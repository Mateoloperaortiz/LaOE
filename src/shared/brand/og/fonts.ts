import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Instancias estáticas TTF (scripts/og-fonts.py) para next/og, leídas una sola vez en el ámbito del
// módulo: no dependen del request (07-marca.md §4, ADR-033).

const dir = join(process.cwd(), "src/shared/brand/fonts/og");

async function fontData(file: string): Promise<ArrayBuffer> {
  const buffer = await readFile(join(dir, file));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export const ogFonts = {
  titulos: await fontData("sofia-sans-extra-condensed-900.ttf"),
  contenido: await fontData("plus-jakarta-sans-600.ttf"),
};

/** El isotipo, tal como está en public/logos: se tinta al usarlo. */
export const isotipoSvg = await readFile(join(process.cwd(), "public/logos/isotipo.svg"), "utf8");
