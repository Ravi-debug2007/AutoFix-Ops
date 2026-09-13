import React, { useState } from 'react';
import { ErrorEvent, StageTransition, PipelineStage } from '../types';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Cpu,
  Terminal,
  FileCode,
  GitPullRequest,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  ExternalLink,
  Flame,
  RotateCcw,
} from 'lucide-react';

interface PipelineTabProps {
  events: ErrorEvent[];
  selectedEvent: ErrorEvent | null;
  onSelectEvent: (event: ErrorEvent) => void;
  transitions: StageTransition[];
  onRunDiagnosis: (eventId: string) => Promise<void>;
  onRunPatchTest: (eventId: string) => Promise<void>;
  onApprovePR: (eventId: string) => Promise<void>;
  onReject: (eventId: string, reason?: string) => Promise<void>;
  onTriggerOrchestration: (eventId: string) => Promise<void>;
  isProcessingAction: boolean;
}

const STAGES: { key: PipelineStage; label: string; desc: string }[] = [
  { key: 'ingested', label: 'Ingested', desc: 'Normalized & Deduped' },
  { key: 'diagnosing', label: 'Diagnosing', desc: 'Gemini 3.1 Pro' },
  { key: 'diagnosed', label: 'Diagnosed', desc: 'Root Cause & Plan' },
  { key: 'patching', label: 'Patching', desc: 'Diff Generation' },
  { key: 'sandboxing', label: 'Sandboxing', desc: 'Sandbox Verification' },
  { key: 'review', label: 'Human Review', desc: 'Approval Gate' },
  { key: 'pr_created', label: 'PR Staged', desc: 'GitHub Pull Request' },
];

