import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { isCheckViolation, isUniqueViolation } from "@/db/errors";
import { runCommand } from "@/db/tx";
import { card, internalCallEntry, request } from "@/modules/crm/schema";
import { editionRegistration } from "@/modules/forms/schema";
import {
  addPersonTags,
  admitPersonAs,
  endMembershipAs,
  findOrCreatePersonFromForm,
  getMembershipRef,
  getMyMembership,
  hasLiveConsent,
} from "@/modules/people";
import { consent, membership, person, personTag, tag } from "@/modules/people/schema";
import { outbox } from "@/modules/system/schema";
import { ensureNextTerm, findTermByCode, getTerm, nextTermCode } from "@/modules/terms";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedCall,
  seedCallEntry,
  seedCard,
  seedCommittee,
  seedForm,
  seedMember,
  seedOrganization,
  seedPerson,
  seedPipeline,
  seedRequest,
  seedSubmission,
  seedTerm,
  seedWorkGroup,
} from "./factories";

// Fase 5, tramo 1 (ADR-037): restricciones del esquema 0007, "dar de alta" y el vínculo por correo.

const admin = { personId: null, ip: null };

async function pendingEvents(type: string): Promise<number> {
  const rows = await getDb()
    .select({ id: outbox.id })
    .from(outbox)
    .where(and(eq(outbox.eventType, type), isNull(outbox.processedAt)));
  return rows.length;
}

describe("restricciones del esquema 0007", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("una tarjeta tiene exactamente un sujeto", async () => {
    const { id, stages } = await seedPipeline("Admisión");
    const stage = stages[0]?.id ?? "";
    await expect(seedCard(id, stage, {})).rejects.toSatisfy((error) =>
      isCheckViolation(error, "card_one_subject"),
    );
    const personId = await seedPerson("postulante@eafit.edu.co");
    await expect(seedCard(id, stage, { personId })).resolves.toBeTruthy();
    const [row] = await getDb().select().from(card);
    expect(row?.closedAt).toBeNull();
  });

  it("una solicitud pendiente por persona y tipo; rechazar exige motivo", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("miembro@eafit.edu.co");
    await seedRequest(personId, termId, "LEAVE");
    await expect(seedRequest(personId, termId, "LEAVE")).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "request_pending_unique"),
    );
    await expect(seedRequest(personId, termId, "TRANSFER")).resolves.toBeTruthy();
    await expect(
      seedRequest(personId, termId, "RESIGNATION", { status: "REJECTED", reason: null }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "request_reason_when_rejected"));
    const rows = await getDb().select().from(request);
    expect(rows).toHaveLength(2);
  });

  it("un formulario por identificador, correos en minúsculas y organizaciones sin repetir", async () => {
    const formId = await seedForm("e2e-admision");
    await expect(seedForm("e2e-admision")).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "form_slug_unique"),
    );
    await expect(seedForm("Mayúsculas")).rejects.toSatisfy((error) =>
      isCheckViolation(error, "form_slug_format"),
    );
    await expect(seedSubmission(formId, "Ana@eafit.edu.co")).rejects.toSatisfy((error) =>
      isCheckViolation(error, "form_submission_email_lowercase"),
    );
    await expect(seedSubmission(formId, "ana@eafit.edu.co")).resolves.toBeTruthy();
    await seedOrganization("Bancolombia");
    await expect(seedOrganization("bancolombia")).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "organization_name_unique"),
    );
  });

  it("una inscripción por persona y convocatoria; una por edición y persona", async () => {
    const termId = await seedTerm();
    const groupId = await seedWorkGroup(termId, "GT Días EAFIT");
    const callId = await seedCall(termId, groupId, { capacity: 1 });
    const personId = await seedMember("gt@eafit.edu.co");
    await seedCallEntry(callId, personId);
    await expect(seedCallEntry(callId, personId, "WAITLISTED")).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "internal_call_entry_unique"),
    );
    const entries = await getDb().select().from(internalCallEntry);
    expect(entries).toHaveLength(1);
    expect(await getDb().select().from(editionRegistration)).toHaveLength(0);
  });
});

