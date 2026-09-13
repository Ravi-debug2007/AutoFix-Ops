import picomatch from 'picomatch';
import { ErrorEvent, Settings } from '../types';

export interface GateDecision {
  allowed: boolean;
  blockedReason?: string;
  blockedType?: 'protected_path' | 'budget_cap_exceeded' | 'pipeline_paused';
}

/**
 * Gate evaluation engine.
 * 
 * Rules:
 * 1. Global Pause check: If operator enabled `isPaused`, block immediately.
 * 2. Denylist check: Extract file path from event's normalizedFilePath / top stack frame,
 *    match using picomatch against patterns configured in Firestore settings.
 * 3. Budget check: Compare active attempts started in window against `budgetCap`.
 * 
 * Priority Invariant:
 * If both checks fail at once, protected-path takes priority in the reported reason,
 * since it's a critical safety concern rather than a resource one.
 */
export function evaluateGate(
  event: ErrorEvent,
  settings: Settings,
  recentAttemptsInWindow: number
): GateDecision {
  // Check 1: Operational pause
  if (settings.isPaused) {
    return {
      allowed: false,
      blockedReason: 'AutoFix pipeline is currently paused by operator in settings or via Telegram /pause command.',
      blockedType: 'pipeline_paused',
    };
  }

  // Denylist verification
  const targetPath = event.normalizedFilePath || 'unknown_file';
  let isPathBlocked = false;
  let matchingPattern = '';

  if (Array.isArray(settings.denylistPatterns) && settings.denylistPatterns.length > 0) {
    for (const pattern of settings.denylistPatterns) {
      if (!pattern || typeof pattern !== 'string') continue;
      try {
        const isMatch = picomatch(pattern, { dot: true });
        if (isMatch(targetPath)) {
          isPathBlocked = true;
          matchingPattern = pattern;
          break;
        }
      } catch (err) {
        console.error(`Invalid glob pattern in settings: ${pattern}`, err);
      }
    }
  }

  // Budget verification
  const budgetCap = typeof settings.budgetCap === 'number' ? settings.budgetCap : 10;
  const isBudgetBlocked = recentAttemptsInWindow >= budgetCap;

  // Priority enforcement:
  // If both fail at once, protected-path MUST take priority over budget cap,
  // since touching sensitive files (.env, secrets, auth) represents a safety vulnerability.
  if (isPathBlocked) {
    return {
      allowed: false,
      blockedReason: `Target file "${targetPath}" matches protected denylist pattern "${matchingPattern}". Auto-fix blocked for safety.`,
      blockedType: 'protected_path',
    };
  }

  if (isBudgetBlocked) {
    return {
      allowed: false,
      blockedReason: `Budget cap reached: ${recentAttemptsInWindow}/${budgetCap} auto-fix attempts initiated in the past ${settings.budgetWindowMinutes} minutes.`,
      blockedType: 'budget_cap_exceeded',
    };
  }

  return { allowed: true };
}
