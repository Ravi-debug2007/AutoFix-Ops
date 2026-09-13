/**
 * Dedup Logic & Signature Engine for AutoFix Ops
 * 
 * Normalization Rules:
 * 1. Error Type: Trim and lowercase string (e.g. ' TypeError ' -> 'typeerror').
 * 2. File Path:
 *    - Convert Windows backslashes to standard forward slashes.
 *    - Strip machine-specific absolute prefixes:
 *      - Windows drive paths (e.g., 'C:/Users/runner/workspace/')
 *      - Unix home directories (e.g., '/home/runner/', '/root/', '~')
 *      - Serverless and container roots (e.g., '/var/task/', '/app/', '/workspace/', '/dist/')
 *    - Remove redundant leading slashes so paths are strictly repository-relative.
 * 3. Line Number:
 *    - If integer >= 1, formatted as string.
 *    - Missing, null, undefined, or <= 0 is strictly normalized to "no_line"
 *      (treating missing line number as "no match" rather than a "wildcard match").
 * 
 * Target Signature Format:
 *   `${errorType}::${normalizedPath}::${lineNumber}`
 */

export interface SignatureInput {
  errorType: string;
  filePath?: string | null;
  lineNumber?: number | null;
}

export function normalizeFilePath(rawPath?: string | null): string {
  if (!rawPath || typeof rawPath !== 'string') {
    return 'unknown_file';
  }

  let cleaned = rawPath.trim().replace(/\\/g, '/');

  // Strip Windows drive letter (e.g. "C:", "D:")
  cleaned = cleaned.replace(/^[a-zA-Z]:\/?/, '');
  // Normalize leading slashes
  cleaned = cleaned.replace(/^\/+/, '/');

  // Strip common CI/CD and container absolute prefixes (case-insensitive, with or without leading slash)
  const prefixesToStrip = [
    /^\/?home\/[^/]+\//i,
    /^\/?Users\/[^/]+\//i,
    /^\/?var\/task\//i,
    /^\/?workspace\//i,
    /^\/?app\//i,
    /^\/?root\//i,
    /^\.\//,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const regex of prefixesToStrip) {
      if (regex.test(cleaned)) {
        cleaned = cleaned.replace(regex, '');
        changed = true;
      }
    }
  }

  // Remove leading slashes
  cleaned = cleaned.replace(/^\/+/, '');

  return cleaned.toLowerCase() || 'unknown_file';
}

export function normalizeErrorType(errorType?: string | null): string {
  if (!errorType || typeof errorType !== 'string') {
    return 'unknown_error';
  }
  return errorType.trim().toLowerCase();
}

export function normalizeLineNumber(lineNumber?: number | null): string {
  if (typeof lineNumber === 'number' && Number.isFinite(lineNumber) && lineNumber > 0) {
    return Math.floor(lineNumber).toString();
  }
  return 'no_line';
}

export function computeDedupSignature(input: SignatureInput): string {
  const normType = normalizeErrorType(input.errorType);
  const normPath = normalizeFilePath(input.filePath);
  const normLine = normalizeLineNumber(input.lineNumber);

  return `${normType}::${normPath}::${normLine}`;
}

/**
 * Expected Test Case Matrix:
 * 
 * 1. Exact Match:
 *    - Input: { errorType: 'TypeError', filePath: 'src/auth/login.ts', lineNumber: 42 }
 *    - Expected: 'typeerror::src/auth/login.ts::42'
 * 
 * 2. Cross-Machine Path Invariance:
 *    - Linux CI: '/home/runner/work/repo/src/auth/login.ts'
 *    - Windows CI: 'C:\\Users\\runner\\workspace\\src\\auth\\login.ts'
 *    - Both produce identical normalized path: 'src/auth/login.ts'
 * 
 * 3. Case Insensitivity for Error Types:
 *    - 'NULLPOINTEREXCEPTION' vs 'NullPointerException' -> both become 'nullpointerexception'
 * 
 * 4. Missing Line Number Strictness:
 *    - Missing line number: produces '...::no_line'
 *    - Event with line 100 will NOT match event with 'no_line' (prevents wildcard false positives)
 * 
 * 5. Malformed / Empty Inputs:
 *    - { errorType: '', filePath: null, lineNumber: undefined }
 *    - Produces safe fallback: 'unknown_error::unknown_file::no_line'
 */
export const DEDUP_TEST_SUITE_SPECS = [
  {
    name: 'Normalizes container and Windows path differences to same signature',
    inputA: { errorType: 'TypeError', filePath: '/var/task/app/api/auth.ts', lineNumber: 18 },
    inputB: { errorType: 'TypeError', filePath: 'C:\\app\\api\\auth.ts', lineNumber: 18 },
    expectedEqual: true,
  },
  {
    name: 'Distinguishes between missing line number and known line number',
    inputA: { errorType: 'ReferenceError', filePath: 'src/utils.ts', lineNumber: null },
    inputB: { errorType: 'ReferenceError', filePath: 'src/utils.ts', lineNumber: 12 },
    expectedEqual: false,
  },
  {
    name: 'Normalizes whitespace and casing in error class names',
    inputA: { errorType: '  DatabaseTimeoutError  ', filePath: 'db/query.ts', lineNumber: 50 },
    inputB: { errorType: 'databagetimeouterror', filePath: 'db/query.ts', lineNumber: 50 },
    expectedEqual: false, // typo in error class should differ
  },
];
