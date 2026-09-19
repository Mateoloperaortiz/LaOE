import { type CopyValues, fillCopy, type SplitCopyList, splitCopyList } from "./format";
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
