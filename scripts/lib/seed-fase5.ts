import { and, eq, sql } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { requestKindLabel, templateStages } from "@/modules/crm";
import {
  card,
  internalCall,
  internalCallEntry,
  organization,
  organizationContact,
  pipeline,
  pipelineStage,
  request,
  task,
} from "@/modules/crm/schema";
import { event, eventEdition } from "@/modules/events/schema";
import { editionRegistration, form, formSubmission } from "@/modules/forms/schema";
import { person } from "@/modules/people/schema";
import { workGroup, workGroupMembership } from "@/modules/permanence/schema";
import { t, tList } from "@/shared/copy";
import { addBusinessDays } from "@/shared/lib/dates";

// Datos sintéticos de la fase 5 (ADR-037): formularios, pipeline de admisión con tarjetas, organizaciones
// con contactos externos y un pipeline de patrocinio por edición, solicitudes y convocatorias. Todo
// "de prueba": correos oe.demo.*@eafit.edu.co para estudiantes y oe.demo.*@example.com para contactos
// externos. Idempotente por slug, nombre o título; nunca corre en producción (lo verifica seed.ts).

type Db = ReturnType<typeof getDb>;

const DAY = 24 * 60 * 60_000;

interface Stage {
  id: string;
  name: string;
  isWon: boolean;
  isLost: boolean;
}

interface Pipe {
  id: string;
  stages: Stage[];
}

interface PersonRef {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

async function personByEmail(db: Db, email: string): Promise<PersonRef | null> {
  const [who] = await db
    .select({
      id: person.id,
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
    })
    .from(person)
    .where(eq(person.email, email))
    .limit(1);
  return who ?? null;
}

const PROGRAMS = ["Ingeniería de Sistemas", "Derecho", "Diseño", "Economía"];

function demoEmail(n: number): string {
  return `oe.demo.${String(n).padStart(2, "0")}@eafit.edu.co`;
}

async function seedPipeline(
  db: Db,
  admin: string,
  name: string,
  kind: "ADMISSION" | "SPONSORSHIP",
  names: string[],
): Promise<Pipe> {
  const [found] = await db
    .select({ id: pipeline.id })
    .from(pipeline)
    .where(eq(pipeline.name, name))
    .limit(1);
  let pipelineId = found?.id;
  if (!pipelineId) {
    const [created] = await db
      .insert(pipeline)
      .values({ name, kind, createdById: admin })
      .returning({ id: pipeline.id });
    if (!created) throw new Error("No se pudo crear el pipeline");
    pipelineId = created.id;
    const stages = templateStages(kind, names).map((stage) => ({
      ...stage,
      pipelineId: created.id,
    }));
    await db.insert(pipelineStage).values(stages);
  }
  const stages = await db
    .select({
      id: pipelineStage.id,
      name: pipelineStage.name,
      isWon: pipelineStage.isWon,
      isLost: pipelineStage.isLost,
    })
    .from(pipelineStage)
    .where(eq(pipelineStage.pipelineId, pipelineId))
    .orderBy(pipelineStage.sortOrder);
  return { id: pipelineId, stages };
}

interface FormSeed {
  slug: string;
  title: string;
  description: string;
  audience: "PUBLIC" | "MEMBERS";
  thanks?: string;
  fields: unknown[];
  actions: Record<string, unknown>;
}

async function seedForm(db: Db, admin: string, input: FormSeed): Promise<string> {
  const values = {
    slug: input.slug,
    title: input.title,
    description: input.description,
    audience: input.audience,
    status: "OPEN" as const,
    thanks: input.thanks ?? null,
    fields: input.fields,
    actions: input.actions,
    createdById: admin,
  };
  const [row] = await db
    .insert(form)
    .values(values)
    .onConflictDoUpdate({
      target: form.slug,
      set: { title: values.title, fields: values.fields, actions: values.actions, status: "OPEN" },
    })
    .returning({ id: form.id });
  if (!row) throw new Error("No se pudo crear el formulario");
  return row.id;
}

async function seedSubmission(
  db: Db,
  formId: string,
  who: PersonRef,
  answers: Record<string, unknown>,
  daysAgo: number,
): Promise<string> {
  const [existing] = await db
    .select({ id: formSubmission.id })
    .from(formSubmission)
    .where(and(eq(formSubmission.formId, formId), eq(formSubmission.email, who.email)))
    .limit(1);
  if (existing) return existing.id;
  const at = new Date(Date.now() - daysAgo * DAY);
  const [row] = await db
    .insert(formSubmission)
    .values({
      formId,
      personId: who.id,
      email: who.email,
      firstName: who.firstName,
      lastName: who.lastName,
      answers,
      consentAcceptedAt: at,
      policyVersion: "pendiente",
      ip: "127.0.0.1",
      createdAt: at,
    })
    .returning({ id: formSubmission.id });
  if (!row) throw new Error("No se pudo crear la respuesta");
  return row.id;
}

async function upsertPerson(
  db: Db,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    kind: "STUDENT" | "EXTERNAL";
    stage: "PROSPECT" | "APPLICANT";
    program?: string | undefined;
  },
): Promise<PersonRef> {
  const [row] = await db
    .insert(person)
    .values({
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      kind: input.kind,
      stage: input.stage,
      program: input.program ?? null,
      source: "SEED",
    })
    .onConflictDoUpdate({ target: person.email, set: { firstName: input.firstName } })
    .returning({
      id: person.id,
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
    });
  if (!row) throw new Error("No se pudo crear la persona");
  return row;
}

