/**
 * Indian Rupee (INR) currency formatting according to the Indian numbering system.
 * Example: 150000 -> ₹1,50,000
 */
export function formatINR(amountInRupees: number, includeDecimals = false): string {
  if (isNaN(amountInRupees) || amountInRupees === null || amountInRupees === undefined) {
    return '₹0';
  }

  const isNegative = amountInRupees < 0;
  const absAmount = Math.abs(amountInRupees);

  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0
  }).format(absAmount);

  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Formats paise into Indian Rupee string.
 * Example: 15000000 paise -> ₹1,50,000
 */
export function formatPaiseToINR(paise: number, includeDecimals = false): string {
  return formatINR(paise / 100, includeDecimals);
}
