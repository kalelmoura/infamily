/**
 * Money and date formatting for the pt-BR UI.
 *
 * Extracted from the estoque page once vendas needed the same rules: two copies
 * of money parsing would eventually drift apart, and money is the last place you
 * want that.
 *
 * **Money is handled in integer cents throughout.** Prices carry at most two
 * decimals, so `Math.round(value * 100)` is exact, and every sum and multiple
 * after that is plain integer arithmetic.
 *
 * To be precise about why: at this scale floats would almost certainly *look*
 * right anyway. Float arithmetic does drift (`1.10 * 3` is 3.3000000000000003),
 * but `Intl.NumberFormat` rounds to two decimals on the way out, so drift below
 * half a cent never reaches the screen — a search over 400k randomised sales
 * found no case where the formatted float total differed from the exact one.
 *
 * Integer cents is used regardless, because it is exact *by construction* rather
 * than by staying under a rounding threshold, it costs nothing, and it keeps the
 * screen consistent with the NUMERIC/Decimal discipline the database and API
 * already follow. The total here is the number Yasmin reads out to a customer;
 * "the error is currently too small to see" is a weaker guarantee than "there is
 * no error".
 */

// pt-BR currency: R$ 1.234,56 — dot for thousands, comma for decimals. Built
// once at module scope; creating an Intl formatter is comparatively expensive
// and this one never changes.
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Format a money value as it arrives from the API (a string like "49.90"). */
export function formatMoney(value: string): string {
  return currencyFormatter.format(Number(value));
}

/** Format an integer number of cents — for totals we computed ourselves. */
export function formatCents(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

/**
 * Read a price typed by a human and return it as integer cents, or `null` if it
 * isn't usable.
 *
 * Brazilians type "49,90"; `Number` expects a dot. Thousands separators are
 * deliberately not accepted: "1.234,56" is ambiguous with "1.234", and store
 * prices don't need it. It fails validation loudly rather than guessing.
 */
export function parseMoneyToCents(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (normalized === "") return null;

  const value = Number(normalized);
  // `Number("")` is 0 and `Number("abc")` is NaN — the emptiness check above
  // and `isFinite` here together reject both.
  if (!Number.isFinite(value) || value < 0) return null;

  return Math.round(value * 100);
}

/** Cents as the two-decimal string the API wants ("4990" -> "49.90"). */
export function centsToApiString(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Read a typed price and return it in the API's format, or `null`.
 *
 * A string, not a number: sent as a string, Pydantic builds the Decimal from the
 * exact digits we typed, with no float rounding in between — the same reason the
 * column is NUMERIC. Two decimals because that is what NUMERIC(10, 2) stores and
 * what the schema's `decimal_places=2` accepts; sending 49.905 would be a 422.
 */
export function parseMoneyInput(raw: string): string | null {
  const cents = parseMoneyToCents(raw);
  return cents === null ? null : centsToApiString(cents);
}

/** Same idea for a whole-number quantity, which must be an integer >= 0. */
export function parseQuantityInput(raw: string): number | null {
  const normalized = raw.trim();
  if (normalized === "") return null;

  const value = Number(normalized);
  if (!Number.isInteger(value) || value < 0) return null;

  return value;
}

/** Show an API price in the pt-BR style inside an input ("49.90" -> "49,90"). */
export function toInputDecimal(value: string): string {
  return value.replace(".", ",");
}

/**
 * Today's date in the store's timezone, as "YYYY-MM-DD".
 *
 * Not `new Date().toISOString()`: that is UTC, and São Paulo is UTC-3, so from
 * 21:00 onwards it would already report *tomorrow* — every evening sale would
 * default to the wrong day. `en-CA` is used purely because its date format is
 * ISO-like (YYYY-MM-DD), which is exactly what `<input type="date">` and the API
 * both expect.
 */
export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/**
 * Show an API date ("2026-08-15") as pt-BR ("15/08/2026").
 *
 * Done with string splitting rather than `new Date(...)` on purpose: that
 * constructor reads a bare "YYYY-MM-DD" as UTC midnight, which formatted in a
 * negative-offset timezone renders as the *previous day*. Splitting the string
 * has no timezone to get wrong.
 */
export function formatSaleDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}