async function upsertCard(
  db: Db,
  pipe: Pipe,
  stage: Stage,
  values: {
    title: string;
    personId?: string | undefined;
    organizationId?: string | undefined;
    submissionId?: string | undefined;
    editionId?: string | undefined;
    ownerId?: string | undefined;
    amount?: number | undefined;
    fields?: Record<string, unknown> | undefined;
    daysAgo: number;
  },
): Promise<void> {
  const subject = values.personId
    ? eq(card.personId, values.personId)
    : values.organizationId
      ? eq(card.organizationId, values.organizationId)
      : sql`false`;
  const [existing] = await db
    .select({ id: card.id })
    .from(card)
    .where(and(eq(card.pipelineId, pipe.id), subject))
    .limit(1);
  if (existing) return;
  const at = new Date(Date.now() - values.daysAgo * DAY);
  await db.insert(card).values({
    pipelineId: pipe.id,
    stageId: stage.id,
    personId: values.personId ?? null,
    organizationId: values.organizationId ?? null,
    submissionId: values.submissionId ?? null,
    editionId: values.editionId ?? null,
    ownerId: values.ownerId ?? null,
    title: values.title,
    fields: values.fields ?? {},
    amount: values.amount ?? null,
    enteredStageAt: at,
    closedAt: stage.isWon || stage.isLost ? at : null,
    createdAt: at,
  });
}

