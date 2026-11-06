import { getStateByCode, INDIAN_STATES } from './states.js';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Calculates the 15th checksum character for the first 14 characters of a GSTIN.
 */
export function calculateGstinChecksum(first14: string): string {
  if (first14.length !== 14) {
    throw new Error('Expected first 14 characters of GSTIN');
  }

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const char = first14[i].toUpperCase();
    const charValue = GST_CHARS.indexOf(char);
    if (charValue === -1) {
      throw new Error(`Invalid character ${char} in GSTIN`);
    }

    // Standard GSTIN Mod-36 Luhn weighting:
    // Alternate factor 1 and 2
    const factor = (i % 2 === 0) ? 1 : 2;
    const product = charValue * factor;
    const quotient = Math.floor(product / 36);
    const remainder = product % 36;
    sum += quotient + remainder;
  }

  const remainderOfSum = sum % 36;
  const checkDigitIndex = (36 - remainderOfSum) % 36;
  return GST_CHARS[checkDigitIndex];
}

export interface GstinValidationResult {
  valid: boolean;
  error?: string;
  stateCode?: string;
  stateName?: string;
}

export function validateGSTIN(rawGstin: string, checkSumRule = true): GstinValidationResult {
  if (!rawGstin) {
    return { valid: false, error: 'GSTIN is required' };
  }

  const gstin = rawGstin.trim().toUpperCase();

  if (gstin.length !== 15) {
    return { valid: false, error: 'GSTIN must be exactly 15 alphanumeric characters' };
  }

  if (!GSTIN_REGEX.test(gstin)) {
    return { valid: false, error: 'GSTIN format is invalid (e.g. 29AAAAA0000A1Z5)' };
  }

  const stateCode = gstin.substring(0, 2);
  const state = getStateByCode(stateCode);
  if (!state) {
    return { valid: false, error: `Invalid GST state code '${stateCode}'` };
  }

  if (checkSumRule) {
    try {
      const expectedCheckChar = calculateGstinChecksum(gstin.substring(0, 14));
      const actualCheckChar = gstin[14];
      if (expectedCheckChar !== actualCheckChar) {
        return {
          valid: false,
          error: `Invalid GSTIN checksum character (expected '${expectedCheckChar}', got '${actualCheckChar}')`,
          stateCode,
          stateName: state.name
        };
      }
    } catch {
      return { valid: false, error: 'Failed to verify GSTIN checksum' };
    }
  }

  return {
    valid: true,
    stateCode,
    stateName: state.name
  };
}

/**
 * Normalizes Indian phone number to 10 digits.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.substring(2);
  }
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  return null;
}

/**
 * Normalizes invoice number: digits only, strips leading zeros, rejects 0 or empty.
 */
export function normalizeInvoice(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const stripped = trimmed.replace(/^0+/, '');
  if (!stripped) {
    return null;
  }
  const num = parseInt(stripped, 10);
  return isNaN(num) || num <= 0 ? null : num;
}

/**
 * Validates Indian 6-digit postal PIN Code format (110001 - 899999).
 */
export function validatePinCode(pin: string): boolean {
  if (!pin) return false;
  return /^[1-9][0-9]{5}$/.test(pin.trim());
}

/**
 * Helper to lookup state code by exact or case-insensitive state name.
 */
export function getStateCodeByName(stateName: string): string | undefined {
  if (!stateName) return undefined;
  const target = stateName.trim().toLowerCase();
  const match = INDIAN_STATES.find(s => s.name.toLowerCase() === target);
  return match?.code;
}

