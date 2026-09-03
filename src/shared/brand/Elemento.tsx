import type { SVGProps } from "react";

// Elementos gráficos del manual (07-marca.md §5) redibujados como SVG con relleno por token.
// Máximo uno o dos por composición; nunca sobre el logo ni sobre texto funcional.

export type ElementoTipo =
  | "estrella"
  | "destello"
  | "asterisco"
  | "barras"
  | "escalera"
  | "franjas"
  | "bucle"
  | "bucle-doble"
  | "espiral";

const ESTRELLA_RADII = [
  50, 30, 47, 28, 50, 31, 46, 27, 49, 32, 50, 29, 48, 30, 50, 28, 47, 31, 49, 30,
];

function estrellaPoints(): string {
  return ESTRELLA_RADII.map((radius, index) => {
    const angle = (Math.PI * 2 * index) / ESTRELLA_RADII.length - Math.PI / 2;
    return `${(50 + radius * Math.cos(angle)).toFixed(2)},${(50 + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

function espiralPath(): string {
  const points: string[] = [];
  for (let theta = 0; theta <= Math.PI * 5.2; theta += 0.16) {
    const radius = 3 + theta * 2.8;
    points.push(
      `${(50 + radius * Math.cos(theta)).toFixed(2)} ${(50 + radius * Math.sin(theta)).toFixed(2)}`,
    );
  }
  return `M ${points.join(" L ")}`;
}

const ESTRELLA = estrellaPoints();
const ESPIRAL = espiralPath();

const shapes: Record<ElementoTipo, React.ReactNode> = {
  estrella: <polygon points={ESTRELLA} />,
  destello: <path d="M50 0 Q54 46 100 50 Q54 54 50 100 Q46 54 0 50 Q46 46 50 0 Z" />,
  asterisco: (
    <>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <ellipse key={angle} cx="50" cy="22" rx="9" ry="24" transform={`rotate(${angle} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="10" />
    </>
  ),
  barras: (
    <>
      <polygon points="8,72 40,28 56,28 24,72" />
      <polygon points="44,72 76,28 92,28 60,72" />
    </>
  ),
  escalera: (
    <>
      <rect x="0" y="75" width="22" height="25" />
      <rect x="26" y="50" width="22" height="50" />
      <rect x="52" y="25" width="22" height="75" />
      <rect x="78" y="0" width="22" height="100" />
    </>
  ),
  franjas: (
    <>
      {[4, 24, 44, 64, 84].map((y) => (
        <rect key={y} x="0" y={y} width="100" height="12" />
      ))}
    </>
  ),
  bucle: (
    <path
      d="M2 62 C 18 18, 46 18, 50 50 C 54 82, 28 88, 34 56 C 40 24, 70 22, 98 42"
      fill="none"
      stroke="currentColor"
      strokeWidth="7"
      strokeLinecap="round"
    />
  ),
  "bucle-doble": (
    <path
      d="M2 56 C 12 14, 38 14, 40 50 C 42 86, 18 86, 20 50 C 22 14, 50 14, 54 50 C 58 86, 34 86, 36 50 C 38 14, 68 12, 98 38"
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
    />
  ),
  espiral: (
    <path d={ESPIRAL} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
  ),
};

type Props = Omit<SVGProps<SVGSVGElement>, "children"> & {
  tipo: ElementoTipo;
};

export function Elemento({ tipo, className = "", ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
      className={className}
      {...rest}
    >
      {shapes[tipo]}
    </svg>
  );
}
