import { and, count, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { interaction, onboardingProgress } from "@/modules/crm/schema";
import { findCheckIn } from "@/modules/participation/domain/check-ins";
import {
  cancelOccasionAs,
  checkInSelfAs,
  decideCheckInAs,
  hostCheckInAs,
} from "@/modules/participation/domain/commands";
import { balanceFor, listEntriesFor } from "@/modules/participation/domain/ledger";
import { rawRate, round4, smoothedRate } from "@/modules/participation/domain/ledger-pure";
import { getOccasion } from "@/modules/participation/domain/occasions";
import { rotatingCodeAt } from "@/modules/participation/domain/rotating-code-pure";
import { listOccasionScores } from "@/modules/participation/domain/scores";
import { checkIn, committeeParticipation, pointEntry } from "@/modules/participation/schema";
import { committeeMembership, membership, person } from "@/modules/people/schema";
import { setConfig } from "@/modules/system";
import { outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { itemPattern } from "../helpers/copy";
import { drainOutbox } from "../helpers/outbox";
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

/** Un ítem de una lista del catálogo como patrón: sus variables aceptan cualquier cosa. */

/** Personas activas en lote, repartidas entre comités; devuelve sus ids. */
async function seedMembersBulk(
  termId: string,
  n: number,
  committeeIds: string[],
  prefix = "bulk",
): Promise<string[]> {
  const people = await db()
    .insert(person)
    .values(
      Array.from({ length: n }, (_, index) => ({
        email: `${prefix}.${index}@eafit.edu.co`,
        firstName: "Persona",
        lastName: `Lote ${index}`,
        stage: "MEMBER" as const,
        source: "TEST",
      })),
    )
    .returning({ id: person.id });
  const ids = people.map((row) => row.id);
  await db()
    .insert(membership)
    .values(ids.map((personId) => ({ personId, firstTermId: termId, status: "ACTIVE" as const })));
  await db()
    .insert(committeeMembership)
    .values(
      ids.map((personId, index) => ({
        personId,
        committeeId: committeeIds[index % committeeIds.length] ?? committeeIds[0] ?? "",
        termId,
        roleCode: "MIEMBRO",
        joinedAt: new Date(),
      })),
    );
  return ids;
}

async function pendingRecomputes(): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(outbox)
    .where(and(eq(outbox.eventType, "score.recompute"), isNull(outbox.processedAt)));
  return row?.n ?? 0;
}

describe("check-in propio", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it(
    "500 check-ins concurrentes sobre la misma ocasión: sin duplicados ni recomputes repetidos",
    { timeout: 120_000 },
    async () => {
      const termId = await seedTerm(currentTermCode());
      const committees = await Promise.all([
        seedCommittee("c1"),
        seedCommittee("c2"),
        seedCommittee("c3"),
        seedCommittee("c4"),
      ]);
      const people = await seedMembersBulk(termId, 500, committees);
      const { id, publicId } = await seedOccasion(termId, {
        points: 10,
        title: "Integración masiva",
      });

      const first = await Promise.all(
        people.map((personId) => checkInSelfAs({ personId, ip: null }, { publicId })),
      );
      expect(first.every((result) => result.ok && result.outcome === "APPROVED_WITH_POINTS")).toBe(
        true,
      );

      const [checkIns] = await db()
        .select({ n: count() })
        .from(checkIn)
        .where(eq(checkIn.occasionId, id));
      const [entries] = await db()
        .select({ n: count(), total: sql<number>`coalesce(sum(${pointEntry.points}), 0)::int` })
        .from(pointEntry)
        .where(eq(pointEntry.kind, "CHECKIN"));
      expect(checkIns?.n).toBe(500);
      expect(entries?.n).toBe(500);
      expect(entries?.total).toBe(5000);
      expect(await pendingRecomputes()).toBe(1);
      const [pending] = await db()
        .select({ dedupeKey: outbox.dedupeKey })
        .from(outbox)
        .where(eq(outbox.eventType, "score.recompute"));
      expect(pending?.dedupeKey).toBe(`score:${id}`);

      // La misma ráfaga otra vez: los 500 ya estaban registrados y nada cambia.
      const again = await Promise.all(
        people.map((personId) => checkInSelfAs({ personId, ip: null }, { publicId })),
      );
      expect(again.every((result) => !result.ok && result.reason === "ALREADY")).toBe(true);
      const [checkInsAgain] = await db().select({ n: count() }).from(checkIn);
      const [entriesAgain] = await db().select({ n: count() }).from(pointEntry);
      expect(checkInsAgain?.n).toBe(500);
      expect(entriesAgain?.n).toBe(500);
      expect(await pendingRecomputes()).toBe(1);

      // El recompute deja una fila por comité con elegibles, igual a la función pura.
      await drainOutbox();
      expect(await pendingRecomputes()).toBe(0);
      const scores = await listOccasionScores(id);
      expect(scores).toHaveLength(4);
      for (const row of scores) {
        expect(row.eligible).toBe(125);
        expect(row.present).toBe(125);
        expect(row.rate).toBe(1);
        expect(row.smoothedRate).toBe(round4(smoothedRate(125, 125, 1, 5)));
        expect(row.frozenAt).toBeNull();
      }
    },
  );

  it("valida en orden: borrador, ventana, solo nuevos, código rotativo, término cerrado", async () => {
    const termId = await seedTerm(currentTermCode());
    const previousTermId = await seedTerm("2019-1");
    const personId = await seedMember("socia@eafit.edu.co");
    const veteranId = await seedMember("veterana@eafit.edu.co");
    await db()
      .update(membership)
      .set({ firstTermId: previousTermId })
      .where(eq(membership.personId, veteranId));

    const draft = await seedOccasion(termId, { status: "DRAFT" });
    expect(await checkInSelfAs({ personId, ip: null }, { publicId: draft.publicId })).toEqual({
      ok: false,
      reason: "DRAFT",
    });

    const future = await seedOccasion(termId, {
      checkInOpensAt: new Date(Date.now() + 3_600_000),
      checkInClosesAt: new Date(Date.now() + 7_200_000),
    });
    const notOpen = await checkInSelfAs({ personId, ip: null }, { publicId: future.publicId });
    expect(notOpen.ok).toBe(false);
    if (!notOpen.ok) expect(notOpen.reason).toBe("NOT_OPEN_YET");

    const past = await seedOccasion(termId, {
      checkInOpensAt: new Date(Date.now() - 7_200_000),
      checkInClosesAt: new Date(Date.now() - 3_600_000),
    });
    expect(await checkInSelfAs({ personId, ip: null }, { publicId: past.publicId })).toEqual({
      ok: false,
      reason: "WINDOW_CLOSED",
    });

    const onlyNew = await seedOccasion(termId, { newMembersOnly: true });
    expect(
      await checkInSelfAs({ personId: veteranId, ip: null }, { publicId: onlyNew.publicId }),
    ).toEqual({
      ok: false,
      reason: "NEW_MEMBERS_ONLY",
    });
    const asNew = await checkInSelfAs({ personId, ip: null }, { publicId: onlyNew.publicId });
    expect(asNew.ok).toBe(true);

    const secret = "secreto";
    const coded = await seedOccasion(termId, { requireRotatingCode: true, rotatingSecret: secret });
    expect(await checkInSelfAs({ personId, ip: null }, { publicId: coded.publicId })).toEqual({
      ok: false,
      reason: "CODE_REQUIRED",
    });
    expect(
      await checkInSelfAs({ personId, ip: null }, { publicId: coded.publicId, code: "000000" }),
    ).toEqual({ ok: false, reason: "BAD_CODE" });
    const good = await checkInSelfAs(
      { personId, ip: null },
      { publicId: coded.publicId, code: rotatingCodeAt(secret, coded.id, new Date()) },
    );
    expect(good.ok).toBe(true);

    await db().update(term).set({ pointsClosedAt: new Date() }).where(eq(term.id, termId));
    const closedTerm = await seedOccasion(termId);
    expect(await checkInSelfAs({ personId, ip: null }, { publicId: closedTerm.publicId })).toEqual({
      ok: false,
      reason: "TERM_CLOSED",
    });
    expect(await checkInSelfAs({ personId, ip: null }, { publicId: "zzzzzzzzzz" })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
  });

  it("aprobación manual: queda pendiente sin puntos, aprobar acredita una sola vez y anular revierte", async () => {
    const termId = await seedTerm(currentTermCode());
    const personId = await seedMember("manual@eafit.edu.co");
    const { id, publicId } = await seedOccasion(termId, { approval: "MANUAL", points: 30 });
    const result = await checkInSelfAs({ personId, ip: null }, { publicId });
    expect(result.ok && result.outcome).toBe("PENDING");
    expect(await balanceFor(personId, termId)).toBe(0);
    const pending = await findCheckIn(id, personId);
    if (!pending) throw new Error("sin check-in");

    await expect(
      decideCheckInAs(
        { personId, ip: null },
        { checkInId: pending.id, decision: "CANCEL", reason: "x" },
      ),
    ).rejects.toBeInstanceOf(DomainError);
    await decideCheckInAs({ personId, ip: null }, { checkInId: pending.id, decision: "REJECT" });
    expect((await findCheckIn(id, personId))?.status).toBe("REJECTED");
    await decideCheckInAs({ personId, ip: null }, { checkInId: pending.id, decision: "APPROVE" });
    expect(await balanceFor(personId, termId)).toBe(30);
    await expect(
      decideCheckInAs({ personId, ip: null }, { checkInId: pending.id, decision: "APPROVE" }),
    ).rejects.toThrow(t("T-676", { estado: "aprobado" }));

    await expect(
      decideCheckInAs(
        { personId, ip: null },
        { checkInId: pending.id, decision: "CANCEL", reason: " " },
      ),
    ).rejects.toThrow(t("T-609"));
    await decideCheckInAs(
      { personId, ip: null },
      { checkInId: pending.id, decision: "CANCEL", reason: "no estuvo" },
    );
    const entries = await listEntriesFor(personId, termId);
    expect(entries.map((entry) => [entry.kind, entry.points])).toEqual([
      ["REVERSAL", -30],
      ["CHECKIN", 30],
    ]);
    expect(entries[0]?.reversalOfId).toBe(entries[1]?.id);
    expect(await balanceFor(personId, termId)).toBe(0);
    await expect(
      decideCheckInAs({ personId, ip: null }, { checkInId: pending.id, decision: "APPROVE" }),
    ).rejects.toBeInstanceOf(DomainError);
    expect((await findCheckIn(id, personId))?.status).toBe("CANCELLED");
  });

  it("el anfitrión registra aprobado aunque la ocasión sea manual, no duplica y rechaza a quien no está activo", async () => {
    const termId = await seedTerm(currentTermCode());
    const host = await seedMember("lider@eafit.edu.co");
    const guest = await seedMember("invitada@eafit.edu.co");
    const retired = await seedMember("retirado@eafit.edu.co");
    await db()
      .update(membership)
      .set({ status: "INACTIVE", endedAt: new Date(), endReason: "OTHER" })
      .where(eq(membership.personId, retired));
    const { id, publicId } = await seedOccasion(termId, { approval: "MANUAL", points: 10 });
    const result = await hostCheckInAs(
      { personId: host, ip: null },
      { occasionId: id, personId: guest, personName: "Invitada", source: "HOST" },
    );
    expect(result.points).toBe(10);
    expect((await findCheckIn(id, guest))?.status).toBe("APPROVED");
    expect(await balanceFor(guest, termId)).toBe(10);
    await expect(
      hostCheckInAs(
        { personId: host, ip: null },
        { occasionId: id, personId: guest, personName: "Invitada", source: "HOST" },
      ),
    ).rejects.toThrow(t("T-601", { nombre: "Invitada" }));
    await expect(
      hostCheckInAs(
        { personId: host, ip: null },
        { occasionId: id, personId: retired, personName: "Retirado", source: "HOST" },
      ),
    ).rejects.toThrow(t("T-673", { nombre: "Retirado" }));
    // Quien se registró y quedó pendiente puede ser aprobado por el anfitrión.
    const other = await seedMember("otra@eafit.edu.co");
    await checkInSelfAs({ personId: other, ip: null }, { publicId });
    expect((await findCheckIn(id, other))?.status).toBe("PENDING");
    await hostCheckInAs(
      { personId: host, ip: null },
      { occasionId: id, personId: other, personName: "Otra", source: "HOST" },
    );
    expect((await findCheckIn(id, other))?.status).toBe("APPROVED");
  });

  it("cancelar la ocasión anula los check-ins vivos y revierte sus créditos en una transacción", async () => {
    const termId = await seedTerm(currentTermCode());
    const a = await seedMember("a@eafit.edu.co");
    const b = await seedMember("b@eafit.edu.co");
    const { id, publicId } = await seedOccasion(termId, { points: 15 });
    await checkInSelfAs({ personId: a, ip: null }, { publicId });
    await checkInSelfAs({ personId: b, ip: null }, { publicId });
    expect(await balanceFor(a, termId)).toBe(15);
    const { cancelledCheckIns } = await cancelOccasionAs(SYSTEM_ACTOR, id, "se canceló el evento");
    expect(cancelledCheckIns).toBe(2);
    expect((await getOccasion(id))?.status).toBe("CANCELLED");
    expect((await findCheckIn(id, a))?.status).toBe("CANCELLED");
    expect(await balanceFor(a, termId)).toBe(0);
    expect(await balanceFor(b, termId)).toBe(0);
    const [reversals] = await db()
      .select({ n: count() })
      .from(pointEntry)
      .where(eq(pointEntry.kind, "REVERSAL"));
    expect(reversals?.n).toBe(2);
    // Nadie puede registrarse en una cancelada.
    const c = await seedMember("c@eafit.edu.co");
    expect(await checkInSelfAs({ personId: c, ip: null }, { publicId })).toEqual({
      ok: false,
      reason: "CANCELLED",
    });
  });

  it("el outbox escribe la línea de tiempo una sola vez y marca la primera integración solo a quien es nuevo", async () => {
    await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "gamification.enabled", true));
    const termId = await seedTerm(currentTermCode());
    const previousTermId = await seedTerm("2019-1");
    const newbie = await seedMember("nueva@eafit.edu.co");
    const veteran = await seedMember("veterano@eafit.edu.co");
    await db()
      .update(membership)
      .set({ firstTermId: previousTermId })
      .where(eq(membership.personId, veteran));
    const committeeId = await seedCommittee("c1");
    await seedCommitteeMembership(newbie, committeeId, termId);
    await seedCommitteeMembership(veteran, committeeId, termId);
    const { id, publicId } = await seedOccasion(termId, {
      points: 20,
      category: "INTEGRATION",
      title: "Integración de nuevos",
    });
    await checkInSelfAs({ personId: newbie, ip: null }, { publicId });
    await checkInSelfAs({ personId: veteran, ip: null }, { publicId });
    await drainOutbox();
    const entries = await db()
      .select()
      .from(interaction)
      .where(eq(interaction.kind, "PARTICIPATION"));
    // Cada check-in escribe sus puntos y, desde G-T5, la insignia En parche 1 que la
    // actividad voluntaria desbloquea en el mismo drenado.
    const pointEntries = entries.filter((entry) =>
      itemPattern(tList("T-667")[1]).test(entry.summary),
    );
    expect(pointEntries).toHaveLength(2);
    expect(
      pointEntries.every(
        (entry) =>
          entry.summary ===
          t("T-667")
            .split(" · ")[1]
            ?.replace("{n}", "20")
            .replace("{ocasion}", "Integración de nuevos"),
      ),
    ).toBe(true);
    const badgeEntries = entries.filter((entry) =>
      itemPattern(tList("T-667")[9]).test(entry.summary),
    );
    expect(badgeEntries).toHaveLength(2);
    expect(badgeEntries.every((entry) => entry.summary.includes("En parche"))).toBe(true);
    const steps = await db().select().from(onboardingProgress);
    expect(steps.map((step) => step.personId)).toEqual([newbie]);
    expect(steps[0]?.source).toBe("AUTO");
    const scores = await listOccasionScores(id);
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({ committeeId, eligible: 2, present: 2, rate: rawRate(2, 2) });
    const [rows] = await db().select({ n: count() }).from(committeeParticipation);
    expect(rows?.n).toBe(1);
  });
});
