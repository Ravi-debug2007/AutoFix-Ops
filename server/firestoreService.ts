import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../src/lib/firebase';
import {
  ErrorEvent,
  StageTransition,
  PullRequest,
  AuditLog,
  Settings,
  PipelineStage,
} from '../src/types';

export const DEFAULT_SETTINGS: Settings = {
  budgetCap: 10,
  budgetWindowMinutes: 60,
  denylistPatterns: [
    '**/.env*',
    '**/secrets/**',
    '**/credentials/**',
    '**/auth/keys/**',
    '**/*.pem',
    '**/*.key',
  ],
  sandboxModeLabel: 'Host Runtime Sandbox (Container-level isolation limitation active)',
  telegramSenderWhitelist: [123456789],
  isPaused: false,
  authAllowlist: [
    'allampallyravikiran2007@gmail.com',
  ],
};

export async function getSettings(): Promise<Settings> {
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
    if (settingsDoc.exists()) {
      return { ...DEFAULT_SETTINGS, ...settingsDoc.data() } as Settings;
    }
    // Initialize default document
    await setDoc(doc(db, 'settings', 'global'), DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  } catch (err) {
    console.warn('Could not read settings from Firestore, returning defaults:', err);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await setDoc(doc(db, 'settings', 'global'), updated);
  return updated;
}

export async function findEventBySignature(signature: string): Promise<ErrorEvent | null> {
  try {
    const q = query(
      collection(db, 'error_events'),
      where('signature', '==', signature),
      limit(5)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    // Prefer open event if available
    for (const d of snap.docs) {
      const data = { id: d.id, ...d.data() } as ErrorEvent;
      if (data.status !== 'pr_created' && data.status !== 'failed' && data.status !== 'rejected') {
        return data;
      }
    }
    // Return the most recent one (even if resolved)
    const first = snap.docs[0];
    return { id: first.id, ...first.data() } as ErrorEvent;
  } catch (err) {
    console.error('Error finding event by signature:', err);
    return null;
  }
}

export async function getErrorEvent(id: string): Promise<ErrorEvent | null> {
  try {
    const snap = await getDoc(doc(db, 'error_events', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as ErrorEvent;
  } catch (err) {
    console.error(`Failed to get error event ${id}:`, err);
    return null;
  }
}

export async function createErrorEvent(event: Omit<ErrorEvent, 'id'>, customId?: string): Promise<ErrorEvent> {
  const id = customId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fullEvent: ErrorEvent = { ...event, id };
  await setDoc(doc(db, 'error_events', id), fullEvent);
  return fullEvent;
}

export async function updateErrorEvent(id: string, updates: Partial<ErrorEvent>): Promise<void> {
  await updateDoc(doc(db, 'error_events', id), updates);
}

export async function recordStageTransition(
  transition: Omit<StageTransition, 'id'>
): Promise<StageTransition> {
  const id = `trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fullTransition: StageTransition = { ...transition, id };
  await setDoc(doc(db, 'stage_transitions', id), fullTransition);
  return fullTransition;
}

export async function recordAuditLog(log: Omit<AuditLog, 'id'>): Promise<AuditLog> {
  const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fullLog: AuditLog = { ...log, id };
  await setDoc(doc(db, 'audit_logs', id), fullLog);
  return fullLog;
}

export async function countAttemptsInWindow(windowMinutes: number): Promise<number> {
  try {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    // Query stage transitions where fromStage is 'ingested' or toStage is 'diagnosing'
    const q = query(
      collection(db, 'stage_transitions'),
      where('timestamp', '>=', windowStart)
    );
    const snap = await getDocs(q);
    // Count distinct events that entered diagnosing
    const activeEvents = new Set<string>();
    snap.forEach((d) => {
      const data = d.data() as StageTransition;
      if (data.toStage === 'diagnosing' || data.toStage === 'diagnosed') {
        activeEvents.add(data.eventId);
      }
    });
    return activeEvents.size;
  } catch (err) {
    console.warn('Failed to count attempts in window:', err);
    return 0;
  }
}

export async function createPullRequestRecord(pr: Omit<PullRequest, 'id'>): Promise<PullRequest> {
  const id = `pr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const fullPr: PullRequest = { ...pr, id };
  await setDoc(doc(db, 'pull_requests', id), fullPr);
  return fullPr;
}
