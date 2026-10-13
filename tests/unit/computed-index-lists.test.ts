import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Day } from "@/modules/competition/domain/schedule-pure";
import { representationLadder } from "@/modules/participation/domain/committee-assembly";
import { levelFor } from "@/modules/participation/domain/ledger-pure";
import { PANAL_RANK_PERCENTAGES, panalRank } from "@/modules/participation/panal-engine";
import { parseRoleAssignments, type RosterCommittee } from "@/modules/people/domain/roster-pure";
import type { ProposalReason } from "@/modules/permanence/domain/permanence-pure";
import { type CopyCode, tList } from "@/shared/copy";
import { COMPUTED_INDEX_READS, type ComputedIndexRead } from "./computed-index-lists.table";

// DT-369: dieciocho lecturas de `src` llevan de subíndice de una lista del catálogo de textos un
// número que calcula el dominio. No son la etiqueta de un valor de un enum, y nada comparaba el largo
// de la lista con el rango de ese número: si The Games gana una jornada y T-3048 no, la pantalla
// muestra el número en vez del nombre del día sin que nada falle. Acá va una fila por lista, con
// cuántas piezas pide y de dónde sale ese número (ADR-128 regla 8). Las lecturas viven en
// `computed-index-lists.table.ts`, que comparte la regla de `tests/unit/label-positions.test.ts`.
//
// Ninguna fila lee la lista: la prueba se la pasa, entera y sin su última pieza, y con esa segunda
// tiene que caer el caso. Así una fila no puede pasar por comparar la lista consigo misma.

const ROOT = process.cwd();
const sourceOf = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Lo que un archivo escribe: si deja de escribirlo así, la prueba cae acá en vez de pasar sin mirar. */
function writtenIn(path: string, pattern: RegExp): string {
  const [, found] = sourceOf(path).match(pattern) ?? [];
  if (!found) {
    throw new Error(`${path} ya no escribe lo que esta prueba lee de él: ${pattern}`);
  }
  return found;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);
const distinct = (numbers: readonly number[]) => [...new Set(numbers)].sort((a, b) => a - b);

// Las jornadas de The Games y los motivos del cierre son tipos: un valor nuevo no compila hasta
// sumarlo acá, y entonces su fila pide una pieza más.
const DAYS = Object.keys({ 1: true, 2: true } satisfies Record<Day, true>).map(Number);
const PROPOSAL_REASONS = Object.keys({
  0: true,
  1: true,
  2: true,
  3: true,
  4: true,
  5: true,
} satisfies Record<ProposalReason, true>).map(Number);

// El escalón y el rango del Panal los da una función, y acá se la llama: de tres faltas en adelante
// el escalón es el último, y con un máximo de 100 cada porcentaje de corte es un puntaje.
const LADDER_STEPS = distinct(range(0, 10).map(representationLadder));
const PANAL_MAX = 100;
const PANAL_RANKS = distinct(range(0, PANAL_MAX).map((score) => panalRank(score, PANAL_MAX)));

// Lo que sigue se lee del texto de un archivo, porque no hay nada que importar.
const BADGE_SCHEMA = "src/modules/participation/schema.ts";
const BADGE_LEVELS = writtenIn(
  BADGE_SCHEMA,
  /check\("badge_definition_level_range", sql`\$\{t\.level\} between (\d+ and \d+)`\)/,
)
  .split(" and ")
  .map(Number);
const BADGE_POSITIONS = range(BADGE_LEVELS[0] ?? 0, BADGE_LEVELS[1] ?? 0).map((level) => level - 1);

const COLLECTION_PAGE = "src/app/app/gh-points/coleccion/page.tsx";
const BADGE_CONDITION_LISTS = [
  ...writtenIn(COLLECTION_PAGE, /const FAMILY_CONDITIONS[^=]*=\s*\{([^}]*)\}/).matchAll(
    /"(T-\d+)"/g,
  ),
].map(([, code]) => code);

const LEVELS_SEED = "0005_participacion_y_gh_points.sql";
const SEEDED_CUTOFFS: number[] = JSON.parse(
  writtenIn(`drizzle/${LEVELS_SEED}`, /\('points\.levels', '(\[[\d, ]+\])'\)/),
);
const LEVEL_POSITIONS = distinct(
  SEEDED_CUTOFFS.flatMap((total) => {
    const level = levelFor(total, SEEDED_CUTOFFS);
    // La página lee el nivel del miembro y, si hay uno más arriba, el siguiente.
    return level.next === null ? [level.index] : [level.index, level.index + 1];
  }),
);

const GAME_STATES = writtenIn("src/app/app/juegos/page.tsx", /type Estado = ([\d |]+);/)
  .split("|")
  .map(Number);

