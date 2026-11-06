import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createApp } from '../app.js';
import { getDatabase } from '../db/index.js';

describe('Phase 6 & 7: Reports, GST Analytics and Settings Integration Tests', () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        port = addr.port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const approvedHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Bearer dev-owner-ramesh@srilakshmisilks.com'
  };

  it('SECURITY: Unauthenticated requests to reports and settings endpoints are rejected with 401', async () => {
    const r1 = await fetch(`${baseUrl}/api/v1/reports/purchase-ledger`);
    assert.strictEqual(r1.status, 401);

    const r2 = await fetch(`${baseUrl}/api/v1/reports/sales-ledger`);
    assert.strictEqual(r2.status, 401);

    const r3 = await fetch(`${baseUrl}/api/v1/reports/gst-dashboard`);
    assert.strictEqual(r3.status, 401);

    const r4 = await fetch(`${baseUrl}/api/v1/settings`);
    assert.strictEqual(r4.status, 401);
  });

  it('SECURITY: Pending shop owner cannot access reports or settings (403 Forbidden)', async () => {
    const db = await getDatabase();
    await db.createShopAndUser({
      shop_name: 'Pending Reports Weavers',
      owner_name: 'P. Rao',
      gstin: '37CCCCC7777C1Z3',
      mobile: '9848099444',
      email: 'pending-rep-owner@srilakshmi.com',
      address: 'Weavers Colony, Dharmavaram',
      state_code: '37',
      default_gst_bp: 500,
      document_name: 'reg.jpg',
      document_mime_type: 'image/jpeg',
      document_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    }, 'dev-uid-pending-rep-owner@srilakshmi.com');

    const headers = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer dev-owner-pending-rep-owner@srilakshmi.com'
    };

    const res1 = await fetch(`${baseUrl}/api/v1/reports/purchase-ledger`, { headers });
    assert.strictEqual(res1.status, 403);

    const res2 = await fetch(`${baseUrl}/api/v1/settings`, { headers });
    assert.strictEqual(res2.status, 403);
  });

  it('PURCHASE LEDGER: Accurate calculation of purchases and eligible ITC (only registered suppliers)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/reports/purchase-ledger`, { headers: approvedHeaders });
    assert.strictEqual(res.status, 200);

    const data = await res.json() as any;
    assert.ok(data.report);
    assert.ok(Array.isArray(data.report.items));
    assert.ok(data.report.items.length > 0);
    assert.ok(data.report.totals);

    const { totals, items } = data.report;
    assert.ok(totals.total_purchase_value > 0);
    assert.ok(totals.total_taxable_value > 0);
    assert.ok(totals.eligible_itc > 0);

    // Verify ITC is granted only for suppliers with valid GSTIN
    for (const item of items) {
      if (!item.has_gstin) {
        assert.strictEqual(item.eligible_itc, 0, 'Unregistered supplier must have 0 eligible ITC');
      } else {
        assert.ok(item.eligible_itc >= 0, 'Registered supplier must have eligible ITC');
      }
    }
  });

  it('SALES LEDGER: Separates intra-state vs inter-state sales and calculates output tax', async () => {
    const res = await fetch(`${baseUrl}/api/v1/reports/sales-ledger`, { headers: approvedHeaders });
    assert.strictEqual(res.status, 200);

    const data = await res.json() as any;
    assert.ok(data.report);
    const { totals, items } = data.report;

    assert.ok(totals.total_taxable_sales > 0);
    assert.ok(totals.total_output_gst > 0);
    assert.ok(totals.total_sales_value > 0);

    // Verify separation into intra-state and inter-state
    const intraItems = items.filter((i: any) => i.sales_type === 'INTRA_STATE');
    const interItems = items.filter((i: any) => i.sales_type === 'INTER_STATE');

    assert.ok(intraItems.length > 0, 'Must have intra-state sales');
    assert.ok(interItems.length > 0, 'Must have inter-state sales');

    for (const item of intraItems) {
      assert.strictEqual(item.igst, 0, 'Intra-state must have 0 IGST');
      assert.ok(item.cgst >= 0 && item.sgst >= 0);
    }

    for (const item of interItems) {
      assert.strictEqual(item.cgst, 0, 'Inter-state must have 0 CGST');
      assert.strictEqual(item.sgst, 0, 'Inter-state must have 0 SGST');
      assert.ok(item.igst > 0, 'Inter-state must have IGST');
    }
  });

  it('ARTISAN & JOB WORK: Generates artisan-wise summary metrics', async () => {
    const res = await fetch(`${baseUrl}/api/v1/reports/job-work-ledger`, { headers: approvedHeaders });
    assert.strictEqual(res.status, 200);

    const data = await res.json() as any;
    assert.ok(data.report);
    assert.ok(Array.isArray(data.report.items));
    assert.ok(Array.isArray(data.report.artisan_summaries));
    assert.ok(data.report.artisan_summaries.length > 0);

    const firstSummary = data.report.artisan_summaries[0];
    assert.ok(firstSummary.artisan_name);
    assert.ok(firstSummary.total_job_work_value > 0);
  });

  it('GST DASHBOARD: Calculates Net GST Payable = Output GST - Eligible ITC and returns chart datasets', async () => {
    const res = await fetch(`${baseUrl}/api/v1/reports/gst-dashboard`, { headers: approvedHeaders });
    assert.strictEqual(res.status, 200);

    const data = await res.json() as any;
    assert.ok(data.gst_data);
    assert.ok(data.disclaimer, 'Must include statutory accountant review disclaimer');

    const { summary, tax_breakdown, charts } = data.gst_data;

    // Verify calculation Net GST = Output GST - Eligible ITC
    const expectedNet = Math.max(0, summary.output_gst - summary.eligible_itc);
    assert.strictEqual(summary.net_gst_payable, expectedNet);

    // Verify tax breakdown
    assert.strictEqual(tax_breakdown.output_cgst + tax_breakdown.output_sgst + tax_breakdown.output_igst, summary.output_gst);

    // Verify charts
    assert.ok(Array.isArray(charts.monthly_sales_vs_purchases));
    assert.ok(Array.isArray(charts.monthly_output_gst_trend));
    assert.ok(Array.isArray(charts.monthly_itc_trend));
    assert.ok(Array.isArray(charts.tax_component_comparison));
    assert.ok(Array.isArray(charts.monthly_net_payable_trend));
  });

  it('SETTINGS: Retrieve and update shop settings (invoice, notifications, preferences)', async () => {
    // 1. Get settings
    const getRes = await fetch(`${baseUrl}/api/v1/settings`, { headers: approvedHeaders });
    assert.strictEqual(getRes.status, 200);
    const settings = await getRes.json() as any;
    assert.ok(settings.shop);
    assert.ok(settings.invoice_settings);
    assert.ok(settings.notification_settings);
    assert.ok(settings.app_preferences);

    // 2. Update Invoice Settings
    const invRes = await fetch(`${baseUrl}/api/v1/settings/invoice`, {
      method: 'PUT',
      headers: approvedHeaders,
      body: JSON.stringify({
        invoice_prefix: 'SLS-',
        invoice_footer: 'Exclusive Pure Dharmavaram Silk Collection'
      })
    });
    assert.strictEqual(invRes.status, 200);
    const invData = await invRes.json() as any;
    assert.strictEqual(invData.invoice_settings.invoice_prefix, 'SLS-');

    // 3. Update Notification Settings
    const notifRes = await fetch(`${baseUrl}/api/v1/settings/notifications`, {
      method: 'PUT',
      headers: approvedHeaders,
      body: JSON.stringify({
        reminder_lead_time_days: 7
      })
    });
    assert.strictEqual(notifRes.status, 200);
    const notifData = await notifRes.json() as any;
    assert.strictEqual(notifData.notification_settings.reminder_lead_time_days, 7);

    // 4. Update App Preferences
    const prefRes = await fetch(`${baseUrl}/api/v1/settings/preferences`, {
      method: 'PUT',
      headers: approvedHeaders,
      body: JSON.stringify({
        theme: 'dark',
        language: 'te'
      })
    });
    assert.strictEqual(prefRes.status, 200);
    const prefData = await prefRes.json() as any;
    assert.strictEqual(prefData.app_preferences.theme, 'dark');
  });

  it('SETTINGS & GST RULES: Updating default GST rate does NOT alter existing bills', async () => {
    // Check initial bills tax values
    const beforeSalesRes = await fetch(`${baseUrl}/api/v1/reports/sales-ledger`, { headers: approvedHeaders });
    const beforeSales = await beforeSalesRes.json() as any;
    const initialTax = beforeSales.report.totals.total_output_gst;

    // Update default GST rate to 12% (1200 bp)
    const updateGstRes = await fetch(`${baseUrl}/api/v1/settings/gst`, {
      method: 'PUT',
      headers: approvedHeaders,
      body: JSON.stringify({
        default_gst_bp: 1200
      })
    });
    assert.strictEqual(updateGstRes.status, 200);

    // Re-verify that existing sales tax is completely unchanged
    const afterSalesRes = await fetch(`${baseUrl}/api/v1/reports/sales-ledger`, { headers: approvedHeaders });
    const afterSales = await afterSalesRes.json() as any;
    assert.strictEqual(afterSales.report.totals.total_output_gst, initialTax, 'Historical bills must retain their saved GST snapshot without recalculation');
  });

  it('DATA EXPORT: Exports CSV formatted records for transactions, parties, and reports', async () => {
    const txExport = await fetch(`${baseUrl}/api/v1/settings/export/transactions`, { headers: approvedHeaders });
    assert.strictEqual(txExport.status, 200);
    assert.ok(txExport.headers.get('content-type')?.includes('text/csv'));
    const txCsv = await txExport.text();
    assert.ok(txCsv.includes('Invoice Number,Date,Party Name'));

    const partyExport = await fetch(`${baseUrl}/api/v1/settings/export/parties`, { headers: approvedHeaders });
    assert.strictEqual(partyExport.status, 200);
    const partyCsv = await partyExport.text();
    assert.ok(partyCsv.includes('Party Name,Type,Owner Name'));

    const reportExport = await fetch(`${baseUrl}/api/v1/settings/export/reports`, { headers: approvedHeaders });
    assert.strictEqual(reportExport.status, 200);
    const repCsv = await reportExport.text();
    assert.ok(repCsv.includes('Metric,Value (INR)'));
  });
});