export const PipelineTab: React.FC<PipelineTabProps> = ({
  events,
  selectedEvent,
  onSelectEvent,
  transitions,
  onRunDiagnosis,
  onRunPatchTest,
  onApprovePR,
  onReject,
  onTriggerOrchestration,
  isProcessingAction,
}) => {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  // If no event selected, pick the first review or active one
  const currentEvent =
    selectedEvent ||
    events.find((e) => e.status === 'review') ||
    events.find((e) => ['diagnosed', 'diagnosing', 'sandboxing'].includes(e.status)) ||
    events[0] ||
    null;

  // Event transitions
  const eventTransitions = currentEvent
    ? transitions.filter((t) => t.eventId === currentEvent.id)
    : [];

  // Determine stage progression index
  const getStageIndex = (status: PipelineStage): number => {
    switch (status) {
      case 'ingested':
        return 0;
      case 'diagnosing':
        return 1;
      case 'diagnosed':
        return 2;
      case 'patching':
        return 3;
      case 'sandboxing':
        return 4;
      case 'review':
      case 'approved':
        return 5;
      case 'pr_created':
        return 6;
      default:
        return 0;
    }
  };

  const currentIndex = currentEvent ? getStageIndex(currentEvent.status) : 0;

  return (
    <div className="space-y-6">
      {/* Event Selector Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <label className="text-xs font-semibold uppercase text-slate-400 font-mono">
            Active Target Incident:
          </label>
          <select
            id="pipeline-event-selector"
            value={currentEvent?.id || ''}
            onChange={(e) => {
              const found = events.find((ev) => ev.id === e.target.value);
              if (found) onSelectEvent(found);
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 max-w-md"
          >
            {events.length === 0 ? (
              <option value="">No incidents available</option>
            ) : (
              events.map((e) => (
                <option key={e.id} value={e.id}>
                  [{e.status.toUpperCase()}] {e.errorType} - {e.normalizedFilePath} ({e.occurrenceCount}x)
                </option>
              ))
            )}
          </select>
        </div>

        {currentEvent && (
          <div className="flex items-center space-x-2">
            <button
              id="reorchestrate-btn"
              disabled={isProcessingAction}
              onClick={() => onTriggerOrchestration(currentEvent.id)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium inline-flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
              <span>Re-run Full Autonomous Flow</span>
            </button>
          </div>
        )}
      </div>

      {!currentEvent ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          <p className="text-sm font-medium text-slate-300">No Target Incident Selected</p>
          <p className="text-xs text-slate-500 mt-1">
            Emit a test incident from the Test Webhooks tab to monitor the fix pipeline.
          </p>
        </div>
      ) : (
        <>
          {/* Visual Progression Steps */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {STAGES.map((stg, idx) => {
                const isPassed = idx < currentIndex;
                const isCurrent = idx === currentIndex;
                const isFailed = currentEvent.status === 'failed' && isCurrent;
                const isGated = currentEvent.status === 'gated_notify_only' && idx === 1;

                let borderClass = 'border-slate-800 bg-slate-950/40 text-slate-500';
                if (isGated) {
                  borderClass = 'border-rose-500/60 bg-rose-950/30 text-rose-300';
                } else if (isFailed) {
                  borderClass = 'border-red-500/60 bg-red-950/30 text-red-300';
                } else if (isCurrent) {
                  borderClass = 'border-indigo-500 bg-indigo-950/40 text-indigo-300 shadow-sm';
                } else if (isPassed) {
                  borderClass = 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300';
                }

                return (
                  <div
                    key={stg.key}
                    className={`p-3 rounded-lg border flex flex-col justify-between relative transition-all ${borderClass}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono uppercase font-bold">
                        Step 0{idx + 1}
                      </span>
                      {isPassed ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      ) : isCurrent && !isFailed ? (
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                      ) : isFailed || isGated ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                      ) : null}
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-white">{stg.label}</div>
                      <div className="text-[10px] text-slate-400 truncate">{stg.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Incident Context Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-base font-bold font-mono text-white">{currentEvent.errorType}</span>
                  {currentEvent.isRegression && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950 text-orange-400 border border-orange-500/40">
                      REGRESSION
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {currentEvent.normalizedFilePath}:{currentEvent.lineNumber ?? 'N/A'} • {currentEvent.occurrenceCount} occurrences
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <span
                  className={`px-3 py-1 rounded text-xs font-mono font-bold uppercase ${
                    currentEvent.status === 'review'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse'
                      : currentEvent.status === 'pr_created'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                      : currentEvent.status === 'gated_notify_only'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                      : currentEvent.status === 'failed'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/50'
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50'
                  }`}
                >
                  Stage: {currentEvent.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            {/* If Gated */}
            {currentEvent.status === 'gated_notify_only' && (
              <div className="p-4 bg-rose-950/40 border border-rose-500/40 rounded-xl mb-4 text-rose-200">
                <div className="flex items-center space-x-2 font-semibold text-xs text-rose-400 mb-1">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Gatekeeper Blocked Auto-Fix Progression</span>
                </div>
                <p className="text-xs font-mono">{currentEvent.denialReason}</p>
              </div>
            )}

            {/* If Failed */}
            {currentEvent.status === 'failed' && (
              <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-xl mb-4 text-red-200">
                <div className="flex items-center space-x-2 font-semibold text-xs text-red-400 mb-1">
                  <AlertCircle className="w-4 h-4" />
                  <span>Pipeline Execution Error</span>
                </div>
                <p className="text-xs font-mono">{currentEvent.errorMessage || 'An error occurred during diagnosis or sandbox test.'}</p>
                <div className="mt-3 flex space-x-2">
                  <button
                    disabled={isProcessingAction}
                    onClick={() => onRunDiagnosis(currentEvent.id)}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Retry Diagnosis
                  </button>
                </div>
              </div>
            )}

            {/* Stack trace accordion */}
            <div className="text-xs">
              <span className="text-slate-400 block font-semibold mb-1">Error Message & Stack:</span>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-32">
                <div className="text-rose-400 font-bold mb-1">{currentEvent.message}</div>
                <pre className="whitespace-pre-wrap leading-relaxed">{currentEvent.stackTrace || 'No stack trace captured.'}</pre>
              </div>
            </div>
          </div>

          {/* Step 4: Gemini High-Thinking Diagnosis */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-purple-600/20 border border-purple-500/30 rounded-lg">
                  <Cpu className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">Gemini AI Diagnosis</h3>
                  <p className="text-[11px] text-slate-400">Structured Root Cause & Fix Strategy</p>
                </div>
              </div>

              {currentEvent.diagnosis && (
                <span
                  className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    currentEvent.diagnosis.confidence === 'high'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                      : currentEvent.diagnosis.confidence === 'medium'
                      ? 'bg-amber-950 text-amber-300 border border-amber-500/30'
                      : 'bg-rose-950 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  Confidence: {currentEvent.diagnosis.confidence}
                </span>
              )}
            </div>

            {currentEvent.diagnosis ? (
              <div className="space-y-4 text-xs">
                <div>
                  <h4 className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider mb-1">
                    Root Cause Analysis:
                  </h4>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 leading-relaxed font-sans">
                    {currentEvent.diagnosis.rootCause}
                  </div>
                </div>

                <div>
                  <h4 className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider mb-1">
                    Proposed Code Remediation Strategy:
                  </h4>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 leading-relaxed font-sans">
                    {currentEvent.diagnosis.proposedFix}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-slate-950 border border-dashed border-slate-800 rounded-lg text-center">
                <p className="text-xs text-slate-400">No diagnosis generated yet.</p>
                <button
                  id="trigger-diagnosis-btn"
                  disabled={isProcessingAction}
                  onClick={() => onRunDiagnosis(currentEvent.id)}
                  className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg inline-flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isProcessingAction ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cpu className="w-3.5 h-3.5" />}
                  <span>Run Gemini Diagnosis</span>
                </button>
              </div>
            )}
          </div>

          {/* Step 5: Unified Diff Patch Viewer & Sandbox */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Diff Viewer */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-semibold text-white text-sm">Generated Unified Diff Patch</h3>
                </div>
                <span className="text-[11px] font-mono text-slate-400">Strict Unified Diff Syntax</span>
              </div>

              {currentEvent.patchDiff ? (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] overflow-x-auto max-h-72 flex-1">
                  {currentEvent.patchDiff.split('\n').map((line, idx) => {
                    let lineStyle = 'text-slate-400';
                    if (line.startsWith('+') && !line.startsWith('+++')) lineStyle = 'text-emerald-400 bg-emerald-950/20';
                    if (line.startsWith('-') && !line.startsWith('---')) lineStyle = 'text-rose-400 bg-rose-950/20';
                    if (line.startsWith('@@')) lineStyle = 'text-indigo-400 font-bold';
                    return (
                      <div key={idx} className={`${lineStyle} px-1 whitespace-pre`}>
                        {line}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 bg-slate-950 border border-dashed border-slate-800 rounded-lg text-center flex-1 flex flex-col items-center justify-center">
                  <p className="text-xs text-slate-400">Patch diff not yet generated.</p>
                  {currentEvent.diagnosis && (
                    <button
                      disabled={isProcessingAction}
                      onClick={() => onRunPatchTest(currentEvent.id)}
                      className="mt-3 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Generate Patch & Test
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Sandbox Test Console */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  <h3 className="font-semibold text-white text-sm">Sandbox Test Execution Console</h3>
                </div>
                {currentEvent.sandboxResult && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      currentEvent.sandboxResult.status === 'passed'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-950 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {currentEvent.sandboxResult.status} (exit {currentEvent.sandboxResult.exitCode})
                  </span>
                )}
              </div>

              {/* Limitation badge */}
              <div className="text-[10px] text-amber-300/90 bg-amber-950/30 border border-amber-500/30 p-2 rounded-lg mb-3">
                <span className="font-semibold">Runtime Boundary:</span> In-process container execution. Hardened microVM sandbox isolation required for untrusted production code.
              </div>

              {currentEvent.sandboxResult ? (
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-56 whitespace-pre-wrap leading-relaxed flex-1">
                  {currentEvent.sandboxResult.output}
                </pre>
              ) : (
                <div className="p-6 bg-slate-950 border border-dashed border-slate-800 rounded-lg text-center flex-1 flex flex-col items-center justify-center">
                  <p className="text-xs text-slate-400">Sandbox test not yet executed.</p>
                </div>
              )}
            </div>
          </div>

          {/* Step 6: Human Review Decision Bar & PR Staging */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <GitPullRequest className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-bold text-white">Human Gate: Production PR Staging</h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  PR creation is gated behind explicit human operator authorization or Telegram command <code className="text-slate-300">/approve {currentEvent.id}</code>.
                </p>
              </div>

              {currentEvent.status === 'review' && (
                <div className="flex items-center space-x-3">
                  <button
                    id="approve-pr-btn"
                    disabled={isProcessingAction}
                    onClick={() => onApprovePR(currentEvent.id)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center space-x-2 shadow-lg shadow-emerald-950/50 cursor-pointer disabled:opacity-50 transition-all"
                  >
                    {isProcessingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    <span>Approve & Create GitHub PR</span>
                  </button>

                  <button
                    id="reject-btn"
                    disabled={isProcessingAction}
                    onClick={() => setShowRejectInput(!showRejectInput)}
                    className="px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-semibold rounded-xl text-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject Remediation</span>
                  </button>
                </div>
              )}

              {currentEvent.status === 'pr_created' && currentEvent.pullRequest && (
                <div className="flex items-center space-x-3">
                  <a
                    href={currentEvent.pullRequest.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs inline-flex items-center space-x-2 cursor-pointer shadow-md transition-all"
                  >
                    <GitPullRequest className="w-4 h-4" />
                    <span>View PR #{currentEvent.pullRequest.prNumber} on GitHub</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {/* Rejection input prompt */}
            {showRejectInput && (
              <div className="mt-4 pt-4 border-t border-slate-800 flex items-center space-x-3">
                <input
                  type="text"
                  placeholder="State reason for rejecting remediation..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
                <button
                  onClick={() => {
                    onReject(currentEvent.id, rejectReason);
                    setShowRejectInput(false);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Confirm Rejection
                </button>
              </div>
            )}
          </div>

          {/* Chronological Stage Transition History for this Event */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Chronological Stage History ({eventTransitions.length} movements)
            </h4>
            <div className="space-y-2">
              {eventTransitions.length === 0 ? (
                <p className="text-xs text-slate-500">No stage transitions recorded yet.</p>
              ) : (
                eventTransitions.map((tr) => (
                  <div
                    key={tr.id}
                    className="p-2.5 bg-slate-950 border border-slate-800/80 rounded-lg text-xs flex items-center justify-between font-mono"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-400">{tr.fromStage}</span>
                      <ArrowRight className="w-3 h-3 text-indigo-400" />
                      <span className="text-indigo-300 font-bold">{tr.toStage}</span>
                      <span className="text-slate-500 text-[11px]">— {tr.reason || 'No note'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center space-x-2">
                      <span className="text-slate-400">{tr.actor}</span>
                      <span>•</span>
                      <span>{new Date(tr.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
