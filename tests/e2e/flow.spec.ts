// §19.3 end-to-end: register → admin approves → parties → sale / purchase / job work →
// history → return → cash / cheque / NEFT payments → dues → reports → notifications →
// settings → historical GST snapshot unchanged. Screenshots of every screen are saved.
import { test, expect, Page, Locator } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { calculateGstinChecksum } from '../../shared/dist/index.js';

const AUTH = 'http://127.0.0.1:9099';
const PROJECT = 'demo-yorledger';
const fixture = fileURLToPath(new URL('./fixtures/gst-certificate.jpg', import.meta.url));
const gstin = (first14: string) => first14 + calculateGstinChecksum(first14);

let shot = 0;
async function snap(page: Page, name: string) {
  shot++;
  await page.waitForTimeout(400);
  const dir = fileURLToPath(new URL(`../../test-results/screens/${test.info().project.name}/`, import.meta.url));
  await page.screenshot({ path: `${dir}${String(shot).padStart(2, '0')}-${name}.png`, fullPage: true });
}

/** First visible match (phone cards and desktop tables both exist in the page). */
const vis = (l: Locator) => l.filter({ visible: true }).first();

/** The visible pane of the Ledger pager (all three panes stay mounted). */
const pane = (page: Page): Locator => page.locator('[role="tabpanel"][aria-hidden="false"]');

async function createAdmin(email: string, password: string) {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const { localId } = await r.json();
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId, customAttributes: JSON.stringify({ admin: true }) })
  });
}

