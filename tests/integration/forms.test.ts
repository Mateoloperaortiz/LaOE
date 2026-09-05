import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";
import { interaction } from "@/modules/crm/schema";
import {
  createForm,
  findOpenProspectForm,
  findOpenRegistrationForm,
  getPublicForm,
  listRegistrationsByPerson,
  listSubmissions,
  listSubmissionsByPerson,
  setFormActions,
  setFormFields,
  submitFormAs,
} from "@/modules/forms";
import { editionRegistration, formSubmission } from "@/modules/forms/schema";
import { endMembershipAs, hasLiveConsent } from "@/modules/people";
import { consent, person, personTag, tag } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedForm, seedMember, seedSubmission, seedTerm } from "./factories";

// Formularios propios (ADR-013, ADR-037 reglas 3 a 5): envío público con vínculo por correo,
// consentimiento, acciones, honeypot, rate limit, una por correo, tope y ventana; borrado al salir.

const admin = { personId: null, ip: null };
const identity = { firstName: "Lu", lastName: "Gómez", email: "lu.gomez@eafit.edu.co" };
const fields = [
  { key: "motivo", label: "¿Por qué?", type: "TEXTAREA", required: true },
  { key: "phone", label: "Celular", type: "PHONE" },
  { key: "comite", label: "Comité", type: "SELECT", options: ["A3", "PIXEL"] },
];

async function publicForm(slug: string, overrides: Parameters<typeof seedForm>[1] = {}) {
  const id = await seedForm(slug, { fields, ...overrides });
  const view = await getPublicForm(slug);
  if (!view) throw new Error("form");
  return { id, view };
}

