import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { adminAreaRoles } from "@/app/_authz/admin-area";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { markOnboardingStepAs } from "@/modules/crm";
import { onboardingProgress } from "@/modules/crm/schema";
import { getPublicForm, submitFormAs } from "@/modules/forms";
import { editionRegistration, formSubmission } from "@/modules/forms/schema";
import { issueCarnet } from "@/modules/identity/domain/carnet";
import { createSession, resolveActor } from "@/modules/identity/domain/session";
import { permission } from "@/modules/identity/schema";
import { checkInSelfAs, hostCheckInAs } from "@/modules/participation/domain/commands";
import { answerSurveyAs, createSurveyInvites } from "@/modules/participation/domain/surveys";
import { startWordleAs } from "@/modules/participation/domain/wordle";
import { occasion, occasionSurveyResponse, pointEntry } from "@/modules/participation/schema";
import { getPersonRecord } from "@/modules/people";
import { changeMembershipStatus } from "@/modules/people/domain/membership";
import { updateOwnContact } from "@/modules/people/domain/own-data";
import { person } from "@/modules/people/schema";
import { requireConfig } from "@/modules/system";
import { DomainError } from "@/shared/lib/errors";
import { truncateAll } from "./db";
import {
  leaveUntilSoon,
  seedCheckIn,
  seedCommittee,
  seedForm,
  seedMember,
  seedOccasion,
  seedTerm,
  seedWorkGroup,
} from "./factories";

const db = () => getDb();

async function onLeave(personId: string) {
  await runCommand(SYSTEM_ACTOR, (ctx) =>
    changeMembershipStatus(ctx, personId, {
      to: "ON_LEAVE",
      reason: "Licencia sintética",
      leaveUntil: leaveUntilSoon(),
    }),
  );
}

describe("consulta de Mi OE en licencia", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("mantiene sesión y datos propios, suspendiendo permisos y roles de grupo sin borrarlos", async () => {
    const personId = await seedMember("consulta@eafit.edu.co");
    const committeeId = await seedCommittee("prueba");
    const termId = await seedTerm();
    await db()
      .insert(permission)
      .values([
        { personId, code: "ADMIN" },
        { personId, code: "BOARD" },
        { personId, code: "COMMITTEE_LEADER", committeeId },
      ]);
    await seedWorkGroup(termId, "Grupo sintético", {
      leaderPersonId: personId,
      evaluatorIds: [personId],
    });
    const session = await createSession(db(), {
      personId,
      remember: false,
      ip: null,
      userAgent: null,
    });
    expect(await resolveActor(session.token)).toMatchObject({ isAdmin: true });
    await onLeave(personId);
    const actor = await resolveActor(session.token);
    expect(actor).toMatchObject({ membershipStatus: "ON_LEAVE", isAdmin: false, permissions: [] });
    if (!actor) throw new Error("Sin actor");
    expect(await adminAreaRoles(actor)).toMatchObject({
      any: false,
      committees: [],
      ledGroups: [],
      evaluatedGroups: [],
    });
    expect(await db().select().from(permission)).toHaveLength(3);
    await runCommand({ personId: actor.personId, ip: null }, (ctx) =>
      updateOwnContact(ctx, personId, { phone: "3001234567", personalEmail: "propia@example.com" }),
    );
    expect(await getPersonRecord(personId)).toMatchObject({
      phone: "+573001234567",
      personalEmail: "propia@example.com",
    });
    await expect(issueCarnet(personId)).rejects.toThrow();
    await db()
      .update(person)
      .set({ sessionsRevokedAt: new Date(Date.now() + 1000) })
      .where(eq(person.id, personId));
    expect(await resolveActor(session.token)).toBeNull();
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(ctx, personId, { to: "ACTIVE", reason: "Regresó" }),
    );
    expect(await resolveActor(session.token)).toBeNull();
  });

  it("rechaza asistencia propia y de anfitrión, Wordle y onboarding sin acreditar puntos", async () => {
    const personId = await seedMember("participacion@eafit.edu.co");
    const host = await seedMember("anfitrion@eafit.edu.co");
    const termId = await seedTerm();
    const target = await seedOccasion(termId);
    await onLeave(personId);
    expect(
      await checkInSelfAs({ personId, ip: null }, { publicId: target.publicId }),
    ).toMatchObject({
      ok: false,
      reason: "NOT_ELIGIBLE",
    });
    await expect(
      hostCheckInAs(
        { personId: host, ip: null },
        { occasionId: target.id, personId, personName: "Persona", source: "HOST" },
      ),
    ).rejects.toBeInstanceOf(DomainError);
    expect(await startWordleAs({ personId, ip: null })).toMatchObject({
      ok: false,
      reason: "NOT_ELIGIBLE",
    });
    const [step] = await requireConfig("onboarding.steps");
    if (!step) throw new Error("Sin pasos de onboarding");
    expect(await markOnboardingStepAs({ personId, ip: null }, termId, step.key)).toBe(false);
    expect(await db().select().from(onboardingProgress)).toHaveLength(0);
    expect(await db().select().from(pointEntry)).toHaveLength(0);
  });

  it("no envía formularios, ni con sesión ni por correo público, y no responde encuestas anteriores", async () => {
    const personId = await seedMember("formularios@eafit.edu.co");
    await seedForm("solo-miembros", { audience: "MEMBERS", consentRequired: false });
    await seedForm("publico-licencia", { audience: "PUBLIC", consentRequired: false });
    const formId = await seedForm("encuesta-licencia", {
      audience: "MEMBERS",
      consentRequired: false,
    });
    const termId = await seedTerm();
    const target = await seedOccasion(termId, { status: "CLOSED" });
    await db()
      .update(occasion)
      .set({ surveyFormId: formId, closedAt: new Date() })
      .where(eq(occasion.id, target.id));
    await seedCheckIn(target.id, personId, "APPROVED");
    const { created } = await createSurveyInvites(target.id);
    const token = created[0]?.token;
    if (!token) throw new Error("Sin invitación");
    await onLeave(personId);
    const actor = { personId, email: "formularios@eafit.edu.co", firstName: "Persona" };
    for (const slug of ["solo-miembros", "publico-licencia"]) {
      const view = await getPublicForm(slug);
      if (!view) throw new Error("Sin formulario");
      expect(
        await submitFormAs(actor, view, { answers: {}, consent: false, ip: null }),
      ).toMatchObject({
        ok: false,
        code: "INVALID",
      });
      if (view.audience === "PUBLIC") {
        expect(
          await submitFormAs(null, view, {
            identity: { firstName: "Persona", lastName: "Sintética", email: actor.email },
            answers: {},
            consent: false,
            ip: null,
          }),
        ).toMatchObject({ ok: false, code: "INVALID" });
      }
    }
    expect(await answerSurveyAs({ personId, ip: null }, token, {})).toMatchObject({
      ok: false,
      state: "NOT_FOUND",
    });
    expect(await db().select().from(formSubmission)).toHaveLength(0);
    expect(await db().select().from(editionRegistration)).toHaveLength(0);
    expect(await db().select().from(occasionSurveyResponse)).toHaveLength(0);
  });
});
