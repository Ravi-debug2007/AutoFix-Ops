import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { computeDedupSignature, normalizeFilePath } from '../src/lib/dedup';
import {
  findEventBySignature,
  createErrorEvent,
  updateErrorEvent,
  recordStageTransition,
  recordAuditLog,
  getErrorEvent,
  getSettings,
  saveSettings,
} from './firestoreService';
import { runOrchestrator } from './orchestrator';
import { runDiagnosis, runPatchGeneration } from './geminiService';
import { executeSandboxVerification } from './sandboxService';
import { createGitHubPullRequest } from './githubService';
import { handleTelegramWebhook } from './telegramService';
import { ErrorEvent } from '../src/types';

export const apiRouter = Router();

// Constant-time string comparison utility
function constantTimeEquals(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Common ingestion handler
 */
async function processIngestedError(params: {
  errorType: string;
  message: string;
  filePath?: string | null;
  lineNumber?: number | null;
  stackTrace?: string;
  repository?: string;
  targetBranch?: string;
  source: 'sentry' | 'github_actions' | 'log_shipper' | 'manual';
  rawPayload?: Record<string, unknown>;
}): Promise<ErrorEvent> {
  const normFilePath = normalizeFilePath(params.filePath);
  const signature = computeDedupSignature({
    errorType: params.errorType,
    filePath: normFilePath,
    lineNumber: params.lineNumber,
  });

  const now = new Date().toISOString();
  const existing = await findEventBySignature(signature);

  if (existing) {
    const isClosed = ['pr_created', 'failed', 'rejected'].includes(existing.status);

    if (isClosed) {
      // Reopen as regression
      console.log(`[Ingest] Reopening resolved/failed error as regression: ${signature}`);
      await updateErrorEvent(existing.id, {
        status: 'ingested',
        isRegression: true,
        occurrenceCount: (existing.occurrenceCount || 1) + 1,
        lastSeen: now,
        message: params.message,
        stackTrace: params.stackTrace || existing.stackTrace,
      });

      await recordStageTransition({
        eventId: existing.id,
        fromStage: existing.status,
        toStage: 'ingested',
        timestamp: now,
        actor: `ingest:${params.source}`,
        reason: 'Reopened occurrence as regression.',
      });

      await recordAuditLog({
        eventId: existing.id,
        action: 'error_reopened_regression',
        actor: `ingest:${params.source}`,
        reason: `Reopened error signature ${signature}`,
        timestamp: now,
      });

      const updated = (await getErrorEvent(existing.id))!;
      // Trigger orchestrator asynchronously
      runOrchestrator(updated.id).catch((e) => console.error('Async orchestrator error:', e));
      return updated;
    } else {
      // Increment occurrence count on open event
      console.log(`[Ingest] Deduplicating existing open error: ${signature}`);
      await updateErrorEvent(existing.id, {
        occurrenceCount: (existing.occurrenceCount || 1) + 1,
        lastSeen: now,
        message: params.message,
      });

      await recordAuditLog({
        eventId: existing.id,
        action: 'error_occurrence_deduped',
        actor: `ingest:${params.source}`,
        reason: `Incremented occurrence count to ${(existing.occurrenceCount || 1) + 1}`,
        timestamp: now,
      });

      return existing;
    }
  }

  // Create new error event
  const newEvent = await createErrorEvent({
    signature,
    errorType: params.errorType,
    message: params.message,
    normalizedFilePath: normFilePath,
    lineNumber: params.lineNumber || null,
    stackTrace: params.stackTrace || '',
    repository: params.repository || 'workspace',
    targetBranch: params.targetBranch || 'main',
    source: params.source,
    status: 'ingested',
    occurrenceCount: 1,
    firstSeen: now,
    lastSeen: now,
    isRegression: false,
  });

  await recordStageTransition({
    eventId: newEvent.id,
    fromStage: 'none',
    toStage: 'ingested',
    timestamp: now,
    actor: `ingest:${params.source}`,
    reason: `Ingested new error signature: ${signature}`,
  });

  await recordAuditLog({
    eventId: newEvent.id,
    action: 'error_ingested',
    actor: `ingest:${params.source}`,
    reason: `Created error event ${newEvent.id}`,
    timestamp: now,
  });

  // Launch async pipeline
  runOrchestrator(newEvent.id).catch((e) => console.error('Async orchestrator error:', e));

  return newEvent;
}

// -------------------------------------------------------------
// 1. Sentry Webhook Endpoint
// -------------------------------------------------------------
apiRouter.post('/webhooks/sentry', async (req: Request, res: Response) => {
  const signatureHeader = req.headers['sentry-hook-signature'] as string | undefined;
  const sentrySecret = process.env.SENTRY_WEBHOOK_SECRET;

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (sentrySecret && sentrySecret.trim() !== '') {
    if (!signatureHeader) {
      return res.status(401).json({ error: 'Missing sentry-hook-signature header.' });
    }
    const computedHmac = crypto.createHmac('sha256', sentrySecret).update(rawBody).digest('hex');
    if (!constantTimeEquals(signatureHeader, computedHmac)) {
      return res.status(401).json({ error: 'Invalid Sentry webhook signature.' });
    }
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Malformed Sentry payload.' });
  }

  try {
    const errorType =
      payload.data?.error?.type ||
      payload.event?.exception?.values?.[0]?.type ||
      payload.error?.type ||
      payload.title ||
      'SentryError';

    const message =
      payload.data?.error?.value ||
      payload.event?.exception?.values?.[0]?.value ||
      payload.message ||
      'Unknown error reported by Sentry';

    const stackFrames =
      payload.event?.exception?.values?.[0]?.stacktrace?.frames ||
      payload.data?.error?.stacktrace?.frames ||
      [];
    const topFrame = stackFrames.length > 0 ? stackFrames[stackFrames.length - 1] : null;

    const filePath = topFrame?.filename || topFrame?.abs_path || payload.culprit;
    const lineNumber = topFrame?.lineno ? Number(topFrame.lineno) : null;
    const stackTrace = stackFrames
      .map((f: any) => `  at ${f.function || '?'} (${f.filename || '?'}:${f.lineno || '?'})`)
      .join('\n');

    const event = await processIngestedError({
      errorType,
      message,
      filePath,
      lineNumber,
      stackTrace,
      repository: payload.project_name || payload.project || 'production-app',
      source: 'sentry',
      rawPayload: payload,
    });

    return res.status(202).json({
      status: 'accepted',
      eventId: event.id,
      signature: event.signature,
      occurrenceCount: event.occurrenceCount,
    });
  } catch (err) {
    console.error('Error processing Sentry webhook:', err);
    return res.status(500).json({ error: 'Internal processing failure.' });
  }
});

// -------------------------------------------------------------
// 2. GitHub Actions Webhook Endpoint
// -------------------------------------------------------------
apiRouter.post('/webhooks/github', async (req: Request, res: Response) => {
  const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
  const githubSecret = process.env.GITHUB_WEBHOOK_SECRET;
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (githubSecret && githubSecret.trim() !== '') {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return res.status(401).json({ error: 'Missing or malformed x-hub-signature-256 header.' });
    }
    const computedHmac = 'sha256=' + crypto.createHmac('sha256', githubSecret).update(rawBody).digest('hex');
    if (!constantTimeEquals(signatureHeader, computedHmac)) {
      return res.status(401).json({ error: 'Invalid GitHub Actions HMAC signature.' });
    }
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Malformed GitHub Actions payload.' });
  }

  try {
    const errorType =
      payload.error_type ||
      (payload.workflow_run?.conclusion === 'failure' ? 'WorkflowRunFailure' : 'GitHubActionsError');

    const message =
      payload.message ||
      payload.workflow_run?.name ||
      `Workflow run #${payload.workflow_run?.run_number ?? 'N/A'} failed`;

    const filePath = payload.file_path || payload.head_commit?.modified?.[0] || 'src/main.ts';
    const lineNumber = payload.line_number ? Number(payload.line_number) : null;
    const stackTrace = payload.stack_trace || payload.logs || 'Failed step logs in workflow run.';

    const event = await processIngestedError({
      errorType,
      message,
      filePath,
      lineNumber,
      stackTrace,
      repository: payload.repository?.full_name || 'repo/main',
      targetBranch: payload.workflow_run?.head_branch || 'main',
      source: 'github_actions',
      rawPayload: payload,
    });

    return res.status(202).json({
      status: 'accepted',
      eventId: event.id,
      signature: event.signature,
      occurrenceCount: event.occurrenceCount,
    });
  } catch (err) {
    console.error('Error processing GitHub Actions webhook:', err);
    return res.status(500).json({ error: 'Internal processing failure.' });
  }
});

