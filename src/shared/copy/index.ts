import {
  type CopyLabels,
  type CopyValues,
  fillCopy,
  type PairedWithList,
  pairCopyLabels,
  type SplitCopyList,
  splitCopyList,
} from "./format";
import { textos } from "./textos.generated";

// Catálogo completo de textos: solo servidor. `textos.generated.ts` lleva `server-only`, así que el build
// falla si un componente cliente llega hasta aquí; lo que corre en el navegador usa `@/shared/copy/client`
// (ADR-081).

export type CopyCode = keyof typeof textos;

/**
 * Devuelve el texto de un código de docs/14-copy-y-textos.md, con sus variables `{n}` reemplazadas.
 * El código no inventa textos: si hace falta uno nuevo, se agrega al inventario y se corre copy:sync.
 */
export function t(code: CopyCode, values: CopyValues = {}): string {
  return fillCopy(textos[code].text, values);
}

/** Tupla con el largo exacto de la lista; `string[]` cuando el código no es un literal. */
export type CopyList<Code extends CopyCode> = CopyCode extends Code
  ? string[]
  : SplitCopyList<(typeof textos)[Code]["text"]>;

/** Un texto que el inventario marca como lista separada por " · ". */
export function tList<const Code extends CopyCode>(code: Code): CopyList<Code> {
  return splitCopyList(textos[code].text) as CopyList<Code>;
}

/**
 * Las etiquetas de un enum por valor: `tLabels("T-597", CHECK_IN_STATUSES)[status]` (ADR-126 regla 3).
 * No compila si la lista y el enum no tienen el mismo largo, ni si el enum no es una tupla. Verifica
 * el largo, no el orden: la pieza de cada valor es la de su posición.
 */
export function tLabels<const Code extends CopyCode, const Values extends readonly string[]>(
  code: Code,
  values: Values & PairedWithList<CopyList<Code>, Values>,
): CopyLabels<Values[number]> {
  return pairCopyLabels(splitCopyList(textos[code].text), values) as CopyLabels<Values[number]>;
}

/** Estado editorial del texto (Propuesta, Aprobado, Pendiente…). */
export function copyStatus(code: CopyCode): string {
  return textos[code].status;
}
