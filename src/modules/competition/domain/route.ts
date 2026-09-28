import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { competitionTeam } from "../schema";
import { getCompetitionBySlug, listRouteStops } from "./reads";
import { ROUTE_VERSION, type TeamRoute, teamRouteSchema } from "./route-pure";

// El recorrido público de un equipo (ADR-097). Como la vitrina (ADR-090 regla 3), el proceso guarda
// el último resultado 3 segundos por equipo y comparte la consulta en curso.

const MEMO_MS = 3000;

interface Entry {
  at: number;
  value: Promise<Omit<TeamRoute, "serverNow"> | null>;
}

const memo = new Map<string, Entry>();

async function build(slug: string, number: number): Promise<Omit<TeamRoute, "serverNow"> | null> {
  const row = await getCompetitionBySlug(slug);
  if (!row || row.status === "DRAFT") return null;
  const [team] = await getDb()
    .select()
    .from(competitionTeam)
    .where(and(eq(competitionTeam.competitionId, row.id), eq(competitionTeam.number, number)))
    .limit(1);
  if (!team) return null;
  return {
    version: ROUTE_VERSION,
    competition: {
      slug: row.slug,
      name: row.name,
      status: row.status,
      rehearsal: row.isRehearsal,
    },
    team: { number: team.number, name: team.name, color: team.color },
    stops: await listRouteStops(row.id, team.id),
  };
}

/** El recorrido de un equipo de una competencia pública; `null` si no existe o es DRAFT. */
export async function getTeamRoute(
  slug: string,
  number: number,
  now = new Date(),
): Promise<TeamRoute | null> {
  const key = `${slug}:${number}`;
  const cached = memo.get(key);
  const fresh = cached && now.getTime() - cached.at < MEMO_MS;
  const entry: Entry = fresh && cached ? cached : { at: now.getTime(), value: build(slug, number) };
  if (!fresh) {
    memo.set(key, entry);
    entry.value.catch(() => memo.delete(key));
  }
  const body = await entry.value;
  return body ? teamRouteSchema.parse({ ...body, serverNow: now.toISOString() }) : null;
}

/** Solo para pruebas: vacía el memo. */
export function clearRouteMemo(): void {
  memo.clear();
}
