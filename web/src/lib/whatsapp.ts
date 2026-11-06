// Free one-tap WhatsApp sharing (no paid API): opens WhatsApp with the party's
// number and a ready message. The shop owner taps Send.
import { formatPaiseToINR, Transaction } from '@yorbalance/shared';

export function waLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

const rs = (p: number) => formatPaiseToINR(p, true);

export function billMessage(shopName: string, tx: Transaction): string {
  const lines = (tx.items ?? []).map(i => `• ${i.item_name} × ${i.quantity} = ${rs(i.amount_paise)}`);
  const kind = tx.type === 'SALE' ? 'Bill' : tx.type === 'PURCHASE' ? 'Purchase bill' : 'Job work bill';
  return [
    `*${shopName}*`,
    `${kind} No. ${tx.invoice_number} · ${tx.invoice_date}`,
    '',
    ...lines,
    '',
    `Total: *${rs(tx.grand_total_paise)}*`,
    tx.pending_paise > 0 && tx.pending_paise !== tx.grand_total_paise ? `Balance: *${rs(tx.pending_paise)}*` : '',
    '',
    'Thank you.'
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

export function reminderMessage(shopName: string, partyName: string, tx: Transaction): string {
  return [
    `Namaste ${partyName},`,
    `This is a reminder from *${shopName}*.`,
    `Bill No. ${tx.invoice_number} dated ${tx.invoice_date} has *${rs(tx.pending_paise)}* pending.`,
    'Please arrange the payment. Thank you.'
  ].join('\n');
}

export function openWhatsApp(phone: string, text: string) {
  window.open(waLink(phone, text), '_blank', 'noopener');
}
