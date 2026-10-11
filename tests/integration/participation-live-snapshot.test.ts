import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import type { CheckInSource, CheckInStatus } from "@/modules/participation";
import { buildLiveSnapshot, getOccasion } from "@/modules/participation";
import { checkIn } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { countQueries } from "../helpers/queries";
import { truncateAll } from "./db";
import { currentTermCode, seedMember, seedOccasion, seedTerm } from "./factories";

// La consola en vivo de una ocasión (ADR-035 regla 16): cinco conteos por estado y los diez últimos
// registros con nombre, hora, origen y estado. La consola lo pide cada 4 segundos (DT-225): lo que
// devuelve se fija primero, y después cuánto lee para armarlo.

const db = () => getDb();

const SOURCES: readonly CheckInSource[] = ["SELF_QR", "HOST", "ADMIN", "IMPORT"];
const BASE = Date.parse("2026-03-02T19:00:00.000Z");

interface Seeded {
  id: string;
  name: string;
  at: string;
  source: CheckInSource;
  status: CheckInStatus;
}

/** Un registro por estado de la lista, cada uno un minuto después del anterior. */
async function seedCheckIns(
  occasionId: string,
  statuses: readonly CheckInStatus[],
  prefix: string,
): Promise<Seeded[]> {
  const seeded: Seeded[] = [];
  for (const [index, status] of statuses.entries()) {
    const firstName = `${prefix}${String(index).padStart(2, "0")}`;
    const personId = await seedMember(`${firstName.toLowerCase()}@test.dev`, {
      firstName,
      lastName: "Sintética",
    });
    const source = SOURCES[index % SOURCES.length] ?? "SELF_QR";
    const at = new Date(BASE + index * 60_000);
    const [row] = await db()
      .insert(checkIn)
      .values({
        occasionId,
        personId,
        status,
        source,
        at,
        reason: "motivo que la consola no lleva",
      })
      .returning({ id: checkIn.id });
    seeded.push({
      id: row?.id ?? "",
      name: `${firstName} Sintética`,
      at: at.toISOString(),
      source,
      status,
    });
  }
  return seeded;
}

/** La ocasión como la traen la ruta del sondeo y la consola, que la leen antes de pedir el snapshot. */
async function readOccasion(id: string) {
  const row = await getOccasion(id);
  if (!row) throw new Error("la ocasión no existe");
  return row;
}

const MIXED: readonly CheckInStatus[] = [
  "APPROVED",
  "APPROVED",
  "PENDING",
  "REJECTED",
  "CANCELLED",
  "EXCUSED",
  "APPROVED",
  "PENDING",
  "APPROVED",
  "EXCUSED",
  "REJECTED",
  "APPROVED",
  "PENDING",
  "APPROVED",
];

describe("consola en vivo: lo que devuelve el snapshot", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("cuenta todas las asistencias de la ocasión por estado y lista solo las diez últimas, de la más reciente a la más vieja", async () => {
    const termId = await seedTerm(currentTermCode());
    const { id } = await seedOccasion(termId);
    const other = await seedOccasion(termId);
    const seeded = await seedCheckIns(id, MIXED, "Ana");
    await seedCheckIns(other.id, ["APPROVED", "PENDING", "EXCUSED"], "Otra");

    const snapshot = await buildLiveSnapshot(await readOccasion(id));

    expect(snapshot.counts).toEqual({
      PENDING: 3,
      APPROVED: 6,
      REJECTED: 2,
      CANCELLED: 1,
      EXCUSED: 2,
    });
    expect(snapshot.recent).toEqual(seeded.slice(-10).reverse());
    expect(Object.keys(snapshot.recent[0] ?? {}).sort()).toEqual([
      "at",
      "id",
      "name",
      "source",
      "status",
    ]);
  });

  it("una ocasión sin registros da los cinco conteos en cero y ninguna fila", async () => {
    const termId = await seedTerm(currentTermCode());
    const { id } = await seedOccasion(termId);
    const other = await seedOccasion(termId);
    await seedCheckIns(other.id, ["APPROVED"], "Otra");

    const snapshot = await buildLiveSnapshot(await readOccasion(id));

    expect(snapshot.counts).toEqual({
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      CANCELLED: 0,
      EXCUSED: 0,
    });
    expect(snapshot.recent).toEqual([]);
  });

  it("el nombre sale sin espacios a los lados", async () => {
    const termId = await seedTerm(currentTermCode());
    const { id } = await seedOccasion(termId);
    const [first, second] = await seedCheckIns(id, ["APPROVED", "PENDING"], "Beto");
    const [row] = await db()
      .select({ personId: checkIn.personId })
      .from(checkIn)
      .where(eq(checkIn.id, second?.id ?? ""));
    await db()
      .update(person)
      .set({ firstName: "  Beto", lastName: "Dos  " })
      .where(eq(person.id, row?.personId ?? ""));

    const snapshot = await buildLiveSnapshot(await readOccasion(id));

    expect(snapshot.recent).toEqual([{ ...second, name: "Beto Dos" }, first]);
  });
});

describe("consola en vivo: cuánto lee para armar el snapshot (DT-225)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("no trae las asistencias de la ocasión: ninguna consulta devuelve más filas que las diez que se muestran", async () => {
    const termId = await seedTerm(currentTermCode());
    const { id } = await seedOccasion(termId);
    const seeded = await seedCheckIns(
      id,
      Array.from({ length: 25 }, (_, index) => MIXED[index % MIXED.length] ?? "APPROVED"),
      "Caro",
    );

    const occasion = await readOccasion(id);

    const { result, queries } = await countQueries(() => buildLiveSnapshot(occasion));

    expect(result.recent).toHaveLength(10);
    expect(Object.values(result.counts).reduce((sum, n) => sum + n, 0)).toBe(seeded.length);
    expect(Math.max(...queries.map((query) => query.rows))).toBeLessThanOrEqual(10);
    // Un conteo por cada uno de los cinco estados, diez registros y sus diez personas. La ocasión
    // llega leída (DT-308): ya no es una consulta de las del snapshot.
    expect(queries.reduce((sum, query) => sum + query.rows, 0)).toBeLessThanOrEqual(5 + 10 + 10);
    expect(queries.length).toBeLessThanOrEqual(3);
  });
});
