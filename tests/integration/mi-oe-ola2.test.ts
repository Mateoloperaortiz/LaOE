import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  getPublicCredential,
  listTrajectory,
  publishCredentialAs,
  revokeCredentialAs,
} from "@/modules/crm";
import { deleteCredentialsFor } from "@/modules/crm/domain/credentials";
import {
  answerSurveyAs,
  createSurveyInvites,
  getSurveyInviteForActor,
  listPendingSurveys,
} from "@/modules/participation";
import { occasion, occasionSurveyInvite } from "@/modules/participation/schema";
import { listHandoverDocsFor, saveHandoverAs, verifyHandoverAs } from "@/modules/people";
import { DomainError } from "@/shared/lib/errors";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedCommitteeRole,
  seedForm,
  seedMember,
  seedOccasion,
  seedTerm,
} from "../factories";
import { truncateAll } from "./db";

// Mi OE en la ola 2: la encuesta que se abre por su id con la sesión (ADR-174), la trayectoria
// verificable (ADR-171) y el empalme entre semestres (ADR-172).

const actor = (personId: string) => ({ personId, ip: null });

beforeEach(truncateAll);
afterAll(() => closeDb());

describe("la encuesta por su id (ADR-174)", () => {
  async function invited(email: string) {
    const termId = await seedTerm();
    const personId = await seedMember(email);
    const formId = await seedForm("encuesta-id", {
      audience: "MEMBERS",
      fields: [{ key: "calif", label: "¿Cómo estuvo?", type: "RATING", required: true }],
      actions: { createPerson: false },
    });
    const { id } = await seedOccasion(termId, { title: "Taller de integración" });
    await getDb()
      .update(occasion)
      .set({ surveyFormId: formId, status: "CLOSED", closedAt: new Date() })
      .where(eq(occasion.id, id));
    await seedCheckIn(id, personId, "APPROVED");
    await createSurveyInvites(id);
    const [invite] = await getDb()
      .select({ id: occasionSurveyInvite.id })
      .from(occasionSurveyInvite)
      .where(eq(occasionSurveyInvite.personId, personId));
    if (!invite) throw new Error("no se creó la invitación");
    return { personId, inviteId: invite.id };
  }

  it("sale en las pendientes, se abre y se responde por su id, y después ya no está pendiente", async () => {
    const { personId, inviteId } = await invited("encuesta.id@eafit.edu.co");

    expect(await listPendingSurveys(personId)).toMatchObject([
      { inviteId, occasionTitle: "Taller de integración" },
    ]);
    expect(await getSurveyInviteForActor(personId, { inviteId })).toMatchObject({ state: "OPEN" });
    expect(await answerSurveyAs(actor(personId), { inviteId }, { calif: "5" })).toEqual({
      ok: true,
    });

    expect(await getSurveyInviteForActor(personId, { inviteId })).toMatchObject({
      state: "ANSWERED",
    });
    expect(await listPendingSurveys(personId)).toEqual([]);
  });

  it("la invitación de otra persona no se abre por su id", async () => {
    const { inviteId } = await invited("encuesta.duena@eafit.edu.co");
    const other = await seedMember("encuesta.otra@eafit.edu.co");

    expect(await getSurveyInviteForActor(other, { inviteId })).toEqual({ state: "NOT_FOUND" });
    expect(await answerSurveyAs(actor(other), { inviteId }, { calif: "1" })).toEqual({
      ok: false,
      state: "NOT_FOUND",
    });
  });
});

describe("la trayectoria verificable (ADR-171)", () => {
  async function member() {
    const termId = await seedTerm();
    const personId = await seedMember("trayectoria@eafit.edu.co");
    const committeeId = await seedCommittee("gemis-trayectoria", "GEMIS");
    const membershipId = await seedCommitteeMembership(personId, committeeId, termId);
    return { personId, membershipId };
  }

  it("lista lo propio sin publicar, publica, lo muestra en la página pública y lo revoca", async () => {
    const { personId, membershipId } = await member();

    const [item] = await listTrajectory(personId);
    expect(item).toMatchObject({ kind: "COMMITTEE", sourceId: membershipId, credential: null });
    expect(item?.title).toContain("GEMIS");

    const { publicId } = await publishCredentialAs(actor(personId), {
      kind: "COMMITTEE",
      sourceId: membershipId,
    });
    expect(await getPublicCredential(publicId)).toMatchObject({
      title: item?.title,
      revoked: false,
    });

    await revokeCredentialAs(actor(personId), publicId);
    expect(await getPublicCredential(publicId)).toMatchObject({ revoked: true });
    expect((await listTrajectory(personId))[0]?.credential).toBeNull();

    // Volver a publicarla conserva el mismo identificador.
    expect(
      await publishCredentialAs(actor(personId), { kind: "COMMITTEE", sourceId: membershipId }),
    ).toEqual({ publicId });
  });

  it("nadie publica lo de otra persona", async () => {
    const { membershipId } = await member();
    const other = await seedMember("trayectoria.otra@eafit.edu.co");

    await expect(
      publishCredentialAs(actor(other), { kind: "COMMITTEE", sourceId: membershipId }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("al anonimizar se borran sus credenciales y la página pública deja de existir", async () => {
    const { personId, membershipId } = await member();
    const { publicId } = await publishCredentialAs(actor(personId), {
      kind: "COMMITTEE",
      sourceId: membershipId,
    });

    expect(await deleteCredentialsFor(personId)).toBe(1);

    expect(await getPublicCredential(publicId)).toBeNull();
  });
});

describe("el empalme entre semestres (ADR-172)", () => {
  async function holder(email: string, roleCode: string) {
    const termId = await seedTerm();
    const personId = await seedMember(email);
    const committeeId = await seedCommittee("empalme-comite", "Comité del empalme");
    const membershipId = await seedCommitteeMembership(personId, committeeId, termId);
    await seedCommitteeRole(membershipId, roleCode);
    return { personId, committeeId };
  }

  it("quien tiene el cargo escribe, verifica y, si vuelve a editar, queda sin verificar", async () => {
    const { personId, committeeId } = await holder("empalme@eafit.edu.co", "GESTION_HUMANA");
    const ref = { committeeId, roleCode: "GESTION_HUMANA" };

    await saveHandoverAs(actor(personId), { ...ref, body: "Contactos y pendientes." });
    await verifyHandoverAs(actor(personId), ref);
    expect((await listHandoverDocsFor(personId))[0]).toMatchObject({
      body: "Contactos y pendientes.",
      canEdit: true,
    });
    expect((await listHandoverDocsFor(personId))[0]?.verifiedAt).toBeInstanceOf(Date);

    await saveHandoverAs(actor(personId), { ...ref, body: "Contactos, pendientes y claves." });
    expect((await listHandoverDocsFor(personId))[0]?.verifiedAt).toBeNull();
  });

  it("quien no tiene el cargo no lo edita", async () => {
    const { committeeId } = await holder("empalme.titular@eafit.edu.co", "GESTION_HUMANA");
    const other = await seedMember("empalme.otra@eafit.edu.co");

    await expect(
      saveHandoverAs(actor(other), { committeeId, roleCode: "GESTION_HUMANA", body: "Intento" }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
