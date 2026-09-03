import { textos } from "./textos.generated";

export type CopyCode = keyof typeof textos;

type Values = Record<string, string | number>;

/**
 * Devuelve el texto de un código de docs/14-copy-y-textos.md, con sus variables `{n}` reemplazadas.
 * El código no inventa textos: si hace falta uno nuevo, se agrega al inventario y se corre copy:sync.
 */
export function t(code: CopyCode, values: Values = {}): string {
  return textos[code].text.replace(/\{([a-zA-Zñáéíóú ]+)\}/g, (match, key: string) => {
    const value = values[key.trim()];
    return value === undefined ? match : String(value);
  });
}

/** Un texto que el inventario marca como lista separada por " · ". */
export function tList(code: CopyCode): string[] {
  return textos[code].text.split("·").map((item) => item.trim());
}

/** Estado editorial del texto (Propuesta, Aprobado, Pendiente…). */
export function copyStatus(code: CopyCode): string {
  return textos[code].status;
}
