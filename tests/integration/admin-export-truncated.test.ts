import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getResource } from "@/app/admin/_kit/registry";
import { GET as exportCsv } from "@/app/api/export/[tipo]/route";
import { closeDb, getDb } from "@/db/client";
import { achievement, badgeDefinition, checkIn } from "@/modules/participation/schema";
import { auditLog } from "@/modules/system/schema";
import { EXPORT_ROW_LIMIT } from "@/shared/admin-kit/types";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedChallenge,
  seedCheckIn,
  seedMember,
  seedOccasion,
  seedParticipation,
  seedTerm,
} from "./factories";

// Un exporte tiene un tope de filas (ADR-118 regla 13; DT-222). Lo que pasa del tope no viaja, y el
// archivo y la auditoría lo dicen: la última fila avisa cuántas van de cuántas, y `export.csv` guarda
// las filas exportadas y el total real. El exporte completo, por lotes, es otro trabajo.

const session = vi.hoisted(() => ({ getActor: vi.fn() }));

// El barrel del admin kit trae componentes con `next/font`, que no carga fuera de Next: de él la ruta
// y los recursos solo usan los contratos y el CSV.
vi.mock("@/shared/admin-kit", async () => ({
  ...(await import("@/shared/admin-kit/types")),
  ...(await import("@/shared/admin-kit/csv")),
}));
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  getActor: session.getActor,
}));

/** Una sesión de ADMIN con el paso de seguridad recién hecho. */
function adminSession(personId: string) {
  return {
    personId,
    email: "admin.recorte@eafit.edu.co",
    membershipStatus: "ACTIVE",
    isAdmin: true,
    permissions: [{ code: "ADMIN", committeeId: null }],
    otpVerifiedAt: new Date(Date.now() - 60_000),
  };
}

function requestExport(key: string, query: string): Promise<Response> {
  return exportCsv(new Request(`http://localhost/api/export/${key}?${query}`), {
    params: Promise.resolve({ tipo: key }),
  });
}

function exportAudits(key: string) {
  return getDb()
    .select({ actorId: auditLog.actorId, after: auditLog.after })
    .from(auditLog)
    .where(and(eq(auditLog.action, "export.csv"), eq(auditLog.entityId, key)));
}

/** `count` movimientos de un punto para esa persona en ese término, cada uno un segundo más viejo. */
async function seedPointEntries(personId: string, termId: string, count: number): Promise<void> {
  await getDb().execute(sql`
    insert into point_entry (id, person_id, term_id, kind, points, reason, created_at)
    select 'recorte' || g, ${personId}, ${termId}, 'ADJUSTMENT', 1, 'Movimiento ' || g,
           now() - g * interval '1 second'
    from generate_series(1, ${count}::int) as g
  `);
}

function csvLines(body: string): string[] {
  return body.trimEnd().split("\r\n");
}

