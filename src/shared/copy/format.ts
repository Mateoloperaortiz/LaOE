// Las dos reglas de formato del inventario de textos. Las comparten el catálogo completo (servidor) y el
// subconjunto de cliente (ADR-081), así que aquí no entra ninguno de los dos.

export type CopyValues = Record<string, string | number>;

/** Reemplaza las variables `{n}` del texto; una variable sin valor se deja tal cual. */
export function fillCopy(text: string, values: CopyValues): string {
  return text.replace(/\{([a-zA-Zñáéíóú ]+)\}/g, (match, key: string) => {
    const value = values[key.trim()];
    return value === undefined ? match : String(value);
  });
}

/** Parte un texto que el inventario marca como lista separada por " · ". */
export function splitCopyList(text: string): string[] {
  return text.split("·").map((item) => item.trim());
}

/** Tupla con un `string` por ítem de la lista: un índice literal fuera de rango no compila. */
export type SplitCopyList<Text extends string> = Text extends `${string}·${infer Rest}`
  ? [string, ...SplitCopyList<Rest>]
  : [string];
