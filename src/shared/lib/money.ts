// Montos en pesos colombianos sin decimales ("$ 2.500.000"), para los patrocinios (ADR-037 regla 6).
const pesos = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatMoney(amount: number): string {
  return pesos.format(amount);
}
