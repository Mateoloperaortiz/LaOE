import { type CaptainsTeam, resolveTeam } from "./captains-pure";
import { cleanTeamName, splitLine, teamKey } from "./schedule-import-pure";
import { type BaseKind, type Outcome, pointsFor } from "./scoring-pure";

// Los poderes de The Games (ADR-098), sin I/O: el catálogo, las reglas que confirmaron la OE y Mateo,
// el resolvedor que fija el resultado oficial y los puntos de una base, los límites del reparto y el
// lector de la hoja de reparto. El resultado de la cancha nunca se toca: el oficial va aparte.

export const POWER_TYPES = [
  "RESULT_SWAP",
  "DOUBLE_POINTS",
  "CANCEL_POWER",
  "LATE_START",
  "ONE_PLAYER_DOWN",
] as const;
export type Power = (typeof POWER_TYPES)[number];

/** El nombre de cada medalla en `public/the-games/poderes/`, igual al del paquete de la OE. */
export const POWER_SLUGS: Record<Power, string> = {
  RESULT_SWAP: "cambio-de-resultados",
  DOUBLE_POINTS: "multiplicador-x2",
  CANCEL_POWER: "cancelar-poder",
  LATE_START: "adversario-1-min-tarde",
  ONE_PLAYER_DOWN: "un-jugador-menos",
};

/** Las reglas de ADR-098 regla 2, confirmadas el 2026-09-28. Cambiar una sube la versión, y cada
 *  resultado con poderes guarda la versión con la que se resolvió. */
export const POWER_RULES = { version: 1, confirmedOn: "2026-09-28" } as const;

/** Cinco tarjetas por equipo, como mucho tres por jornada: el reparto completo es 2/3 o 3/2. */
export const POWERS_PER_TEAM = 5;
export const POWERS_PER_DAY = 3;
/** «El adversario empieza 1 min tarde»: el rival arranca este tiempo después del inicio de la base. */
export const LATE_START_SECONDS = 60;

export type PowerSide = "A" | "B";

export const POWER_EFFECTS = ["APPLIED", "CANCELLED", "NO_EFFECT", "NEUTRALIZED"] as const;
/** Qué pasó con un poder en su base: tuvo efecto, se lo anuló un Cancelar del rival, no tuvo efecto
 *  (x2 sin ganar ni empatar, Cancelar sin poder del rival, base inflable) o se anuló con el mismo
 *  poder del rival. */
export type PowerEffect = (typeof POWER_EFFECTS)[number];

export interface PowerUseInput {
  id: string;
  side: PowerSide;
  power: Power;
}

/** El desglose que guarda un resultado con poderes: lo de la cancha, lo oficial y cada uso. */
export interface PowerDetail {
  rulesVersion: number;
  sporting: Outcome;
  official: Outcome;
  teams: Record<PowerSide, { base: number; bonus: number; total: number }>;
  uses: Array<{ useId: string; side: PowerSide; power: Power; effect: PowerEffect }>;
}

export interface PowerResolution {
  official: Outcome;
  points: { a: number; b: number };
  detail: PowerDetail;
}

const rivalOf = (side: PowerSide): PowerSide => (side === "A" ? "B" : "A");

/** Solo cuenta un poder por equipo en cada base; en una inflable no cuenta ninguno. */
function countedUses(baseKind: BaseKind, uses: readonly PowerUseInput[]) {
  const effects = new Map<string, PowerEffect>();
  const counted: PowerUseInput[] = [];
  const seen = new Set<PowerSide>();
  for (const use of uses) {
    if (baseKind === "MACRO" || seen.has(use.side)) {
      effects.set(use.id, "NO_EFFECT");
      continue;
    }
    seen.add(use.side);
    counted.push(use);
  }
  return { effects, counted };
}

/** Cancelar poder, antes que todo: anula el poder del rival y queda usado; sin poder del rival se gasta
 *  sin efecto, y dos Cancelar se anulan entre sí. Devuelve el efecto de los usos que resuelve. */
