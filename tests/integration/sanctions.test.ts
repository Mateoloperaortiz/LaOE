import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";
import { grantRecognitionAs } from "@/modules/crm";
import { interaction } from "@/modules/crm/schema";
import {
  listSanctionsForPerson,
  recordSanctionAs,
  revokeSanctionAs,
  sanctionStateFor,
} from "@/modules/people";
import { membership, sanction } from "@/modules/people/schema";
import {
  applyDecisions,
  closeTermPermanenceAs,
  confirmAllProposedAs,
  getSnapshot,
  listClosingRows,
  recomputeSnapshots,
} from "@/modules/permanence";
import { manualCredit } from "@/modules/permanence/schema";
import { closeTermPoints } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { truncateAll } from "./db";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedOccasion,
  seedPerson,
  seedRule,
  seedTerm,
} from "./factories";

// Faltas y sanciones (Regl. cap. 9; ADR-060 regla 6): registro con fechas derivadas y línea de
// tiempo, suspensión que bloquea reconocimientos, revocación, y la falta grave más otra sanción que el
// cierre convierte en expulsión.

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

async function member(email: string, termId: string, committeeId: string) {
  const personId = await seedPerson(email);
  await seedMembership(personId, termId);
  await seedCommitteeMembership(personId, committeeId, termId, "MIEMBRO", {
    joinedAt: new Date("2024-07-20T12:00:00Z"),
  });
  return personId;
}

