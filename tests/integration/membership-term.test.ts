import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";
import { interaction } from "@/modules/crm/schema";
import { probationInputSchema, setProbationAs } from "@/modules/people";
import { membershipTerm } from "@/modules/people/schema";
import { permanenceSnapshot } from "@/modules/permanence/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { truncateAll } from "./db";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedTerm,
} from "./factories";

// Condición del semestre desde la Persona 360 (ADR-056): el comando exige motivo, es idempotente,
// audita, y su evento recalcula la permanencia de la persona y escribe la línea de tiempo.

const db = () => getDb();

async function drenar(): Promise<void> {
  for (let batch = 0; batch < 20; batch += 1) {
    const result = await drain(50);
    expect(result.failed).toBe(0);
    if (result.processed === 0) {
      return;
    }
  }
  throw new Error("El outbox no terminó");
}

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
    ).toEqual({ probation: false, reason: "Cumplió el semestre" });
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

    await drenar();
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
      `En periodo de prueba en ${currentTermCode()}: Roster mal cargado`,
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
    await drenar();
    const [cleared] = await db()
      .select({ probation: permanenceSnapshot.probation })
      .from(permanenceSnapshot)
      .where(and(eq(permanenceSnapshot.personId, personId), eq(permanenceSnapshot.termId, termId)));
    expect(cleared).toEqual({ probation: false });
    expect(await summaries()).toEqual([
      `En periodo de prueba en ${currentTermCode()}: Roster mal cargado`,
      `Sin periodo de prueba en ${currentTermCode()}: GH la levantó`,
    ]);
  });
});
