/**
 * Persian (Eastern Arabic) digit + thousands-separator formatting for plan
 * prices/credit amounts. No cross-feature "centralized numeral formatter"
 * exists yet in this codebase, so this stays local to `billing` (its only
 * consumer today) — mirroring the `plants` feature's own local
 * `lib/plant-fields.ts` helper. Extract to a shared module if a second
 * feature needs the same formatting.
 */
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

function toPersianNumeral(value: string): string {
  return value
    .replace(/,/g, '٬') // U+066C ARABIC THOUSANDS SEPARATOR
    .replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/** Formats an integer count (e.g. a plan's monthly credit allowance) with Persian digits. */
export function formatCreditAllowance(value: number): string {
  return toPersianNumeral(value.toLocaleString('en-US'));
}

/**
 * Formats a plan's `priceMinor` (integer minor currency units, never a
 * float — per the shared `planSchema` contract) with Persian digits,
 * followed by the plan's ISO currency code.
 */
export function formatPlanPrice(priceMinor: number, currency: string): string {
  return `${toPersianNumeral(priceMinor.toLocaleString('en-US'))} ${currency}`;
}