describe("faltas y sanciones", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("registra con fechas derivadas, suspende los reconocimientos y se revoca con motivo", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const gh = await seedPerson("gh@eafit.edu.co");
    await seedMembership(gh, termId);
    const personId = await member("falta@eafit.edu.co", termId, a3);
    const actor = { personId: gh, ip: null };
    const today = new Date().toISOString().slice(0, 10);

    const { id } = await recordSanctionAs(actor, personId, {
      termId,
      kind: "WARNING",
      cause: "Faltó a la reunión del 3 de septiembre sin excusa; en descargos reconoció la falta",
      reference: "Anexo 1, llamado de atención 1",
      occurredOn: today,
      committeeId: a3,
    });
    const [row] = await db().select().from(sanction).where(eq(sanction.id, id));
    expect(row).toMatchObject({ kind: "WARNING", suspendedFrom: today, issuedById: gh });
    expect(row?.suspendedUntil).not.toBeNull();
    expect((row?.expiresOn ?? "") > today).toBe(true);
    const state = await sanctionStateFor(personId);
    expect(state).toMatchObject({
      suspendedUntil: row?.suspendedUntil,
      officeBan: false,
      expulsionWarning: false,
    });
    // Con derechos suspendidos no hay destacado del mes (Regl. art. 69 y 73).
    await expect(
      grantRecognitionAs(actor, {
        personId,
        kind: "MEMBER_OF_MONTH",
        committeeId: a3,
        termId,
        month: 9,
        title: "",
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await drenar();
    const timeline = async () =>
      (
        await db()
          .select({ summary: interaction.summary })
          .from(interaction)
          .where(and(eq(interaction.personId, personId), eq(interaction.kind, "MEMBERSHIP")))
      ).map((item) => item.summary);
    expect(await timeline()).toContain(
      "Sanción registrada: Llamado de atención (Faltó a la reunión del 3 de septiembre sin excusa; en descargos reconoció la falta)",
    );

    await expect(revokeSanctionAs(actor, id, " ")).rejects.toBeInstanceOf(DomainError);
    await revokeSanctionAs(actor, id, "La junta aceptó la revisión de los descargos");
    await revokeSanctionAs(actor, id, "Repetida: no hace nada");
    const views = await listSanctionsForPerson(personId);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      state: "REVOKED",
      kindLabel: "Llamado de atención",
      committeeName: "A3",
      revokeReason: "La junta aceptó la revisión de los descargos",
    });
    expect((await sanctionStateFor(personId)).suspendedUntil).toBeNull();
    await drenar();
    expect(await timeline()).toContain(
      "Sanción revocada: Llamado de atención (La junta aceptó la revisión de los descargos)",
    );
    // Ahora sí se puede reconocer.
    const granted = await grantRecognitionAs(actor, {
      personId,
      kind: "MEMBER_OF_MONTH",
      committeeId: a3,
      termId,
      month: 9,
      title: "",
    });
    expect(granted.id).toBeTruthy();
  });

  it("una suspensión explícita respeta el mes y solo se sanciona a una membresía viva", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const gh = await seedPerson("gh@eafit.edu.co");
    await seedMembership(gh, termId);
    const personId = await member("susp@eafit.edu.co", termId, a3);
    const retired = await seedPerson("retirada@eafit.edu.co");
    await seedMembership(retired, termId, "INACTIVE");
    const actor = { personId: gh, ip: null };
    await expect(
      recordSanctionAs(actor, personId, {
        termId,
        kind: "SUSPENSION",
        cause: "Uso indebido de la oficina, con descargos el 5 de septiembre",
        occurredOn: "2026-09-01",
        suspendedUntil: "2026-10-15",
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await recordSanctionAs(actor, personId, {
      termId,
      kind: "SUSPENSION",
      cause: "Uso indebido de la oficina, con descargos el 5 de septiembre",
      occurredOn: "2026-09-01",
      suspendedUntil: "2026-09-28",
    });
    expect((await listSanctionsForPerson(personId))[0]).toMatchObject({
      suspendedFrom: "2026-09-01",
      suspendedUntil: "2026-09-28",
      expiresOn: "2027-09-01",
    });
    await expect(
      recordSanctionAs(actor, retired, {
        termId,
        kind: "WARNING",
        cause: "No aplica: ya no es miembro",
        occurredOn: "2026-09-01",
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("una falta grave más otra sanción viva hace que el cierre proponga y aplique la expulsión", async () => {
    const termId = await seedTerm("2024-2");
    const previous = await seedTerm("2024-1");
    const a3 = await seedCommittee("a3", "A3");
    const gh = await seedPerson("gh@eafit.edu.co");
    await seedMembership(gh, previous);
    const personId = await member("grave@eafit.edu.co", termId, a3);
    const eventos = await seedRule(termId, "eventos", {
      committeeId: a3,
      weight: 60,
      computation: "MANUAL",
      params: {},
    });
    await db()
      .insert(manualCredit)
      .values({ termId, ruleId: eventos, personId, value: 60, reason: "seed", grantedById: gh });
    const assembly = await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      points: 0,
      status: "CLOSED",
      startsAt: new Date("2024-09-10T22:00:00Z"),
      checkInOpensAt: new Date("2024-09-10T21:00:00Z"),
      checkInClosesAt: new Date("2024-09-10T23:00:00Z"),
    });
    await seedCheckIn(assembly.id, personId);
    const election = await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "BOARD_ELECTION",
      points: 0,
      status: "CLOSED",
      startsAt: new Date("2024-11-10T22:00:00Z"),
      checkInOpensAt: new Date("2024-11-10T21:00:00Z"),
      checkInClosesAt: new Date("2024-11-10T23:00:00Z"),
    });
    await seedCheckIn(election.id, personId);
    const actor = { personId: gh, ip: null };
    await recordSanctionAs(actor, personId, {
      termId,
      kind: "MAJOR",
      cause: "Consumo de alcohol con la camiseta de la OE; descargos del 2 de octubre",
      occurredOn: "2024-10-01",
    });
    await recomputeSnapshots(termId);
    expect((await getSnapshot(personId, termId))?.expulsionWarning).toBe(false);
    await recordSanctionAs(actor, personId, {
      termId,
      kind: "WARNING",
      cause: "Llegada tarde al turno de GAP del 20 de octubre",
      occurredOn: "2024-10-20",
    });
    await drenar();
    expect((await getSnapshot(personId, termId))?.expulsionWarning).toBe(true);
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    const { rows } = await listClosingRows(termId);
    expect(rows.find((row) => row.personId === personId)).toMatchObject({
      personProposed: "EXIT_OE",
      personReason: 5,
      mandatoryMet: true,
    });
    await confirmAllProposedAs(actor, termId);
    const { nextTermId } = await closeTermPermanenceAs(actor, termId);
    await applyDecisions(termId, nextTermId);
    const [row] = await db().select().from(membership).where(eq(membership.personId, personId));
    expect(row).toMatchObject({ status: "INACTIVE", endReason: "EXPULSION" });
  });
});
