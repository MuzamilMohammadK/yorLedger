import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { Transaction } from '@yorbalance/shared';
import { api } from './api';
import { auth, db } from './firebase';
import { todayIST } from './data/util';

/**
 * Run a loader now and again whenever the shop's live data changes
 * (another device added a bill, a payment synced, ...).
 */
export function useLive<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => load().then(d => { if (alive) { setData(d); setError(null); } })
      .catch(e => { if (alive) setError(e?.message ?? 'Error'); });
    run();
    const unsub = api.onDataChange(run);
    return () => { alive = false; unsub(); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error };
}

export interface Alert {
  id: string;
  kind: 'SHOP_APPROVED' | 'SHOP_REJECTED' | 'DUE';
  read: boolean;
  reason?: string | null;
  bill?: Transaction;
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Bills whose reminder window has started and still have money due. */
export function dueReminders(bills: Transaction[], rawLead: (id: string) => number | null): Transaction[] {
  const today = todayIST();
  return bills
    .filter(b => b.due_date && b.pending_paise > 0 && addDays(b.due_date, -(rawLead(b.id) ?? 0)) <= today)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
}

/** In-app inbox + due reminders, live. */
export function useAlerts(approved: boolean) {
  const [inbox, setInbox] = useState<Alert[]>([]);
  const [due, setDue] = useState<Alert[]>([]);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'users', uid, 'notifications'), orderBy('created_at', 'desc'), limit(20)),
      snap => setInbox(snap.docs.map(d => ({
        id: d.id, kind: d.data().kind, read: !!d.data().read_at, reason: d.data().payload?.reason ?? null
      }))),
      () => setInbox([])
    );
  }, []);

  const { data } = useLive(async () => (approved ? api.getRemindersDue() : []), [approved]);
  useEffect(() => {
    setDue((data ?? []).map(b => ({ id: `due-${b.id}`, kind: 'DUE' as const, read: false, bill: b })));
  }, [data]);

  const markRead = async (id: string) => {
    const uid = auth.currentUser?.uid;
    if (uid && !id.startsWith('due-')) await updateDoc(doc(db, 'users', uid, 'notifications', id), { read_at: serverTimestamp() });
  };

  const all = [...due, ...inbox];
  return { alerts: all, unread: all.filter(a => !a.read).length, markRead };
}
