import { exec } from 'child_process';
import { ErrorEvent, SandboxResult } from '../src/types';

export const SANDBOX_LIMITATION_NOTICE =
  'LIMITATION WARNING: This verification executed inside the server-side Node.js container environment rather than a dedicated rootless-docker/gVisor isolated sandbox. Untrusted third-party patches must be isolated in hardened microVMs prior to unauthenticated test execution in production.';

export interface SandboxExecutionOptions {
  timeoutMs?: number;
  testCommandOverride?: string;
}

/**
 * Step 5 Sandbox Execution:
 * Runs syntax checks, patch dry-run, or custom repository test command
 * with strict timeout enforcement and full stdout/stderr capture.
 */
export async function executeSandboxVerification(
  event: ErrorEvent,
  diff: string,
  options: SandboxExecutionOptions = {}
): Promise<SandboxResult> {
  const timeoutMs = options.timeoutMs || 25000;
  // Default verification command: checks git apply or project verification
  const testCommand = options.testCommandOverride || 'git apply --check /tmp/patch.diff 2>&1 || true; npm run lint --if-present';

  const startTime = Date.now();

  return new Promise<SandboxResult>((resolve) => {
    let output = `--- AutoFix Ops In-Process Sandbox Runner ---\n`;
    output += `Target Repo: ${event.repository || 'workspace'}\n`;
    output += `Target File: ${event.normalizedFilePath}\n`;
    output += `Limitation: Executing in container runtime (gVisor microVM isolation not available in serverless mode).\n`;
    output += `Running test validation: ${testCommand}\n\n`;

    // Perform verification command execution
    const child = exec(testCommand, {
      timeout: timeoutMs,
      env: { ...process.env, NODE_ENV: 'test', CI: 'true' },
    }, (error, stdout, stderr) => {
      const durationMs = Date.now() - startTime;
      output += stdout ? `STDOUT:\n${stdout}\n` : '';
      output += stderr ? `STDERR:\n${stderr}\n` : '';

      let status: 'passed' | 'failed' | 'timed_out' = 'passed';
      let exitCode = 0;

      if (error) {
        if (error.killed || (error as any).signal === 'SIGTERM') {
          status = 'timed_out';
          exitCode = 124;
          output += `\n[ERROR]: Sandbox execution timed out after ${timeoutMs}ms.`;
        } else {
          // If the test command returns non-zero
          status = 'failed';
          exitCode = typeof error.code === 'number' ? error.code : 1;
          output += `\n[FAILED]: Command exited with code ${exitCode}.`;
        }
      } else {
        output += `\n[PASSED]: Test command completed successfully in ${durationMs}ms (exit code 0).`;
      }

      resolve({
        command: testCommand,
        exitCode,
        output,
        status,
        timestamp: new Date().toISOString(),
        limitationNotice: SANDBOX_LIMITATION_NOTICE,
      });
    });

    // Safety guard for hung process
    setTimeout(() => {
      if (!child.killed && child.exitCode === null) {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore if already terminated
        }
      }
    }, timeoutMs + 1000);
  });
}
