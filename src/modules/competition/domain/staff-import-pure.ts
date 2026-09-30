import { createHash } from "node:crypto";
import { cleanTeamName, teamKey } from "./schedule-import-pure";
import type { Day } from "./schedule-pure";

// El personal de una jornada desde la hoja del GAP de la OE (ADR-101): tres columnas, Persona, Base y
// Función, pegadas desde la hoja de cálculo. La base va solo en la fila del líder y vale para las
// filas de abajo. Aquí se lee lo pegado, se resuelve cada base dentro de la jornada y cada nombre
// entre los miembros, y se calcula qué entra, qué sale y qué sigue. Entra la jornada completa o nada.

export const MAX_STAFF_TEXT = 30_000;

/** Las fichas y la hoja del GAP numeran las bases del viernes del 16 al 30. */
const SECOND_DAY_OFFSET = 15;
const MAX_SUGGESTIONS = 3;
const SUGGESTION_THRESHOLD = 0.5;

export const STAFF_SHEET_ROLES = ["LEADER", "GRADER", "OVERSEER", "VAR"] as const;
/** El líder queda como `JUDGE` en `competition_staff`; los demás, como apoyo de la base. */
export type StaffSheetRole = (typeof STAFF_SHEET_ROLES)[number];
export type SupportRole = Exclude<StaffSheetRole, "LEADER">;

export type StaffSheetProblem =
  | { kind: "COLUMNS"; line: number }
  | { kind: "EXTRA_COLUMNS"; line: number }
  | { kind: "NO_BASE"; line: number }
  | { kind: "BASE"; line: number; base: string }
  | { kind: "BASE_OTHER_DAY"; line: number; base: number }
  | { kind: "ROLE"; line: number; role: string }
  | { kind: "NOT_FOUND"; line: number; name: string; suggestions: string[] }
  | { kind: "AMBIGUOUS"; line: number; name: string; options: string[] }
  | { kind: "INACTIVE"; line: number; name: string }
  | { kind: "TWICE"; line: number; name: string; other: number }
  | { kind: "EMPTY" };

export interface StaffBase {
  id: string;
  day: number;
  orderIndex: number;
  name: string;
}

/** Un miembro que puede quedar en el personal: `ACTIVE` u `HONORARY`. */
export interface StaffMember {
  id: string;
  fullName: string;
}

/** Un miembro buscado por su correo, con su estado, para decir por qué no entra. */
export interface StaffEmailMember extends StaffMember {
  status: string;
}

export interface StaffDirectory {
  members: readonly StaffMember[];
  /** Por correo institucional en minúsculas. */
  byEmail: ReadonlyMap<string, StaffEmailMember>;
}

export type MatchKind = "EXACT" | "PARTIAL" | "EMAIL";

export interface ParsedStaffRow {
  line: number;
  baseId: string;
  role: StaffSheetRole;
  personId: string;
  /** Como viene en la hoja, sin espacios de más. */
  sheetName: string;
  /** Como está en la casa. */
  memberName: string;
  match: MatchKind;
}

const ELIGIBLE = new Set(["ACTIVE", "HONORARY"]);

// --- Lectura del texto ---------------------------------------------------------------------------

type Separator = "\t" | ";" | ",";

/** Las filas de lo pegado con un separador, respetando comillas («"…"», con «""» adentro): una celda
 *  con tabuladores o saltos de línea viene entre comillas desde la hoja. */
function rowsWith(text: string, separator: Separator): Array<{ line: number; cells: string[] }> {
  const rows: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    cells.push(cell);
    rows.push({ line: rowLine, cells });
    cells = [];
    cell = "";
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === "\n") line++;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === separator) {
      cells.push(cell);
      cell = "";
    } else if (char === "\n") {
      endRow();
      line++;
      rowLine = line;
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell !== "" || cells.length > 0) endRow();
  return rows;
}

/** Un solo separador para todo el texto: el que deja más filas con tres celdas o más. Así un
 *  tabulador suelto dentro de un nombre no parte una fila separada por `;`. */