describe("envío de un formulario público", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crea la persona como prospecto, registra el consentimiento y etiqueta en una transacción", async () => {
    const [etiqueta] = await getDb().insert(tag).values({ name: "Convocatoria" }).returning();
    if (!etiqueta) throw new Error("tag");
    const { view } = await publicForm("admision", {
      actions: { createPerson: true, tagIds: [etiqueta.id] },
    });
    const result = await submitFormAs(null, view, {
      identity,
      answers: { motivo: "Quiero aportar", phone: "3001234567", comite: "A3" },
      consent: true,
      ip: "10.0.0.1",
      userAgent: "vitest",
    });
    expect(result.ok).toBe(true);
    const [who] = await getDb().select().from(person).where(eq(person.email, identity.email));
    expect(who).toMatchObject({ stage: "PROSPECT", source: "FORM", phone: "+573001234567" });
    if (!who) throw new Error("person");
    expect(await hasLiveConsent(who.id, "DATA_PROCESSING")).toBe(true);
    const [row] = await getDb().select().from(consent).where(eq(consent.personId, who.id));
    expect(row).toMatchObject({ source: "FORM", ip: "10.0.0.1" });
    expect(
      await getDb().select().from(personTag).where(eq(personTag.personId, who.id)),
    ).toHaveLength(1);
    const [stored] = await getDb().select().from(formSubmission);
    expect(stored).toMatchObject({
      personId: who.id,
      email: identity.email,
      answers: { motivo: "Quiero aportar", phone: "+573001234567", comite: "A3" },
      ip: "10.0.0.1",
    });
    expect(stored?.consentAcceptedAt).not.toBeNull();
    await drain(10);
    const timeline = await getDb()
      .select()
      .from(interaction)
      .where(eq(interaction.personId, who.id));
    expect(timeline.map((item) => item.kind)).toContain("FORM");
    expect(timeline.find((item) => item.kind === "FORM")?.summary).toBe(
      t("T-1046").split(" · ")[0]?.replace("{formulario}", "admision"),
    );
  });

  it("vincula a la persona existente sin tocarla y nunca crea miembros", async () => {
    const memberId = await seedMember("miembro@eafit.edu.co", { firstName: "Ana" });
    const { view } = await publicForm("avisame");
    const result = await submitFormAs(null, view, {
      identity: { firstName: "Otro", lastName: "Nombre", email: "MIEMBRO@eafit.edu.co" },
      answers: { motivo: "Avisame" },
      consent: true,
    });
    expect(result.ok).toBe(true);
    const [who] = await getDb().select().from(person).where(eq(person.id, memberId));
    expect(who).toMatchObject({ firstName: "Ana", stage: "MEMBER" });
    expect(await getDb().select().from(person)).toHaveLength(1);
    expect((await listSubmissionsByPerson(memberId))[0]?.email).toBe("miembro@eafit.edu.co");
  });

  it("el honeypot no guarda, el rate limit por IP corta y una respuesta por correo salvo allowMultiple", async () => {
    const { view } = await publicForm("admision");
    const trap = await submitFormAs(null, view, {
      identity,
      answers: { motivo: "bot" },
      consent: true,
      honeypot: "http://spam",
      ip: "10.0.0.2",
    });
    expect(trap).toMatchObject({ ok: true, honeypot: true, submissionId: null });
    expect(await getDb().select().from(formSubmission)).toHaveLength(0);
    for (let i = 0; i < 10; i += 1) {
      await seedSubmission(view.id, `otro${i}@gmail.com`, { ip: "10.0.0.3" });
    }
    const limited = await submitFormAs(null, view, {
      identity,
      answers: { motivo: "Quiero" },
      consent: true,
      ip: "10.0.0.3",
    });
    expect(limited).toMatchObject({ ok: false, code: "RATE_LIMITED" });
    const first = await submitFormAs(null, view, {
      identity,
      answers: { motivo: "Quiero" },
      consent: true,
      ip: "10.0.0.4",
    });
    expect(first.ok).toBe(true);
    const duplicate = await submitFormAs(null, view, {
      identity,
      answers: { motivo: "Otra vez" },
      consent: true,
      ip: "10.0.0.4",
    });
    expect(duplicate).toMatchObject({ ok: false, code: "DUPLICATE", errors: { email: "T-862" } });
    const { view: multiple } = await publicForm("encuesta", { allowMultiple: true });
    for (const _ of [1, 2]) {
      const again = await submitFormAs(null, multiple, {
        identity,
        answers: { motivo: "Sí" },
        consent: true,
        ip: "10.0.0.5",
      });
      expect(again.ok).toBe(true);
    }
    expect(
      (await listSubmissions({ formId: multiple.id, q: "", page: 1, pageSize: 10 })).total,
    ).toBe(2);
  });

  it("respeta consentimiento, obligatorios, tope y ventana", async () => {
    const { view } = await publicForm("admision", { maxSubmissions: 1 });
    const noConsent = await submitFormAs(null, view, {
      identity,
      answers: { motivo: "Quiero" },
      consent: false,
    });
    expect(noConsent).toMatchObject({ ok: false, code: "CONSENT", errors: { consent: "T-858" } });
    const invalid = await submitFormAs(null, view, {
      identity: { ...identity, email: "no-es-correo" },
      answers: { motivo: "", comite: "OTRO" },
      consent: true,
    });
    expect(invalid).toMatchObject({ ok: false, code: "INVALID" });
    if (!invalid.ok) {
      expect(invalid.errors).toEqual({ email: "T-854" });
    }
    const badAnswers = await submitFormAs(null, view, {
      identity,
      answers: { motivo: "", comite: "OTRO" },
      consent: true,
    });
    if (!badAnswers.ok) {
      expect(badAnswers.errors).toEqual({ motivo: "T-853", comite: "T-856" });
    }
    await seedSubmission(view.id, "lleno@gmail.com");
    const full = await submitFormAs(null, view, {
      identity,
      answers: { motivo: "Tarde" },
      consent: true,
    });
    expect(full).toMatchObject({ ok: false, code: "FULL" });
    const { view: closed } = await publicForm("cerrado", { status: "CLOSED" });
    expect(
      await submitFormAs(null, closed, { identity, answers: { motivo: "x" }, consent: true }),
    ).toMatchObject({
      ok: false,
      code: "CLOSED",
    });
    const { view: future } = await publicForm("futuro", {
      opensAt: new Date(Date.now() + 86_400_000),
    });
    expect(future.state).toBe("CLOSED");
  });

  it("un formulario de miembros toma la persona del actor y la inscribe a la edición", async () => {
    const termId = await seedTerm();
    const memberId = await seedMember("inscrita@eafit.edu.co");
    const { rows: none } = await getDb()
      .select()
      .from(person)
      .where(eq(person.id, memberId))
      .then((rows) => ({ rows }));
    expect(none).toHaveLength(1);
    const [edition] = await getDb()
      .execute<{ id: string }>(
        `insert into event (id, slug, name, summary, description, audience, publication_status, sort_order)
       values ('evt0000000000000000000001', 'dias-eafit', 'Días EAFIT', '', '', 'PUBLIC', 'PUBLISHED', 1)
       returning id`,
      )
      .then(() =>
        getDb().execute<{ id: string }>(
          `insert into event_edition (id, event_id, slug, name, starts_at, publication_status)
         values ('edi0000000000000000000001', 'evt0000000000000000000001', '2026-2', '2026-2', now() + interval '10 days', 'PUBLISHED')
         returning id`,
        ),
      )
      .then((result) => result.rows);
    if (!edition) throw new Error("edition");
    const { view } = await publicForm("inscripcion", {
      audience: "MEMBERS",
      fields: [],
      actions: { createPerson: true, editionId: edition.id },
    });
    expect((await findOpenRegistrationForm(edition.id))?.id).toBe(view.id);
    const actor = { personId: memberId, email: "inscrita@eafit.edu.co", firstName: "Ana" };
    const result = await submitFormAs(actor as never, view, { answers: {}, consent: false });
    expect(result).toMatchObject({ ok: true, registered: true });
    const registrations = await getDb().select().from(editionRegistration);
    expect(registrations).toHaveLength(1);
    expect(registrations[0]).toMatchObject({ editionId: edition.id, personId: memberId });
    expect((await listRegistrationsByPerson(memberId))[0]?.editionName).toBe("Días EAFIT · 2026-2");
    const again = await submitFormAs(actor as never, view, { answers: {}, consent: false });
    expect(again).toMatchObject({ ok: false, code: "DUPLICATE" });
    void termId;
  });

  it("salir de la OE borra las respuestas y la aprobación de la anonimización también", async () => {
    const memberId = await seedMember("saliente@eafit.edu.co");
    const { view } = await publicForm("encuesta");
    await seedSubmission(view.id, "saliente@eafit.edu.co", { personId: memberId });
    await endMembershipAs(admin, memberId, {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    });
    await drain(20);
    expect(await getDb().select().from(formSubmission)).toHaveLength(0);
  });
});

