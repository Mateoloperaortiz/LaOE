import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { isCheckViolation, isUniqueViolation } from "@/db/errors";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  cancelOccasionAs,
  closeOccasionAs,
  createOccasionAs,
  openOccasionAs,
  setRotatingCodeAs,
  updateOccasionAs,
} from "@/modules/participation/domain/commands";
import {
  countOpenOccasions,
  getOccasion,
  getOccasionByPublicId,
  listOccasions,
  type OccasionInput,
  occasionInputSchema,
  searchOccasions,
} from "@/modules/participation/domain/occasions";
import { occasion } from "@/modules/participation/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { currentTermCode, seedOccasion, seedTerm } from "./factories";

const db = () => getDb();

// Una fecha dentro del término actual, escrita como la escribe el admin (datetime-local en Bogotá).
function localInput(daysFromNow = 1, hour = "18:00"): string {
  const at = new Date(Date.now() + daysFromNow * 86_400_000);
  const key = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
  return `${key}T${hour}`;
}

function parse(overrides: Record<string, unknown> = {}): OccasionInput {
  return occasionInputSchema.parse({
    title: "Integración de prueba",
    kind: "ACTIVITY",
    category: "INTEGRATION",
    startsAt: localInput(),
    points: "20",
    approval: "AUTO",
    ...overrides,
  });
}

