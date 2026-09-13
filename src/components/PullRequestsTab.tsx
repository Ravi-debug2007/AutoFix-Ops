import React from 'react';
import { PullRequest, ErrorEvent } from '../types';
import { GitPullRequest, ExternalLink, GitBranch, Calendar, CheckCircle } from 'lucide-react';

interface PullRequestsTabProps {
  events: ErrorEvent[];
  pullRequests: PullRequest[];
  onSelectEvent: (event: ErrorEvent) => void;
}

export const PullRequestsTab: React.FC<PullRequestsTabProps> = ({
  events,
  pullRequests,
  onSelectEvent,
}) => {
  // Combine PR collection and events with pullRequest info
  const allPrs: {
    id: string;
    prNumber: number;
    prUrl: string;
    branchName: string;
    title: string;
    status: string;
    createdAt: string;
    event?: ErrorEvent;
  }[] = [];

  // From pullRequests collection
  pullRequests.forEach((pr) => {
    const ev = events.find((e) => e.id === pr.eventId);
    allPrs.push({
      id: pr.id,
      prNumber: pr.prNumber,
      prUrl: pr.prUrl,
      branchName: pr.branchName,
      title: pr.title,
      status: pr.status,
      createdAt: pr.createdAt,
      event: ev,
    });
  });

  // From events directly if not already included
  events
    .filter((e) => e.pullRequest && !allPrs.some((p) => p.prNumber === e.pullRequest?.prNumber))
    .forEach((e) => {
      const pr = e.pullRequest!;
      allPrs.push({
        id: `pr_ev_${e.id}`,
        prNumber: pr.prNumber,
        prUrl: pr.prUrl,
        branchName: pr.branchName,
        title: `fix(${e.errorType}): remediate ${e.normalizedFilePath}`,
        status: 'open',
        createdAt: pr.createdAt,
        event: e,
      });
    });

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Staged Pull Requests</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Production pull requests generated after automated diagnosis, sandbox testing, and human operator sign-off.
            </p>
          </div>
          <span className="px-2.5 py-1 bg-indigo-950 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-mono font-bold">
            {allPrs.length} Staged PRs
          </span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {allPrs.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <GitPullRequest className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-300">No Pull Requests Staged Yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              When an incident passes through diagnosis and sandbox verification, an operator can approve it to open a pull request.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {allPrs.map((pr) => (
              <div
                key={pr.id}
                className="p-4 hover:bg-slate-800/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-white">{pr.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                      #{pr.prNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/30 uppercase">
                      {pr.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                    <div className="flex items-center space-x-1">
                      <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{pr.branchName}</span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      <span>{new Date(pr.createdAt).toLocaleString()}</span>
                    </div>
                    {pr.event && (
                      <>
                        <span>•</span>
                        <span>Incident: {pr.event.errorType} ({pr.event.normalizedFilePath})</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {pr.event && (
                    <button
                      onClick={() => onSelectEvent(pr.event!)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      View Incident
                    </button>
                  )}
                  <a
                    href={pr.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg inline-flex items-center space-x-1.5 cursor-pointer transition-colors"
                  >
                    <span>Open on GitHub</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
