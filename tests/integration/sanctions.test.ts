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
import { auditLog, outbox } from "@/modules/system/schema";
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
/** ADMIN desde la Persona 360: declara su alcance, sin restricción de tipo ni de comité. */
const asAdmin = { by: "ADMIN" } as const;

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

    const { id } = await recordSanctionAs(
      actor,
      personId,
      {
        termId,
        kind: "WARNING",
        cause: "Faltó a la reunión del 3 de septiembre sin excusa; en descargos reconoció la falta",
        reference: "Anexo 1, llamado de atención 1",
        occurredOn: today,
        committeeId: a3,
      },
      asAdmin,
    );
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

    await expect(revokeSanctionAs(actor, personId, id, " ")).rejects.toBeInstanceOf(DomainError);
    await revokeSanctionAs(actor, personId, id, "La junta aceptó la revisión de los descargos");
    await revokeSanctionAs(actor, personId, id, "Repetida: no hace nada");
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
      recordSanctionAs(
        actor,
        personId,
        {
          termId,
          kind: "SUSPENSION",
          cause: "Uso indebido de la oficina, con descargos el 5 de septiembre",
          occurredOn: "2026-09-01",
          suspendedUntil: "2026-10-15",
        },
        asAdmin,
      ),
    ).rejects.toBeInstanceOf(DomainError);
    await recordSanctionAs(
      actor,
      personId,
      {
        termId,
        kind: "SUSPENSION",
        cause: "Uso indebido de la oficina, con descargos el 5 de septiembre",
        occurredOn: "2026-09-01",
        suspendedUntil: "2026-09-28",
      },
      asAdmin,
    );
    expect((await listSanctionsForPerson(personId))[0]).toMatchObject({
      suspendedFrom: "2026-09-01",
      suspendedUntil: "2026-09-28",
      expiresOn: "2027-09-01",
    });
    await expect(
      recordSanctionAs(
        actor,
        retired,
        {
          termId,
          kind: "WARNING",
          cause: "No aplica: ya no es miembro",
          occurredOn: "2026-09-01",
        },
        asAdmin,
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("la suspensión y la vigencia de una falta corren hasta la medianoche de Colombia de su último día", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const gh = await seedPerson("gh@eafit.edu.co");
    await seedMembership(gh, termId);
    const personId = await member("ultimo-dia@eafit.edu.co", termId, a3);
    // Llamado de atención del 25 de agosto: suspende siete días (hasta el 1 de septiembre) y vence al año.
    await recordSanctionAs(
      { personId: gh, ip: null },
      personId,
      {
        termId,
        kind: "WARNING",
        cause: "Faltó a la reunión sin excusa; en descargos reconoció la falta",
        occurredOn: "2026-08-25",
        committeeId: a3,
      },
      asAdmin,
    );

    // 1 de septiembre a las 9 p. m. de Colombia: en UTC ya es 2 de septiembre (ADR-020).
    const lastEvening = await sanctionStateFor(personId, new Date("2026-09-02T02:00:00Z"));
    expect(lastEvening.suspendedUntil).toBe("2026-09-01");
    const nextMidnight = await sanctionStateFor(personId, new Date("2026-09-02T05:00:00Z"));
    expect(nextMidnight.suspendedUntil).toBeNull();

    // Lo mismo con la vigencia: el 25 de agosto del año siguiente a las 9 p. m. sigue viva.
    const stateAt = async (now: Date) => (await listSanctionsForPerson(personId, now))[0]?.state;
    expect(await stateAt(new Date("2027-08-26T02:00:00Z"))).toBe("LIVE");
    expect(await stateAt(new Date("2027-08-26T05:00:00Z"))).toBe("EXPIRED");
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
    await recordSanctionAs(
      actor,
      personId,
      {
        termId,
        kind: "MAJOR",
        cause: "Consumo de alcohol con la camiseta de la OE; descargos del 2 de octubre",
        occurredOn: "2024-10-01",
      },
      asAdmin,
    );
    await recomputeSnapshots(termId);
    expect((await getSnapshot(personId, termId))?.expulsionWarning).toBe(false);
    await recordSanctionAs(
      actor,
      personId,
      {
        termId,
        kind: "WARNING",
        cause: "Llegada tarde al turno de GAP del 20 de octubre",
        occurredOn: "2024-10-20",
      },
      asAdmin,
    );
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

  it("quien no declara desde dónde sanciona no registra nada", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const gh = await seedPerson("gh@eafit.edu.co");
    await seedMembership(gh, termId);
    const personId = await member("sin-alcance@eafit.edu.co", termId, a3);
    const actor = { personId: gh, ip: null };
    const suspension = {
      termId,
      kind: "SUSPENSION",
      cause: "Uso indebido de la oficina, con descargos el 5 de septiembre",
      occurredOn: "2026-09-01",
      suspendedUntil: "2026-09-20",
    } as const;

    // @ts-expect-error El alcance es obligatorio (ADR-072 regla 1 y ADR-112): olvidarlo no compila.
    const forgotten = recordSanctionAs(actor, personId, suspension);
    await expect(forgotten).rejects.toThrow();
    expect(await listSanctionsForPerson(personId)).toEqual([]);

    // Un alcance que el comando no reconoce se rechaza: no cae en el de ADMIN, que es el más amplio.
    const unknownScope = recordSanctionAs(
      actor,
      personId,
      suspension,
      // @ts-expect-error La forma anterior del alcance, sin decir desde dónde se sanciona.
      { committeeId: a3, termId },
    );
    await expect(unknownScope).rejects.toMatchObject({
      name: "DomainError",
      message: t("T-032"),
    });
    expect(await listSanctionsForPerson(personId)).toEqual([]);
  });

  // El alcance de un comité (ADR-060 regla 6 y ADR-072 regla 1): la dirección registra llamados,
  // leves y graves, y solo a miembros de su comité; con el alcance de ADMIN no hay restricción.

  it("desde el alcance de un comité no se registra una suspensión ni una inhabilidad", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const director = await seedPerson("direccion@eafit.edu.co");
    await seedMembership(director, termId);
    const personId = await member("propia@eafit.edu.co", termId, a3);
    const actor = { personId: director, ip: null };
    const scope = { by: "COMMITTEE", committeeId: a3, termId } as const;
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

    // Con el alcance de ADMIN, desde la Persona 360, la misma suspensión sí se registra.
    await recordSanctionAs(actor, personId, suspension, asAdmin);
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
    const scope = { by: "COMMITTEE", committeeId: a3, termId } as const;
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

    // Con el alcance de ADMIN sí se sanciona a cualquier miembro vivo.
    await recordSanctionAs(actor, outsider, { ...warning, committeeId: null }, asAdmin);
    expect(await listSanctionsForPerson(outsider)).toHaveLength(1);
  });

  it("desde el alcance de un comité no se sanciona a quien fue de ese comité en otro término y no lo es en el del alcance", async () => {
    const termId = await seedTerm();
    const previous = await seedTerm("2024-1");
    const a3 = await seedCommittee("a3", "A3");
    const director = await seedPerson("direccion@eafit.edu.co");
    await seedMembership(director, termId);
    // Sigue en la OE, pero su pertenencia a A3 es del término anterior: en este no está en el comité.
    const personId = await member("termino-anterior@eafit.edu.co", previous, a3);
    const actor = { personId: director, ip: null };
    const warning = {
      termId,
      kind: "WARNING",
      cause: "Faltó a la reunión del 3 de septiembre sin excusa; en descargos reconoció la falta",
      occurredOn: todayKey(),
      committeeId: a3,
    } as const;

    await expect(
      recordSanctionAs(actor, personId, warning, { by: "COMMITTEE", committeeId: a3, termId }),
    ).rejects.toMatchObject({ name: "DomainError", message: t("T-032") });
    expect(await listSanctionsForPerson(personId)).toEqual([]);

    // Desde el alcance del término en que sí fue del comité, la misma falta se registra.
    await recordSanctionAs(actor, personId, warning, {
      by: "COMMITTEE",
      committeeId: a3,
      termId: previous,
    });
    expect(await listSanctionsForPerson(personId)).toMatchObject([
      { kind: "WARNING", committeeName: "A3", termId: previous },
    ]);
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
    const scope = { by: "COMMITTEE", committeeId: a3, termId } as const;

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

  // Revocar comprueba la persona (ADR-114 regla 3): la ficha desde la que se revoca manda, y una
  // sanción que no es de esa persona se trata como inexistente.

  /** Lo que deja una revocación: la entrada de auditoría y el evento que escribe la línea de tiempo. */
  async function revocationTraces(sanctionId: string) {
    const audits = await db()
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.action, "sanction.revoked"), eq(auditLog.entityId, sanctionId)));
    const events = (
      await db()
        .select({ payload: outbox.payload })
        .from(outbox)
        .where(eq(outbox.eventType, "sanction.revoked"))
    ).filter((event) => event.payload.sanctionId === sanctionId);
    return { audits: audits.length, events: events.length };
  }

  async function sanctionedAndBystander() {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const gh = await seedPerson("gh@eafit.edu.co");
    await seedMembership(gh, termId);
    const sanctioned = await member("sancionada@eafit.edu.co", termId, a3);
    const bystander = await member("otra-ficha@eafit.edu.co", termId, a3);
    const actor = { personId: gh, ip: null };
    const { id } = await recordSanctionAs(
      actor,
      sanctioned,
      {
        termId,
        kind: "WARNING",
        cause: "Faltó a la reunión del 3 de septiembre sin excusa; en descargos reconoció la falta",
        occurredOn: todayKey(),
        committeeId: a3,
      },
      asAdmin,
    );
    return { actor, sanctioned, bystander, id };
  }

  it("una sanción no se revoca desde la ficha de otra persona: responde como inexistente y no escribe", async () => {
    const { actor, sanctioned, bystander, id } = await sanctionedAndBystander();
    const missing = { name: "DomainError", message: t("T-032") };

    await expect(
      revokeSanctionAs(actor, bystander, id, "Motivo escrito en la ficha de otra persona"),
    ).rejects.toMatchObject(missing);
    // La misma respuesta que da una sanción que no existe.
    await expect(
      revokeSanctionAs(
        actor,
        bystander,
        "sancion-que-no-existe",
        "Motivo de una sanción inventada",
      ),
    ).rejects.toMatchObject(missing);
    expect(await listSanctionsForPerson(sanctioned)).toMatchObject([
      { id, state: "LIVE", revokedAt: null, revokedById: null, revokeReason: null },
    ]);
    expect((await sanctionStateFor(sanctioned)).suspendedUntil).not.toBeNull();
    expect(await revocationTraces(id)).toEqual({ audits: 0, events: 0 });

    // Desde la ficha de la persona sancionada sí se revoca.
    await revokeSanctionAs(actor, sanctioned, id, "La junta aceptó la revisión de los descargos");
    expect(await listSanctionsForPerson(sanctioned)).toMatchObject([
      { id, state: "REVOKED", revokeReason: "La junta aceptó la revisión de los descargos" },
    ]);
    expect(await revocationTraces(id)).toEqual({ audits: 1, events: 1 });

    // Ya revocada, desde la ficha ajena sigue sin existir: no es un éxito silencioso.
    await expect(
      revokeSanctionAs(actor, bystander, id, "Segundo intento desde la ficha ajena"),
    ).rejects.toMatchObject(missing);
    expect((await listSanctionsForPerson(sanctioned))[0]?.revokeReason).toBe(
      "La junta aceptó la revisión de los descargos",
    );
    expect(await revocationTraces(id)).toEqual({ audits: 1, events: 1 });
  });

  it("revocar sin decir de quién es la sanción no compila, y una persona que no se reconoce responde como inexistente", async () => {
    const { actor, sanctioned, id } = await sanctionedAndBystander();

    // @ts-expect-error La persona es obligatoria (ADR-114 regla 3): la firma anterior no compila.
    const forgotten = revokeSanctionAs(actor, id, "La junta aceptó la revisión de los descargos");
    await expect(forgotten).rejects.toThrow();

    for (const nobody of [undefined, null, "", id]) {
      await expect(
        revokeSanctionAs(actor, nobody as unknown as string, id, "Motivo sin persona reconocible"),
      ).rejects.toMatchObject({ name: "DomainError", message: t("T-032") });
    }
    expect(await listSanctionsForPerson(sanctioned)).toMatchObject([
      { id, state: "LIVE", revokedAt: null, revokeReason: null },
    ]);
    expect(await revocationTraces(id)).toEqual({ audits: 0, events: 0 });
  });

  it("revocaciones simultáneas desde la ficha propia y desde una ajena dejan una sola, la de la propia", async () => {
    const { actor, sanctioned, bystander, id } = await sanctionedAndBystander();

    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        revokeSanctionAs(
          actor,
          index % 2 === 0 ? sanctioned : bystander,
          id,
          index % 2 === 0 ? `Revisión de la junta ${index}` : `Desde la ficha ajena ${index}`,
        ),
      ),
    );

    expect(attempts.filter((_, index) => index % 2 === 0).map((item) => item.status)).toEqual(
      Array.from({ length: 4 }, () => "fulfilled"),
    );
    for (const attempt of attempts.filter((_, index) => index % 2 === 1)) {
      expect(attempt).toMatchObject({
        status: "rejected",
        reason: { name: "DomainError", message: t("T-032") },
      });
    }
    const [view] = await listSanctionsForPerson(sanctioned);
    expect(view?.state).toBe("REVOKED");
    expect(view?.revokeReason).toMatch(/^Revisión de la junta [0246]$/);
    expect(await revocationTraces(id)).toEqual({ audits: 1, events: 1 });
  });
});
