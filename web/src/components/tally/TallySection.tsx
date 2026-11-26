import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { TallyFilter, TallyShowType, formatPaiseToINR, toCsv } from '@yorbalance/shared';
import { api } from '../../lib/api';
import { useLive } from '../../lib/useLiveData';
import { useAuth } from '../../context/AuthContext';
import { shareFile } from '../../lib/platform';
import { TallyFilters, PartyOption, presetRange } from './TallyFilters';
import { StockBalanceCard } from './StockBalanceCard';
import { SalesTable } from './SalesTable';
import { PurchasesTable } from './PurchasesTable';
import { HsnBalanceTable } from './HsnBalanceTable';
import { PolishPanel } from './PolishPanel';

export const TallySection: React.FC = () => {
  const { shop } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tick, setTick] = useState(0);

  const filter: TallyFilter = useMemo(() => {
    const def = presetRange('month');
    const hasAny = params.has('t_from') || params.has('t_to') || params.has('t_hsn') || params.has('t_party') || params.has('t_type');
    return {
      from: hasAny ? (params.get('t_from') || undefined) : def.from,
      to: hasAny ? (params.get('t_to') || undefined) : def.to,
      hsn: params.get('t_hsn') || undefined,
      partyId: params.get('t_party') || undefined,
      type: (params.get('t_type') as TallyShowType) || 'ALL'
    };
  }, [params]);

  const applyFilter = (next: TallyFilter) => {
    const p = new URLSearchParams(params);
    if (next.from) p.set('t_from', next.from); else p.delete('t_from');
    if (next.to) p.set('t_to', next.to); else p.delete('t_to');
    if (next.hsn?.trim()) p.set('t_hsn', next.hsn.trim()); else p.delete('t_hsn');
    if (next.partyId) p.set('t_party', next.partyId); else p.delete('t_party');
    if (next.type && next.type !== 'ALL') p.set('t_type', next.type); else p.delete('t_type');
    setParams(p, { replace: true });
  };

  const key = JSON.stringify(filter);
  const { data: tally, error } = useLive(() => api.getTally(filter), [key, tick]);
  const { data: partiesData } = useLive(() => api.getParties(), [tick]);

  const showType: TallyShowType = filter.type ?? 'ALL';
  const purchasesMode = showType === 'PURCHASES';
  const salesMode = showType === 'SALES';

  const parties: PartyOption[] = useMemo(() => {
    const list = partiesData?.parties ?? [];
    return list.map(p => ({ id: p.id, name: p.name, role: p.type }));
  }, [partiesData]);

  // Filtered party list for the dropdown — suppliers for Purchases, customers for Sales, all otherwise
  const filteredParties = useMemo(() => {
    if (purchasesMode) return parties.filter(p => p.role === 'SUPPLIER' || p.role === 'BOTH');
    if (salesMode) return parties.filter(p => p.role === 'CUSTOMER' || p.role === 'BOTH');
    return parties;
  }, [parties, purchasesMode, salesMode]);

  const partyLabel = purchasesMode ? 'Supplier' : salesMode ? 'Customer' : 'Person / Party';

  const handleExportCsv = async () => {
    if (!tally) return;

    const cols = [
      { key: 'date', label: 'Date' },
      { key: 'party_name', label: 'Person' },
      { key: 'invoice_no', label: 'Bill no.' },
      { key: 'hsn_code', label: 'HSN' },
      { key: 'qty', label: 'No. of sarees' },
      { key: 'rate', label: 'Rate' },
      { key: 'taxable', label: 'Taxable' },
      { key: 'gst', label: 'GST' },
      { key: 'total', label: 'Total' }
    ];
    const toRow = (l: { date: string; party_name: string; invoice_no: string; hsn_code: string; qty: number; rate_paise: number; taxable_paise: number; gst_paise: number; total_paise: number }) => ({
      date: l.date,
      party_name: l.party_name,
      invoice_no: l.invoice_no,
      hsn_code: l.hsn_code,
      qty: l.qty,
      rate: l.rate_paise / 100,
      taxable: l.taxable_paise / 100,
      gst: l.gst_paise / 100,
      total: l.total_paise / 100
    });

    const meta = { shop: shop?.name ?? 'YorLedger', gstin: shop?.gstin ?? '', report: '', period: `${filter.from || 'All'} to ${filter.to || 'All'}` };
    const sections: string[] = [];

    if (tally.lines.length > 0) {
      sections.push(toCsv({ ...meta, report: 'Sales Lines' }, cols, tally.lines.map(toRow), {
        qty: tally.totals.qty, taxable: tally.totals.taxable_paise / 100, gst: tally.totals.gst_paise / 100, total: tally.totals.total_paise / 100
      }));
    }
    if (tally.purchase_lines.length > 0) {
      sections.push(toCsv({ ...meta, report: 'Purchase Lines' }, cols, tally.purchase_lines.map(toRow), {
        qty: tally.purchase_totals.qty, taxable: tally.purchase_totals.taxable_paise / 100, gst: tally.purchase_totals.gst_paise / 100, total: tally.purchase_totals.total_paise / 100
      }));
    }

    const csv = sections.join('\n\n');
    await shareFile(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), 'yorledger-tally.csv', 'Tally CSV');
  };

  const handleExportPdf = () => {
    if (!tally) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text(`${shop?.name ?? 'YorLedger'} — Tally Summary`, 40, 40);
    doc.setFontSize(10);
    doc.text(`Period: ${filter.from || 'All'} to ${filter.to || 'All'} | HSN: ${filter.hsn || 'All'}`, 40, 58);
    doc.text(
      `Sales: ${formatPaiseToINR(tally.totals.total_paise, true)} | Sarees: ${tally.totals.qty} | Purchases: ${formatPaiseToINR(tally.purchase_totals.total_paise, true)} | Book balance: ${tally.equation.book_balance}`,
      40, 74
    );
    let y = 100;
    doc.setFontSize(9);

    if (tally.lines.length > 0) {
      doc.setFontSize(10); doc.text('Sales Lines', 40, y); y += 14; doc.setFontSize(9);
      doc.text('Date | Person | Bill | HSN | Qty | Taxable | GST | Total', 40, y); y += 12;
      for (const l of tally.lines.slice(0, 20)) {
        doc.text(`${l.date} | ${l.party_name.slice(0, 18)} | ${l.invoice_no} | ${l.hsn_code} | ${l.qty} | ${formatPaiseToINR(l.taxable_paise, true)} | ${formatPaiseToINR(l.gst_paise, true)} | ${formatPaiseToINR(l.total_paise, true)}`, 40, y);
        y += 12; if (y > 540) break;
      }
    }
    if (tally.purchase_lines.length > 0 && y < 530) {
      y += 8; doc.setFontSize(10); doc.text('Purchase Lines', 40, y); y += 14; doc.setFontSize(9);
      doc.text('Date | Supplier | Bill | HSN | Qty | Taxable | GST | Total', 40, y); y += 12;
      for (const l of tally.purchase_lines.slice(0, 20)) {
        doc.text(`${l.date} | ${l.party_name.slice(0, 18)} | ${l.invoice_no} | ${l.hsn_code} | ${l.qty} | ${formatPaiseToINR(l.taxable_paise, true)} | ${formatPaiseToINR(l.gst_paise, true)} | ${formatPaiseToINR(l.total_paise, true)}`, 40, y);
        y += 12; if (y > 540) break;
      }
    }
    doc.save('yorledger-tally.pdf');
  };

  const showSalesTable = showType === 'SALES' || showType === 'BOTH' || showType === 'ALL';
  const showPurchasesTable = showType === 'PURCHASES' || showType === 'ALL';
  const showPolishPanel = showType !== 'SALES' && showType !== 'PURCHASES';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tally</h2>
          <p className="text-xs sm:text-sm text-slate-600">
            HSN-wise stock balance, filtered sales &amp; purchase lines, physical counts, and polishing
          </p>
        </div>
      </div>

      <TallyFilters
        filter={filter}
        parties={filteredParties}
        partyLabel={partyLabel}
        onApply={applyFilter}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
      />

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span className="font-semibold">Unable to load tally:</span> {error}
        </div>
      )}

      {!tally && !error && (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-200/70" />)}
          </div>
          <div className="h-44 rounded-2xl bg-slate-200/70" />
          <div className="h-56 rounded-2xl bg-slate-200/70" />
        </div>
      )}

      {tally && (
        <div className="space-y-4">
          <StockBalanceCard
            totals={tally.totals}
            purchaseTotals={tally.purchase_totals}
            showPurchases={showPurchasesTable}
            equation={tally.equation}
            hsnLabel={filter.hsn}
          />

          {showSalesTable && (
            <SalesTable
              lines={tally.lines}
              totals={tally.totals}
              personSplit={tally.person_split}
              activePartyId={filter.partyId}
              onOpenBill={id => navigate(`/history?bill=${id}`)}
              onSelectParty={partyId => applyFilter({ ...filter, partyId })}
            />
          )}

          {showPurchasesTable && (
            <PurchasesTable
              lines={tally.purchase_lines}
              totals={tally.purchase_totals}
              supplierSplit={tally.supplier_split}
              activePartyId={filter.partyId}
              onOpenBill={id => navigate(`/history?bill=${id}`)}
              onSelectSupplier={partyId => applyFilter({ ...filter, partyId })}
            />
          )}

          <HsnBalanceTable rows={tally.hsn_balances} onRefresh={() => setTick(t => t + 1)} />

          {showPolishPanel && (
            <PolishPanel
              summary={tally.polish_summary}
              entries={tally.polish_entries}
              parties={parties}
              defaultHsn={filter.hsn}
              onRefresh={() => setTick(t => t + 1)}
            />
          )}
        </div>
      )}
    </section>
  );
};
