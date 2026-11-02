import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateGSTIN, calculateGstinChecksum, normalizePhone, normalizeInvoice } from '../gst.js';

describe('GSTIN and Input Validation', () => {
  it('should calculate valid Mod-36 checksum for GSTIN', () => {
    // 29AAAAA0000A1Z5 is a standard Indian sample format
    // Let's test checksum calculation on first 14 chars
    const first14 = '29AAAAA0000A1Z';
    const checksum = calculateGstinChecksum(first14);
    assert.strictEqual(typeof checksum, 'string');
    assert.strictEqual(checksum.length, 1);
  });

  it('should validate correctly formatted GSTIN with valid state code', () => {
    const first14 = '29ABCDE1234F1Z';
    const expectedCheckChar = calculateGstinChecksum(first14);
    const validGstin = `${first14}${expectedCheckChar}`;

    const result = validateGSTIN(validGstin, true);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.stateCode, '29');
    assert.strictEqual(result.stateName, 'Karnataka');
  });

  it('should reject invalid GSTIN format', () => {
    const result = validateGSTIN('INVALID_GSTIN_123', true);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  });

  it('should reject invalid GSTIN checksum', () => {
    const first14 = '29ABCDE1234F1Z';
    const correctCheckChar = calculateGstinChecksum(first14);
    const wrongCheckChar = correctCheckChar === '0' ? '1' : '0';
    const badGstin = `${first14}${wrongCheckChar}`;

    const result = validateGSTIN(badGstin, true);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error?.includes('checksum'));
  });

  it('should normalize Indian phone numbers to 10 digits', () => {
    assert.strictEqual(normalizePhone('9845012345'), '9845012345');
    assert.strictEqual(normalizePhone('+91 98450 12345'), '9845012345');
    assert.strictEqual(normalizePhone('919845012345'), '9845012345');
    assert.strictEqual(normalizePhone('12345'), null); // invalid length
    assert.strictEqual(normalizePhone('1234567890'), null); // invalid starting digit
  });

  it('should normalize invoice numbers per HLD Section 6', () => {
    assert.strictEqual(normalizeInvoice('0042'), 42);
    assert.strictEqual(normalizeInvoice('01'), 1);
    assert.strictEqual(normalizeInvoice('100'), 100);
    assert.strictEqual(normalizeInvoice('000'), null);
    assert.strictEqual(normalizeInvoice('abc'), null);
  });
});

