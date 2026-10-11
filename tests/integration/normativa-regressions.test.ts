import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { grantRecognitionAs, listRecognitionsFor } from "@/modules/crm/domain/recognitions";
import { requestEventApprovalAs } from "@/modules/finance/domain/commands";
import { createCommittee, updateCommittee } from "@/modules/people/domain/committees";
import { leadershipContext } from "@/modules/people/domain/inhabilities";
import { changeMembershipStatus } from "@/modules/people/domain/membership";
import { listTermRoster } from "@/modules/people/domain/people-reads";
import { listPreferentialSchedule } from "@/modules/people/domain/preferential-schedule";
import { setProbation } from "@/modules/people/domain/term-outcomes";
import { membership, membershipTerm } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembershipTerm,
  seedTerm,
} from "./factories";

describe("regresiones de la revisión normativa", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("el comando rechaza un comité en prueba sin fechas y una ampliación sin motivo", async () => {
    const input = { slug: "sintetico", name: "Comité sintético", status: "ON_TRIAL" as const };
    await expect(runCommand(SYSTEM_ACTOR, (ctx) => createCommittee(ctx, input))).rejects.toThrow(
      t("T-2327"),
    );
    const dated = { ...input, trialStartsOn: "2026-01-31", trialEndsOn: "2026-07-31" };
    const row = await runCommand(SYSTEM_ACTOR, (ctx) => createCommittee(ctx, dated));
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        updateCommittee(ctx, row.id, { ...dated, trialEndsOn: "2027-01-31" }),
      ),
    ).rejects.toThrow(t("T-2328"));
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updateCommittee(ctx, row.id, {
        ...dated,
        trialEndsOn: "2027-01-31",
        lifecycleReason: "Ampliación decidida por la junta",
      }),
    );
  });

  it("congela nuevo y prueba por comité al salir y los retoma al regresar sin cambiar el ingreso", async () => {
    const previous = await seedTerm("2026-1");
    const current = await seedTerm("2026-2");
    const personId = await seedMember("licencia-sintetica@eafit.edu.co", {
      entryTermCode: "2026-1",
    });
    const committeeId = await seedCommittee("sintetico");
    const transferred = await seedCommittee("transferencia-sintetica");
    await seedCommitteeMembership(personId, transferred, previous, "MIEMBRO", {
      transferredIn: true,
    });
    await seedCommitteeMembership(personId, transferred, current);
    await seedCommitteeMembership(personId, committeeId, current);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setProbation(ctx, personId, previous, {
        probation: true,
        committeeId,
        reason: "Condición al salir",
      }),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(
        ctx,
        personId,
        { to: "ON_LEAVE", reason: "Licencia sintética", leaveUntil: "2026-09-20" },
        new Date("2026-06-01T12:00:00Z"),
      ),
    );
    // Cambiar el histórico durante la licencia no cambia lo que llevaba al salir.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setProbation(ctx, personId, previous, {
        probation: false,
        committeeId,
        reason: "Edición posterior",
      }),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(
        ctx,
        personId,
        { to: "ACTIVE", reason: "Regreso sintético" },
        new Date("2026-09-13T12:00:00Z"),
      ),
    );
    const rows = await getDb()
      .select()
      .from(membershipTerm)
      .where(and(eq(membershipTerm.personId, personId), eq(membershipTerm.termId, current)));
    expect(rows.find((row) => row.committeeId === null)).toMatchObject({
      resumedNew: true,
      probation: false,
    });
    expect(rows.find((row) => row.committeeId === committeeId)).toMatchObject({ probation: true });
    expect(rows.find((row) => row.committeeId === transferred)).toMatchObject({
      resumedTransfer: true,
    });
    expect(
      (await listTermRoster(current)).find((row) => row.committeeId === committeeId),
    ).toMatchObject({
      resumedNew: true,
      committeeProbation: true,
      firstTermId: previous,
    });
    expect(await leadershipContext(getDb(), personId, current)).toMatchObject({ isNew: true });
    const [member] = await getDb()
      .select()
      .from(membership)
      .where(eq(membership.personId, personId));
    expect(member).toMatchObject({ firstTermId: previous, leaveCondition: null, leaveUntil: null });
  });

  it("la prueba bloquea reconocimientos, avales y horario preferencial; levantarla permite el beneficio", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("beneficio-sintetico@eafit.edu.co");
    const committeeId = await seedCommittee("sintetico");
    await seedAppointment(personId, termId, "PRESIDENT");
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setProbation(ctx, personId, termId, {
        committeeId,
        probation: true,
        reason: "Prueba sintética",
      }),
    );
    const award = {
      personId,
      termId,
      kind: "OE_AWARD" as const,
      award: "BEST_NEW_MEMBER" as const,
      title: "",
    };
    await expect(grantRecognitionAs(SYSTEM_ACTOR, award)).rejects.toThrow(t("T-2331"));
    await expect(
      requestEventApprovalAs(
        { personId, ip: null },
        { committeeId, title: "Evento sintético", eventOn: "2099-11-20" },
      ),
    ).rejects.toThrow(t("T-2331"));
    expect(await listPreferentialSchedule(termId)).toEqual([]);
    expect(await listRecognitionsFor(personId)).toEqual([]);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setProbation(ctx, personId, termId, {
        committeeId,
        probation: false,
        reason: "Prueba terminada",
      }),
    );
    await grantRecognitionAs(SYSTEM_ACTOR, award);
    expect(await listPreferentialSchedule(termId)).toHaveLength(1);
  });
  // ADR-123 regla 7: la prueba con la que alguien salió a licencia vive en la condición guardada y no
  // en una fila del semestre vigente. Sigue siendo prueba mientras no vuelva a activo (ADR-120 regla
  // 4), también para los otros tres beneficios de ADR-061 regla 2 (DT-299).
  describe("los beneficios de quien está en licencia", () => {
    /**
     * Sale a licencia en 2026-1, el semestre en que entró si no se dice otro, con o sin prueba, y
     * preside la junta del semestre vigente, en el que no tiene fila. El reloj se le pasa al comando.
     */
    async function onLeave(email: string, probation: boolean, entryTermCode = "2026-1") {
      const previo = await seedTerm("2026-1");
      const termId = await seedTerm();
      const personId = await seedMember(email, { entryTermCode });
      const committeeId = await seedCommittee("sintetico");
      await seedAppointment(personId, termId, "PRESIDENT");
      await seedMembershipTerm(personId, previo, probation);
      await runCommand(SYSTEM_ACTOR, (ctx) =>
        changeMembershipStatus(
          ctx,
          personId,
          { to: "ON_LEAVE", reason: "Intercambio", leaveUntil: "2027-06-01" },
          new Date("2026-06-01T15:00:00Z"),
        ),
      );
      const award = {
        personId,
        termId,
        kind: "OE_AWARD" as const,
        award: "BEST_NEW_MEMBER" as const,
        title: "",
      };
      const aval = { committeeId, title: "Evento sintético", eventOn: "2099-11-20" };
      return { termId, personId, award, aval };
    }

    it("con la prueba guardada no recibe un reconocimiento", async () => {
      const { personId, award } = await onLeave("premio-guardada@eafit.edu.co", true);

      await expect(grantRecognitionAs(SYSTEM_ACTOR, award)).rejects.toThrow(t("T-2331"));
      expect(await listRecognitionsFor(personId)).toEqual([]);
    });

    it("con la prueba guardada no pide un aval", async () => {
      const { personId, aval } = await onLeave("aval-guardada@eafit.edu.co", true);

      await expect(requestEventApprovalAs({ personId, ip: null }, aval)).rejects.toThrow(
        t("T-2331"),
      );
    });

    it("con la prueba guardada no figura en el horario preferencial", async () => {
      const { termId } = await onLeave("horario-guardada@eafit.edu.co", true);

      expect(await listPreferentialSchedule(termId)).toEqual([]);
    });

    // Conducta de hoy, sin elegir: si la licencia por sí sola suspende estos beneficios es la decisión
    // abierta 71. El reglamento (ADR-061 regla 2) habla de la prueba y de la suspensión, no de la licencia.
    it("sin prueba guardada recibe el reconocimiento, pide el aval y figura en el horario preferencial (decisión abierta 71)", async () => {
      const { termId, personId, award, aval } = await onLeave("licencia-sola@eafit.edu.co", false);

      await grantRecognitionAs(SYSTEM_ACTOR, award);
      await requestEventApprovalAs({ personId, ip: null }, aval);

      expect(await listRecognitionsFor(personId)).toHaveLength(1);
      expect((await listPreferentialSchedule(termId)).map((row) => row.personId)).toEqual([
        personId,
      ]);
    });

    // Conducta de hoy, sin elegir (ADR-123 regla 7): la prueba guardada es la condición de la persona
    // mientras no vuelva a activo y cuenta para cualquier semestre por el que se pregunte, como la
    // suspensión. La prueba de un activo es la fila de un semestre y cuenta solo para ese. Si las dos
    // deben medirse igual es la decisión abierta 72.
    it("con la prueba guardada tampoco recibe el reconocimiento de un semestre anterior a su prueba, que a un activo en prueba sí se le registra (decisión abierta 72)", async () => {
      const { termId, personId, award } = await onLeave(
        "premio-previo@eafit.edu.co",
        true,
        "2025-2",
      );
      const anterior = await seedTerm("2025-2");
      const activo = await seedMember("activo-en-prueba@eafit.edu.co", { entryTermCode: "2025-2" });
      await seedMembershipTerm(activo, termId, true);

      // En licencia con la prueba guardada: ni el del semestre vigente ni el de uno anterior a su prueba.
      await expect(
        grantRecognitionAs(SYSTEM_ACTOR, { ...award, termId: anterior }),
      ).rejects.toThrow(t("T-2331"));
      // Activo y en prueba en el semestre vigente: el del vigente no, el del anterior sí.
      await expect(
        grantRecognitionAs(SYSTEM_ACTOR, { ...award, personId: activo }),
      ).rejects.toThrow(t("T-2331"));
      await grantRecognitionAs(SYSTEM_ACTOR, { ...award, personId: activo, termId: anterior });

      expect(await listRecognitionsFor(personId)).toEqual([]);
      expect((await listRecognitionsFor(activo)).map((row) => row.termId)).toEqual([anterior]);
    });
  });
});
