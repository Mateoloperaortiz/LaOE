import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { setMailTransportsForTests } from "@/modules/comms";
import { createRequestAs } from "@/modules/crm";
import { request, task } from "@/modules/crm/schema";
import { createSubmission, getFormView, getPublicForm, submitFormAs } from "@/modules/forms";
import { editionRegistration, formSubmission } from "@/modules/forms/schema";
import { requestOtp, resolveActor, verifyOtp } from "@/modules/identity";
import { checkInSelfAs } from "@/modules/participation";
import { admitPersonAs, endMembershipAs, recordConsent, revokeConsentAs } from "@/modules/people";
import {
  committeeMembership,
  consent,
  membership,
  person,
  personTag,
} from "@/modules/people/schema";
import { getPrivacyPolicyState, PrivacyPolicyPendingError, requireConfig } from "@/modules/system";
import { appConfig, auditLog, outbox } from "@/modules/system/schema";
import {
  seedCommittee,
  seedConfig,
  seedForm,
  seedMember,
  seedOccasion,
  seedPermission,
  seedPerson,
  seedTerm,
} from "../factories";
import { truncateAll } from "./db";

const db = () => getDb();

async function setPolicy(version: string): Promise<void> {
  await seedConfig("privacy.policyVersion", version);
}

describe("política pendiente (ADR-039)", () => {
  beforeEach(truncateAll);
  afterEach(async () => {
    await setPolicy("prueba-v1");
    setMailTransportsForTests(undefined);
  });
  afterAll(closeDb);

  it.each([
    "SELF",
    "ADMIN",
    "IMPORT",
    "FORM",
  ] as const)("rechaza nuevas aceptaciones %s sin consentimiento, auditoría ni evento", async (source) => {
    const personId = await seedMember("politica@eafit.edu.co");
    await setPolicy("pendiente");
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        recordConsent(ctx, personId, { purpose: "MEMBERSHIP", source }),
      ),
    ).rejects.toBeInstanceOf(PrivacyPolicyPendingError);
    expect(await db().select().from(consent)).toHaveLength(0);
    expect(await db().select().from(auditLog)).toHaveLength(0);
    expect(await db().select().from(outbox)).toHaveLength(0);
  });

  it("lee el estado actual al escribir aunque la caché general tenga una versión anterior; permite revocar", async () => {
    const personId = await seedMember("cache.politica@eafit.edu.co");
    await requireConfig("privacy.policyVersion");
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      recordConsent(ctx, personId, { purpose: "MEMORIAL", source: "SELF" }),
    );
    await setPolicy("pendiente");
    expect(await getPrivacyPolicyState()).toEqual({ ready: false, version: "pendiente" });
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        recordConsent(ctx, personId, { purpose: "DIRECTORY_PHOTO", source: "SELF" }),
      ),
    ).rejects.toBeInstanceOf(PrivacyPolicyPendingError);
    await revokeConsentAs(SYSTEM_ACTOR, personId, "MEMORIAL");
    expect((await db().select().from(consent))[0]?.revokedAt).toBeInstanceOf(Date);
    await setPolicy("prueba-v2");
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      recordConsent(ctx, personId, { purpose: "MEMORIAL", source: "SELF" }),
    );
    expect(
      (await db().select().from(consent)).some(
        (row) => row.policyVersion === "prueba-v2" && !row.revokedAt,
      ),
    ).toBe(true);
  });

  it("una clave ausente falla cerrada", async () => {
    const personId = await seedMember("sin.version@eafit.edu.co");
    await db().delete(appConfig).where(eq(appConfig.key, "privacy.policyVersion"));
    expect(await getPrivacyPolicyState()).toEqual({ ready: false, version: null });
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        recordConsent(ctx, personId, { purpose: "MEMORIAL", source: "SELF" }),
      ),
    ).rejects.toBeInstanceOf(PrivacyPolicyPendingError);
  });

  it("revierte la persona y los efectos de un formulario público, también sin persona vinculada", async () => {
    await seedForm("politica-publica");
    const form = await getPublicForm("politica-publica");
    if (!form) throw new Error("formulario de prueba");
    await setPolicy("pendiente");
    expect(
      await submitFormAs(null, form, {
        identity: { firstName: "Persona", lastName: "Prueba", email: "nuevo@eafit.edu.co" },
        answers: {},
        consent: true,
        ip: null,
      }),
    ).toMatchObject({ ok: false, code: "POLICY_PENDING" });
    for (const table of [
      person,
      consent,
      formSubmission,
      personTag,
      editionRegistration,
      auditLog,
      outbox,
    ]) {
      expect(await db().select().from(table)).toHaveLength(0);
    }
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        createSubmission(ctx, {
          form,
          personId: null,
          email: "externo@example.com",
          answers: {},
          consentAcceptedAt: new Date(),
        }),
      ),
    ).rejects.toBeInstanceOf(PrivacyPolicyPendingError);
    expect(await db().select().from(formSubmission)).toHaveLength(0);
    await setPolicy("prueba-v2");
    expect(
      await submitFormAs(null, form, {
        identity: { firstName: "Persona", lastName: "Prueba", email: "nuevo@eafit.edu.co" },
        answers: {},
        consent: true,
        ip: null,
      }),
    ).toMatchObject({ ok: true });
    expect((await db().select().from(formSubmission))[0]?.policyVersion).toBe("prueba-v2");
    expect((await db().select().from(consent))[0]?.policyVersion).toBe("prueba-v2");
  });

  it("un formulario interno sin consentimiento sigue abierto, y uno que lo exige no se puede omitir desde otro comando", async () => {
    const personId = await seedMember("form.interno@eafit.edu.co");
    const actor = { personId, email: "form.interno@eafit.edu.co", firstName: "Persona", ip: null };
    await seedForm("sin-consentimiento", { audience: "MEMBERS", consentRequired: false });
    const requiredId = await seedForm("con-consentimiento", {
      audience: "MEMBERS",
      consentRequired: true,
    });
    const form = await getPublicForm("sin-consentimiento");
    const required = await getFormView(requiredId);
    if (!form || !required) throw new Error("formulario de prueba");
    await setPolicy("pendiente");
    expect(
      await submitFormAs(actor, form, { answers: {}, consent: false, ip: null }),
    ).toMatchObject({
      ok: true,
    });
    await expect(
      runCommand(actor, (ctx) =>
        createSubmission(ctx, {
          form: { ...required, consentRequired: false },
          personId,
          email: actor.email,
          answers: {},
          consentAcceptedAt: null,
        }),
      ),
    ).rejects.toBeInstanceOf(PrivacyPolicyPendingError);
    expect(await db().select().from(formSubmission)).toHaveLength(1);
    expect(await db().select().from(consent)).toHaveLength(0);
  });

  it("alta individual pendiente no crea membresía ni comités", async () => {
    const personId = await seedPerson("alta.pendiente@eafit.edu.co", { stage: "PROSPECT" });
    const termId = await seedTerm();
    const committeeId = await seedCommittee("politica");
    await setPolicy("pendiente");
    await expect(
      admitPersonAs(SYSTEM_ACTOR, personId, { termId, committeeIds: [committeeId] }),
    ).rejects.toBeInstanceOf(PrivacyPolicyPendingError);
    expect(await db().select().from(membership)).toHaveLength(0);
    expect(await db().select().from(committeeMembership)).toHaveLength(0);
    expect((await db().select().from(person))[0]?.stage).toBe("PROSPECT");
  });

  it("rechaza capturar autorización al pedir retiro; permite pedirlo y ejecutarlo sin nuevas autorizaciones", async () => {
    const personId = await seedMember("retiro.politica@eafit.edu.co");
    await setPolicy("pendiente");
    await expect(
      createRequestAs({ personId, ip: null }, "RESIGNATION", {
        reason: "Retiro de prueba",
        memorialConsent: true,
        contactConsent: false,
      }),
    ).rejects.toBeInstanceOf(PrivacyPolicyPendingError);
    expect(await db().select().from(request)).toHaveLength(0);
    expect(await db().select().from(task)).toHaveLength(0);
    await createRequestAs({ personId, ip: null }, "RESIGNATION", {
      reason: "Retiro de prueba",
      memorialConsent: false,
      contactConsent: false,
    });
    await expect(
      endMembershipAs(SYSTEM_ACTOR, personId, {
        endReason: "RESIGNATION",
        memorialConsent: true,
        contactConsent: false,
      }),
    ).rejects.toBeInstanceOf(PrivacyPolicyPendingError);
    expect((await db().select().from(membership))[0]?.status).toBe("ACTIVE");
    expect(
      await endMembershipAs(SYSTEM_ACTOR, personId, {
        endReason: "RESIGNATION",
        memorialConsent: false,
        contactConsent: false,
      }),
    ).toBe(true);
  });

  it("permite OTP, sesión ADMIN y check-in sin consentimiento durante el arranque", async () => {
    const email = "arranque.politica@eafit.edu.co";
    const personId = await seedMember(email);
    const termId = await seedTerm();
    const occasion = await seedOccasion(termId);
    await seedPermission(personId, "ADMIN");
    setMailTransportsForTests({
      primary: { name: "console", send: async () => ({ id: null }) },
      overflow: null,
    });
    await setPolicy("pendiente");
    await requestOtp({ email, ip: null });
    const login = await verifyOtp({
      email,
      code: process.env.OTP_FIXED_CODE ?? "123456",
      ip: null,
      userAgent: null,
      remember: false,
    });
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    expect(await resolveActor(login.token)).toMatchObject({ personId, isAdmin: true });
    expect(
      await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId }),
    ).toMatchObject({
      ok: true,
    });
    expect(await db().select().from(consent)).toHaveLength(0);
  });
});