function cancelStage(uses: readonly PowerUseInput[]): Map<string, PowerEffect> {
  const effects = new Map<string, PowerEffect>();
  for (const own of uses) {
    if (own.power !== "CANCEL_POWER") continue;
    const rival = uses.find((use) => use.side === rivalOf(own.side));
    if (!rival) {
      effects.set(own.id, "NO_EFFECT");
    } else if (rival.power === "CANCEL_POWER") {
      effects.set(own.id, "NEUTRALIZED");
      effects.set(rival.id, "NEUTRALIZED");
    } else {
      effects.set(own.id, "APPLIED");
      effects.set(rival.id, "CANCELLED");
    }
  }
  return effects;
}

/** Cambio de resultados invierte todo el enfrentamiento; un empate lo gana quien lo usó. */
function swapOutcome(outcome: Outcome, user: PowerSide): Outcome {
  if (outcome === "A_WIN") return "B_WIN";
  if (outcome === "B_WIN") return "A_WIN";
  return user === "A" ? "A_WIN" : "B_WIN";
}

/** El resultado oficial y los puntos de una base con los poderes declarados, en el orden de ADR-098:
 *  base inflable (sin efecto), Cancelar, Cambio de resultados, x2 y los avisos, que no tocan puntos. */
export function resolvePowers(input: {
  baseKind: BaseKind;
  outcome: Outcome;
  uses: readonly PowerUseInput[];
}): PowerResolution {
  const { effects, counted } = countedUses(input.baseKind, input.uses);
  for (const [id, effect] of cancelStage(counted)) effects.set(id, effect);
  const alive = counted.filter((use) => !effects.has(use.id));
  const swaps = alive.filter((use) => use.power === "RESULT_SWAP");
  let official = input.outcome;
  const [swap, secondSwap] = swaps;
  if (swap && secondSwap) {
    effects.set(swap.id, "NEUTRALIZED");
    effects.set(secondSwap.id, "NEUTRALIZED");
  } else if (swap) {
    official = swapOutcome(input.outcome, swap.side);
    effects.set(swap.id, "APPLIED");
  }
  const base = pointsFor(input.baseKind, official);
  const teams: PowerDetail["teams"] = {
    A: { base: base.a, bonus: 0, total: base.a },
    B: { base: base.b, bonus: 0, total: base.b },
  };
  for (const use of alive) {
    if (use.power === "DOUBLE_POINTS") {
      const team = teams[use.side];
      // x2 duplica lo que el equipo gana en la base: 2000 al ganar, 1000 al empatar; perdiendo, nada.
      if (team.base > 0) {
        team.bonus = team.base;
        team.total = team.base * 2;
        effects.set(use.id, "APPLIED");
      } else {
        effects.set(use.id, "NO_EFFECT");
      }
    } else if (use.power === "LATE_START" || use.power === "ONE_PLAYER_DOWN") {
      effects.set(use.id, "APPLIED");
    }
  }
  return {
    official,
    points: { a: teams.A.total, b: teams.B.total },
    detail: {
      rulesVersion: POWER_RULES.version,
      sporting: input.outcome,
      official,
      teams,
      uses: input.uses.map((use) => ({
        useId: use.id,
        side: use.side,
        power: use.power,
        effect: effects.get(use.id) ?? "NO_EFFECT",
      })),
    },
  };
}

/** Cómo está cada poder declarado antes del resultado, para la pantalla del líder: `ACTIVE` si va a
 *  contar; si no, lo que ya resolvió Cancelar poder o la base inflable. */
export type PowerNoticeState = "ACTIVE" | Exclude<PowerEffect, "APPLIED">;

export function powerNotices(
  baseKind: BaseKind,
  uses: readonly PowerUseInput[],
): Array<PowerUseInput & { state: PowerNoticeState }> {
  const { effects, counted } = countedUses(baseKind, uses);
  for (const [id, effect] of cancelStage(counted)) effects.set(id, effect);
  return uses.map((use) => {
    const effect = effects.get(use.id);
    return { ...use, state: effect === undefined || effect === "APPLIED" ? "ACTIVE" : effect };
  });
}

// --- Reparto -------------------------------------------------------------------------------------

export type GrantLimitProblem =
  | { kind: "TEAM_TOTAL"; teamId: string }
  | { kind: "TEAM_DAY"; teamId: string; day: 1 | 2 };