const ROSTER = "src/modules/people/domain/roster-pure.ts";
const ASSIGNMENT_ERRORS = distinct(
  [...sourceOf(ROSTER).matchAll(/return \{ bySlug, error: (\d+) \}/g)].map(([, n]) => Number(n)),
);
const WRITTEN_ROSTER_ERRORS = [...sourceOf(ROSTER).matchAll(/\btext\((\d+)/g)].map(([, n]) =>
  Number(n),
);

/** Con qué mira la prueba el rango del número. */
type Seen =
  /** Llama a la función que da el número. */
  | "función"
  /** Enumera un tipo exportado, que no compila si gana un valor. */
  | "tipo"
  /** Lee un número del texto de un archivo: nada lo ata a lo que hay guardado en una base. */
  | "texto";

interface ListRow {
  code: CopyCode;
  /** Qué número la lee. */
  number: string;
  /** De dónde sale ese número. */
  source: string;
  seen: Seen;
  /** Cuántas piezas pide. */
  pieces: number;
  /** Las posiciones que ese número puede pedir. */
  positions: readonly number[];
}

const badgeConditions = (code: CopyCode): ListRow => ({
  code,
  number: "el nivel de una insignia",
  source: `el \`check\` \`badge_definition_level_range\` de \`${BADGE_SCHEMA}\`; el rango de verdad es el de la base`,
  seen: "texto",
  pieces: BADGE_POSITIONS.length,
  positions: BADGE_POSITIONS,
});

const LISTS: ListRow[] = [
  {
    code: "T-3048",
    number: "la jornada de The Games",
    source: "el tipo `Day` de `src/modules/competition/domain/schedule-pure.ts`",
    seen: "tipo",
    pieces: DAYS.length,
    positions: DAYS.map((day) => day - 1),
  },
  {
    code: "T-3078",
    number: "la columna de cada jornada de The Games, entre la del equipo y la de las entregadas",
    source: "el tipo `Day` de `src/modules/competition/domain/schedule-pure.ts`",
    seen: "tipo",
    pieces: DAYS.length + 2,
    positions: DAYS,
  },
  {
    code: "T-2739",
    number: "el rango del Panal",
    source:
      "`panalRank` sobre los cortes de `PANAL_RANK_PERCENTAGES` (`src/modules/participation/panal-engine.ts`)",
    seen: "función",
    pieces: PANAL_RANK_PERCENTAGES.length + 1,
    positions: PANAL_RANKS,
  },
  {
    code: "T-2250",
    number: "el escalón de la representación de un comité",
    source: "`representationLadder` (`src/modules/participation/domain/committee-assembly.ts`)",
    seen: "función",
    pieces: LADDER_STEPS.length,
    positions: LADDER_STEPS,
  },
  {
    code: "T-801",
    number: "el motivo automático de una propuesta del cierre",
    source: "el tipo `ProposalReason` de `src/modules/permanence/domain/permanence-pure.ts`",
    seen: "tipo",
    pieces: PROPOSAL_REASONS.length,
    positions: PROPOSAL_REASONS,
  },
  badgeConditions("T-2475"),
  badgeConditions("T-2477"),
  badgeConditions("T-2479"),
  badgeConditions("T-2481"),
  {
    code: "T-082",
    number: "el nivel de GH Points",
    source: `los cortes de \`points.levels\` que siembra \`drizzle/${LEVELS_SEED}\`, por \`levelFor\`; lo guardado es configuración y esta prueba no lo ve`,
    seen: "texto",
    pieces: SEEDED_CUTOFFS.length,
    positions: LEVEL_POSITIONS,
  },
  {
    code: "T-2623",
    number: "el estado de un juego de la biblioteca",
    source: "el tipo `Estado`, que es de `src/app/app/juegos/page.tsx` y no se puede importar",
    seen: "texto",
    pieces: GAME_STATES.length,
    positions: GAME_STATES,
  },
  {
    code: "T-165",
    number: "el error del validador de asignaciones",
    source: `los \`error: n\` que devuelve \`parseRoleAssignments\` (\`${ROSTER}\`); el largo es la posición más alta que ese archivo le pide a su lista`,
    seen: "texto",
    pieces: Math.max(...WRITTEN_ROSTER_ERRORS, ...ASSIGNMENT_ERRORS) + 1,
    positions: ASSIGNMENT_ERRORS,
  },
];

/** Lo que le falta a una lista para lo que su fila pide. Vacío si trae todo. */
function problems(row: ListRow, list: readonly string[]): string[] {
  const found: string[] = [];
  if (list.length !== row.pieces) {
    found.push(`${row.code} trae ${list.length} piezas y ${row.number} pide ${row.pieces}`);
  }
  if (row.positions.length === 0) {
    found.push(`${row.code}: no se encontró ninguna posición para ${row.number}`);
  }
  for (const position of row.positions) {
    if (!Number.isInteger(position) || position < 0 || !list[position]) {
      found.push(`${row.code} no trae la pieza ${position}, que lee ${row.number}`);
    }
  }
  return found;
}

/** Las lecturas que no nombran ninguna lista, o que nombran una que no tiene fila. */
function withoutRow(reads: readonly ComputedIndexRead[], rows: readonly ListRow[]): string[] {
  const codes = new Set<string>(rows.map((row) => row.code));
  return reads.flatMap((read) => {
    const where = `${read.path} · ${read.read}`;
    if (read.lists.length === 0) {
      return [`${where} · no nombra la lista que lee`];
    }
    return read.lists
      .filter((code) => !codes.has(code))
      .map((code) => `${where} · ${code} no tiene fila`);
  });
}

describe("cada lista del catálogo que se lee con un subíndice calculado", () => {
  it.each(LISTS)("$code trae una pieza por cada posición que le pide $number", (row) => {
    expect(problems(row, tList(row.code))).toEqual([]);
  });

  it.each(LISTS)("$code sin su última pieza deja su caso en rojo", (row) => {
    expect(problems(row, tList(row.code).slice(0, -1))).not.toEqual([]);
  });

  it("el puntaje máximo del Panal lee la última pieza de T-2739, y el cero la primera", () => {
    expect(panalRank(PANAL_MAX, PANAL_MAX)).toBe(tList("T-2739").length - 1);
    expect(panalRank(0, PANAL_MAX)).toBe(0);
  });

  it("de tres faltas en adelante el escalón es el último de T-2250", () => {
    expect(representationLadder(3)).toBe(tList("T-2250").length - 1);
    expect(representationLadder(40)).toBe(tList("T-2250").length - 1);
  });

  it("el validador de asignaciones devuelve las dos posiciones de T-165 que su archivo escribe", () => {
    const committee = (slug: string): RosterCommittee => ({
      id: slug,
      slug,
      name: slug,
      status: "ACTIVE",
    });
    const unknownCommittee = parseRoleAssignments("General de XX", [], []).error;
    const roleWithoutCommittee = parseRoleAssignments(
      "Tesorería",
      [],
      [committee("a3"), committee("pixel")],
    ).error;
    expect(distinct([unknownCommittee ?? -1, roleWithoutCommittee ?? -1])).toEqual(
      ASSIGNMENT_ERRORS,
    );
  });

  it("los cortes de GH Points los siembra una sola migración: otra que los cambie pide mirar T-082", () => {
    const writers = readdirSync(join(ROOT, "drizzle")).filter(
      (file) => file.endsWith(".sql") && sourceOf(`drizzle/${file}`).includes("points.levels"),
    );
    expect(writers).toEqual([LEVELS_SEED]);
  });
});

describe("cada lectura con un subíndice calculado nombra su lista, y cada lista tiene su fila", () => {
  it("ninguna lectura queda sin lista ni nombra una lista sin fila", () => {
    expect(withoutRow(COMPUTED_INDEX_READS, LISTS)).toEqual([]);
  });

  it("ninguna fila sobra ni se repite: la lista que ya no lee ninguna lectura se quita", () => {
    const read = new Set(COMPUTED_INDEX_READS.flatMap((entry) => entry.lists));
    expect(LISTS.filter((row) => !read.has(row.code)).map((row) => row.code)).toEqual([]);
    expect(new Set(LISTS.map((row) => row.code)).size).toBe(LISTS.length);
  });

  it("el archivo de cada lectura escribe el código de la lista que dice leer", () => {
    const unwritten = COMPUTED_INDEX_READS.flatMap((read) =>
      read.lists
        .filter((code) => !sourceOf(read.path).includes(`"${code}"`))
        .map((code) => `${read.path} · ${code}`),
    );
    expect(unwritten).toEqual([]);
  });

  it("la lectura del nivel de una insignia nombra cada lista de condiciones que su página escribe", () => {
    const read = COMPUTED_INDEX_READS.find((entry) => entry.path === COLLECTION_PAGE);
    expect(read?.lists).toEqual(BADGE_CONDITION_LISTS);
  });

  it("sembrada en memoria, una lectura nueva sin fila para su lista deja la prueba en rojo", () => {
    const seeded = { path: "src/app/sembrado/page.tsx", read: "labels[rank(score)]", reason: "" };
    expect(withoutRow([{ ...seeded, lists: ["T-444"] }], LISTS)).toEqual([
      "src/app/sembrado/page.tsx · labels[rank(score)] · T-444 no tiene fila",
    ]);
    expect(withoutRow([{ ...seeded, lists: [] }], LISTS)).toEqual([
      "src/app/sembrado/page.tsx · labels[rank(score)] · no nombra la lista que lee",
    ]);
  });
});