// Postulantes y prospectos sintéticos: respuesta al formulario público y tarjeta en el pipeline.
async function seedAdmission(
  db: Db,
  admin: string,
  admission: Pipe,
  postulacionId: string,
  prospectoId: string,
): Promise<void> {
  const [recibida, entrevista, admitida, , noAdmitida] = admission.stages;
  if (!recibida || !entrevista || !admitida || !noAdmitida) throw new Error("faltan etapas");
  const applicants: Array<{ n: number; stage: Stage; daysAgo: number }> = [
    { n: 1, stage: recibida, daysAgo: 1 },
    { n: 2, stage: recibida, daysAgo: 2 },
    { n: 3, stage: recibida, daysAgo: 4 },
    { n: 4, stage: entrevista, daysAgo: 6 },
    { n: 5, stage: entrevista, daysAgo: 8 },
    { n: 6, stage: admitida, daysAgo: 12 },
    { n: 7, stage: noAdmitida, daysAgo: 20 },
  ];
  const names: Array<[string, string]> = [
    ["Valeria", "Zuluaga"],
    ["Samuel", "Vélez"],
    ["Laura", "Montoya"],
    ["Andrés", "Correa"],
    ["Manuela", "Bedoya"],
    ["Santiago", "Ríos"],
    ["Juliana", "Salazar"],
  ];
  for (const item of applicants) {
    const [firstName, lastName] = names[item.n - 1] ?? ["Persona", "Sintética"];
    const who = await upsertPerson(db, {
      email: `oe.demo.aspirante.${String(item.n).padStart(2, "0")}@eafit.edu.co`,
      firstName,
      lastName,
      kind: "STUDENT",
      stage: "APPLICANT",
      program: PROGRAMS[item.n % 4] ?? "Derecho",
    });
    const submissionId = await seedSubmission(
      db,
      postulacionId,
      who,
      {
        phone: `30098765${String(item.n).padStart(2, "0")}`,
        program: PROGRAMS[item.n % 4] ?? "Derecho",
        motivacion:
          "Quiero aportar a los eventos de la universidad y conocer gente (dato sintético).",
        como_supiste: ["Redes sociales", "Un amigo", "Días EAFIT", "Otro"][item.n % 4],
      },
      item.daysAgo,
    );
    await upsertCard(db, admission, item.stage, {
      title: `${who.firstName} ${who.lastName}`,
      personId: who.id,
      submissionId,
      ownerId: item.stage === entrevista ? admin : undefined,
      daysAgo: item.daysAgo,
    });
  }
  // Dos prospectos que solo pidieron información.
  for (const n of [1, 2]) {
    const who = await upsertPerson(db, {
      email: `oe.demo.prospecto.${String(n).padStart(2, "0")}@eafit.edu.co`,
      firstName: n === 1 ? "Carolina" : "Esteban",
      lastName: n === 1 ? "Ochoa" : "Vargas",
      kind: "STUDENT",
      stage: "PROSPECT",
    });
    await seedSubmission(
      db,
      prospectoId,
      who,
      { interes: n === 1 ? ["Eventos", "Voluntariado"] : ["Eventos"] },
      n * 3,
    );
  }
}

// Inscritos sintéticos a la edición de prueba de Días EAFIT desde el formulario de miembros.
async function seedRegistrations(db: Db, formId: string, editionId: string): Promise<void> {
  for (const n of [1, 4, 8, 15, 19]) {
    const who = await personByEmail(db, demoEmail(n));
    if (!who) continue;
    const submissionId = await seedSubmission(
      db,
      formId,
      who,
      { turno: n % 2 === 0 ? "Mañana" : "Tarde", restricciones: "" },
      n % 5,
    );
    await db
      .insert(editionRegistration)
      .values({ editionId, personId: who.id, submissionId })
      .onConflictDoNothing();
  }
}