// -------------------------------------------------------------
// 3. Generic Log-Shipper Endpoint
// -------------------------------------------------------------
apiRouter.post('/ingest/logs', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const logShipperToken = process.env.LOG_SHIPPER_TOKEN;

  if (logShipperToken && logShipperToken.trim() !== '') {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization Bearer header.' });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!constantTimeEquals(token, logShipperToken)) {
      return res.status(401).json({ error: 'Unauthorized bearer token.' });
    }
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object' || !payload.errorType || !payload.message) {
    return res.status(400).json({
      error: 'Malformed log payload: "errorType" and "message" are required.',
    });
  }

  try {
    const event = await processIngestedError({
      errorType: String(payload.errorType),
      message: String(payload.message),
      filePath: payload.filePath,
      lineNumber: payload.lineNumber ? Number(payload.lineNumber) : null,
      stackTrace: payload.stackTrace,
      repository: payload.repository || 'workspace',
      targetBranch: payload.targetBranch || 'main',
      source: 'log_shipper',
      rawPayload: payload,
    });

    return res.status(202).json({
      status: 'accepted',
      eventId: event.id,
      signature: event.signature,
      occurrenceCount: event.occurrenceCount,
      isRegression: event.isRegression,
    });
  } catch (err) {
    console.error('Error processing log-shipper ingestion:', err);
    return res.status(500).json({ error: 'Failed to ingest log record.' });
  }
});

