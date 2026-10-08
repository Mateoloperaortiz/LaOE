import { t } from "@/shared/copy";

// Qué pasó con el alta a mano (ADR-116 regla 5): la action lo manda en `?alta=` y la pantalla lo dice.
const ALTA_CODES = { entro: "T-3214", volvio: "T-3215", "ya-estaba": "T-3216" } as const;

export type AltaOutcome = keyof typeof ALTA_CODES;

/** El aviso de un resultado del alta, o vacío si el parámetro no es uno de los tres. */
export function altaNotice(key: string): string {
  // `Object.hasOwn` y no `in`: `constructor` o `toString` también están «en» cualquier objeto.
  return Object.hasOwn(ALTA_CODES, key) ? t(ALTA_CODES[key as AltaOutcome]) : "";
}
