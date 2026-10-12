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

/**
 * Las etiquetas de un enum, por valor (ADR-126 regla 3). El objeto no hereda de `Object.prototype`:
 * un valor que el enum no trae, `constructor` o `__proto__` incluidos, da `undefined` y entra el
 * respaldo del sitio que lo lee.
 */
export type CopyLabels<Value extends string> = { readonly [Key in Value]: string };

/**
 * Lo que `tLabels` le pide a su enum: ser una tupla con tantos valores como piezas trae la lista. Si
 * lo es no agrega nada; si no, el argumento no compila y el error trae el motivo.
 */
export type PairedWithList<
  List extends readonly string[],
  Values extends readonly string[],
> = number extends List["length"]
  ? "tLabels pide el código de la lista como literal: sin él no se conoce su largo"
  : number extends Values["length"]
    ? "tLabels pide el enum como tupla: declaralo `as const`"
    : Values["length"] extends List["length"]
      ? unknown
      : "la lista y el enum no tienen el mismo largo";

/**
 * Empareja cada valor con la pieza de su posición: el único sitio que lo hace (ADR-081 regla 5). Un
 * valor sin pieza queda sin etiqueta; los tipos de `tLabels` no dejan que pase.
 */
export function pairCopyLabels(
  list: readonly string[],
  values: readonly string[],
): Readonly<Record<string, string>> {
  const labels: Record<string, string> = Object.create(null);
  values.forEach((value, index) => {
    const label = list[index];
    if (label !== undefined) {
      labels[value] = label;
    }
  });
  return labels;
}

/**
 * Las etiquetas que un componente de cliente recibió por props. React solo deja pasar objetos llanos
 * del servidor al navegador, así que llegan heredando de `Object.prototype`: esta copia vuelve a no
 * heredar, y un valor ajeno (`constructor`) da `undefined` como en el `Record` de `tLabels`.
 */
export function labelsFromProps(
  labels: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.assign(Object.create(null), labels);
}