// -------------------------------------------------------------
// 4. Telegram Webhook Endpoint
// -------------------------------------------------------------
apiRouter.post('/webhooks/telegram', async (req: Request, res: Response) => {
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
  const appUrl = process.env.APP_URL || 'https://ai.studio';

  try {
    const result = await handleTelegramWebhook(secretHeader, req.body, appUrl);
    return res.status(result.status).json({ message: result.message });
  } catch (err) {
    console.error('Telegram webhook handler error:', err);
    return res.status(500).json({ error: 'Telegram processing error' });
  }
});

// -------------------------------------------------------------
// 5. Pipeline Controls (Diagnose, Patch & Test, Approve, Reject)
// -------------------------------------------------------------
apiRouter.post('/pipeline/diagnose', async (req: Request, res: Response) => {
  const { eventId } = req.body;
  if (!eventId) return res.status(400).json({ error: 'eventId required.' });

  const event = await getErrorEvent(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  try {
    await updateErrorEvent(eventId, { status: 'diagnosing' });
    const diagnosis = await runDiagnosis(event);
    await updateErrorEvent(eventId, { status: 'diagnosed', diagnosis });
    await recordStageTransition({
      eventId,
      fromStage: event.status,
      toStage: 'diagnosed',
      timestamp: new Date().toISOString(),
      actor: 'gemini-3.8-flash',
      reason: `Diagnosis complete. Confidence: ${diagnosis.confidence}`,
    });
    return res.json({ success: true, diagnosis });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateErrorEvent(eventId, { status: 'failed', errorMessage: msg });
    return res.status(500).json({ error: msg });
  }
});

apiRouter.post('/pipeline/patch-and-test', async (req: Request, res: Response) => {
  const { eventId } = req.body;
  if (!eventId) return res.status(400).json({ error: 'eventId required.' });

  const event = await getErrorEvent(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (!event.diagnosis) return res.status(400).json({ error: 'Event must be diagnosed before generating patch.' });

  try {
    await updateErrorEvent(eventId, { status: 'patching' });
    const patchDiff = await runPatchGeneration(event, event.diagnosis);
    await updateErrorEvent(eventId, { patchDiff, status: 'sandboxing' });

    const sandboxResult = await executeSandboxVerification(event, patchDiff);
    const nextStatus = sandboxResult.status === 'passed' ? 'review' : 'failed';

    await updateErrorEvent(eventId, { status: nextStatus, sandboxResult });
    await recordStageTransition({
      eventId,
      fromStage: 'sandboxing',
      toStage: nextStatus,
      timestamp: new Date().toISOString(),
      actor: 'system:sandbox',
      reason: `Sandbox result: ${sandboxResult.status}`,
    });

    return res.json({ success: true, patchDiff, sandboxResult, nextStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateErrorEvent(eventId, { status: 'failed', errorMessage: msg });
    return res.status(500).json({ error: msg });
  }
});

apiRouter.post('/pipeline/approve-and-pr', async (req: Request, res: Response) => {
  const { eventId } = req.body;
  if (!eventId) return res.status(400).json({ error: 'eventId required.' });

  const event = await getErrorEvent(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (event.status !== 'review' && event.status !== 'approved') {
    return res.status(400).json({ error: `Event must be in review status (current: ${event.status}).` });
  }

  const appUrl = process.env.APP_URL || 'https://ai.studio';
  const prResult = await createGitHubPullRequest(event, appUrl);

  if (prResult.success && prResult.pr) {
    await updateErrorEvent(eventId, {
      status: 'pr_created',
      pullRequest: prResult.pr,
    });
    await recordStageTransition({
      eventId,
      fromStage: event.status,
      toStage: 'pr_created',
      timestamp: new Date().toISOString(),
      actor: 'system:github',
      reason: `PR #${prResult.pr.prNumber} created.`,
    });
    return res.json({ success: true, pr: prResult.pr, isExisting: prResult.isExisting });
  } else {
    await recordAuditLog({
      eventId,
      action: 'pr_creation_failure',
      actor: 'operator:ui',
      reason: prResult.error || 'Failed to create GitHub PR.',
      timestamp: new Date().toISOString(),
    });
    return res.status(500).json({ error: prResult.error || 'Failed to create GitHub PR.' });
  }
});

apiRouter.post('/pipeline/reject', async (req: Request, res: Response) => {
  const { eventId, reason } = req.body;
  if (!eventId) return res.status(400).json({ error: 'eventId required.' });

  const event = await getErrorEvent(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const rejectionReason = reason || 'Rejected by operator in console.';
  await updateErrorEvent(eventId, { status: 'rejected', denialReason: rejectionReason });
  await recordStageTransition({
    eventId,
    fromStage: event.status,
    toStage: 'rejected',
    timestamp: new Date().toISOString(),
    actor: 'operator:ui',
    reason: rejectionReason,
  });
  await recordAuditLog({
    eventId,
    action: 'operator_reject',
    actor: 'operator:ui',
    reason: rejectionReason,
    timestamp: new Date().toISOString(),
  });

  return res.json({ success: true });
});

apiRouter.post('/pipeline/orchestrate', async (req: Request, res: Response) => {
  const { eventId } = req.body;
  if (!eventId) return res.status(400).json({ error: 'eventId required.' });

  runOrchestrator(eventId).catch((e) => console.error('Orchestrator error:', e));
  return res.status(202).json({ status: 'orchestrator_triggered', eventId });
});

// -------------------------------------------------------------
// 6. System Status & Settings
// -------------------------------------------------------------
apiRouter.get('/system/status', async (_req: Request, res: Response) => {
  const settings = await getSettings();

  return res.json({
    status: 'ok',
    secrets: {
      hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== ''),
      hasGithubToken: Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim() !== ''),
      hasSentrySecret: Boolean(process.env.SENTRY_WEBHOOK_SECRET && process.env.SENTRY_WEBHOOK_SECRET.trim() !== ''),
      hasGithubWebhookSecret: Boolean(process.env.GITHUB_WEBHOOK_SECRET && process.env.GITHUB_WEBHOOK_SECRET.trim() !== ''),
      hasLogShipperToken: Boolean(process.env.LOG_SHIPPER_TOKEN && process.env.LOG_SHIPPER_TOKEN.trim() !== ''),
      hasTelegramToken: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim() !== ''),
      hasTelegramWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET && process.env.TELEGRAM_WEBHOOK_SECRET.trim() !== ''),
    },
    settings,
  });
});

apiRouter.post('/system/settings', async (req: Request, res: Response) => {
  try {
    const updated = await saveSettings(req.body);
    await recordAuditLog({
      action: 'settings_updated',
      actor: 'operator:ui',
      reason: 'Operational parameters updated.',
      timestamp: new Date().toISOString(),
      details: req.body,
    });
    return res.json({ success: true, settings: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
});
