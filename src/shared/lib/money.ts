// Montos en pesos colombianos sin decimales ("$ 2.500.000"), para los patrocinios (ADR-037 regla 6).
const pesos = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const pesosConCentavos = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatMoney(amount: number): string {
  return pesos.format(amount);
}

export function formatExactMoney(amount: number): string {
  return pesosConCentavos.format(amount);
}
