import { cleanTeamName, splitLine, teamKey } from "./schedule-import-pure";

// Los capitanes de la hoja de inscripción de la OE (ADR-095): tres columnas, Equipo, Nombre y
// Celular, pegadas desde la hoja de cálculo. Aquí se leen, se resuelve cada equipo contra los de la
// competencia y se comprueba que todo cuadre. Una fila con más columnas se rechaza: la hoja completa
// trae cédula y datos de salud, que la casa no guarda.

export const MAX_CAPTAINS_TEXT = 20_000;
export const MAX_CAPTAINS_PER_TEAM = 2;
export const MAX_CAPTAIN_NAME = 80;

export type CaptainsProblem =
  | { kind: "COLUMNS"; line: number }
  | { kind: "EXTRA_COLUMNS"; line: number }
  | { kind: "TEAM"; line: number; team: string }
  | { kind: "NAME"; line: number }
  | { kind: "PHONE"; line: number }
  | { kind: "TOO_MANY"; line: number; team: string }
  | { kind: "EMPTY" };

export interface CaptainsTeam {
  id: string;
  number: number;
  name: string;
}

export interface ParsedCaptain {
  teamId: string;
  /** 1 o 2, en el orden de la hoja. */
  position: number;
  name: string;
  /** Diez dígitos, o `null` si la hoja no lo trae. */
  phone: string | null;
}

/** El celular en diez dígitos, sin signos ni el 57 del país; `null` si viene vacío y `undefined` si
 *  no es un número de diez dígitos. */
export function normalizePhone(value: string): string | null | undefined {
  if (value.trim() === "") return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("57")) digits = digits.slice(2);
  return /^\d{10}$/.test(digits) ? digits : undefined;
}

/** El equipo de una celda: por número («7» o «Equipo 7») o por nombre. */
function resolveTeam(cell: string, teams: readonly CaptainsTeam[]): CaptainsTeam | undefined {
  const match = /^(?:equipo\s*)?(\d{1,2})$/i.exec(cleanTeamName(cell));
  if (match?.[1]) return teams.find((team) => team.number === Number(match[1]));
  const key = teamKey(cell);
  return teams.find((team) => teamKey(team.name) === key);
}

/** Lee la hoja pegada. Devuelve los capitanes o, si algo no cuadra, todos los problemas con su
 *  línea: entra la hoja completa o nada. */
export function parseCaptainsSheet(
  text: string,
  teams: readonly CaptainsTeam[],
): { captains: ParsedCaptain[] | null; problems: CaptainsProblem[] } {
  const problems: CaptainsProblem[] = [];
  const captains: ParsedCaptain[] = [];
  const perTeam = new Map<string, number>();
  let firstLine = true;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    if (raw.trim() === "") continue;
    const line = index + 1;
    const cells = splitLine(raw);
    // Las celdas vacías del final no cuentan: la hoja las agrega al copiar una selección más ancha.
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    const [teamCell = "", nameCell = "", phoneCell = ""] = cells;
    const isFirst = firstLine;
    firstLine = false;
    // La primera fila puede ser el encabezado: dice «Equipo» y no trae un celular.
    if (isFirst && teamKey(teamCell) === "equipo" && !/\d/.test(phoneCell)) continue;
    if (cells.length > 3) {
      problems.push({ kind: "EXTRA_COLUMNS", line });
      continue;
    }
    const name = cleanTeamName(nameCell);
    if (cleanTeamName(teamCell) === "" || name === "") {
      problems.push({ kind: "COLUMNS", line });
      continue;
    }
    const team = resolveTeam(teamCell, teams);
    if (!team) {
      problems.push({ kind: "TEAM", line, team: cleanTeamName(teamCell) });
      continue;
    }
    if (name.length > MAX_CAPTAIN_NAME) {
      problems.push({ kind: "NAME", line });
      continue;
    }
    const phone = normalizePhone(phoneCell);
    if (phone === undefined) {
      problems.push({ kind: "PHONE", line });
      continue;
    }
    const position = (perTeam.get(team.id) ?? 0) + 1;
    perTeam.set(team.id, position);
    if (position > MAX_CAPTAINS_PER_TEAM) {
      problems.push({ kind: "TOO_MANY", line, team: `${team.number} ${team.name}` });
      continue;
    }
    captains.push({ teamId: team.id, position, name, phone });
  }
  if (captains.length === 0 && problems.length === 0) problems.push({ kind: "EMPTY" });
  return problems.length > 0 ? { captains: null, problems } : { captains, problems };
}
