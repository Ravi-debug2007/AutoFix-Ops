import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, query, orderBy, limit, setDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { Header, TabKey } from './components/Header';
import { OverviewTab } from './components/OverviewTab';
import { EventsTab } from './components/EventsTab';
import { PipelineTab } from './components/PipelineTab';
import { PullRequestsTab } from './components/PullRequestsTab';
import { AuditLogTab } from './components/AuditLogTab';
import { SettingsTab } from './components/SettingsTab';
import { WebhookSimulatorTab } from './components/WebhookSimulatorTab';
import { ErrorEvent, StageTransition, PullRequest, AuditLog, Settings } from './types';
import { Loader2, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const MainApp: React.FC = () => {
  const { currentUser, isAllowed, loading, settings } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [events, setEvents] = useState<ErrorEvent[]>([]);
  const [transitions, setTransitions] = useState<StageTransition[]>([]);
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ErrorEvent | null>(null);

  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 6000);
  };

  // 1. Real-time Listeners for error_events and stage_transitions
  useEffect(() => {
    if (!currentUser || !isAllowed) return;

    // Listen to error_events
    const qEvents = query(collection(db, 'error_events'), limit(100));
    const unsubEvents = onSnapshot(
      qEvents,
      (snap) => {
        const list: ErrorEvent[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as ErrorEvent);
        });
        // Sort in memory by lastSeen desc
        list.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
        setEvents(list);

        // Keep selectedEvent in sync if updated
        if (selectedEvent) {
          const fresh = list.find((e) => e.id === selectedEvent.id);
          if (fresh) setSelectedEvent(fresh);
        }
      },
      (err) => console.warn('Events listener warning:', err)
    );

    // Listen to stage_transitions
    const qTrans = query(collection(db, 'stage_transitions'), limit(200));
    const unsubTrans = onSnapshot(
      qTrans,
      (snap) => {
        const list: StageTransition[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as StageTransition);
        });
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setTransitions(list);
      },
      (err) => console.warn('Transitions listener warning:', err)
    );

    // Listen to pull_requests
    const qPrs = query(collection(db, 'pull_requests'), limit(50));
    const unsubPrs = onSnapshot(
      qPrs,
      (snap) => {
        const list: PullRequest[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as PullRequest);
        });
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setPullRequests(list);
      },
      (err) => console.warn('PRs listener warning:', err)
    );

    // Listen to audit_logs
    const qAudit = query(collection(db, 'audit_logs'), limit(100));
    const unsubAudit = onSnapshot(
      qAudit,
      (snap) => {
        const list: AuditLog[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as AuditLog);
        });
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setAuditLogs(list);
      },
      (err) => console.warn('Audit logs listener warning:', err)
    );

    return () => {
      unsubEvents();
      unsubTrans();
      unsubPrs();
      unsubAudit();
    };
  }, [currentUser, isAllowed, selectedEvent?.id]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 space-y-3">
        <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
        <p className="text-xs font-mono">Initializing AutoFix Ops Environment...</p>
      </div>
    );
  }

  // Auth Gate
  if (!currentUser || !isAllowed) {
    return <LoginScreen />;
  }

  // Action Handlers
  const handleRunDiagnosis = async (eventId: string) => {
    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/pipeline/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      if (!res.ok) {
        const err = await res.json();
        showNotification('error', `Diagnosis failed: ${err.error || 'Server error'}`);
      } else {
        showNotification('success', 'Diagnosis started successfully.');
      }
    } catch (err) {
      showNotification('error', `Diagnosis network error: ${err}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleRunPatchTest = async (eventId: string) => {
    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/pipeline/patch-and-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      if (!res.ok) {
        const err = await res.json();
        showNotification('error', `Patch & Test failed: ${err.error || 'Server error'}`);
      } else {
        showNotification('success', 'Patch generation and sandbox test queued.');
      }
    } catch (err) {
      showNotification('error', `Patch & Test network error: ${err}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleApprovePR = async (eventId: string) => {
    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/pipeline/approve-and-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification('error', `PR creation failed: ${data.error || 'Check GITHUB_TOKEN configuration'}`);
      } else {
        showNotification('success', `PR created successfully! #${data.pr?.prNumber || 'Done'}`);
      }
    } catch (err) {
      showNotification('error', `Approve PR network error: ${err}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleReject = async (eventId: string, reason?: string) => {
    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/pipeline/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        showNotification('error', `Reject failed: ${data.error || 'Server error'}`);
      } else {
        showNotification('info', 'Incident patch marked as rejected.');
      }
    } catch (err) {
      showNotification('error', `Reject error: ${err}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleTriggerOrchestration = async (eventId: string) => {
    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/pipeline/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      if (!res.ok) {
        const data = await res.json();
        showNotification('error', `Orchestration trigger failed: ${data.error || 'Server error'}`);
      } else {
        showNotification('success', 'Autonomous remediation orchestrator triggered.');
      }
    } catch (err) {
      showNotification('error', `Orchestration trigger error: ${err}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleTogglePause = async () => {
    const nextPaused = !settings?.isPaused;
    try {
      await fetch('/api/system/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPaused: nextPaused }),
      });
    } catch (err) {
      console.error('Failed to toggle pause:', err);
    }
  };

  const handleSaveSettings = async (updated: Partial<Settings>) => {
    setIsSavingSettings(true);
    try {
      // Persist directly to Firestore
      await setDoc(doc(db, 'settings', 'global'), updated, { merge: true });
      // Also notify server
      await fetch('/api/system/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const openIncidentsCount = events.filter((e) =>
    ['ingested', 'diagnosing', 'diagnosed', 'patching', 'sandboxing', 'review'].includes(e.status)
  ).length;

  const inReviewCount = events.filter((e) => e.status === 'review').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        openIncidentsCount={openIncidentsCount}
        inReviewCount={inReviewCount}
        settings={settings}
        onTogglePause={handleTogglePause}
      />

      {notification && (
        <div
          id="app-notification-toast"
          className="fixed top-16 right-4 z-50 max-w-md w-full shadow-2xl rounded-xl border p-4 backdrop-blur-md animate-in slide-in-from-top-4 duration-200 transition-all flex items-start justify-between space-x-3"
          style={{
            backgroundColor:
              notification.type === 'error'
                ? 'rgba(69, 10, 10, 0.95)'
                : notification.type === 'success'
                ? 'rgba(6, 78, 59, 0.95)'
                : 'rgba(30, 41, 59, 0.95)',
            borderColor:
              notification.type === 'error'
                ? 'rgba(239, 68, 68, 0.4)'
                : notification.type === 'success'
                ? 'rgba(16, 185, 129, 0.4)'
                : 'rgba(99, 102, 241, 0.4)',
          }}
        >
          <div className="flex items-start space-x-3">
            {notification.type === 'error' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
            {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
            {notification.type === 'info' && <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />}
            <p className="text-xs text-white font-medium leading-relaxed">{notification.message}</p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'overview' && (
          <OverviewTab
            events={events}
            transitions={transitions}
            settings={settings}
            onNavigate={setActiveTab}
            onSelectEvent={(evt) => {
              setSelectedEvent(evt);
              setActiveTab('pipeline');
            }}
          />
        )}

        {activeTab === 'events' && (
          <EventsTab
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            onNavigateToPipeline={(evt) => {
              setSelectedEvent(evt);
              setActiveTab('pipeline');
            }}
            onRunDiagnosis={handleRunDiagnosis}
            onRunPatchTest={handleRunPatchTest}
            onApprovePR={handleApprovePR}
            onReject={(id) => handleReject(id)}
            isProcessingAction={isProcessingAction}
          />
        )}

        {activeTab === 'pipeline' && (
          <PipelineTab
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            transitions={transitions}
            onRunDiagnosis={handleRunDiagnosis}
            onRunPatchTest={handleRunPatchTest}
            onApprovePR={handleApprovePR}
            onReject={handleReject}
            onTriggerOrchestration={handleTriggerOrchestration}
            isProcessingAction={isProcessingAction}
          />
        )}

        {activeTab === 'prs' && (
          <PullRequestsTab
            events={events}
            pullRequests={pullRequests}
            onSelectEvent={(evt) => {
              setSelectedEvent(evt);
              setActiveTab('pipeline');
            }}
          />
        )}

        {activeTab === 'audit' && <AuditLogTab auditLogs={auditLogs} />}

        {activeTab === 'settings' && (
          <SettingsTab
            settings={settings}
            onSaveSettings={handleSaveSettings}
            isSaving={isSavingSettings}
          />
        )}

        {activeTab === 'simulator' && (
          <WebhookSimulatorTab
            events={events}
            onNavigateToEvent={(evt) => {
              setSelectedEvent(evt);
              setActiveTab('pipeline');
            }}
          />
        )}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
