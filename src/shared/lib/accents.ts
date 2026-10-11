// Quitar acentos (DT-074, DT-332; ADR-122 regla 11 y ADR-123 regla 18): descomponer el texto (NFD) y
// sacarle las marcas. Es la única escritura de ese paso fuera de `competition`, que queda quieto
// (decisión abierta 8). Lo que cada sitio hace después (mayúsculas, minúsculas, espacios, recorte) es
// suyo y sigue en él.

/**
 * Toda marca (`\p{M}`): lo que Unicode clasifica como marca, sea del bloque U+0300 a U+036F, donde
 * caen los acentos del español, o de fuera, como las vocales del árabe o el selector de variante de
 * un emoji. Un acento suelto (´, `, ^, ¨) no es una marca y se queda, igual que el modificador de
 * tono de un emoji. Es un solo conjunto para los ocho sitios (`tests/unit/accent-stripping.test.ts`).
 */
const MARKS = /\p{M}/gu;

/** El texto descompuesto y sin sus marcas: á, ñ y ü salen a, n y u. */
export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(MARKS, "");
}
