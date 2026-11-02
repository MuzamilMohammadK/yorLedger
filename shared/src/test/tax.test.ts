import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computeTax } from '../tax.js';

describe('Tax Split & Rounding Logic', () => {
  it('should split tax into CGST and SGST for intra-state transactions', () => {
    // 10 sarees @ Rs 2,000 each (200,000 paise) = 2,000,000 paise subtotal
    // GST @ 5% (500 bp) = 100,000 paise tax (Rs 1,000)
    // CGST: 50,000 paise (Rs 500), SGST: 50,000 paise (Rs 500)
    const items = [{ name: 'Kanchipuram Silk Saree', qty: 10, rate: 200000 }];
    const res = computeTax(items, 500, '29', '29');

    assert.strictEqual(res.taxMode, 'INTRA');
    assert.strictEqual(res.subtotal, 2000000);
    assert.strictEqual(res.cgst, 50000);
    assert.strictEqual(res.sgst, 50000);
    assert.strictEqual(res.igst, 0);
    assert.strictEqual(res.grandTotal, 2100000);
  });

  it('should handle odd paise rounding with SGST floor and CGST remainder', () => {
    // 1 item @ 101 paise, GST @ 5% = round(101 * 0.05) = 5 paise tax
    // sgst = floor(5/2) = 2 paise
    // cgst = 5 - 2 = 3 paise
    const items = [{ name: 'Thread Spool', qty: 1, rate: 101 }];
    const res = computeTax(items, 500, '29', '29');

    assert.strictEqual(res.subtotal, 101);
    assert.strictEqual(res.sgst, 2);
    assert.strictEqual(res.cgst, 3);
    assert.strictEqual(res.igst, 0);
    assert.strictEqual(res.grandTotal, 106);
  });

  it('should charge full IGST for inter-state transactions', () => {
    const items = [{ name: 'Banarasi Silk Saree', qty: 5, rate: 500000 }];
    const res = computeTax(items, 500, '29', '09'); // Karnataka to UP

    assert.strictEqual(res.taxMode, 'INTER');
    assert.strictEqual(res.subtotal, 2500000);
    assert.strictEqual(res.cgst, 0);
    assert.strictEqual(res.sgst, 0);
    assert.strictEqual(res.igst, 125000);
    assert.strictEqual(res.grandTotal, 2625000);
  });
});

