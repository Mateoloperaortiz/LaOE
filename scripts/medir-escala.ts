import { closeDb, getDb } from "../src/db/client";
import { listCompetitions, listStandings } from "../src/modules/competition";
import {
  buildLiveSnapshot,
  getOccasion,
  listActiveGoals,
  listPolls,
  peopleBoards,
} from "../src/modules/participation";
import { occasion } from "../src/modules/participation/schema";
import { getCurrentTerm } from "../src/modules/terms";

// Medición de base para la ADR técnica de escala (ADR-183): cuánto tarda cada lectura caliente de las
// olas con picos, contra la base que tenga `DATABASE_URL`. Primero se mide aquí y en staging; después
// se decide si hacen falta tablas precalculadas, LISTEN/NOTIFY o límites de tasa.
// Uso: node --env-file-if-exists=.env --conditions=react-server --import tsx scripts/medir-escala.ts [vueltas]

const rounds = Number(process.argv[2] ?? 30);

function percentile(sorted: number[], fraction: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

async function measure(name: string, read: () => Promise<unknown>): Promise<void> {
  await read();
  const times: number[] = [];
  for (let index = 0; index < rounds; index += 1) {
    const started = performance.now();
    await read();
    times.push(performance.now() - started);
  }
  const sorted = times.sort((a, b) => a - b);
  process.stdout.write(
    `${name.padEnd(42)} p50 ${percentile(sorted, 0.5).toFixed(1)} ms · p95 ${percentile(sorted, 0.95).toFixed(1)} ms\n`,
  );
}

const term = await getCurrentTerm();
const [someOccasion] = await getDb().select({ id: occasion.id }).from(occasion).limit(1);
const occasionRow = someOccasion ? await getOccasion(someOccasion.id) : null;
const competitions = await listCompetitions();
process.stdout.write(`Vueltas por lectura: ${rounds}; término: ${term?.code ?? "ninguno"}\n`);
if (term) {
  // Un tablero nuevo por vuelta: cada uno guarda lo que leyó y la segunda vuelta no mediría nada.
  await measure("Ranking de GH Points (veteranos)", () => peopleBoards(term.id).rank("VETERAN"));
}
if (occasionRow) {
  await measure("Consola en vivo (buildLiveSnapshot)", () => buildLiveSnapshot(occasionRow));
  await measure("Consultas de una asamblea (listPolls)", () => listPolls(occasionRow.id));
}
const firstCompetition = competitions[0];
if (firstCompetition) {
  await measure("Tabla de The Games (listStandings)", () => listStandings(firstCompetition.id));
}
await measure("Metas colectivas en curso (listActiveGoals)", () =>
  listActiveGoals([], new Date().toISOString().slice(0, 10)),
);
await closeDb();
