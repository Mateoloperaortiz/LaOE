import { type CopyCode, t } from "@/shared/copy";
import type { CopyValues } from "@/shared/copy/format";
import { renderPlain } from "@/shared/copy/render";

// Las pruebas buscan los textos de la interfaz por su código del inventario, no por la redacción
// (ADR-086 regla 9): así un cambio de copy no rompe la suite.

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** El texto tal como se ve en pantalla: variables llenas y sin las marcas de `**negrita**`. */
export function tPlain(code: CopyCode, values: CopyValues = {}): string {
  return renderPlain(t(code, values));
}

/**
 * Expresión que encuentra el texto dentro de otro más largo. Las variables sin valor aceptan cualquier
 * cosa, así que `copyPattern("T-…")` sirve para «Ver detalle de {nombre}» sin saber el nombre.
 */
export function copyPattern(code: CopyCode, values: CopyValues = {}, flags = ""): RegExp {
  return itemPattern(tPlain(code, values), flags);
}

/**
 * Lo mismo sobre un texto ya sacado del catálogo, como un ítem de `tList("T-…")[i]`. `hueco` es lo que
 * acepta cada variable sin valor: `"\\d+"` cuando es un número y el texto de al lado también calza.
 */
export function itemPattern(text: string, flags = "", hueco = ".+?"): RegExp {
  return new RegExp(
    text
      .split(/\{[^}]+\}/)
      .map(escapeRegExp)
      .join(hueco),
    flags,
  );
}

/** Igual que `copyPattern`, pero el texto tiene que ser completo: ni antes ni después. */
export function copyExact(code: CopyCode, values: CopyValues = {}, flags = ""): RegExp {
  return new RegExp(`^${copyPattern(code, values).source}$`, flags);
}
