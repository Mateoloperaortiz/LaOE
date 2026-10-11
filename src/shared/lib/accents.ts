// Quitar acentos (DT-074; ADR-122 regla 11): descomponer el texto (NFD) y sacarle las marcas. Es la
// única escritura de ese paso fuera de `competition`, que queda quieto (decisión abierta 8). Lo que
// cada sitio hace después (mayúsculas, minúsculas, espacios, recorte) es suyo y sigue en él.

/**
 * Qué se saca después de descomponer. Los sitios no quitaban lo mismo, y cada uno conserva lo suyo
 * (`tests/unit/accent-stripping.test.ts`). En español los tres dan igual: á, ñ y ü salen a, n y u.
 */
const MARKS = {
  /** El bloque de marcas combinantes, U+0300 a U+036F: nada más. */
  BLOCK: /[\u0300-\u036f]/g,
  /** Toda marca (`\p{M}`): el bloque y las de fuera, como el selector de variante de un emoji. */
  MARKS: /\p{M}/gu,
  /**
   * Los diacríticos (`\p{Diacritic}`): también los sueltos que no combinan (´, `, ^, ¨), pero no las
   * marcas que no lo son, ni siquiera todas las del bloque.
   */
  DIACRITICS: /\p{Diacritic}/gu,
} as const;

/** El texto descompuesto y sin las marcas del conjunto pedido, que quien llama nombra siempre. */
export function stripAccents(value: string, marks: keyof typeof MARKS): string {
  return value.normalize("NFD").replace(MARKS[marks], "");
}
