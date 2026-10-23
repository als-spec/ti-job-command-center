export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money2 = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export const pctText = (n: number) => (isFinite(n) ? `${Math.round(n * 1000) / 10}%` : "—");

/** Parse a currency/number form field: "12,500.00" -> 12500. Returns NaN when empty or invalid. */
export function num(v: FormDataEntryValue | null): number {
  if (v === null) return NaN;
  const s = String(v).replace(/[$,\s]/g, "");
  return s === "" ? NaN : Number(s);
}