describe("ocasiones", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crea con publicId y ventana por defecto, deriva el término de la fecha y audita", async () => {
    const termId = await seedTerm(currentTermCode());
    const created = await createOccasionAs(SYSTEM_ACTOR, parse());
    expect(created.publicId).toMatch(/^[0-9a-z]{10}$/);
    const row = await getOccasion(created.id);
    if (!row) throw new Error("sin ocasión");
    expect(row.termId).toBe(termId);
    expect(row.status).toBe("DRAFT");
    expect(row.checkInOpensAt.getTime()).toBe(row.startsAt.getTime() - 30 * 60_000);
    expect(row.checkInClosesAt.getTime()).toBe(row.startsAt.getTime() + 180 * 60_000);
    const byPublicId = await getOccasionByPublicId(created.publicId);
    expect(byPublicId?.id).toBe(created.id);
    const [audit] = await db().select().from(auditLog).where(eq(auditLog.entityId, created.id));
    expect(audit?.action).toBe("occasion.created");
  });

  it("rechaza una fecha sin término, una asamblea con puntos o sin tipo y una ventana invertida", async () => {
    await expect(createOccasionAs(SYSTEM_ACTOR, parse())).rejects.toThrow(t("T-675"));
    await seedTerm(currentTermCode());
    const assembly = occasionInputSchema.safeParse({
      title: "Asamblea",
      kind: "ASSEMBLY",
      startsAt: localInput(),
      points: "5",
    });
    expect(assembly.success).toBe(false);
    if (!assembly.success) {
      const messages = assembly.error.issues.map((issue) => issue.message);
      expect(messages).toContain(t("T-573"));
      expect(messages).toContain(t("T-572"));
    }
    const window = occasionInputSchema.safeParse({
      title: "Charla",
      startsAt: localInput(),
      checkInOpensAt: localInput(1, "19:00"),
      checkInClosesAt: localInput(1, "18:00"),
    });
    expect(window.success).toBe(false);
    const session = occasionInputSchema.safeParse({
      title: "Sesión",
      kind: "EDITION_SESSION",
      startsAt: localInput(),
    });
    expect(session.success).toBe(false);
  });

  it("solo admite una elección de junta y una segunda vuelta no canceladas por término", async () => {
    await seedTerm(currentTermCode());
    const election = () =>
      createOccasionAs(
        SYSTEM_ACTOR,
        parse({
          title: "Elección de junta",
          kind: "ASSEMBLY",
          assemblyKind: "BOARD_ELECTION",
          points: "0",
        }),
      );
    const first = await election();
    await expect(election()).rejects.toBeInstanceOf(DomainError);
    await cancelOccasionAs(SYSTEM_ACTOR, first.id, "se reprograma");
    await expect(election()).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("abre, cierra y cancela con auditoría; el cierre emite el recompute y bloquea el término cerrado", async () => {
    const termId = await seedTerm(currentTermCode());
    const created = await createOccasionAs(SYSTEM_ACTOR, parse({ requireRotatingCode: true }));
    await openOccasionAs(SYSTEM_ACTOR, created.id);
    let row = await getOccasion(created.id);
    expect(row?.status).toBe("OPEN");
    expect(row?.rotatingSecret).toBeTruthy();
    expect(await countOpenOccasions(termId)).toBe(1);
    await expect(openOccasionAs(SYSTEM_ACTOR, created.id)).rejects.toBeInstanceOf(DomainError);

    await closeOccasionAs(SYSTEM_ACTOR, created.id);
    row = await getOccasion(created.id);
    expect(row?.status).toBe("CLOSED");
    expect(row?.closedAt).toBeInstanceOf(Date);
    const events = await db().select().from(outbox);
    expect(events.map((event) => event.eventType).sort()).toEqual([
      "occasion.closed",
      "score.recompute",
    ]);
    expect(events.find((event) => event.eventType === "score.recompute")?.dedupeKey).toBe(
      `score:${created.id}`,
    );

    await expect(cancelOccasionAs(SYSTEM_ACTOR, created.id, "  ")).rejects.toThrow(t("T-609"));
    await cancelOccasionAs(SYSTEM_ACTOR, created.id, "llovió");
    row = await getOccasion(created.id);
    expect(row?.status).toBe("CANCELLED");
    expect(row?.cancelReason).toBe("llovió");
    const [audits] = await db()
      .select({ n: count() })
      .from(auditLog)
      .where(eq(auditLog.entityId, created.id));
    expect(audits?.n).toBe(4);

    // Con los puntos del término cerrados no se abre nada más.
    const draft = await createOccasionAs(SYSTEM_ACTOR, parse({ title: "Otra" }));
    await db().update(term).set({ pointsClosedAt: new Date() }).where(eq(term.id, termId));
    await expect(openOccasionAs(SYSTEM_ACTOR, draft.id)).rejects.toThrow(t("T-579"));
  });

  it("fuera de borrador solo cambian título, descripción y lugar", async () => {
    await seedTerm(currentTermCode());
    const created = await createOccasionAs(SYSTEM_ACTOR, parse());
    await openOccasionAs(SYSTEM_ACTOR, created.id);
    const base = await getOccasion(created.id);
    if (!base) throw new Error("sin ocasión");
    const same = {
      title: "Integración renombrada",
      description: "Con descripción",
      location: "Bloque 38",
      kind: base.kind,
      category: base.category,
      startsAt: localInput(),
      checkInOpensAt: localInput(1, "17:30"),
      checkInClosesAt: localInput(1, "21:00"),
      points: String(base.points),
      approval: base.approval,
    };
    await updateOccasionAs(SYSTEM_ACTOR, created.id, occasionInputSchema.parse(same));
    const renamed = await getOccasion(created.id);
    expect(renamed?.title).toBe("Integración renombrada");
    expect(renamed?.location).toBe("Bloque 38");
    await expect(
      updateOccasionAs(
        SYSTEM_ACTOR,
        created.id,
        occasionInputSchema.parse({ ...same, points: "50" }),
      ),
    ).rejects.toThrow(t("T-577"));
    await setRotatingCodeAs(SYSTEM_ACTOR, created.id, true);
    expect((await getOccasion(created.id))?.requireRotatingCode).toBe(true);
  });

  it("el esquema exige asamblea con tipo y sin puntos, publicId con formato y ventana ordenada", async () => {
    const termId = await seedTerm(currentTermCode());
    await expect(
      seedOccasion(termId, { kind: "ASSEMBLY", assemblyKind: null, points: 0 }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "occasion_assembly_kind_consistent"));
    await expect(
      seedOccasion(termId, { kind: "ASSEMBLY", assemblyKind: "ORDINARY", points: 5 }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "occasion_assembly_no_points"));
    await expect(seedOccasion(termId, { publicId: "MAYUSCULAS" })).rejects.toSatisfy((error) =>
      isCheckViolation(error, "occasion_public_id_format"),
    );
    const now = new Date();
    await expect(
      seedOccasion(termId, { checkInOpensAt: now, checkInClosesAt: now }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "occasion_window_ordered"));
    const one = await seedOccasion(termId, { publicId: "abcdefghjk" });
    await expect(seedOccasion(termId, { publicId: "abcdefghjk" })).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "occasion_public_id_unique"),
    );
    expect(one.publicId).toBe("abcdefghjk");
  });

  it("lista con filtros y busca por similitud", async () => {
    const termId = await seedTerm(currentTermCode());
    await seedOccasion(termId, { title: "Integración de nuevos", category: "INTEGRATION" });
    await seedOccasion(termId, {
      title: "Asamblea ordinaria",
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      points: 0,
      status: "DRAFT",
    });
    const all = await listOccasions({ q: "", page: 1, pageSize: 10 });
    expect(all.total).toBe(2);
    const open = await listOccasions({ q: "", status: "OPEN", page: 1, pageSize: 10 });
    expect(open.rows.map((row) => row.title)).toEqual(["Integración de nuevos"]);
    const assemblies = await listOccasions({
      q: "",
      kind: "ASSEMBLY",
      termId,
      page: 1,
      pageSize: 10,
    });
    expect(assemblies.total).toBe(1);
    const found = await searchOccasions("integracion");
    expect(found.map((row) => row.title)).toContain("Integración de nuevos");
    const [total] = await db().select({ n: count() }).from(occasion);
    expect(total?.n).toBe(2);
    await runCommand(SYSTEM_ACTOR, async () => undefined);
  });
});
