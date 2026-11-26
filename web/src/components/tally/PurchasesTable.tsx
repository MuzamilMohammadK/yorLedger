import React from 'react';
import { TallyPurchaseLine, TallySupplierSplit, formatPaiseToINR } from '@yorbalance/shared';
import { useI18n } from '../../i18n';

interface Props {
  lines: TallyPurchaseLine[];
  totals: { qty: number; taxable_paise: number; gst_paise: number; total_paise: number };
  supplierSplit: TallySupplierSplit[];
  activePartyId?: string;
  onOpenBill: (billId: string) => void;
  onSelectSupplier: (partyId?: string) => void;
}

export const PurchasesTable: React.FC<Props> = ({
  lines,
  totals,
  supplierSplit,
  activePartyId,
  onOpenBill,
  onSelectSupplier
}) => {
  const { fmtDate } = useI18n();

  return (
    <div className="space-y-4">
      {supplierSplit.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-900">Supplier-wise summary</h3>
            {activePartyId && (
              <button
                type="button"
                onClick={() => onSelectSupplier(undefined)}
                className="text-xs font-semibold text-indigo-700 hover:underline"
              >
                Clear supplier filter
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {supplierSplit.map(s => {
              const selected = activePartyId === s.party_id;
              return (
                <button
                  key={s.party_id}
                  type="button"
                  onClick={() => onSelectSupplier(selected ? undefined : s.party_id)}
                  className={`text-left rounded-xl px-3 py-2 border transition-colors ${
                    selected
                      ? 'bg-indigo-700 text-white border-indigo-700'
                      : 'bg-slate-50 hover:bg-indigo-50/60 text-slate-900 border-slate-200'
                  }`}
                >
                  <p className="text-xs font-bold">{s.party_name}</p>
                  <p className={`text-xs tabular-nums ${selected ? 'text-indigo-100' : 'text-slate-600'}`}>
                    {s.qty} sarees · {formatPaiseToINR(s.total_paise, true)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Purchase lines</h3>
          <span className="text-xs text-slate-500 tabular-nums">{lines.length} lines</span>
        </div>

        {lines.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No purchase lines match the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                  <th className="px-3 py-2.5 whitespace-nowrap">Date</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Bill no.</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">HSN</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">No. of sarees</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Rate</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Taxable</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">GST</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l, idx) => (
                  <tr
                    key={`${l.bill_id}-${idx}`}
                    onClick={() => onOpenBill(l.bill_id)}
                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-600">{fmtDate(l.date)}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900 max-w-[180px] truncate" title={l.party_name}>
                      {l.party_name}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-indigo-700">{l.invoice_no}</td>
                    <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-slate-600">{l.hsn_code}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-semibold">{l.qty}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{formatPaiseToINR(l.rate_paise, true)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{formatPaiseToINR(l.taxable_paise, true)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{formatPaiseToINR(l.gst_paise, true)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-bold text-slate-900">
                      {formatPaiseToINR(l.total_paise, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                  <td colSpan={4} className="px-3 py-2.5 text-xs uppercase text-slate-600">Totals</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{totals.qty}</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{formatPaiseToINR(totals.taxable_paise, true)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{formatPaiseToINR(totals.gst_paise, true)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{formatPaiseToINR(totals.total_paise, true)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
