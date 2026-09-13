import React, { useState } from 'react';
import { AuditLog } from '../types';
import { FileText, Search, ShieldCheck, ShieldAlert, User, Clock, Terminal } from 'lucide-react';

interface AuditLogTabProps {
  auditLogs: AuditLog[];
}

export const AuditLogTab: React.FC<AuditLogTabProps> = ({ auditLogs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const filteredLogs = auditLogs.filter((log) => {
    if (actionFilter !== 'all' && !log.action.includes(actionFilter)) return false;
    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      const matchAction = log.action.toLowerCase().includes(term);
      const matchActor = log.actor.toLowerCase().includes(term);
      const matchReason = (log.reason || '').toLowerCase().includes(term);
      const matchId = (log.eventId || '').toLowerCase().includes(term);
      if (!matchAction && !matchActor && !matchReason && !matchId) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white">Security & Operational Audit Trail</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable chronicle of all gatekeeper decisions, human operator approvals, Telegram actions, and stage transitions.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search audit trail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All Actions</option>
            <option value="gate">Gatekeeper Decisions</option>
            <option value="approve">Approvals</option>
            <option value="reject">Rejections</option>
            <option value="telegram">Telegram Bot</option>
            <option value="sandbox">Sandbox Testing</option>
          </select>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono uppercase text-[10px]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Associated Event</th>
                <th className="py-3 px-4">Reason & Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    No audit records match the current filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isBlocked = log.action.includes('block') || log.action.includes('reject') || log.action.includes('failed');
                  const isApproved = log.action.includes('approve') || log.action.includes('passed');

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                            isBlocked
                              ? 'bg-rose-950 text-rose-300 border border-rose-500/30'
                              : isApproved
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                              : 'bg-indigo-950 text-indigo-300 border border-indigo-500/30'
                          }`}
                        >
                          {isBlocked ? (
                            <ShieldAlert className="w-2.5 h-2.5" />
                          ) : isApproved ? (
                            <ShieldCheck className="w-2.5 h-2.5" />
                          ) : null}
                          <span>{log.action.replace(/_/g, ' ')}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300">
                        <div className="flex items-center space-x-1.5">
                          <User className="w-3 h-3 text-slate-500" />
                          <span>{log.actor}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        {log.eventId ? (
                          <span className="text-indigo-400">{log.eventId}</span>
                        ) : (
                          <span className="text-slate-600">Global</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-300 max-w-md">
                        <p className="truncate font-mono text-[11px]">{log.reason || 'No description provided'}</p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