describe("dar de alta", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crea la membresía activa, los comités, el consentimiento y los eventos en una transacción", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const pixel = await seedCommittee("pixel", "PIXEL");
    const personId = await seedPerson("nueva@eafit.edu.co", { stage: "APPLICANT" });
    const result = await admitPersonAs(admin, personId, { termId, committeeIds: [a3, pixel] });
    expect(result.membershipId).toBeTruthy();
    const ref = await getMembershipRef(personId);
    expect(ref).toMatchObject({ status: "ACTIVE", firstTermId: termId });
    const [who] = await getDb().select().from(person).where(eq(person.id, personId));
    expect(who?.stage).toBe("MEMBER");
    const mine = await getMyMembership(personId);
    expect(mine?.committees.map((row) => row.committeeSlug).sort()).toEqual(["a3", "pixel"]);
    expect(mine?.isNew).toBe(true);
    expect(await hasLiveConsent(personId, "MEMBERSHIP")).toBe(true);
    expect(await pendingEvents("membership.changed")).toBe(1);
    expect(await pendingEvents("stage.changed")).toBe(1);
    const [admitted] = await getDb()
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(eq(outbox.eventType, "person.admitted"));
    expect(admitted?.payload).toMatchObject({
      personId,
      termId,
      email: "nueva@eafit.edu.co",
      committees: ["A3", "PIXEL"],
    });
  });

  it("rechaza a quien ya tiene membresía, a un contacto externo, a un correo externo y sin comités", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const member = await seedMember("activa@eafit.edu.co");
    await expect(admitPersonAs(admin, member, { termId, committeeIds: [a3] })).rejects.toThrow(
      "ya tiene membresía",
    );
    const external = await seedPerson("contacto@empresa.com", { kind: "EXTERNAL" });
    await expect(admitPersonAs(admin, external, { termId, committeeIds: [a3] })).rejects.toThrow(
      t("T-988"),
    );
    const gmail = await seedPerson("alguien@gmail.com");
    await expect(admitPersonAs(admin, gmail, { termId, committeeIds: [a3] })).rejects.toThrow(
      t("T-987"),
    );
    const retired = await seedMember("retirada@eafit.edu.co");
    await endMembershipAs(admin, retired, {
      endReason: "OTHER",
      memorialConsent: false,
      contactConsent: false,
    });
    await expect(admitPersonAs(admin, retired, { termId, committeeIds: [a3] })).rejects.toThrow(
      "ya tiene membresía",
    );
    const memberships = await getDb().select().from(membership);
    expect(memberships).toHaveLength(2);
  });
});

describe("vínculo por correo y etiquetas aditivas", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crea la persona como prospecto con fuente FORM una sola vez y no toca a la existente", async () => {
    const first = await runCommand(admin, (ctx) =>
      findOrCreatePersonFromForm(ctx, {
        email: "prospecto@gmail.com",
        firstName: "Lu",
        lastName: "Gómez",
        phone: "3001234567",
        program: "Diseño",
      }),
    );
    expect(first.created).toBe(true);
    expect(first.stage).toBe("PROSPECT");
    const again = await runCommand(admin, (ctx) =>
      findOrCreatePersonFromForm(ctx, {
        email: "prospecto@gmail.com",
        firstName: "Otro",
        lastName: "Nombre",
      }),
    );
    expect(again).toMatchObject({ id: first.id, created: false });
    const [who] = await getDb().select().from(person).where(eq(person.id, first.id));
    expect(who).toMatchObject({
      firstName: "Lu",
      source: "FORM",
      phone: "+573001234567",
      program: "Diseño",
    });
    const memberId = await seedMember("miembro@eafit.edu.co");
    const linked = await runCommand(admin, (ctx) =>
      findOrCreatePersonFromForm(ctx, {
        email: "miembro@eafit.edu.co",
        firstName: "X",
        lastName: "Y",
      }),
    );
    expect(linked).toMatchObject({ id: memberId, created: false, stage: "MEMBER" });
    expect(await getDb().select().from(person)).toHaveLength(2);
  });

  it("suma etiquetas sin quitar las que ya tiene y registra el consentimiento de tratamiento de datos", async () => {
    const personId = await seedPerson("etiquetada@eafit.edu.co");
    const [a] = await getDb().insert(tag).values({ name: "Convocatoria 2026-2" }).returning();
    const [b] = await getDb().insert(tag).values({ name: "Diseño" }).returning();
    if (!a || !b) throw new Error("tags");
    await runCommand(admin, (ctx) => addPersonTags(ctx, personId, [a.id]));
    const added = await runCommand(admin, (ctx) => addPersonTags(ctx, personId, [a.id, b.id]));
    expect(added).toBe(1);
    expect(
      await getDb().select().from(personTag).where(eq(personTag.personId, personId)),
    ).toHaveLength(2);
    const [row] = await getDb()
      .insert(consent)
      .values({ personId, purpose: "DATA_PROCESSING", source: "FORM", policyVersion: "pendiente" })
      .returning();
    expect(row?.purpose).toBe("DATA_PROCESSING");
    expect(await hasLiveConsent(personId, "DATA_PROCESSING")).toBe(true);
  });
});

describe("término siguiente", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("ensureNextTerm crea el siguiente con fechas convencionales una sola vez", async () => {
    const termId = await seedTerm("2030-1");
    const current = await getTerm(termId);
    if (!current) throw new Error("term");
    const first = await runCommand(admin, (ctx) => ensureNextTerm(ctx, current));
    expect(first).toMatchObject({ code: "2030-2", created: true });
    const second = await runCommand(admin, (ctx) => ensureNextTerm(ctx, current));
    expect(second).toMatchObject({ id: first.id, created: false });
    expect(nextTermCode("2030-2")).toBe("2031-1");
    expect((await findTermByCode("2030-2"))?.id).toBe(first.id);
  });
});
