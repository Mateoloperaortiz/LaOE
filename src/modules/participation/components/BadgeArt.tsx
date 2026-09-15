import { Elemento, type ElementoTipo, Numeral } from "@/shared/brand";
import type { BadgeFamily } from "../gamification-types";

// Emblema de cada insignia (07-marca.md §5): un elemento del manual por familia y el nivel como
// numeral de sección. Bloqueada va en tinta suave; los niveles suben azul → amarillo → naranja.
// Es decoración: `aria-hidden` y el texto al lado lleva el significado.

const FAMILY_ELEMENT: Record<BadgeFamily, ElementoTipo> = {
  EN_PARCHE: "estrella",
  EXPLORADOR: "bucle",
  RELAMPAGO: "barras",
  PALABRA_A_PALABRA: "espiral",
  SPECIAL: "destello",
};

const LEVEL_COLORS = ["text-oe-blue", "text-oe-yellow", "text-oe-orange"] as const;

type Props = {
  family: BadgeFamily;
  level: number;
  /** Falso cuando el nivel todavía está bloqueado. */
  unlocked: boolean;
  className?: string;
};

export function BadgeArt({ family, level, unlocked, className = "" }: Props) {
  const color = unlocked
    ? (LEVEL_COLORS[Math.min(Math.max(level, 1), 3) - 1] ?? LEVEL_COLORS[0])
    : "text-tinta-suave";
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 ${className}`}>
      <Elemento tipo={FAMILY_ELEMENT[family]} className={`size-12 ${color}`} />
      <Numeral
        valor={level}
        className={`absolute -bottom-1 -right-2 text-xl ${unlocked ? "text-tinta" : "text-tinta-suave"}`}
      />
    </span>
  );
}