// Organizaciones aliadas de prueba con contactos externos y tarjetas de patrocinio por edición.
async function seedOrganizations(
  db: Db,
  admin: string,
  sponsorship: Pipe,
  editionId: string | null,
): Promise<void> {
  const [contacto, propuesta, negociacion, cerrado] = sponsorship.stages;
  if (!contacto || !propuesta || !negociacion || !cerrado) throw new Error("faltan etapas");
  const rows: Array<{
    name: string;
    kind: "COMPANY" | "EAFIT_UNIT" | "STUDENT_GROUP";
    website: string | null;
    notes: string;
    contacts: Array<{ n: number; firstName: string; lastName: string; role: string }>;
    stage: Stage;
    amount: number | null;
    counterpart: string | null;
    daysAgo: number;
  }> = [
    {
      name: "Empresa de prueba S.A.S.",
      kind: "COMPANY",
      website: "https://example.com",
      notes: "Aliado **sintético** para revisar el detalle de una organización en local.",
      contacts: [
        { n: 1, firstName: "Patricia", lastName: "Gómez", role: "Gerente de mercadeo" },
        { n: 2, firstName: "Jorge", lastName: "Álvarez", role: "Analista" },
      ],
      stage: negociacion,
      amount: 2_500_000,
      counterpart: "Logo en la camiseta y mención en redes",
      daysAgo: 5,
    },
    {
      name: "Unidad EAFIT de prueba",
      kind: "EAFIT_UNIT",
      website: null,
      notes: "Dependencia de la universidad, sintética.",
      contacts: [{ n: 3, firstName: "Marta", lastName: "Suárez", role: "Coordinadora" }],
      stage: cerrado,
      amount: 800_000,
      counterpart: "Préstamo del auditorio",
      daysAgo: 15,
    },
    {
      name: "Grupo estudiantil de prueba",
      kind: "STUDENT_GROUP",
      website: null,
      notes: "",
      contacts: [{ n: 4, firstName: "Diego", lastName: "Pérez", role: "Representante" }],
      stage: contacto,
      amount: null,
      counterpart: null,
      daysAgo: 1,
    },
  ];
  for (const item of rows) {
    const [found] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(sql`lower(${organization.name}) = lower(${item.name})`)
      .limit(1);
    const [own] = found
      ? [found]
      : await db
          .insert(organization)
          .values({
            name: item.name,
            kind: item.kind,
            website: item.website,
            notes: item.notes,
            createdById: admin,
          })
          .returning({ id: organization.id });
    if (!own) continue;
    for (const [index, contact] of item.contacts.entries()) {
      const who = await upsertPerson(db, {
        email: `oe.demo.aliado.${String(contact.n).padStart(2, "0")}@example.com`,
        firstName: contact.firstName,
        lastName: contact.lastName,
        kind: "EXTERNAL",
        stage: "PROSPECT",
      });
      await db
        .insert(organizationContact)
        .values({
          organizationId: own.id,
          personId: who.id,
          role: contact.role,
          isPrimary: index === 0,
        })
        .onConflictDoNothing();
    }
    await upsertCard(db, sponsorship, item.stage, {
      title: editionId ? `${item.name} · Días EAFIT` : item.name,
      organizationId: own.id,
      editionId: editionId ?? undefined,
      ownerId: admin,
      amount: item.amount ?? undefined,
      fields: item.counterpart ? { counterpart: item.counterpart } : {},
      daysAgo: item.daysAgo,
    });
  }
}

// Tareas sintéticas para el tablero: una del admin sobre la empresa aliada y una vencida de otra persona
// sobre un postulante en entrevista.
async function seedTasks(db: Db, admin: string): Promise<void> {
  const [company] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.name, "Empresa de prueba S.A.S."))
    .limit(1);
  const applicant = await personByEmail(db, "oe.demo.aspirante.04@eafit.edu.co");
  const vpGh = await personByEmail(db, demoEmail(2));
  const rows: Array<{
    title: string;
    assigneeId: string | null;
    dueInDays: number;
    personId?: string | undefined;
    organizationId?: string | undefined;
  }> = [
    {
      title: "Enviar la propuesta de patrocinio (prueba)",
      assigneeId: admin,
      dueInDays: 2,
      organizationId: company?.id,
    },
    {
      title: "Agendar la entrevista (prueba)",
      assigneeId: vpGh?.id ?? null,
      dueInDays: -3,
      personId: applicant?.id,
    },
  ];
  for (const item of rows) {
    if (!item.personId && !item.organizationId) continue;
    const [existing] = await db
      .select({ id: task.id })
      .from(task)
      .where(eq(task.title, item.title))
      .limit(1);
    if (existing) continue;
    await db.insert(task).values({
      title: item.title,
      kind: "GENERAL",
      assigneeId: item.assigneeId,
      dueAt: new Date(Date.now() + item.dueInDays * DAY),
      personId: item.personId ?? null,
      organizationId: item.organizationId ?? null,
      createdById: admin,
    });
  }
}

