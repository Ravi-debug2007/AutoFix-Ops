export interface DiffValidationResult {
  isValid: boolean;
  error?: string;
  filesModified?: string[];
  hunkCount?: number;
}

/**
 * Validates that text represents a valid Unified Diff syntax:
 * - Contains `--- a/...` and `+++ b/...` file headers
 * - Contains at least one valid hunk header `@@ -start,len +start,len @@`
 * - Contains diff lines (+, -, space, \)
 */
export function validateUnifiedDiff(rawDiffText: string): DiffValidationResult {
  if (!rawDiffText || typeof rawDiffText !== 'string') {
    return { isValid: false, error: 'Diff content is empty or not a string.' };
  }

  // Strip markdown code blocks if the LLM wrapped it in ```diff ... ```
  let cleaned = rawDiffText.trim();
  if (cleaned.startsWith('```diff')) {
    cleaned = cleaned.replace(/^```diff\s*/i, '').replace(/\s*```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  }

  const lines = cleaned.split('\n');
  const files: string[] = [];
  let hunkCount = 0;
  let hasOldFile = false;
  let hasNewFile = false;

  const fileOldRegex = /^---\s+(a\/)?(.+)$/;
  const fileNewRegex = /^\+\+\+\s+(b\/)?(.+)$/;
  const hunkRegex = /^@@\s+-[0-9]+(,[0-9]+)?\s+\+[0-9]+(,[0-9]+)?\s+@@/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (fileOldRegex.test(line)) {
      hasOldFile = true;
    } else if (fileNewRegex.test(line)) {
      hasNewFile = true;
      const match = line.match(fileNewRegex);
      if (match && match[2]) {
        files.push(match[2].trim());
      }
    } else if (hunkRegex.test(line)) {
      hunkCount++;
    }
  }

  if (!hasOldFile || !hasNewFile) {
    return {
      isValid: false,
      error: 'Invalid diff header: missing standard "--- a/..." and "+++ b/..." file indicators.',
    };
  }

  if (hunkCount === 0) {
    return {
      isValid: false,
      error: 'Invalid unified diff: no "@@ -line,count +line,count @@" range hunks detected.',
    };
  }

  return {
    isValid: true,
    filesModified: files,
    hunkCount,
  };
}
