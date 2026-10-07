import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { grantRecognitionAs } from "@/modules/crm";
import { interaction } from "@/modules/crm/schema";
import {
  leaveCommitteeAs,
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
import { t, tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { drainOutbox } from "../helpers/outbox";
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
    const today = todayKey();

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
    await drainOutbox();
    const timeline = async () =>
      (
        await db()
          .select({ summary: interaction.summary })
          .from(interaction)
          .where(and(eq(interaction.personId, personId), eq(interaction.kind, "MEMBERSHIP")))
      ).map((item) => item.summary);
    expect(await timeline()).toContain(
      fillCopy(tList("T-2234")[0], {
        tipo: tList("T-2229")[0],
        causal:
          "Faltó a la reunión del 3 de septiembre sin excusa; en descargos reconoció la falta",
      }),
    );

    await expect(revokeSanctionAs(actor, id, " ")).rejects.toBeInstanceOf(DomainError);
    await revokeSanctionAs(actor, id, "La junta aceptó la revisión de los descargos");
    await revokeSanctionAs(actor, id, "Repetida: no hace nada");
    const views = await listSanctionsForPerson(personId);
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      state: "REVOKED",
      kindLabel: tList("T-2229")[0],
      committeeName: "A3",
      revokeReason: "La junta aceptó la revisión de los descargos",
    });
    expect((await sanctionStateFor(personId)).suspendedUntil).toBeNull();
    await drainOutbox();
    expect(await timeline()).toContain(
      fillCopy(tList("T-2234")[1], {
        tipo: tList("T-2229")[0],
        motivo: "La junta aceptó la revisión de los descargos",
      }),
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
    const induction = await seedOccasion(termId, {
      kind: "ACTIVITY",
      category: "INDUCTION",
      status: "CLOSED",
      points: 0,
      startsAt: new Date("2024-08-01T15:00:00Z"),
    });
    await seedCheckIn(induction.id, personId);
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
    await drainOutbox();
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

  // El alcance de un comité (ADR-060 regla 6 y ADR-072 regla 1): la dirección registra llamados,
  // leves y graves, y solo a miembros de su comité; sin alcance, GH sigue sin restricción.

  it("desde el alcance de un comité no se registra una suspensión ni una inhabilidad", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const director = await seedPerson("direccion@eafit.edu.co");
    await seedMembership(director, termId);
    const personId = await member("propia@eafit.edu.co", termId, a3);
    const actor = { personId: director, ip: null };
    const scope = { committeeId: a3, termId };
    const suspension = {
      termId,
      kind: "SUSPENSION",
      cause: "Uso indebido de la oficina, con descargos el 5 de septiembre",
      occurredOn: "2026-09-01",
      suspendedUntil: "2026-09-20",
      committeeId: a3,
    } as const;

    await expect(recordSanctionAs(actor, personId, suspension, scope)).rejects.toMatchObject({
      name: "DomainError",
      message: t("T-260"),
    });
    await expect(
      recordSanctionAs(
        actor,
        personId,
        { ...suspension, kind: "OFFICE_BAN", suspendedUntil: null },
        scope,
      ),
    ).rejects.toMatchObject({ name: "DomainError", message: t("T-260") });
    expect(await listSanctionsForPerson(personId)).toEqual([]);

    // Sin alcance, como GH desde la Persona 360, la misma suspensión sí se registra.
    await recordSanctionAs(actor, personId, suspension);
    expect((await listSanctionsForPerson(personId)).map((view) => view.kind)).toEqual([
      "SUSPENSION",
    ]);
  });

  it("desde el alcance de un comité no se sanciona a quien es de otro comité ni a quien ya salió del suyo", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const nexos = await seedCommittee("nexos", "NEXOS");
    const director = await seedPerson("direccion@eafit.edu.co");
    await seedMembership(director, termId);
    const outsider = await member("ajena@eafit.edu.co", termId, nexos);
    const former = await member("salio@eafit.edu.co", termId, a3);
    const actor = { personId: director, ip: null };
    await leaveCommitteeAs(actor, former, a3, termId, "Pidió salir del comité");
    const scope = { committeeId: a3, termId };
    const warning = {
      termId,
      kind: "WARNING",
      cause: "Faltó a la reunión del 3 de septiembre sin excusa; en descargos reconoció la falta",
      occurredOn: todayKey(),
      committeeId: a3,
    } as const;

    for (const personId of [outsider, former]) {
      // Uno ajeno se trata como inexistente: el mismo texto y nada escrito.
      await expect(recordSanctionAs(actor, personId, warning, scope)).rejects.toMatchObject({
        name: "DomainError",
        message: t("T-032"),
      });
      expect(await listSanctionsForPerson(personId)).toEqual([]);
      expect((await sanctionStateFor(personId)).suspendedUntil).toBeNull();
    }

    // Sin alcance, GH sí sanciona a cualquier miembro vivo.
    await recordSanctionAs(actor, outsider, { ...warning, committeeId: null });
    expect(await listSanctionsForPerson(outsider)).toHaveLength(1);
  });

  it("desde el alcance de un comité, la falta de un miembro suyo queda a nombre de ese comité y de su término", async () => {
    const termId = await seedTerm();
    const previous = await seedTerm("2024-1");
    const a3 = await seedCommittee("a3", "A3");
    const nexos = await seedCommittee("nexos", "NEXOS");
    const director = await seedPerson("direccion@eafit.edu.co");
    await seedMembership(director, termId);
    const personId = await member("propia@eafit.edu.co", termId, a3);
    const actor = { personId: director, ip: null };
    const scope = { committeeId: a3, termId };

    for (const kind of ["WARNING", "MINOR", "MAJOR"] as const) {
      // El término y el comité que traiga el formulario no mandan: manda el alcance autorizado.
      await recordSanctionAs(
        actor,
        personId,
        {
          termId: previous,
          kind,
          cause: "Llegada tarde al turno de GAP del 20 de octubre, con descargos",
          occurredOn: todayKey(),
          committeeId: nexos,
        },
        scope,
      );
    }

    const views = await listSanctionsForPerson(personId);
    expect(views.map((view) => view.kind).sort()).toEqual(["MAJOR", "MINOR", "WARNING"]);
    for (const view of views) {
      expect(view).toMatchObject({ committeeName: "A3", termId });
    }
  });
});