// Una licencia pendiente (con su tarea sin asignar) y una aprobada por el admin.
async function seedRequests(db: Db, admin: string, termId: string): Promise<void> {
  const rows: Array<{ email: string; status: "PENDING" | "APPROVED"; daysAgo: number }> = [
    { email: "oe.demo.12@eafit.edu.co", status: "PENDING", daysAgo: 1 },
    { email: "oe.demo.07@eafit.edu.co", status: "APPROVED", daysAgo: 20 },
  ];
  for (const item of rows) {
    const who = await personByEmail(db, item.email);
    if (!who) continue;
    const [existing] = await db
      .select({ id: request.id })
      .from(request)
      .where(and(eq(request.personId, who.id), eq(request.kind, "LEAVE")))
      .limit(1);
    if (existing) continue;
    const at = new Date(Date.now() - item.daysAgo * DAY);
    const done = item.status === "APPROVED";
    const [opened] = await db
      .insert(task)
      .values({
        title: t("T-1009", {
          nombre: `${who.firstName} ${who.lastName}`.trim(),
          tipo: requestKindLabel("LEAVE"),
        }),
        kind: "REQUEST",
        personId: who.id,
        createdById: who.id,
        dueAt: addBusinessDays(at, 5),
        status: done ? "DONE" : "OPEN",
        completedAt: done ? new Date(at.getTime() + 2 * DAY) : null,
        completedById: done ? admin : null,
        createdAt: at,
      })
      .returning({ id: task.id });
    await db.insert(request).values({
      personId: who.id,
      kind: "LEAVE",
      termId,
      payload: {
        reason: "Intercambio académico este semestre (dato sintético)",
        until: "2026-12-05",
      },
      status: item.status,
      taskId: opened?.id ?? null,
      decidedById: done ? admin : null,
      decidedAt: done ? new Date(at.getTime() + 2 * DAY) : null,
      createdAt: at,
    });
  }
}

// Dos convocatorias abiertas: una por orden de llegada con cupo (y lista de espera) y una manual con formulario.
async function seedCalls(db: Db, admin: string, termId: string, gapFormId: string): Promise<void> {
  const groupId = async (name: string) => {
    const [row] = await db
      .select({ id: workGroup.id })
      .from(workGroup)
      .where(and(eq(workGroup.termId, termId), eq(workGroup.name, name)))
      .limit(1);
    return row?.id ?? null;
  };
  const calls: Array<{
    title: string;
    group: string;
    formId: string | null;
    selection: "FIRST_COME" | "MANUAL";
    capacity: number | null;
    entries: Array<[number, "APPLIED" | "ACCEPTED" | "WAITLISTED"]>;
  }> = [
    {
      title: "Convocatoria GT Inventiva (prueba)",
      group: "GT Inventiva 2026-2",
      formId: null,
      selection: "FIRST_COME",
      capacity: 2,
      entries: [
        [20, "ACCEPTED"],
        [24, "ACCEPTED"],
        [25, "WAITLISTED"],
      ],
    },
    {
      title: "Convocatoria GAP Días EAFIT (prueba)",
      group: "GAP Días EAFIT",
      formId: gapFormId,
      selection: "MANUAL",
      capacity: null,
      entries: [
        [27, "APPLIED"],
        [29, "APPLIED"],
      ],
    },
  ];
  for (const item of calls) {
    const group = await groupId(item.group);
    if (!group) continue;
    const [found] = await db
      .select({ id: internalCall.id })
      .from(internalCall)
      .where(eq(internalCall.title, item.title))
      .limit(1);
    const [own] = found
      ? [found]
      : await db
          .insert(internalCall)
          .values({
            termId,
            groupId: group,
            formId: item.formId,
            title: item.title,
            description:
              "Convocatoria **sintética** para revisar Mi OE y el admin en local; el cupo y las fechas no son datos de la OE.",
            opensAt: new Date(Date.now() - DAY),
            closesAt: new Date(Date.now() + 14 * DAY),
            capacity: item.capacity,
            selection: item.selection,
            status: "OPEN",
            createdById: admin,
          })
          .returning({ id: internalCall.id });
    if (!own) continue;
    for (const [index, [n, status]] of item.entries.entries()) {
      const who = await personByEmail(db, demoEmail(n));
      if (!who) continue;
      const at = new Date(Date.now() - (item.entries.length - index) * 3_600_000);
      const submissionId = item.formId
        ? await seedSubmission(
            db,
            item.formId,
            who,
            { disponibilidad: n % 2 === 0 ? ["Mañana"] : ["Mañana", "Tarde"] },
            0,
          )
        : null;
      await db
        .insert(internalCallEntry)
        .values({
          callId: own.id,
          personId: who.id,
          submissionId,
          status,
          decidedAt: status === "APPLIED" ? null : at,
          createdAt: at,
        })
        .onConflictDoNothing();
      if (status === "ACCEPTED") {
        // Lo que haría el handler de permanence al drenar el outbox.
        await db
          .insert(workGroupMembership)
          .values({ groupId: group, personId: who.id })
          .onConflictDoNothing();
      }
    }
  }
}

