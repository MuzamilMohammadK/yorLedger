// Due-date reminders without a server (Spark plan).
// Spec §16: fire at 08:00 IST on (remind_on − remind_lead_days) while money is due,
// once per bill and date (idempotent).
//  - Android app: real scheduled local notifications (fire even when the app is closed).
//  - Desktop app / website: system notification when the app is open, checked every 30 min.
import { formatPaiseToINR } from '@yorbalance/shared';
import { cache } from './data/cache';
import { todayIST } from './data/util';
import { isAndroidApp } from './platform';
import { api } from './api';

type T = (key: any, vars?: Record<string, string | number>) => string;

interface Due { billId: string; fireDate: string; title: string; body: string }

const SENT_KEY = 'yorledger_reminded';
const MAX_SCHEDULED = 60;

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 08:00 IST on a date = 02:30 UTC. */
const at8amIST = (iso: string) => new Date(`${iso}T02:30:00Z`);

/** Stable positive 31-bit id per bill + date, so re-scheduling replaces instead of duplicating. */
function notifId(billId: string, date: string) {
  let h = 7;
  for (const c of billId + date) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 2147483647 || 1;
}

function collect(t: T): Due[] {
  const out: Due[] = [];
  for (const b of cache.rawBills()) {
    if (!b.remind_on || !(b.amount_due > 0)) continue;
    const fireDate = addDays(b.remind_on, -(b.remind_lead_days ?? 0));
    const amount = formatPaiseToINR(b.amount_due, true);
    const party = b.party_name ?? '';
    out.push({
      billId: b.id,
      fireDate,
      title: t('notif_title'),
      body: b.kind === 'SALE' ? t('notif_collect', { amount, party }) : t('notif_pay', { amount, party })
    });
  }
  return out.sort((a, b) => a.fireDate.localeCompare(b.fireDate));
}

function sentSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SENT_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
function markSent(keys: Set<string>) {
  try {
    // Keep the list small: drop entries older than ~60 days.
    const cutoff = addDays(todayIST(), -60);
    localStorage.setItem(SENT_KEY, JSON.stringify([...keys].filter(k => k.slice(-10) >= cutoff)));
  } catch {
    /* storage unavailable: worst case a reminder repeats */
  }
}

async function syncAndroid(dues: Due[]) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') {
    const req = await LocalNotifications.requestPermissions();
    if (req.display !== 'granted') return;
  }
  // Replace everything we scheduled before with the current list.
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });

  const now = Date.now();
  const today = todayIST();
  const sent = sentSet();
  const list = dues
    .map(d => {
      const key = `${d.billId}:${d.fireDate}`;
      let at = at8amIST(d.fireDate);
      // Missed today's 08:00 (app was closed / bill added later): show it shortly, once.
      if (at.getTime() <= now) {
        if (d.fireDate !== today || sent.has(key)) return null;
        at = new Date(now + 5000);
        sent.add(key);
      }
      return { id: notifId(d.billId, d.fireDate), title: d.title, body: d.body, schedule: { at, allowWhileIdle: true },
               smallIcon: 'ic_stat_yorledger', extra: { billId: d.billId } };
    })
    .filter((n): n is NonNullable<typeof n> => !!n)
    .slice(0, MAX_SCHEDULED);
  if (list.length) await LocalNotifications.schedule({ notifications: list });
  markSent(sent);
}

function syncBrowser(dues: Due[]) {
  if (!('Notification' in window)) return;
  const fire = () => {
    const now = Date.now();
    const sent = sentSet();
    let changed = false;
    for (const d of dues) {
      const key = `${d.billId}:${d.fireDate}`;
      // Only today's reminders (older ones are listed in the in-app Alerts instead).
      if (d.fireDate !== todayIST() || at8amIST(d.fireDate).getTime() > now || sent.has(key)) continue;
      new Notification(d.title, { body: d.body, tag: key, icon: './icon-512.png' });
      sent.add(key);
      changed = true;
    }
    if (changed) markSent(sent);
  };
  if (Notification.permission === 'granted') fire();
  else if (Notification.permission === 'default' && dues.some(d => d.fireDate <= todayIST())) {
    Notification.requestPermission().then(p => { if (p === 'granted') fire(); });
  }
}

let timer: number | undefined;
let pending: number | undefined;

/** Start keeping reminders in sync with the shop's bills. Returns a stop function. */
export function startReminders(t: T): () => void {
  const run = () => {
    window.clearTimeout(pending);
    // Debounce: many bill changes arrive together on first load.
    pending = window.setTimeout(async () => {
      // §12.6: respect "due reminders" and "phone / desktop notifications" switches.
      const n = (await api.getShopSettings().catch(() => null))?.notification_settings;
      const enabled = (n?.due_reminders ?? true) && (n?.push_notifications ?? true);
      const dues = enabled ? collect(t) : [];
      (isAndroidApp ? syncAndroid(dues) : Promise.resolve(syncBrowser(dues))).catch(e => console.warn('Reminder sync failed', e));
    }, 1500);
  };
  run();
  const unsub = cache.subscribe(run);
  if (!isAndroidApp) timer = window.setInterval(run, 30 * 60 * 1000);
  return () => { unsub(); window.clearInterval(timer); window.clearTimeout(pending); };
}
