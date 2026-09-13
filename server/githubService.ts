import { ErrorEvent, PullRequestInfo } from '../src/types';

export interface GitHubPRCreationResult {
  success: boolean;
  pr?: PullRequestInfo;
  error?: string;
  isExisting?: boolean;
}

/**
 * Creates GitHub PR deterministically named `autofix/${eventId}`.
 * Body contains root cause, proposed fix, and links back to the AutoFix event.
 */
export async function createGitHubPullRequest(
  event: ErrorEvent,
  appUrl: string
): Promise<GitHubPRCreationResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token || token.trim() === '') {
    return {
      success: false,
      error: 'GITHUB_TOKEN is not configured in the Secrets panel. Add a GitHub token to enable PR creation.',
    };
  }

  const repo = event.repository || 'org/repo';
  const branchName = `autofix/${event.id}`;
  const title = `fix(${event.errorType}): auto-remediate ${event.normalizedFilePath || 'error'}`;
  
  const body = `## 🤖 AutoFix Ops Automated Remediation

**Event ID:** \`${event.id}\`
**Error Type:** \`${event.errorType}\`
**File:** \`${event.normalizedFilePath || 'unknown'}:${event.lineNumber ?? 'N/A'}\`

### 🔍 Root Cause Analysis
${event.diagnosis?.rootCause || 'No root cause available'}

### 🛠️ Proposed Fix
${event.diagnosis?.proposedFix || 'No proposed fix details available'}

### 🧪 Sandbox Verification
- **Status:** \`${event.sandboxResult?.status || 'unverified'}\`
- **Exit Code:** \`${event.sandboxResult?.exitCode ?? 'N/A'}\`

---
[View in AutoFix Ops Console](${appUrl}?event=${event.id})
`;

  try {
    // 1. Get default branch SHA
    const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'AutoFix-Ops',
      },
    });

    if (!repoRes.ok) {
      const errText = await repoRes.text();
      return {
        success: false,
        error: `GitHub repository lookup failed (${repoRes.status}): ${errText}`,
      };
    }

    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch || 'main';

    // 2. Get default branch ref
    const refRes = await fetch(
      `https://api.github.com/repos/${repo}/git/ref/heads/${defaultBranch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AutoFix-Ops',
        },
      }
    );

    if (!refRes.ok) {
      const errText = await refRes.text();
      return {
        success: false,
        error: `Failed to fetch default branch ref: ${errText}`,
      };
    }

    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    // 3. Create branch ref (or check if exists)
    const createRefRes = await fetch(
      `https://api.github.com/repos/${repo}/git/refs`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AutoFix-Ops',
        },
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSha,
        }),
      }
    );

    if (!createRefRes.ok && createRefRes.status !== 422) {
      const errText = await createRefRes.text();
      return {
        success: false,
        error: `Branch creation failed: ${errText}`,
      };
    }

    // 4. Create Pull Request
    const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'AutoFix-Ops',
      },
      body: JSON.stringify({
        title,
        head: branchName,
        base: defaultBranch,
        body,
      }),
    });

    if (!prRes.ok) {
      const prErrText = await prRes.text();
      if (prErrText.includes('A pull request already exists') || prRes.status === 422) {
        // Fetch existing PR
        const existingPrsRes = await fetch(
          `https://api.github.com/repos/${repo}/pulls?head=${repo.split('/')[0]}:${branchName}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3+json',
              'User-Agent': 'AutoFix-Ops',
            },
          }
        );
        if (existingPrsRes.ok) {
          const list = await existingPrsRes.json();
          if (list.length > 0) {
            const first = list[0];
            return {
              success: true,
              isExisting: true,
              pr: {
                prNumber: first.number,
                prUrl: first.html_url,
                branchName,
                createdAt: first.created_at,
              },
            };
          }
        }
        return {
          success: false,
          error: `Pull request already exists for branch ${branchName}, but could not retrieve details.`,
        };
      }
      return {
        success: false,
        error: `GitHub PR creation failed (${prRes.status}): ${prErrText}`,
      };
    }

    const prData = await prRes.json();
    return {
      success: true,
      pr: {
        prNumber: prData.number,
        prUrl: prData.html_url,
        branchName,
        createdAt: prData.created_at,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `Network error communicating with GitHub API: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
