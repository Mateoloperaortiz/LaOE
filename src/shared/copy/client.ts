import {
  type CopyLabels,
  type CopyValues,
  fillCopy,
  type PairedWithList,
  pairCopyLabels,
  type SplitCopyList,
  splitCopyList,
} from "./format";
import { textosCliente } from "./textos.client.generated";

// Textos para lo que corre en el navegador (ADR-081): misma API que `@/shared/copy` sobre el subconjunto
// que genera `npm run copy:sync` con los códigos `T-…` escritos en los archivos que importan este módulo.
// Un código que todavía no está en el subconjunto no compila: corré copy:sync.

export type ClientCopyCode = keyof typeof textosCliente;

export function t(code: ClientCopyCode, values: CopyValues = {}): string {
  return fillCopy(textosCliente[code], values);
}

export type ClientCopyList<Code extends ClientCopyCode> = ClientCopyCode extends Code
  ? string[]
  : SplitCopyList<(typeof textosCliente)[Code]>;

export function tList<const Code extends ClientCopyCode>(code: Code): ClientCopyList<Code> {
  return splitCopyList(textosCliente[code]) as ClientCopyList<Code>;
}

/** Las etiquetas de un enum por valor, como `tLabels` de `@/shared/copy` (ADR-126 regla 3). */
export function tLabels<const Code extends ClientCopyCode, const Values extends readonly string[]>(
  code: Code,
  values: Values & PairedWithList<ClientCopyList<Code>, Values>,
): CopyLabels<Values[number]> {
  return pairCopyLabels(splitCopyList(textosCliente[code]), values) as CopyLabels<Values[number]>;
}