/** Siembra todo lo de la fase 5; espera personas, comités, grupos, ediciones y el admin ya sembrados. */
export async function seedFase5(db: Db, termId: string): Promise<void> {
  const admin = (await personByEmail(db, "oe.demo.admin@eafit.edu.co"))?.id;
  if (!admin) throw new Error("falta el admin sintético");
  const [edition] = await db
    .select({ id: eventEdition.id })
    .from(eventEdition)
    .innerJoin(event, eq(event.id, eventEdition.eventId))
    .where(and(eq(event.slug, "dias-eafit"), eq(eventEdition.slug, "prueba")))
    .limit(1);

  const admission = await seedPipeline(db, admin, "Admisión 2026-2", "ADMISSION", tList("T-965"));
  const sponsorship = await seedPipeline(
    db,
    admin,
    "Patrocinios Días EAFIT (prueba)",
    "SPONSORSHIP",
    tList("T-966"),
  );

  const postulacion = await seedForm(db, admin, {
    slug: "postulacion",
    title: "Postulación a la OE (prueba)",
    description:
      "Formulario **sintético** de admisión: las preguntas reales las define GH (11-contenido-pendiente.md).",
    audience: "PUBLIC",
    thanks: "Recibimos tu postulación. Te escribimos al correo para la entrevista.",
    fields: [
      { key: "phone", label: "Celular", type: "PHONE", required: true },
      { key: "program", label: "Programa", type: "TEXT", required: true },
      {
        key: "motivacion",
        label: "¿Por qué querés entrar a la OE?",
        type: "TEXTAREA",
        required: true,
      },
      {
        key: "como_supiste",
        label: "¿Cómo supiste de la OE?",
        type: "SELECT",
        required: false,
        options: ["Redes sociales", "Un amigo", "Días EAFIT", "Otro"],
      },
    ],
    actions: { createPerson: true, pipelineId: admission.id, tagIds: [] },
  });
  const prospecto = await seedForm(db, admin, {
    slug: "quiero-saber-mas",
    title: "Quiero saber más de la OE (prueba)",
    description: "Dejanos tu correo y te contamos cuándo abre la próxima convocatoria.",
    audience: "PUBLIC",
    fields: [
      {
        key: "interes",
        label: "¿Qué te interesa?",
        type: "MULTISELECT",
        required: false,
        options: ["Eventos", "Voluntariado", "Deporte", "Cultura"],
      },
    ],
    actions: { createPerson: true, tagIds: [] },
  });
  const gapForm = await seedForm(db, admin, {
    slug: "gap-dias-eafit",
    title: "Disponibilidad para el GAP de Días EAFIT (prueba)",
    description: "Contanos en qué jornadas podés apoyar.",
    audience: "MEMBERS",
    fields: [
      {
        key: "disponibilidad",
        label: "Jornadas en las que podés estar",
        type: "MULTISELECT",
        required: true,
        options: ["Mañana", "Tarde", "Noche"],
      },
    ],
    actions: { createPerson: false, tagIds: [] },
  });

  await seedAdmission(db, admin, admission, postulacion, prospecto);
  if (edition) {
    const inscripcion = await seedForm(db, admin, {
      slug: "inscripcion-dias-eafit",
      title: "Inscripción a Días EAFIT (prueba)",
      description: "Inscribite a la edición de prueba desde Mi OE.",
      audience: "MEMBERS",
      fields: [
        {
          key: "turno",
          label: "Turno",
          type: "SELECT",
          required: true,
          options: ["Mañana", "Tarde"],
        },
        { key: "restricciones", label: "Restricciones alimentarias", type: "TEXTAREA" },
      ],
      actions: { createPerson: true, editionId: edition.id, tagIds: [] },
    });
    await seedRegistrations(db, inscripcion, edition.id);
  }
  await seedOrganizations(db, admin, sponsorship, edition?.id ?? null);
  await seedTasks(db, admin);
  await seedRequests(db, admin, termId);
  await seedCalls(db, admin, termId, gapForm);
}
