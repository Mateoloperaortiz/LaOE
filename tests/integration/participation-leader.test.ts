import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { drain } from "@/jobs/poller";
import "@/jobs/handlers";
import {
  aliasesResource,
  assembliesResource,
  checkInsResource,
  ledgerResource,
  rankingsResource,
} from "@/modules/participation/admin";
import {
  adjustPointsAs,
  checkInSelfAs,
  closeOccasionAs,
  createOccasionSeriesAs,
} from "@/modules/participation/domain/commands";
import { weeklyDates } from "@/modules/participation/domain/occasions";
import { listCommitteeScores } from "@/modules/participation/domain/scores";
import { occasion } from "@/modules/participation/schema";
import { createAlias, resolveAlias } from "@/modules/system/domain/aliases";
import { getTerm } from "@/modules/terms/domain/terms";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
} from "./factories";

const db = () => getDb();

describe("vista de líder, exportes y alias", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("la serie semanal crea reuniones abiertas sin puntos hasta el fin del término, sin duplicar", async () => {
    const termId = await seedTerm(currentTermCode());
    const term = await getTerm(termId);
    if (!term) throw new Error("sin término");
    const committeeId = await seedCommittee("c1");
    const leader = await seedMember("lider@eafit.edu.co");
    const first = new Date(`${term.startsOn}T18:00:00-05:00`);
    const expected = weeklyDates(first, term.endsOn);
    expect(expected.length).toBeGreaterThan(0);
    const result = await createOccasionSeriesAs(
      { personId: leader },
      {
        committeeId,
        title: "Reunión semanal",
        firstStartsAt: first,
        durationMinutes: 90,
        location: "Oficina",
      },
    );
    expect(result.created).toBe(expected.length);
    expect(result.skipped).toBe(0);
    const rows = await db().select().from(occasion).where(eq(occasion.committeeId, committeeId));
    expect(rows).toHaveLength(expected.length);
    expect(
      rows.every(
        (row) => row.category === "COMMITTEE_MEETING" && row.points === 0 && row.status === "OPEN",
      ),
    ).toBe(true);
    expect(
      rows.every(
        (row) => row.endsAt && row.endsAt.getTime() - row.startsAt.getTime() === 90 * 60_000,
      ),
    ).toBe(true);
    const again = await createOccasionSeriesAs(
      { personId: leader },
      {
        committeeId,
        title: "Reunión semanal",
        firstStartsAt: first,
        durationMinutes: 60,
        location: "",
      },
    );
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(expected.length);
    const [total] = await db().select({ n: count() }).from(occasion);
    expect(total?.n).toBe(expected.length);
    await expect(
      createOccasionSeriesAs(
        { personId: leader },
        {
          committeeId,
          title: "Fuera",
          firstStartsAt: new Date("2001-01-01T12:00:00Z"),
          durationMinutes: 60,
          location: "",
        },
      ),
    ).rejects.toThrow(t("T-675"));
  });

  it("el líder ve el score de su comité por ocasión", async () => {
    const termId = await seedTerm(currentTermCode());
    const committeeId = await seedCommittee("c1");
    const a = await seedMember("a@eafit.edu.co");
    const b = await seedMember("b@eafit.edu.co");
    await seedCommitteeMembership(a, committeeId, termId);
    await seedCommitteeMembership(b, committeeId, termId);
    const { id, publicId } = await seedOccasion(termId, { points: 10, title: "Integración" });
    await checkInSelfAs({ personId: a }, { publicId });
    await closeOccasionAs({ personId: a }, id);
    await drain(50);
    const scores = await listCommitteeScores(committeeId, termId);
    expect(
      scores.map((row) => [row.occasionTitle, row.present, row.eligible, row.occasionStatus]),
    ).toEqual([["Integración", 1, 2, "CLOSED"]]);
    expect(scores[0]?.frozenAt).toBeInstanceOf(Date);
  });

  it("los recursos de exporte producen filas con nombre y nunca dependen de la pantalla", async () => {
    const termId = await seedTerm(currentTermCode());
    const admin = await seedMember("admin@eafit.edu.co", { firstName: "Admin", lastName: "GH" });
    const socia = await seedMember("socia@eafit.edu.co", {
      firstName: "Socia",
      lastName: "Activa",
    });
    const { id, publicId } = await seedOccasion(termId, { points: 10, title: "Charla" });
    await checkInSelfAs({ personId: socia }, { publicId });
    await adjustPointsAs(
      { personId: admin },
      { personId: socia, termId, points: 5, reason: "bono" },
    );
    const params = { q: "", page: 1, pageSize: 100, filters: { termId } };
    const checkIns = await checkInsResource.list({ ...params, filters: { occasionId: id } });
    expect(checkIns.rows.map((row) => checkInsResource.exportRow(row))).toEqual([
      expect.objectContaining({
        nombre: "Socia Activa",
        correo: "socia@eafit.edu.co",
        ocasion: "Charla",
        estado: "APPROVED",
      }),
    ]);
    const ledger = await ledgerResource.list(params);
    expect(ledger.rows.map((row) => ledgerResource.exportRow(row).puntos).sort()).toEqual([10, 5]);
    const rankings = await rankingsResource.list({ ...params, filters: { termId, board: "NEW" } });
    expect(rankings.rows.map((row) => rankingsResource.exportRow(row))).toEqual([
      expect.objectContaining({ puesto: 1, nombre: "Socia Activa", puntos: 15 }),
      expect.objectContaining({ puesto: 2, nombre: "Admin GH", puntos: 0 }),
    ]);
    const assemblies = await assembliesResource.list(params);
    expect(assemblies.rows).toHaveLength(2);
    const firstRow = assemblies.rows[0];
    if (!firstRow) throw new Error("sin filas");
    expect(assembliesResource.exportRow(firstRow).cumple).toBe("no");
    expect(
      checkInsResource.personalData &&
        ledgerResource.personalData &&
        rankingsResource.personalData &&
        assembliesResource.personalData,
    ).toBe(true);
  });

  it("los alias legados validan la ruta, no se repiten y resuelven a la ocasión", async () => {
    const termId = await seedTerm(currentTermCode());
    const { id } = await seedOccasion(termId, { title: "Asamblea vieja" });
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        createAlias(ctx, { path: "/otra/abcdefghjk", targetId: id }),
      ),
    ).rejects.toThrow(t("T-661"));
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      createAlias(ctx, { path: "/asamblea/abcdefghjk", targetId: id }),
    );
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        createAlias(ctx, { path: "/asamblea/abcdefghjk", targetId: id }),
      ),
    ).rejects.toThrow(t("T-660"));
    expect((await resolveAlias("/asamblea/abcdefghjk"))?.targetId).toBe(id);
    const listed = await aliasesResource.list({
      q: "asamblea",
      page: 1,
      pageSize: 10,
      filters: {},
    });
    expect(listed.rows[0]?.occasionTitle).toBe("Asamblea vieja");
    await expect(
      aliasesResource.create?.(
        { personId: SYSTEM_ACTOR.personId ?? "", isAdmin: true },
        { path: "/a/zzzzzzzzz1", targetId: "no-existe" },
      ),
    ).rejects.toBeDefined();
  });
});