function detectSeparator(text: string): Separator {
  let best: Separator = "\t";
  let bestRows = -1;
  for (const separator of ["\t", ";", ","] as const) {
    const wide = rowsWith(text, separator).filter((row) => row.cells.length >= 3).length;
    if (wide > bestRows) {
      best = separator;
      bestRows = wide;
    }
  }
  return best;
}

/** Las filas con contenido, sin las celdas vacías del final (la hoja las agrega al copiar de más). */
export function splitStaffText(text: string): Array<{ line: number; cells: string[] }> {
  return rowsWith(text, detectSeparator(text))
    .map((row) => {
      const cells = row.cells.map((cell) => cell.replace(/\s+/g, " ").trim());
      while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
      return { line: row.line, cells };
    })
    .filter((row) => row.cells.length > 0);
}

// --- Funciones y bases ---------------------------------------------------------------------------

function words(value: string): string {
  return teamKey(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ROLE_ALIASES: Record<string, StaffSheetRole> = {
  lider: "LEADER",
  lideres: "LEADER",
  "lider de base": "LEADER",
  "lideres de base": "LEADER",
  calificador: "GRADER",
  calificadora: "GRADER",
  calificadores: "GRADER",
  veedor: "OVERSEER",
  veedora: "OVERSEER",
  veedores: "OVERSEER",
  veedoras: "OVERSEER",
  var: "VAR",
};

/** La función de una celda: líder de base, calificador, veedor o VAR, con tildes, plurales y
 *  espacios como vengan. */
export function parseStaffRole(cell: string): StaffSheetRole | undefined {
  return ROLE_ALIASES[words(cell)];
}

/** El número de una celda de base: «7» o «Base 7». */
function baseNumber(cell: string): number | undefined {
  const match = /^(?:base\s*)?(\d{1,2})$/i.exec(cleanTeamName(cell));
  return match?.[1] ? Number(match[1]) : undefined;
}

/** Las bases de una jornada que se llaman «Base N», sin números repetidos. */
function namedBases(bases: readonly StaffBase[]): Map<number, StaffBase> {
  const named = bases.flatMap((base) => {
    const match = /^base\s+(\d+)(?:$|\s)/i.exec(base.name.trim());
    return match?.[1] ? [{ number: Number(match[1]), base }] : [];
  });
  return new Map(
    named
      .filter((item) => named.filter((other) => other.number === item.number).length === 1)
      .map((item) => [item.number, item.base]),
  );
}

export type DayBaseMatch =
  | { kind: "OK"; base: StaffBase }
  | { kind: "OTHER_DAY" }
  | { kind: "MISSING" };

/**
 * La base número `n` de la jornada: primero la que se llama «Base N» y si no, la del puesto N. El
 * viernes también vale la numeración de las fichas, del 16 al 30 (el puesto N − 15). Un número que
 * solo existe en la otra jornada se reporta aparte, para que pegar el jueves en el viernes no pase.
 */
export function resolveDayBase(bases: readonly StaffBase[], day: Day, n: number): DayBaseMatch {
  const inDay = (which: number) => bases.filter((base) => base.day === which);
  const byPosition = (which: number, position: number) =>
    inDay(which).find((base) => base.orderIndex + 1 === position);
  const found =
    day === 1
      ? (namedBases(inDay(1)).get(n) ?? byPosition(1, n))
      : (namedBases(inDay(2)).get(n) ??
        (n > SECOND_DAY_OFFSET ? byPosition(2, n - SECOND_DAY_OFFSET) : undefined));
  if (found) return { kind: "OK", base: found };
  const other =
    day === 1
      ? n > SECOND_DAY_OFFSET &&
        (namedBases(inDay(2)).has(n) || byPosition(2, n - SECOND_DAY_OFFSET) !== undefined)
      : namedBases(inDay(1)).has(n) || byPosition(1, n) !== undefined;
  return other ? { kind: "OTHER_DAY" } : { kind: "MISSING" };
}

/** Una celda con tabuladores escondidos que la hoja copia sin comillas corre la fila: el nombre queda
 *  seguido de celdas vacías antes de la base o la función. Si lo que sobra está vacío y la fila
 *  termina en una función, se vuelve a armar como Persona, Base y Función. */
function realign(cells: readonly string[]): readonly string[] {
  if (cells.length <= 3) return cells;
  const [person = "", ...rest] = cells;
  const role = rest[rest.length - 1] ?? "";
  if (person === "" || !parseStaffRole(role)) return cells;
  const filled = rest.filter((cell) => cell !== "");
  if (filled.length === 1) return [person, "", role];
  const [base = ""] = filled;
  if (filled.length === 2 && baseNumber(base) !== undefined) return [person, base, role];
  return cells;
}

// --- Personas ------------------------------------------------------------------------------------

/** Las palabras de un nombre para comparar: sin mayúsculas, tildes, signos ni espacios de más. */
export function nameWords(value: string): string[] {
  return words(value).split(" ").filter(Boolean);
}

/** Si `short` aparece en orden dentro de `long`, palabra por palabra; una letra suelta de `short`
 *  vale como inicial. */
function inOrder(short: readonly string[], long: readonly string[]): boolean {
  let at = 0;
  for (const word of short) {
    while (
      at < long.length &&
      !(long[at] === word || (word.length === 1 && long[at]?.startsWith(word)))
    ) {
      at++;
    }
    if (at >= long.length) return false;
    at++;
  }
  return true;
}

/** Una coincidencia parcial: el nombre de la hoja y el de la casa coinciden en orden y a uno le
 *  sobran palabras, o trae iniciales. Exige al menos dos palabras de dos letras o más en el más
 *  corto, para que «Juan» no encuentre a cualquiera. */
function partialMatch(sheet: readonly string[], member: readonly string[]): boolean {
  const [short, long] = sheet.length <= member.length ? [sheet, member] : [member, sheet];
  if (short.filter((word) => word.length >= 2).length < 2) return false;
  return inOrder(short, long) || (short.length === long.length && inOrder(long, short));
}

function bigrams(value: string): string[] {
  const text = value.replace(/\s+/g, " ");
  return Array.from({ length: Math.max(text.length - 1, 0) }, (_, index) =>
    text.slice(index, index + 2),
  );
}

function dice(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const pool = [...b];
  let shared = 0;
  for (const item of a) {
    const at = pool.indexOf(item);
    if (at >= 0) {
      shared++;
      pool.splice(at, 1);
    }
  }
  return (2 * shared) / (a.length + b.length);
}

/** Qué tanto se parecen dos nombres: por pares de letras o por palabras, lo que dé más. Las palabras
 *  encuentran un nombre escrito en otro orden. */
function likeness(a: readonly string[], b: readonly string[]): number {
  return Math.max(dice(bigrams(a.join(" ")), bigrams(b.join(" "))), dice(a, b));
}

export type PersonMatch =
  | { kind: MatchKind; member: StaffMember }
  | { kind: "NOT_FOUND"; suggestions: string[] }
  | { kind: "AMBIGUOUS"; options: string[] }
  | { kind: "INACTIVE"; name: string };

/** La persona de una celda: por correo institucional, por su nombre exacto o por una coincidencia
 *  parcial única. Si no, sugiere hasta tres nombres parecidos. */
export function resolvePerson(cell: string, directory: StaffDirectory): PersonMatch {
  const value = cleanTeamName(cell);
  if (value.includes("@")) {
    const member = directory.byEmail.get(value.toLowerCase());
    if (!member) return { kind: "NOT_FOUND", suggestions: [] };
    if (!ELIGIBLE.has(member.status)) return { kind: "INACTIVE", name: member.fullName };
    return { kind: "EMAIL", member: { id: member.id, fullName: member.fullName } };
  }
  const sheet = nameWords(value);
  const key = sheet.join(" ");
  const candidates = directory.members.map((member) => ({
    member,
    words: nameWords(member.fullName),
  }));
  const exact = candidates.filter((item) => item.words.join(" ") === key);
  if (exact.length === 1 && exact[0]) return { kind: "EXACT", member: exact[0].member };
  if (exact.length > 1) {
    return { kind: "AMBIGUOUS", options: exact.map((item) => item.member.fullName) };
  }
  const partial = candidates.filter((item) => partialMatch(sheet, item.words));
  if (partial.length === 1 && partial[0]) return { kind: "PARTIAL", member: partial[0].member };
  if (partial.length > 1) {
    return {
      kind: "AMBIGUOUS",
      options: partial.slice(0, MAX_SUGGESTIONS).map((item) => item.member.fullName),
    };
  }
  const suggestions = candidates
    .map((item) => ({ name: item.member.fullName, score: likeness(sheet, item.words) }))
    .filter((item) => item.score >= SUGGESTION_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "es"))
    .slice(0, MAX_SUGGESTIONS)
    .map((item) => item.name);
  return { kind: "NOT_FOUND", suggestions };
}

// --- La hoja -------------------------------------------------------------------------------------

/** La primera fila puede ser el encabezado («Persona», «Base», «Función»); si se copió desde más
 *  arriba, lo de antes del encabezado (el título de la hoja) no cuenta. */
function headerIndex(rows: ReadonlyArray<{ cells: string[] }>): number {
  const within = rows.slice(0, 5);
  return within.findIndex(
    (row) =>
      ["persona", "nombre"].includes(words(row.cells[0] ?? "")) &&
      ["funcion", "rol"].includes(words(row.cells[2] ?? "")),
  );
}

/**
 * Lee la hoja pegada de una jornada. Devuelve las filas resueltas o, si algo no cuadra, todos los
 * problemas con su línea. Se saltan el encabezado, las filas sin persona y las de totales («64»,
 * «TOTAL PERSONAS»); una fila sin persona con otra cosa en la base («COLCHONCITO») corta la base que
 * venía bajando.
 */
export function parseStaffSheet(
  text: string,
  day: Day,
  bases: readonly StaffBase[],
  directory: StaffDirectory,
): { rows: ParsedStaffRow[] | null; problems: StaffSheetProblem[] } {
  const problems: StaffSheetProblem[] = [];
  const rows: ParsedStaffRow[] = [];
  const seen = new Map<string, number>();
  const all = splitStaffText(text);
  const header = headerIndex(all);
  let carried: number | null = null;
  for (const { line, cells: raw } of all.slice(header + 1)) {
    const cells = realign(raw);
    const [personCell = "", baseCell = "", roleCell = ""] = cells;
    const person = cleanTeamName(personCell);
    const baseValue = baseNumber(baseCell);
    if (person === "" || (/^\d+$/.test(person) && roleCell === "")) {
      carried = baseValue ?? (baseCell === "" && person === "" ? carried : null);
      continue;
    }
    if (roleCell === "") {
      problems.push({ kind: "COLUMNS", line });
      continue;
    }
    if (cells.length > 3) {
      problems.push({ kind: "EXTRA_COLUMNS", line });
      continue;
    }
    if (baseCell !== "") {
      if (baseValue === undefined) {
        carried = null;
        problems.push({ kind: "BASE", line, base: cleanTeamName(baseCell) });
        continue;
      }
      carried = baseValue;
    }
    if (carried === null) {
      problems.push({ kind: "NO_BASE", line });
      continue;
    }
    const role = parseStaffRole(roleCell);
    if (!role) {
      problems.push({ kind: "ROLE", line, role: cleanTeamName(roleCell) });
      continue;
    }
    const base = resolveDayBase(bases, day, carried);
    if (base.kind === "OTHER_DAY") {
      problems.push({ kind: "BASE_OTHER_DAY", line, base: carried });
      continue;
    }
    if (base.kind === "MISSING") {
      problems.push({ kind: "BASE", line, base: String(carried) });
      continue;
    }
    const match = resolvePerson(person, directory);
    if (match.kind === "NOT_FOUND") {
      problems.push({ kind: "NOT_FOUND", line, name: person, suggestions: match.suggestions });
      continue;
    }
    if (match.kind === "AMBIGUOUS") {
      problems.push({ kind: "AMBIGUOUS", line, name: person, options: match.options });
      continue;
    }
    if (match.kind === "INACTIVE") {
      problems.push({ kind: "INACTIVE", line, name: match.name });
      continue;
    }
    const other = seen.get(match.member.id);
    if (other !== undefined) {
      problems.push({ kind: "TWICE", line, name: match.member.fullName, other });
      continue;
    }
    seen.set(match.member.id, line);
    rows.push({
      line,
      baseId: base.base.id,
      role,
      personId: match.member.id,
      sheetName: person,
      memberName: match.member.fullName,
      match: match.kind,
    });
  }
  if (rows.length === 0 && problems.length === 0) problems.push({ kind: "EMPTY" });
  return problems.length > 0 ? { rows: null, problems } : { rows, problems };
}

// --- Qué cambia ----------------------------------------------------------------------------------

/** Una fila vigente de la jornada: un juez (`STAFF`) o alguien del apoyo (`SUPPORT`). */
export interface CurrentStaffRow {
  table: "STAFF" | "SUPPORT";
  id: string;
  baseId: string;
  personId: string;
  role: StaffSheetRole;
}

export interface DesiredStaffRow {
  baseId: string;
  personId: string;
  role: StaffSheetRole;
}

const rowKey = (row: DesiredStaffRow) => `${row.baseId}:${row.personId}:${row.role}`;

/** Qué sigue, qué entra y qué sale de la jornada. Cambiar de función en la misma base es salir y
 *  entrar; lo que sigue conserva su fila. */
export function planStaffChanges(
  current: readonly CurrentStaffRow[],
  desired: readonly DesiredStaffRow[],
): { keep: CurrentStaffRow[]; add: DesiredStaffRow[]; remove: CurrentStaffRow[] } {
  const wanted = new Set(desired.map(rowKey));
  const existing = new Set(current.map(rowKey));
  return {
    keep: current.filter((row) => wanted.has(rowKey(row))),
    add: desired.filter((row) => !existing.has(rowKey(row))),
    remove: current.filter((row) => !wanted.has(rowKey(row))),
  };
}

/** La huella de una revisión: la jornada, lo que pide la hoja y lo que había. Si algo de eso cambia
 *  entre revisar y guardar, la casa vuelve a mostrar la revisión en lugar de guardar. */
export function staffPlanFingerprint(
  day: Day,
  desired: readonly DesiredStaffRow[],
  current: readonly CurrentStaffRow[],
): string {
  const sorted = (items: string[]) => [...items].sort();
  const payload = JSON.stringify({
    day,
    desired: sorted(desired.map(rowKey)),
    current: sorted(current.map((row) => `${row.table}:${row.id}:${rowKey(row)}`)),
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** Los avisos que no bloquean: una base de la jornada sin líder o con más de uno. */
export type LeaderWarning =
  | { kind: "NO_LEADER"; baseId: string }
  | { kind: "MANY_LEADERS"; baseId: string; n: number };

export function leaderWarnings(
  dayBases: readonly StaffBase[],
  desired: readonly DesiredStaffRow[],
): LeaderWarning[] {
  return [...dayBases]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .flatMap((base): LeaderWarning[] => {
      const leaders = desired.filter((row) => row.baseId === base.id && row.role === "LEADER");
      if (leaders.length === 0) return [{ kind: "NO_LEADER", baseId: base.id }];
      if (leaders.length > 1) return [{ kind: "MANY_LEADERS", baseId: base.id, n: leaders.length }];
      return [];
    });
}
