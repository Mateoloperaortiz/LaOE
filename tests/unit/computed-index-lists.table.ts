// Las lecturas de `src` que llevan de subíndice de una lista del catálogo de textos un número que
// calcula el dominio o que el sitio recorre con un arreglo de números (ADR-126 reglas 11 y 13,
// DT-369). No son la etiqueta de un valor de un enum, así que `tLabels` no les aplica, y con un
// subíndice de tipo `number` la tupla de `tList` no cuida el largo de su lista.
//
// La comparten dos pruebas. `tests/unit/label-positions.test.ts` las toma como las excepciones de la
// forma `computedIndex`: una lectura que no esté acá la deja en rojo. Y
// `tests/unit/computed-index-lists.test.ts` pide que cada una nombre la lista que lee y que esa lista
// tenga su fila, con cuántas piezas pide y de dónde sale ese número (ADR-128 regla 8). Una lectura
// nueva entra acá con su lista, y su lista entra allá con su fila.

export interface ComputedIndexRead {
  path: string;
  /** La expresión como la devuelve la regla: sin espacios ni comas finales. */
  read: string;
  /** Cuántas veces la escribe el archivo. Una más también cae. */
  times?: number;
  /** Por qué esta lectura sigue por posición, en una frase. */
  reason: string;
  /** Las listas del catálogo que puede leer: su archivo escribe el código de cada una. */
  lists: readonly string[];
}

const DOMAIN_NUMBER =
  "El subíndice es un número que calcula el dominio o que está escrito en el sitio, no un valor de un enum (DT-369):";

export const COMPUTED_INDEX_READS: ComputedIndexRead[] = [
  {
    path: "src/modules/competition/domain/staff-import.ts",
    read: 'tList("T-3048")[day-1]',
    reason: `${DOMAIN_NUMBER} la jornada de The Games.`,
    lists: ["T-3048"],
  },
  {
    path: "src/modules/competition/domain/powers.ts",
    read: "dayName(problem.day)",
    times: 2,
    reason: `${DOMAIN_NUMBER} la jornada de The Games, por el ayudante que lee T-3048.`,
    lists: ["T-3048"],
  },
  {
    path: "src/app/admin/the-games/[id]/_ui/Powers.tsx",
    read: "dayName(day)",
    times: 2,
    reason: `${DOMAIN_NUMBER} la jornada de The Games, que el sitio recorre con \`[1, 2]\`.`,
    lists: ["T-3048"],
  },
  {
    path: "src/app/admin/the-games/[id]/_ui/Powers.tsx",
    read: "columns[day]",
    reason: `${DOMAIN_NUMBER} la columna de cada jornada, que el sitio recorre con \`[1, 2]\`.`,
    lists: ["T-3078"],
  },
  {
    path: "src/app/admin/the-games/[id]/_ui/Powers.tsx",
    read: "days[day-1]",
    reason: `${DOMAIN_NUMBER} la jornada de The Games, que el sitio recorre con \`[1, 2]\`.`,
    lists: ["T-3048"],
  },
  {
    path: "src/app/admin/the-games/[id]/_ui/Setup.tsx",
    read: "days[day-1]",
    reason: `${DOMAIN_NUMBER} la jornada de The Games.`,
    lists: ["T-3048"],
  },
  {
    path: "src/modules/participation/components/Panal.tsx",
    read: 'tList("T-2739")[panalRank(score,puzzle.maxScore)]',
    reason: `${DOMAIN_NUMBER} el rango del Panal.`,
    lists: ["T-2739"],
  },
  {
    path: "src/app/admin/asambleas/page.tsx",
    read: "ladderLabels[row.ladder]",
    reason: `${DOMAIN_NUMBER} el escalón de la representación de un comité en las asambleas.`,
    lists: ["T-2250"],
  },
  {
    path: "src/app/admin/comites/[slug]/_ui/Personas.tsx",
    read: "ladderLabels[representation.ladder]",
    reason: `${DOMAIN_NUMBER} el escalón de la representación de un comité en las asambleas.`,
    lists: ["T-2250"],
  },
  {
    path: "src/app/admin/permanencia/cierre/page.tsx",
    read: "reasonLabels[row.personReason]",
    reason: `${DOMAIN_NUMBER} el motivo automático de una propuesta del cierre, una de las seis piezas de T-801.`,
    lists: ["T-801"],
  },
  {
    path: "src/app/admin/personas/[id]/_ui/TabPermanencia.tsx",
    read: "reasonLabels[decision.proposalReason]",
    reason: `${DOMAIN_NUMBER} el motivo automático de una decisión confirmada del cierre, que la lectura de la pestaña trae resuelto (ADR-128 regla 1); antes lo armaba la pestaña con la posición de la decisión.`,
    lists: ["T-801"],
  },
  {
    path: "src/app/app/gh-points/page.tsx",
    read: "levelLabels[level.index+1]",
    reason: `${DOMAIN_NUMBER} el nivel que sigue al del miembro.`,
    lists: ["T-082"],
  },
  {
    path: "src/app/app/gh-points/page.tsx",
    read: "levelLabels[level.index]",
    reason: `${DOMAIN_NUMBER} el nivel del miembro.`,
    lists: ["T-082"],
  },
  {
    path: "src/app/app/gh-points/coleccion/page.tsx",
    read: "conditions[level.badge.level-1]",
    reason: `${DOMAIN_NUMBER} el nivel de una insignia, sobre la lista de condiciones de su familia.`,
    lists: ["T-2475", "T-2477", "T-2479", "T-2481"],
  },
  {
    path: "src/app/app/juegos/page.tsx",
    read: "estados[juego.estado]",
    reason: `${DOMAIN_NUMBER} el estado de cada juego de la biblioteca, que la página calcula como 0, 1 o 2.`,
    lists: ["T-2623"],
  },
  {
    path: "src/modules/people/domain/roster-pure.ts",
    read: 'text(assignments.error,{sigla:values.role,sugerencia:"—"})',
    reason: `${DOMAIN_NUMBER} la posición del error que devuelve el validador de asignaciones.`,
    lists: ["T-165"],
  },
];
