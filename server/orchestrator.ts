import {
  getErrorEvent,
  updateErrorEvent,
  recordStageTransition,
  recordAuditLog,
  getSettings,
  countAttemptsInWindow,
} from './firestoreService';
import { evaluateGate } from '../src/lib/gate';
import { runDiagnosis, runPatchGeneration } from './geminiService';
import { executeSandboxVerification } from './sandboxService';
import { ErrorEvent } from '../src/types';

/**
 * Autonomous Orchestrator:
 * Executes: Gate -> Diagnosis (Gemini 3.1 Pro) -> Patch -> Sandbox -> Review.
 * Halts at "review" stage for human confirmation before PR creation.
 * Any unhandled error transitions event to "failed" with full context in audit log.
 */
export async function runOrchestrator(eventId: string): Promise<void> {
  console.log(`[Orchestrator] Starting run for event ${eventId}`);
  const event = await getErrorEvent(eventId);
  if (!event) {
    console.error(`[Orchestrator] Event ${eventId} not found.`);
    return;
  }

  try {
    // 1. GATEKEEPING
    const settings = await getSettings();
    const attemptsInWindow = await countAttemptsInWindow(settings.budgetWindowMinutes);
    const gateDecision = evaluateGate(event, settings, attemptsInWindow);

    if (!gateDecision.allowed) {
      console.log(`[Orchestrator] Gate blocked event ${eventId}: ${gateDecision.blockedReason}`);
      await updateErrorEvent(eventId, {
        status: 'gated_notify_only',
        denialReason: gateDecision.blockedReason,
      });

      await recordStageTransition({
        eventId,
        fromStage: event.status,
        toStage: 'gated_notify_only',
        timestamp: new Date().toISOString(),
        actor: 'system:gatekeeper',
        reason: gateDecision.blockedReason,
      });

      await recordAuditLog({
        eventId,
        action: 'gate_blocked',
        actor: 'system:gatekeeper',
        reason: gateDecision.blockedReason,
        timestamp: new Date().toISOString(),
        details: { blockedType: gateDecision.blockedType },
      });

      return;
    }

    // 2. DIAGNOSIS (Gemini AI Diagnosis)
    console.log(`[Orchestrator] Running diagnosis for event ${eventId}`);
    await updateErrorEvent(eventId, { status: 'diagnosing' });
    await recordStageTransition({
      eventId,
      fromStage: 'ingested',
      toStage: 'diagnosing',
      timestamp: new Date().toISOString(),
      actor: 'system:orchestrator',
      reason: 'Gate passed. Starting Gemini AI diagnosis.',
    });

    const diagnosis = await runDiagnosis(event);

    await updateErrorEvent(eventId, {
      status: 'diagnosed',
      diagnosis,
    });
    await recordStageTransition({
      eventId,
      fromStage: 'diagnosing',
      toStage: 'diagnosed',
      timestamp: new Date().toISOString(),
      actor: 'gemini-3.8-flash',
      reason: `Diagnosis complete. Confidence: ${diagnosis.confidence}`,
    });

    // 3. PATCH GENERATION
    console.log(`[Orchestrator] Generating patch diff for event ${eventId}`);
    await updateErrorEvent(eventId, { status: 'patching' });
    await recordStageTransition({
      eventId,
      fromStage: 'diagnosed',
      toStage: 'patching',
      timestamp: new Date().toISOString(),
      actor: 'system:orchestrator',
      reason: 'Generating unified diff patch.',
    });

    const patchDiff = await runPatchGeneration(event, diagnosis);

    await updateErrorEvent(eventId, { patchDiff });

    // 4. SANDBOX TESTING
    console.log(`[Orchestrator] Running sandbox testing for event ${eventId}`);
    await updateErrorEvent(eventId, { status: 'sandboxing' });
    await recordStageTransition({
      eventId,
      fromStage: 'patching',
      toStage: 'sandboxing',
      timestamp: new Date().toISOString(),
      actor: 'system:orchestrator',
      reason: 'Executing patch verification in sandbox runtime.',
    });

    const sandboxResult = await executeSandboxVerification(event, patchDiff);

    await updateErrorEvent(eventId, { sandboxResult });

    if (sandboxResult.status === 'passed') {
      // 5. TRANSITION TO REVIEW (Wait for human approval)
      console.log(`[Orchestrator] Sandbox passed. Event ${eventId} moved to review.`);
      await updateErrorEvent(eventId, { status: 'review' });
      await recordStageTransition({
        eventId,
        fromStage: 'sandboxing',
        toStage: 'review',
        timestamp: new Date().toISOString(),
        actor: 'system:sandbox',
        reason: 'Sandbox verification passed. Awaiting operator approval.',
      });
      await recordAuditLog({
        eventId,
        action: 'sandbox_passed',
        actor: 'system:sandbox',
        reason: 'Verification tests succeeded. Transferred to review.',
        timestamp: new Date().toISOString(),
      });
    } else {
      // Sandbox failed or timed out
      console.log(`[Orchestrator] Sandbox failed for event ${eventId}`);
      await updateErrorEvent(eventId, {
        status: 'failed',
        errorMessage: `Sandbox verification ${sandboxResult.status} (exit code ${sandboxResult.exitCode}).`,
      });
      await recordStageTransition({
        eventId,
        fromStage: 'sandboxing',
        toStage: 'failed',
        timestamp: new Date().toISOString(),
        actor: 'system:sandbox',
        reason: `Sandbox verification ${sandboxResult.status}.`,
      });
      await recordAuditLog({
        eventId,
        action: 'sandbox_failed',
        actor: 'system:sandbox',
        reason: `Tests failed with exit code ${sandboxResult.exitCode}.`,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Orchestrator] Unhandled error during event ${eventId}:`, err);

    await updateErrorEvent(eventId, {
      status: 'failed',
      errorMessage: errorMsg,
    });

    await recordStageTransition({
      eventId,
      fromStage: 'in_progress',
      toStage: 'failed',
      timestamp: new Date().toISOString(),
      actor: 'system:orchestrator',
      reason: `Unhandled error: ${errorMsg}`,
    });

    await recordAuditLog({
      eventId,
      action: 'pipeline_unhandled_failure',
      actor: 'system:orchestrator',
      reason: errorMsg,
      timestamp: new Date().toISOString(),
    });
  }
}
