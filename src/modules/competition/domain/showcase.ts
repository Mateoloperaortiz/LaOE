import {
  creditBalances,
  getCompetitionBySlug,
  getLiveRotations,
  listAnnouncements,
  listCaptainNames,
  listMarkets,
  listStandings,
  listTeams,
} from "./reads";
import { type Showcase, type ShowcaseBody, showcaseSchema, toShowcase } from "./showcase-pure";

// La vitrina pública (ADR-090 regla 3): el proceso guarda el último resultado 3 segundos por slug y
// comparte la consulta en curso, así que muchas pantallas sondeando cuestan una consulta cada 3 s.

const MEMO_MS = 3000;

interface Entry {
  at: number;
  value: Promise<ShowcaseBody | null>;
}

const memo = new Map<string, Entry>();

async function build(slug: string): Promise<ShowcaseBody | null> {
  const row = await getCompetitionBySlug(slug);
  if (!row || row.status === "DRAFT") return null;
  const [teams, standings, rotations, announcements, markets, balances, captains] =
    await Promise.all([
      listTeams(row.id),
      listStandings(row.id),
      getLiveRotations(row.id),
      listAnnouncements(row.id, true),
      row.bettingEnabled ? listMarkets(row.id) : Promise.resolve([]),
      row.bettingEnabled ? creditBalances(row.id) : Promise.resolve(new Map<string, number>()),
      // Los nombres de los capitanes solo se leen si están publicados (ADR-095).
      row.showCaptains ? listCaptainNames(row.id) : Promise.resolve([]),
    ]);
  return toShowcase({
    competition: row,
    teams,
    standings,
    rotations,
    announcements,
    markets,
    balances,
    captains,
  });
}

/** La vitrina de una competencia pública, con `serverNow` estampado; `null` si no existe o es DRAFT. */
export async function getShowcase(slug: string, now = new Date()): Promise<Showcase | null> {
  const cached = memo.get(slug);
  const fresh = cached && now.getTime() - cached.at < MEMO_MS;
  const entry: Entry = fresh && cached ? cached : { at: now.getTime(), value: build(slug) };
  if (!fresh) {
    memo.set(slug, entry);
    entry.value.catch(() => memo.delete(slug));
  }
  const body = await entry.value;
  return body ? showcaseSchema.parse({ ...body, serverNow: now.toISOString() }) : null;
}

/** Solo para pruebas: vacía el memo. */
export function clearShowcaseMemo(): void {
  memo.clear();
}