describe("constructor y apertura", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crea, guarda campos y acciones, y encuentra el formulario de prospecto abierto", async () => {
    const created = await runCommand(admin, (ctx) =>
      createForm(ctx, {
        slug: "avisame",
        title: "Avisame",
        description: "",
        audience: "PUBLIC",
        status: "OPEN",
        allowMultiple: false,
        consentRequired: true,
      }),
    );
    await expect(
      runCommand(admin, (ctx) =>
        createForm(ctx, {
          slug: "avisame",
          title: "Repetido",
          description: "",
          audience: "PUBLIC",
          status: "DRAFT",
          allowMultiple: false,
          consentRequired: true,
        }),
      ),
    ).rejects.toThrow(t("T-915"));
    await expect(
      runCommand(admin, (ctx) =>
        setFormFields(ctx, created.id, [
          { key: "a", label: "A", type: "TEXT" },
          { key: "a", label: "B", type: "TEXT" },
        ]),
      ),
    ).rejects.toThrow(t("T-926"));
    await runCommand(admin, (ctx) => setFormFields(ctx, created.id, fields));
    const actions = await runCommand(admin, (ctx) =>
      setFormActions(ctx, created.id, { createPerson: true }),
    );
    expect(actions).toEqual({ createPerson: true, tagIds: [] });
    expect((await findOpenProspectForm())?.id).toBe(created.id);
    const view = await getPublicForm("avisame");
    expect(view?.parsedFields).toHaveLength(3);
    expect(view?.state).toBe("OPEN");
    const [row] = await getDb()
      .select()
      .from(formSubmission)
      .where(and(eq(formSubmission.formId, created.id), eq(formSubmission.email, "x")));
    expect(row).toBeUndefined();
  });
});
