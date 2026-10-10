import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { committeeMembership, membership, person } from "@/modules/people/schema";
import { listLeaderScores, scoreCriterionAs } from "@/modules/permanence";
import { leaderScore } from "@/modules/permanence/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedRule,
  seedTerm,
} from "./factories";

// DT-146 inciso (c), ADR-122 regla 2: el líder puntúa a quien está vivo en su comité en el término
// de la tabla. Antes el comando lo creía porque quien lo llamaba se lo declaraba (`inCommittee`);
// ahora lo lee él, en su transacción, y lo que declare quien llama no cuenta.

const names = { personName: "Persona Sintética", committeeName: "A3" };
const notInCommittee = t("T-776", { nombre: names.personName, comité: names.committeeName });

async function setup() {
  const previous = await seedTerm("2024-1");
  const termId = await seedTerm();
  const a3 = await seedCommittee("a3");
  const pixel = await seedCommittee("pixel");
  const ruleId = await seedRule(termId, "convivencia", {
    committeeId: a3,
    computation: "LEADER_SCORE",
    weight: 5,
    params: { mandatory: true },
  });
  return {
    previous,
    termId,
    a3,
    pixel,
    ruleId,
    leader: { personId: null, ip: null },
    ref: { termId, scope: "COMMITTEE" as const, committeeId: a3 },
  };
}

async function written(): Promise<{ scores: number; audits: number; events: number }> {
  const db = getDb();
  return {
    scores: (await db.select({ id: leaderScore.ruleId }).from(leaderScore)).length,
    audits: (await db.select({ id: auditLog.id }).from(auditLog)).length,
    events: (await db.select({ id: outbox.id }).from(outbox)).length,
  };
}

describe("el puntaje del líder comprueba que la persona sea de su comité", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("a una persona de otro comité no la puntúa, declare lo que declare quien llama, y no escribe nada", async () => {
    const f = await setup();
    const outsider = await seedMember("otro.comite@eafit.edu.co");
    await seedCommitteeMembership(outsider, f.pixel, f.termId);
    const before = await written();

    // El parámetro de antes: quien llamaba decía que la persona era del comité y el comando le creía.
    const declared = { ...names, inCommittee: true } as never;
    await expect(
      scoreCriterionAs(
        f.leader,
        f.ref,
        { ruleId: f.ruleId, personId: outsider, value: 5, note: "" },
        declared,
      ),
    ).rejects.toThrow(notInCommittee);

    expect(await written()).toEqual(before);
  });

  it("a quien ya salió del comité tampoco", async () => {
    const f = await setup();
    const gone = await seedMember("salio.comite@eafit.edu.co");
    const membershipId = await seedCommitteeMembership(gone, f.a3, f.termId);
    await getDb()
      .update(committeeMembership)
      .set({ leftAt: new Date("2026-03-01T15:00:00Z") })
      .where(eq(committeeMembership.id, membershipId));

    await expect(
      scoreCriterionAs(
        f.leader,
        f.ref,
        { ruleId: f.ruleId, personId: gone, value: 5, note: "" },
        names,
      ),
    ).rejects.toThrow(notInCommittee);

    expect(await listLeaderScores(f.termId, f.a3)).toEqual([]);
  });

  it("a quien fue anonimizado tampoco, aunque su pertenencia siga abierta: la regla es la del roster", async () => {
    const f = await setup();
    const erased = await seedMember("anonimizado.comite@eafit.edu.co");
    await seedCommitteeMembership(erased, f.a3, f.termId);
    await getDb()
      .update(person)
      .set({ anonymizedAt: new Date("2026-03-01T15:00:00Z") })
      .where(eq(person.id, erased));

    await expect(
      scoreCriterionAs(
        f.leader,
        f.ref,
        { ruleId: f.ruleId, personId: erased, value: 5, note: "" },
        names,
      ),
    ).rejects.toThrow(notInCommittee);

    expect(await listLeaderScores(f.termId, f.a3)).toEqual([]);
  });

  it("a quien tiene la membresía fuera del directorio, con la pertenencia todavía abierta, tampoco", async () => {
    const f = await setup();
    const inactive = await seedMember("inactivo.comite@eafit.edu.co");
    await seedCommitteeMembership(inactive, f.a3, f.termId);
    // La tercera condición del roster (ADR-122 regla 2): el estado de la membresía es del directorio.
    await getDb()
      .update(membership)
      .set({ status: "INACTIVE" })
      .where(eq(membership.personId, inactive));

    await expect(
      scoreCriterionAs(
        f.leader,
        f.ref,
        { ruleId: f.ruleId, personId: inactive, value: 5, note: "" },
        names,
      ),
    ).rejects.toThrow(notInCommittee);

    expect(await listLeaderScores(f.termId, f.a3)).toEqual([]);
  });

  it("a quien estuvo en el comité en otro término tampoco", async () => {
    const f = await setup();
    const before = await seedMember("antes.comite@eafit.edu.co");
    await seedCommitteeMembership(before, f.a3, f.previous);

    await expect(
      scoreCriterionAs(
        f.leader,
        f.ref,
        { ruleId: f.ruleId, personId: before, value: 5, note: "" },
        names,
      ),
    ).rejects.toThrow(notInCommittee);

    expect(await listLeaderScores(f.termId, f.a3)).toEqual([]);
  });

  it("a quien está vivo en el comité en el término de la tabla, el puntaje entra", async () => {
    const f = await setup();
    const member = await seedMember("miembro.comite@eafit.edu.co");
    await seedCommitteeMembership(member, f.a3, f.termId);

    await scoreCriterionAs(
      f.leader,
      f.ref,
      { ruleId: f.ruleId, personId: member, value: 5, note: "" },
      names,
    );

    expect(await listLeaderScores(f.termId, f.a3)).toMatchObject([{ personId: member, value: 5 }]);
  });
});
