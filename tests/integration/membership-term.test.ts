import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { interaction } from "@/modules/crm/schema";
import { listTermRoster, probationInputSchema, setProbationAs } from "@/modules/people";
import { membershipTerm } from "@/modules/people/schema";
import { getSnapshot, recomputeSnapshots } from "@/modules/permanence";
import { permanenceSnapshot } from "@/modules/permanence/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedTerm,
} from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Condición del semestre desde la Persona 360 (ADR-056): el comando exige motivo, es idempotente,
// audita, y su evento recalcula la permanencia de la persona y escribe la línea de tiempo.

const db = () => getDb();

async function condition(personId: string, termId: string) {
  const [row] = await db()
    .select()
    .from(membershipTerm)
    .where(and(eq(membershipTerm.personId, personId), eq(membershipTerm.termId, termId)));
  return row ?? null;
}

describe("condición del semestre (ADR-056)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("exige un motivo de al menos dos caracteres y lo recorta", () => {
    expect(probationInputSchema.safeParse({ probation: true, reason: "x" }).success).toBe(false);
    expect(probationInputSchema.safeParse({ probation: true, reason: "   " }).success).toBe(false);
    expect(
      probationInputSchema.parse({ probation: false, reason: "  Cumplió el semestre  " }),
    ).toEqual({
      probation: false,
      reason: "Cumplió el semestre",
      committeeId: null,
      reportAsVeteran: false,
    });
  });

  it("marca y retira la prueba con auditoría, recálculo de permanencia y línea de tiempo", async () => {
    const gh = await seedMember("gh@eafit.edu.co");
    const personId = await seedMember("prueba@eafit.edu.co");
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3", "A3");
    await seedCommitteeMembership(personId, committeeId, termId);
    const actor = { personId: gh, ip: null };

    await setProbationAs(actor, personId, termId, {
      probation: true,
      reason: "Roster mal cargado",
    });
    expect(await condition(personId, termId)).toMatchObject({
      probation: true,
      reason: "Roster mal cargado",
      decidedById: gh,
    });
    // Repetir con los mismos valores no escribe ni audita ni emite otra vez.
    await setProbationAs(actor, personId, termId, {
      probation: true,
      reason: "Roster mal cargado",
    });
    const audits = await db()
      .select({ before: auditLog.before, after: auditLog.after, actorId: auditLog.actorId })
      .from(auditLog)
      .where(and(eq(auditLog.action, "membership-term.set"), eq(auditLog.entityId, personId)));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: gh,
      before: null,
      after: { termId, probation: true, reason: "Roster mal cargado", decidedById: gh },
    });
    const events = await db()
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(eq(outbox.eventType, "membership-term.changed"));
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      personId,
      termId,
      probation: true,
      reason: "Roster mal cargado",
      actorId: gh,
    });

    await drainOutbox();
    const [snapshot] = await db()
      .select({ probation: permanenceSnapshot.probation })
      .from(permanenceSnapshot)
      .where(and(eq(permanenceSnapshot.personId, personId), eq(permanenceSnapshot.termId, termId)));
    expect(snapshot).toEqual({ probation: true });
    const summaries = async () =>
      (
        await db()
          .select({ summary: interaction.summary })
          .from(interaction)
          .where(and(eq(interaction.personId, personId), eq(interaction.kind, "PERMANENCE")))
      ).map((row) => row.summary);
    expect(await summaries()).toEqual([
      fillCopy(tList("T-832")[7], { término: currentTermCode(), motivo: "Roster mal cargado" }),
    ]);

    await setProbationAs(actor, personId, termId, {
      probation: false,
      reason: "GH la levantó",
    });
    expect(await condition(personId, termId)).toMatchObject({
      probation: false,
      reason: "GH la levantó",
      decidedById: gh,
    });
    await drainOutbox();
    const [cleared] = await db()
      .select({ probation: permanenceSnapshot.probation })
      .from(permanenceSnapshot)
      .where(and(eq(permanenceSnapshot.personId, personId), eq(permanenceSnapshot.termId, termId)));
    expect(cleared).toEqual({ probation: false });
    expect(await summaries()).toEqual([
      fillCopy(tList("T-832")[7], { término: currentTermCode(), motivo: "Roster mal cargado" }),
      fillCopy(tList("T-832")[8], { término: currentTermCode(), motivo: "GH la levantó" }),
    ]);
  });

  it("fija la prueba solo en un comité y el roster del término la refleja ahí (ADR-060 regla 2)", async () => {
    const gh = await seedMember("gh2@eafit.edu.co");
    const personId = await seedMember("dos@eafit.edu.co");
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const pixel = await seedCommittee("pixel", "PIXEL");
    await seedCommitteeMembership(personId, a3, termId);
    await seedCommitteeMembership(personId, pixel, termId);
    const actor = { personId: gh, ip: null };

    await setProbationAs(actor, personId, termId, {
      probation: true,
      reason: "Quedó en la banda en A3",
      committeeId: a3,
    });
    const rows = await listTermRoster(termId, [personId]);
    const byCommittee = new Map(rows.map((row) => [row.committeeId, row]));
    expect(byCommittee.get(a3)).toMatchObject({ probation: false, committeeProbation: true });
    expect(byCommittee.get(pixel)).toMatchObject({ probation: false, committeeProbation: false });

    // La condición de toda la persona convive con la del comité: dos filas distintas.
    await setProbationAs(actor, personId, termId, { probation: true, reason: "Roster" });
    const both = await db()
      .select({ committeeId: membershipTerm.committeeId })
      .from(membershipTerm)
      .where(and(eq(membershipTerm.personId, personId), eq(membershipTerm.termId, termId)));
    expect(both).toHaveLength(2);
    expect(both.map((row) => row.committeeId)).toEqual(expect.arrayContaining([a3, null]));
    const all = await listTermRoster(termId, [personId]);
    expect(all.every((row) => row.probation)).toBe(true);

    await drainOutbox();
    const summaries = (
      await db()
        .select({ summary: interaction.summary })
        .from(interaction)
        .where(and(eq(interaction.personId, personId), eq(interaction.kind, "PERMANENCE")))
    ).map((row) => row.summary);
    expect(summaries).toContain(
      fillCopy(tList("T-832")[9], {
        comité: "A3",
        término: currentTermCode(),
        motivo: "Quedó en la banda en A3",
      }),
    );
    expect(summaries).toContain(
      fillCopy(tList("T-832")[7], { término: currentTermCode(), motivo: "Roster" }),
    );
  });

  it("la mesa de un comité nuevo se reporta como activa aunque sea nueva (Est. art. 5 par. 1)", async () => {
    const gh = await seedMember("gh3@eafit.edu.co");
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const personId = await seedMember("nueva@eafit.edu.co");
    await seedCommitteeMembership(personId, a3, termId, "GENERAL");
    const actor = { personId: gh, ip: null };
    await recomputeSnapshots(termId);
    expect((await getSnapshot(personId, termId))?.isNew).toBe(true);
    await setProbationAs(actor, personId, termId, {
      probation: false,
      reason: "Mesa del comité reactivado",
      reportAsVeteran: true,
    });
    const [row] = await listTermRoster(termId, [personId]);
    expect(row).toMatchObject({ reportAsVeteran: true, probation: false });
    await drainOutbox();
    expect((await getSnapshot(personId, termId))?.isNew).toBe(false);
  });
});
