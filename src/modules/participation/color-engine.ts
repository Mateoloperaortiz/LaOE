import type { HslColor } from "./color-types";

// Reglas públicas de Color (ADR-134); los objetivos y los premios los decide el servidor.
export const COLOR_RULES_VERSION = "color-oklab-1";
export const COLOR_ROUNDS = 3;
export const COLOR_WATCH_MS = 3_000;
export const COLOR_POINT_THRESHOLDS = [
  { minAverage: 0, points: 1 },
  { minAverage: 50, points: 2 },
  { minAverage: 65, points: 3 },
  { minAverage: 80, points: 4 },
  { minAverage: 90, points: 5 },
  { minAverage: 95, points: 6 },
] as const;

function oklab(color: HslColor): readonly [number, number, number] {
  const h = (color.h % 360) / 60;
  const s = color.s / 100;
  const l = color.l / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const rgb =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  const linear = (channel: number) => {
    const value = channel + m;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(rgb[0] ?? 0);
  const g = linear(rgb[1] ?? 0);
  const b = linear(rgb[2] ?? 0);
  // Matrices sRGB lineal→OKLab de Björn Ottosson, versión 2021-01-25, dominio público:
  // https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab
  const ll = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const ss = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * ll + 0.793617785 * mm - 0.0040720468 * ss,
    1.9779984951 * ll - 2.428592205 * mm + 0.4505937099 * ss,
    0.0259040371 * ll + 0.7827717662 * mm - 0.808675766 * ss,
  ];
}

/** Precisión sin redondear: el promedio no acumula los redondeos de presentación de cada ronda. */
export function colorAccuracy(target: HslColor, answer: HslColor): number {
  const a = oklab(target);
  const b = oklab(answer);
  return Math.max(0, Math.min(100, 100 - 250 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])));
}

export function colorReward(average: number): number {
  let points = 1;
  for (const threshold of COLOR_POINT_THRESHOLDS)
    if (average >= threshold.minAverage) points = threshold.points;
  return points;
}
