export function parseBonusTotal(raw: string): number {
  const total = raw.trim();
  return /^\d+(?:[.,]\d{1,2})?$/.test(total) ? Number(total.replace(",", ".")) : Number.NaN;
}
