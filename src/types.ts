export type PipelineStage =
  | 'ingested'
  | 'gated_notify_only'
  | 'diagnosing'
  | 'diagnosed'
  | 'patching'
  | 'sandboxing'
  | 'review'
  | 'approved'
  | 'rejected'
  | 'pr_created'
  | 'failed';

export interface Diagnosis {
  rootCause: string;
  proposedFix: string;
  confidence: 'high' | 'medium' | 'low';
  timestamp: string;
}

export interface SandboxResult {
  command: string;
  exitCode: number;
  output: string;
  status: 'passed' | 'failed' | 'timed_out';
  timestamp: string;
  limitationNotice: string;
}

export interface PullRequestInfo {
  prNumber: number;
  prUrl: string;
  branchName: string;
  createdAt: string;
}

export interface ErrorEvent {
  id: string;
  signature: string;
  errorType: string;
  message: string;
  normalizedFilePath: string;
  lineNumber: number | null;
  stackTrace: string;
  repository: string;
  targetBranch: string;
  source: 'sentry' | 'github_actions' | 'log_shipper' | 'manual';
  status: PipelineStage;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  isRegression: boolean;
  denialReason?: string;
  diagnosis?: Diagnosis;
  patchDiff?: string;
  sandboxResult?: SandboxResult;
  pullRequest?: PullRequestInfo;
  errorMessage?: string;
}

export interface StageTransition {
  id: string;
  eventId: string;
  fromStage: string;
  toStage: string;
  timestamp: string;
  actor: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface PullRequest {
  id: string;
  eventId: string;
  prNumber: number;
  prUrl: string;
  branchName: string;
  title: string;
  body: string;
  status: 'open' | 'merged' | 'closed';
  createdAt: string;
}

export interface AuditLog {
  id: string;
  eventId?: string;
  action: string;
  actor: string;
  reason?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface Settings {
  budgetCap: number;
  budgetWindowMinutes: number;
  denylistPatterns: string[];
  sandboxModeLabel: string;
  telegramSenderWhitelist: number[];
  isPaused: boolean;
  authAllowlist: string[];
}
