import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  decideCandidacyAs,
  myCandidacies,
  pendingCandidacies,
  requestCandidacyAs,
  setCommitteeMembershipsAs,
} from "@/modules/people";
import { candidacyApproval } from "@/modules/people/schema";
import { outbox } from "@/modules/system/schema";
import { seedAppointment, seedCommittee, seedMember, seedTerm } from "../factories";
import { ghActor } from "../helpers/gh";
import { truncateAll } from "./db";

async function setup() {
  const termId = await seedTerm();
  const committeeId = await seedCommittee("teatro", "Teatro");
  const personId = await seedMember("postulante@eafit.edu.co");
  const actor = { personId, ip: null };
  const input = { termId, committeeId, roleCode: "LOGISTICA" };
  return { actor, input };
}

describe("aval de postulación a la mesa", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);
  it("la decisión de GH habilita solo el cargo, el comité y el semestre solicitados", async () => {
    const { actor, input } = await setup();
    const gh = await ghActor();
    const request = () => requestCandidacyAs(actor, input);
    const [a, b] = await Promise.all([request(), request()]);
    expect(a.id).toBe(b.id);
    const name = (committeeId: string, roleCode: string) =>
      setCommitteeMembershipsAs(
        { personId: null, ip: null },
        actor.personId,
        input.termId,
        [{ committeeId, roles: [{ roleCode, coDirector: false }] }],
        { reason: "Excepción administrativa" },
      );
    expect((await pendingCandidacies()).map((r) => r.id)).toContain(a.id);
    await expect(name(input.committeeId, "LOGISTICA")).rejects.toThrow();
    await expect(decideCandidacyAs(actor, a.id, { decision: "APPROVED" })).rejects.toThrow();
    await expect(
      decideCandidacyAs(gh, a.id, { decision: "REJECTED", note: " " }),
    ).rejects.toThrow();
    await decideCandidacyAs(gh, a.id, { decision: "APPROVED" });
    await expect(name(input.committeeId, "LOGISTICA")).resolves.toBeUndefined();
    await expect(name(input.committeeId, "GENERAL")).rejects.toThrow();
    const other = await seedCommittee("cine", "Cine");
    await expect(name(other, "LOGISTICA")).rejects.toThrow();
    const [row] = await getDb()
      .select()
      .from(candidacyApproval)
      .where(eq(candidacyApproval.id, a.id));
    expect(row).toMatchObject({
      status: "APPROVED",
      decidedById: gh.personId,
      decidedAs: "HOLDER",
    });
    expect((await myCandidacies(actor.personId)).history[0]?.status).toBe("APPROVED");
    const notices = await getDb()
      .select({ p: outbox.payload })
      .from(outbox)
      .where(eq(outbox.eventType, "notification.requested"));
    expect(notices.map((r) => r.p)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipients: [{ personId: gh.personId }],
          dedupeKey: `postulacion-pedida:${a.id}`,
        }),
        expect.objectContaining({
          recipients: [{ personId: actor.personId }],
          dedupeKey: `postulacion-decidida:${a.id}`,
        }),
      ]),
    );
  });
  it("la Presidencia suple la vacante y una postulación rechazada puede presentarse de nuevo", async () => {
    const { actor, input } = await setup();
    const president = await seedMember("presidencia.prueba@eafit.edu.co");
    await seedAppointment(president, input.termId, "PRESIDENT");
    const { id } = await requestCandidacyAs(actor, input);
    await decideCandidacyAs({ personId: president, ip: null }, id, {
      decision: "REJECTED",
      note: "Revisar la postulación",
    });
    await expect(
      decideCandidacyAs({ personId: president, ip: null }, id, { decision: "APPROVED" }),
    ).rejects.toThrow();
    expect((await myCandidacies(actor.personId)).history[0]).toMatchObject({
      decidedAs: "PRESIDENCY",
      decisionNote: "Revisar la postulación",
    });
    expect((await requestCandidacyAs(actor, input)).id).not.toBe(id);
  });
});