describe("exporte de un recurso del admin con más filas que el tope", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("el libro de puntos que pasa del tope lo dice en la última fila y audita lo exportado y el total real", async () => {
    const adminId = await seedMember("admin.recorte@eafit.edu.co");
    const personId = await seedMember("puntos.recorte@eafit.edu.co");
    const termId = await seedTerm();
    await seedPointEntries(personId, termId, EXPORT_ROW_LIMIT + 1);
    session.getActor.mockResolvedValue(adminSession(adminId));

    const response = await requestExport("ledger", `termId=${termId}`);

    expect(response.status).toBe(200);
    const lines = csvLines(await response.text());
    // La cabecera, las filas del tope y la fila que avisa.
    expect(lines).toHaveLength(1 + EXPORT_ROW_LIMIT + 1);
    expect(lines.at(-1)).toContain(
      t("T-3248", { n: EXPORT_ROW_LIMIT, total: EXPORT_ROW_LIMIT + 1 }),
    );
    expect(await exportAudits("ledger")).toEqual([
      { actorId: adminId, after: { rows: EXPORT_ROW_LIMIT, total: EXPORT_ROW_LIMIT + 1 } },
    ]);
  }, 60_000);

  it("el que cabe entero no lleva aviso y audita las dos cifras iguales", async () => {
    const adminId = await seedMember("admin.recorte@eafit.edu.co");
    const personId = await seedMember("puntos.recorte@eafit.edu.co");
    const termId = await seedTerm();
    await seedPointEntries(personId, termId, 3);
    session.getActor.mockResolvedValue(adminSession(adminId));

    const response = await requestExport("ledger", `termId=${termId}`);

    const lines = csvLines(await response.text());
    expect(lines).toHaveLength(1 + 3);
    expect(lines.join("\n")).not.toContain(t("T-3248", { n: 3, total: 3 }));
    expect(await exportAudits("ledger")).toEqual([
      { actorId: adminId, after: { rows: 3, total: 3 } },
    ]);
  });

  it("las asistencias cuentan el total real y buscan por nombre en todas, no solo en las más recientes", async () => {
    const adminId = await seedMember("admin.recorte@eafit.edu.co");
    const termId = await seedTerm();
    const occasion = await seedOccasion(termId);
    const old = await seedCheckIn(
      occasion.id,
      await seedMember("zoraida@eafit.edu.co", { firstName: "Zoraida", lastName: "Buscada" }),
    );
    await seedCheckIn(occasion.id, await seedMember("uno@eafit.edu.co"));
    await seedCheckIn(occasion.id, await seedMember("dos@eafit.edu.co"));
    await getDb()
      .update(checkIn)
      .set({ at: new Date(Date.now() - 3 * 86_400_000) })
      .where(eq(checkIn.id, old));
    const resource = getResource("check-ins");
    const params = {
      page: 1,
      pageSize: 2,
      filters: {},
      actor: { personId: adminId, isAdmin: true },
    };

    // Con un tope de dos, la asistencia de Zoraida es la tercera: la más vieja.
    const all = await resource?.list({ ...params, q: "" });
    expect({ rows: all?.rows.length, total: all?.total }).toEqual({ rows: 2, total: 3 });
    const found = await resource?.list({ ...params, q: "zoraida" });
    expect({ ids: found?.rows.map((row) => row.id), total: found?.total }).toEqual({
      ids: [old],
      total: 1,
    });
  });

  it("las entregas de retos y las insignias también cuentan el total del listado entero, no las filas de la página", async () => {
    const adminId = await seedMember("admin.recorte@eafit.edu.co");
    const termId = await seedTerm();
    const challengeId = await seedChallenge(termId, { kind: "EVIDENCE", passPercent: null });
    const [badge] = await getDb()
      .select({ id: badgeDefinition.id })
      .from(badgeDefinition)
      .where(eq(badgeDefinition.code, "EN_PARCHE_1"));
    for (const who of ["uno", "dos", "tres"]) {
      const personId = await seedMember(`${who}@eafit.edu.co`);
      await seedParticipation(challengeId, personId, { status: "COMPLETED" });
      await getDb()
        .insert(achievement)
        .values({
          personId,
          badgeId: badge?.id ?? "",
          termId,
          sourceKind: "CHECKIN",
          sourceRef: `recorte-${who}`,
          historical: true,
          unlockedAt: new Date("2023-03-10T15:00:00Z"),
        });
    }
    const params = {
      q: "",
      page: 1,
      pageSize: 2,
      filters: {},
      actor: { personId: adminId, isAdmin: true },
    };

    // Tres filas y una página de dos: con el total de la página, la ruta exportaría recortado sin avisar.
    for (const key of ["retos", "insignias"]) {
      const listed = await getResource(key)?.list(params);
      expect({ key, rows: listed?.rows.length, total: listed?.total }).toEqual({
        key,
        rows: 2,
        total: 3,
      });
    }
  });
});
