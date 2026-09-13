import crypto from 'crypto';
import {
  getSettings,
  saveSettings,
  getErrorEvent,
  updateErrorEvent,
  recordStageTransition,
  recordAuditLog,
} from './firestoreService';
import { createGitHubPullRequest } from './githubService';

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function sendTelegramReply(chatId: number | string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn(`[Telegram] No TELEGRAM_BOT_TOKEN configured. Reply output: "${text}"`);
    return;
  }

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
  }
}

export async function handleTelegramWebhook(
  secretHeader: string | undefined,
  body: any,
  appUrl: string
): Promise<{ status: number; message: string }> {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  // Secret token verification if configured
  if (expectedSecret && expectedSecret.trim() !== '') {
    if (!secretHeader || !safeCompare(secretHeader, expectedSecret)) {
      return { status: 401, message: 'Invalid Telegram secret token.' };
    }
  }

  const message = body?.message;
  if (!message || !message.text) {
    return { status: 200, message: 'Ignored non-text message.' };
  }

  const senderId = message.from?.id;
  const senderUsername = message.from?.username || `id:${senderId}`;
  const chatId = message.chat?.id;
  const text = message.text.trim();

  // Look up sender's Telegram user ID against whitelist in Firestore BEFORE parsing command
  const settings = await getSettings();
  const whitelist = settings.telegramSenderWhitelist || [];

  if (!senderId || !whitelist.includes(senderId)) {
    await sendTelegramReply(
      chatId,
      '⛔ Access Denied. Your Telegram user ID is not authorized to execute AutoFix Ops commands.'
    );
    return { status: 200, message: 'Unauthorized user blocked.' };
  }

  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (command === '/pause') {
    await saveSettings({ isPaused: true });
    await recordAuditLog({
      action: 'telegram_pause',
      actor: `@${senderUsername}`,
      reason: 'Pipeline paused via Telegram bot.',
      timestamp: new Date().toISOString(),
    });
    await sendTelegramReply(chatId, '⏸️ **AutoFix Pipeline Paused.** Ingestion will dedupe incoming events but skip starting new diagnosis work.');
    return { status: 200, message: 'Pipeline paused' };
  }

  if (command === '/resume') {
    await saveSettings({ isPaused: false });
    await recordAuditLog({
      action: 'telegram_resume',
      actor: `@${senderUsername}`,
      reason: 'Pipeline resumed via Telegram bot.',
      timestamp: new Date().toISOString(),
    });
    await sendTelegramReply(chatId, '▶️ **AutoFix Pipeline Resumed.** New incoming events will proceed through diagnosis and testing.');
    return { status: 200, message: 'Pipeline resumed' };
  }

  if (command === '/scan') {
    await sendTelegramReply(
      chatId,
      `🔍 **AutoFix Scanner Active**\nBudget: ${settings.budgetCap} runs / ${settings.budgetWindowMinutes}m\nPaused: ${settings.isPaused ? 'YES' : 'NO'}\nView details at: ${appUrl}`
    );
    return { status: 200, message: 'Scan complete' };
  }

  if (command === '/approve') {
    const eventId = args[0];
    if (!eventId) {
      await sendTelegramReply(chatId, '⚠️ Usage: `/approve <eventId>`');
      return { status: 200, message: 'Missing event ID' };
    }

    const event = await getErrorEvent(eventId);
    if (!event) {
      await sendTelegramReply(chatId, `❌ Event \`${eventId}\` not found in Firestore.`);
      return { status: 200, message: 'Event not found' };
    }

    if (event.status !== 'review') {
      await sendTelegramReply(
        chatId,
        `⚠️ Event \`${eventId}\` cannot be approved because its current status is "${event.status}" (must be in "review").`
      );
      return { status: 200, message: 'Invalid state for approval' };
    }

    // Update status to approved
    await updateErrorEvent(eventId, { status: 'approved' });
    await recordStageTransition({
      eventId,
      fromStage: 'review',
      toStage: 'approved',
      timestamp: new Date().toISOString(),
      actor: `telegram:@${senderUsername}`,
      reason: 'Approved via Telegram bot.',
    });

    await recordAuditLog({
      eventId,
      action: 'telegram_approve',
      actor: `@${senderUsername}`,
      reason: 'Approved for PR creation.',
      timestamp: new Date().toISOString(),
    });

    // Create GitHub PR
    const prResult = await createGitHubPullRequest(event, appUrl);
    if (prResult.success && prResult.pr) {
      await updateErrorEvent(eventId, {
        status: 'pr_created',
        pullRequest: prResult.pr,
      });
      await recordStageTransition({
        eventId,
        fromStage: 'approved',
        toStage: 'pr_created',
        timestamp: new Date().toISOString(),
        actor: 'system:github',
        reason: `PR #${prResult.pr.prNumber} created.`,
      });
      await sendTelegramReply(
        chatId,
        `✅ **PR Created Successfully!**\nPR: [${prResult.pr.prUrl}](${prResult.pr.prUrl})\nBranch: \`${prResult.pr.branchName}\``
      );
    } else {
      await updateErrorEvent(eventId, { status: 'review' });
      await recordAuditLog({
        eventId,
        action: 'pr_creation_failed',
        actor: `@${senderUsername}`,
        reason: prResult.error || 'Failed to create PR.',
        timestamp: new Date().toISOString(),
      });
      await sendTelegramReply(chatId, `❌ **PR Creation Failed:** ${prResult.error}\nEvent returned to "review" state.`);
    }

    return { status: 200, message: 'Approval processed' };
  }

  if (command === '/reject') {
    const eventId = args[0];
    const reasoning = args.slice(1).join(' ') || 'Rejected by operator via Telegram.';

    if (!eventId) {
      await sendTelegramReply(chatId, '⚠️ Usage: `/reject <eventId> <reason>`');
      return { status: 200, message: 'Missing event ID' };
    }

    const event = await getErrorEvent(eventId);
    if (!event) {
      await sendTelegramReply(chatId, `❌ Event \`${eventId}\` not found in Firestore.`);
      return { status: 200, message: 'Event not found' };
    }

    if (event.status !== 'review') {
      await sendTelegramReply(
        chatId,
        `⚠️ Event \`${eventId}\` cannot be rejected because its current status is "${event.status}".`
      );
      return { status: 200, message: 'Invalid state for rejection' };
    }

    await updateErrorEvent(eventId, { status: 'rejected', denialReason: reasoning });
    await recordStageTransition({
      eventId,
      fromStage: 'review',
      toStage: 'rejected',
      timestamp: new Date().toISOString(),
      actor: `telegram:@${senderUsername}`,
      reason: reasoning,
    });
    await recordAuditLog({
      eventId,
      action: 'telegram_reject',
      actor: `@${senderUsername}`,
      reason: reasoning,
      timestamp: new Date().toISOString(),
    });

    await sendTelegramReply(chatId, `🚫 **Event \`${eventId}\` rejected.** Reason: ${reasoning}`);
    return { status: 200, message: 'Rejection processed' };
  }

  await sendTelegramReply(
    chatId,
    `❓ Unknown command: \`${command}\`. Available commands: \`/approve\`, \`/reject\`, \`/pause\`, \`/resume\`, \`/scan\`.`
  );
  return { status: 200, message: 'Unknown command' };
}