/** Los equipos que pasarían de 5 tarjetas activas o de 3 en una jornada si se suman `added`. */
export function checkGrantLimits(
  existing: ReadonlyArray<{ teamId: string; day: number }>,
  added: ReadonlyArray<{ teamId: string; day: number }>,
): GrantLimitProblem[] {
  const totals = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const grant of [...existing, ...added]) {
    totals.set(grant.teamId, (totals.get(grant.teamId) ?? 0) + 1);
    const key = `${grant.teamId}:${grant.day}`;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const problems: GrantLimitProblem[] = [];
  const reported = new Set<string>();
  for (const grant of added) {
    const day = grant.day === 2 ? 2 : 1;
    if ((totals.get(grant.teamId) ?? 0) > POWERS_PER_TEAM && !reported.has(grant.teamId)) {
      reported.add(grant.teamId);
      problems.push({ kind: "TEAM_TOTAL", teamId: grant.teamId });
    }
    const key = `${grant.teamId}:${day}`;
    if ((perDay.get(key) ?? 0) > POWERS_PER_DAY && !reported.has(key)) {
      reported.add(key);
      problems.push({ kind: "TEAM_DAY", teamId: grant.teamId, day });
    }
  }
  return problems;
}

/** El reparto de un equipo está completo con 5 tarjetas activas, 2/3 o 3/2 entre las jornadas. */
export function isCompleteSplit(dayOne: number, dayTwo: number): boolean {
  return dayOne + dayTwo === POWERS_PER_TEAM && dayOne >= 2 && dayTwo >= 2;
}

/** Las jornadas que ya terminaron. Con la competencia cerrada, las dos. Si no, la jornada 1 termina
 *  cuando empieza la 2 o cuando cerraron todas sus rotaciones, y la 2 cuando cerraron todas las suyas.
 *  Sale de las rotaciones, no del reloj: las fechas no se deducen de hoy. */
export function finishedDays(
  competitionStatus: string,
  rotations: ReadonlyArray<{ day: number; status: "PENDING" | "ACTIVE" | "CLOSED" }>,
): Set<number> {
  if (competitionStatus === "FINISHED" || competitionStatus === "ARCHIVED") return new Set([1, 2]);
  const finished = new Set<number>();
  for (const dayNumber of [1, 2]) {
    const own = rotations.filter((rotation) => rotation.day === dayNumber);
    if (own.length > 0 && own.every((rotation) => rotation.status === "CLOSED")) {
      finished.add(dayNumber);
    }
  }
  if (rotations.some((rotation) => rotation.day === 2 && rotation.status !== "PENDING")) {
    finished.add(1);
  }
  return finished;
}

/** Cómo está una tarjeta para quien la mira: anulada, usada, sin entregar, vencida (su jornada ya
 *  pasó sin usarla) o disponible. */
export type GrantState = "ASSIGNED" | "DELIVERED" | "USED" | "EXPIRED" | "VOIDED";

export function grantState(
  grant: { status: "ASSIGNED" | "DELIVERED" | "VOIDED"; day: number },
  used: boolean,
  finishedDays: ReadonlySet<number>,
): GrantState {
  if (grant.status === "VOIDED") return "VOIDED";
  if (used) return "USED";
  if (grant.status === "ASSIGNED") return "ASSIGNED";
  return finishedDays.has(grant.day) ? "EXPIRED" : "DELIVERED";
}

// --- Hoja de reparto -----------------------------------------------------------------------------

export const MAX_POWERS_TEXT = 20_000;

export type PowerSheetProblem =
  | { kind: "COLUMNS"; line: number }
  | { kind: "EXTRA_COLUMNS"; line: number }
  | { kind: "TEAM"; line: number; team: string }
  | { kind: "POWER"; line: number; power: string }
  | { kind: "DAY"; line: number; day: string }
  | { kind: "TEAM_TOTAL"; team: string }
  | { kind: "TEAM_DAY"; team: string; day: 1 | 2 }
  | { kind: "EMPTY" };

export interface ParsedGrant {
  teamId: string;
  power: Power;
  day: 1 | 2;
}