test('complete shop journey', async ({ browser }, info) => {
  shot = 0;
  const tag = info.project.name;
  const ownerEmail = `owner-${tag}-${Date.now()}@shop.test`;
  const adminEmail = `admin-${tag}-${Date.now()}@shop.test`;
  const shopName = `Sri Lakshmi Silks ${tag}`;
  const owner = await (await browser.newContext({ ...info.project.use })).newPage();
  // Surface app errors in the CI log.
  owner.on('console', m => { if (m.type() === 'error') console.log(`[browser ${tag}] ${m.text()}`); });
  owner.on('pageerror', e => console.log(`[pageerror ${tag}] ${e.message}`));

  await test.step('1. register shop', async () => {
    await owner.goto('/#/register-shop');
    await owner.getByLabel('Shop / business name').fill(shopName);
    await owner.getByLabel('Owner name').fill('Ramesh Kumar');
    await owner.getByLabel('GSTIN').fill(gstin('37AAACH7409R1Z'));
    await owner.getByLabel('Mobile number').fill('9848022338');
    await owner.getByLabel('Address').fill('Shop 14, Silk Bazaar, Dharmavaram');
    await owner.getByLabel('PIN code').fill('515671');
    await owner.locator('input[type=file]').first().setInputFiles(fixture);
    await expect(owner.getByText('gst-certificate.jpg')).toBeVisible();
    await owner.getByLabel('Email').fill(ownerEmail);
    await owner.getByLabel(/^Password/).fill('Shop@12345');
    await owner.getByLabel('Confirm password').fill('Shop@12345');
    await snap(owner, 'register-filled');
    await owner.getByRole('button', { name: 'Register shop' }).click();
    await expect(owner.getByText('Waiting for approval')).toBeVisible();
    await snap(owner, 'pending-approval');
  });

  await test.step('2. admin approves document and shop', async () => {
    await createAdmin(adminEmail, 'Admin@12345');
    const admin = await (await browser.newContext({ ...info.project.use })).newPage();
    await admin.goto('/#/admin-login');
    await admin.getByPlaceholder('admin@example.com').fill(adminEmail);
    await admin.getByPlaceholder('Enter administrator password').fill('Admin@12345');
    await admin.getByRole('button', { name: /Authenticate/ }).click();
    await expect(admin.getByText('Shop verification')).toBeVisible();
    await admin.getByText(shopName).click();
    await snap(admin, 'admin-review');
    await admin.getByRole('button', { name: 'Approve', exact: true }).first().click();
    await expect(admin.getByText('APPROVED').first()).toBeVisible();
    await admin.getByRole('button', { name: 'Approve shop' }).click();
    await expect(admin.getByText('Review history').locator('..').getByText(/APPROVED ·/)).toBeVisible();
    await snap(admin, 'admin-approved');
    await admin.context().close();
  });

  await test.step('3. owner sees approval live, opens the app', async () => {
    await expect(owner.getByText('Your shop is approved')).toBeVisible();
    await owner.getByRole('button', { name: 'Open YorLedger' }).click();
    await expect(owner.getByText(/Welcome back/)).toBeVisible();
    await snap(owner, 'dashboard-empty');
  });

  const addParty = async (type: 'Customer' | 'Supplier' | 'Weaver', name: string, phone: string, gst?: string) => {
    await owner.goto('/#/parties?new=1');
    await owner.getByRole('dialog').getByRole('button', { name: type, exact: true }).click();
    await owner.getByLabel('Shop / business name').fill(name);
    await owner.getByLabel('Owner name').fill(`${name} owner`);
    await owner.getByPlaceholder('98480 12345').fill(phone);
    if (gst) await owner.getByLabel('GSTIN (if they have one)').fill(gst);
    await owner.getByLabel('Address').fill('Market Road');
    await owner.getByRole('button', { name: 'Save party' }).click();
    await expect(owner.getByRole('dialog').getByText(name).first()).toBeVisible();
    await owner.keyboard.press('Escape');
  };

  await test.step('4. create parties', async () => {
    await addParty('Customer', 'Kanchi Retail', '9840112233', gstin('33AABCK1234M1Z')); // Tamil Nadu -> IGST
    await addParty('Supplier', 'Dharmavaram Weavers Co', '9848011111', gstin('37AABCD1234E1Z')); // same state
    await addParty('Weaver', 'Lakshmamma Looms', '9848022222');
    await owner.goto('/#/parties');
    await expect(vis(owner.getByText('Kanchi Retail'))).toBeVisible();
    await snap(owner, 'parties');
    await owner.getByRole('button', { name: /Join dates/ }).click();
    await snap(owner, 'parties-calendar');
  });

  const saveBill = async (view: 'Sales' | 'Purchases', party: string, item: string, qty: string, rate: string, opts: { kind?: string; billNo?: string } = {}) => {
    await owner.goto('/#/ledger');
    await owner.getByRole('tab', { name: view }).click();
    const p = pane(owner);
    // A previous save leaves this pane on the "Bill saved" panel: start a new bill.
    if (await p.getByText('Bill saved').isVisible()) await p.getByRole('button', { name: 'New bill', exact: true }).click();
    if (opts.kind) await p.getByRole('button', { name: opts.kind, exact: true }).click();
    await p.getByPlaceholder('Type name or phone number').fill(party.split(' ')[0]);
    await p.getByRole('button', { name: new RegExp(party) }).first().click();
    if (opts.billNo) await p.getByLabel('Bill number').fill(opts.billNo);
    await p.getByLabel('Item', { exact: true }).fill(item);
    await p.getByLabel('Qty').fill(qty);
    await p.getByLabel('Price ₹').fill(rate);
    await snap(owner, `bill-${view}-${opts.kind ?? 'sale'}`);
    await p.getByRole('button', { name: 'Save bill' }).click();
    await expect(p.getByText('Bill saved')).toBeVisible();
    await snap(owner, `bill-saved-${opts.kind ?? view}`);
  };

  await test.step('5-6. sale, purchase and job work bills from the ledger', async () => {
    await saveBill('Sales', 'Kanchi Retail', 'Kanchi pattu saree', '10', '12500');
    await saveBill('Purchases', 'Dharmavaram Weavers Co', 'Silk yarn bundle', '20', '1500', { kind: 'Bought', billNo: '0077' });
    await saveBill('Purchases', 'Lakshmamma Looms', 'Weaving charges', '4', '1000', { kind: 'Job work', billNo: '12' });
    await owner.goto('/#/ledger?view=party');
    await owner.getByRole('tab', { name: 'Party' }).click();
    await pane(owner).getByPlaceholder('Type name or phone number').fill('Kanchi');
    await pane(owner).getByRole('button', { name: /Kanchi Retail/ }).click();
    await expect(pane(owner).getByText('Party ledger')).toBeVisible();
    await snap(owner, 'party-ledger');
  });

  await test.step('7. history', async () => {
    await owner.goto('/#/history');
    await expect(vis(owner.getByText('Kanchi Retail'))).toBeVisible();
    await snap(owner, 'history');
  });

  const openBill = async (party: string) => {
    await owner.goto('/#/history');
    await vis(owner.getByText(party)).click();
    await expect(owner.getByRole('dialog')).toBeVisible();
  };

  await test.step('8. return two sarees on the sale', async () => {
    await openBill('Kanchi Retail');
    await expect(owner.getByRole('dialog').getByText('IGST 5%')).toBeVisible();
    await snap(owner, 'sale-details');
    await owner.getByRole('button', { name: 'Return goods' }).click();
    await owner.getByRole('button', { name: '+' }).click();
    await owner.getByRole('button', { name: '+' }).click();
    await expect(owner.getByText('₹26,250.00')).toBeVisible(); // 2 × 12,500 + 5 % IGST
    await snap(owner, 'return');
    await owner.getByRole('button', { name: 'Save return' }).click();
    await expect(owner.getByText('Goods returned')).toHaveCount(0);
  });

  await test.step('9. cash payment on the sale', async () => {
    await openBill('Kanchi Retail');
    await owner.getByRole('button', { name: 'Got money' }).click();
    await owner.getByLabel('Amount ₹').fill('50000');
    await owner.getByLabel('Who took the cash?').fill('Ravi');
    await snap(owner, 'payment-cash');
    await owner.getByRole('button', { name: 'Save payment' }).click();
    await expect(owner.getByText('Save payment')).toHaveCount(0);
  });

  await test.step('10. cheque payment on the purchase', async () => {
    await openBill('Dharmavaram Weavers Co');
    await owner.getByRole('button', { name: 'Paid money' }).click();
    await owner.getByRole('button', { name: 'Cheque' }).click();
    await owner.getByLabel('Cheque number').fill('482913');
    await snap(owner, 'payment-cheque');
    await owner.getByRole('button', { name: 'Save payment' }).click();
    await expect(owner.getByText('Save payment')).toHaveCount(0);
  });

  await test.step('11. NEFT payment on the job work', async () => {
    await openBill('Lakshmamma Looms');
    await owner.getByRole('button', { name: 'Paid money' }).click();
    await owner.getByRole('button', { name: 'Bank / NEFT' }).click();
    await owner.getByLabel('Amount ₹').fill('1000');
    await owner.getByLabel('UTR / reference number').fill(`SBIN4263${String(Date.now()).slice(-8)}`);
    await snap(owner, 'payment-neft');
    await owner.getByRole('button', { name: 'Save payment' }).click();
    await expect(owner.getByText('Save payment')).toHaveCount(0);
  });

  await test.step('12. dues', async () => {
    await owner.goto('/#/dues');
    // Sale 1,31,250 − return 26,250 − paid 50,000 = 55,000 to collect.
    await expect(vis(owner.getByText('₹55,000.00'))).toBeVisible();
    await snap(owner, 'dues');
    await owner.getByRole('tab', { name: 'Completed' }).click();
    await snap(owner, 'dues-completed');
  });

  await test.step('13. dashboard and reports', async () => {
    await owner.goto('/#/dashboard');
    await expect(owner.getByText('Total transactions')).toBeVisible();
    await snap(owner, 'dashboard');
    for (const r of ['purchase', 'sales', 'job', 'gst']) {
      await owner.goto(`/#/reports?r=${r}`);
      await owner.waitForTimeout(800);
      await snap(owner, `report-${r}`);
    }
    await expect(vis(owner.getByText(/Net GST payable/i))).toBeVisible();
  });

  await test.step('14. notifications', async () => {
    await owner.goto('/#/dashboard');
    await owner.getByRole('button', { name: 'Alerts' }).click();
    await expect(owner.getByText('Your shop is approved. You can start billing.')).toBeVisible();
    await snap(owner, 'alerts');
    await owner.keyboard.press('Escape');
  });

  await test.step('15-16. settings change does not alter saved bills', async () => {
    await owner.goto('/#/settings');
    await owner.getByRole('button', { name: 'GST & tax' }).click();
    await owner.getByLabel('Default GST rate').selectOption('12');
    await owner.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(owner.getByText('Saved')).toBeVisible();
    await snap(owner, 'settings-gst');
    await openBill('Kanchi Retail');
    await expect(owner.getByRole('dialog').getByText('IGST 5%')).toBeVisible(); // snapshot unchanged
    await snap(owner, 'sale-after-settings');
  });
});
