import type { TablerIcon } from "@tabler/icons-react";

// Biblioteca de iconos de la casa digital (ADR-076). Esta carpeta es la única que importa Tabler
// Icons: `npm run lint` lo exige con `noRestrictedImports` (biome.json). Cada icono vive en su
// archivo y se importa por su ruta (`@/shared/ui/icons/HomeIcon`), sin índice: con un índice, un
// componente cliente arrastra al navegador las definiciones de todos los iconos, también las que
// solo se pintan en el servidor (medido en el build, ADR-076 regla 2). Para sumar uno se busca en
// https://tabler.io/icons y se crea su archivo como los demás, con el nombre de su forma y sufijo
// Icon; knip avisa cuando un archivo deja de usarse. La familia rellena (`…FilledIcon`) solo marca
// el destino activo de una barra de navegación.

export type IconProps = {
  /** Lado del icono, en píxeles o en cualquier longitud CSS. Por defecto escala con el texto. */
  size?: number | string;
  /** Grosor del trazo sobre la retícula de 24. Se sube solo en iconos diminutos. */
  stroke?: number;
  /** Nombre accesible, del catálogo de textos. Sin él, el icono es decorativo y no se anuncia. */
  label?: string;
  className?: string;
};

/** Valores de la casa para cualquier icono de Tabler (ADR-076 reglas 3 y 4). */
export function Glyph({
  shape: Shape,
  size = "1.25em",
  stroke = 1.75,
  label,
  className = "",
}: IconProps & { shape: TablerIcon }) {
  return (
    <Shape
      size={size}
      stroke={stroke}
      // Preflight de Tailwind vuelve bloque a todo <svg>; en línea y sobre la línea base del texto
      // se comporta como el glifo que reemplaza. Dentro de un flex estas dos reglas no pesan.
      className={`inline-block shrink-0 align-[-0.25em] ${className}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    />
  );
}