/** La clave de un poder o una jornada: sin mayúsculas, tildes ni signos. */
function powerKey(value: string): string {
  return teamKey(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const POWER_ALIASES: Record<string, Power> = Object.fromEntries(
  (
    [
      ["RESULT_SWAP", ["cambio de resultados", "cambio de resultado", "cambio", "result swap"]],
      ["DOUBLE_POINTS", ["multiplicador x2", "multiplicador", "x2", "double points"]],
      ["CANCEL_POWER", ["cancelar poder", "cancelar", "cancel power"]],
      [
        "LATE_START",
        [
          "el adversario empieza 1 min tarde",
          "el adversario empieza un minuto tarde",
          "adversario empieza 1 min tarde",
          "adversario 1 min tarde",
          "1 min tarde",
          "un minuto tarde",
          "late start",
        ],
      ],
      ["ONE_PLAYER_DOWN", ["un jugador menos", "jugador menos", "one player down"]],
    ] as const
  ).flatMap(([power, aliases]) => aliases.map((alias) => [alias, power])),
);

/** El poder de una celda, por su nombre en la tarjeta o un nombre corto («x2», «cambio»). */
export function parsePower(cell: string): Power | undefined {
  return POWER_ALIASES[powerKey(cell)];
}

/** La jornada de una celda: «jueves» o «1», «viernes» o «2» (también «Jornada 1» o «Día 2»). */
export function parseDay(cell: string): 1 | 2 | undefined {
  const key = powerKey(cell).replace(/^(jornada|dia)\s+/, "");
  if (key === "jueves" || key === "1") return 1;
  if (key === "viernes" || key === "2") return 2;
  return undefined;
}

/** Lee el reparto pegado: tres columnas, Equipo, Poder y Jornada. Devuelve las tarjetas o, si algo no
 *  cuadra, todos los problemas: entra la hoja completa o nada. `existing` son las tarjetas activas que
 *  ya tiene la competencia, para los límites por equipo. */
export function parsePowerSheet(
  text: string,
  teams: readonly CaptainsTeam[],
  existing: ReadonlyArray<{ teamId: string; day: number }> = [],
): { grants: ParsedGrant[] | null; problems: PowerSheetProblem[] } {
  const problems: PowerSheetProblem[] = [];
  const grants: ParsedGrant[] = [];
  let firstLine = true;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (raw.trim() === "") continue;
    const line = index + 1;
    const cells = splitLine(raw);
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    const [teamCell = "", powerCell = "", dayCell = ""] = cells;
    const isFirst = firstLine;
    firstLine = false;
    // La primera fila puede ser el encabezado: «Equipo», «Poder», «Jornada».
    if (isFirst && teamKey(teamCell) === "equipo" && powerKey(powerCell) === "poder") continue;
    if (cells.length > 3) {
      problems.push({ kind: "EXTRA_COLUMNS", line });
      continue;
    }
    if (cleanTeamName(teamCell) === "" || powerKey(powerCell) === "" || powerKey(dayCell) === "") {
      problems.push({ kind: "COLUMNS", line });
      continue;
    }
    const team = resolveTeam(teamCell, teams);
    if (!team) {
      problems.push({ kind: "TEAM", line, team: cleanTeamName(teamCell) });
      continue;
    }
    const power = parsePower(powerCell);
    if (!power) {
      problems.push({ kind: "POWER", line, power: cleanTeamName(powerCell) });
      continue;
    }
    const day = parseDay(dayCell);
    if (!day) {
      problems.push({ kind: "DAY", line, day: cleanTeamName(dayCell) });
      continue;
    }
    grants.push({ teamId: team.id, power, day });
  }
  const label = (teamId: string) => {
    const team = teams.find((item) => item.id === teamId);
    return team ? `${team.number} ${team.name}` : teamId;
  };
  for (const problem of checkGrantLimits(existing, grants)) {
    problems.push(
      problem.kind === "TEAM_TOTAL"
        ? { kind: "TEAM_TOTAL", team: label(problem.teamId) }
        : { kind: "TEAM_DAY", team: label(problem.teamId), day: problem.day },
    );
  }
  if (grants.length === 0 && problems.length === 0) problems.push({ kind: "EMPTY" });
  return problems.length > 0 ? { grants: null, problems } : { grants, problems };
}
