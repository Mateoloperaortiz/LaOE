import { and, asc, eq } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { enqueueEvent, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { scoreRecompute } from "@/domain-events/participation";
import { createTemplate, updatePreferencesAs } from "@/modules/comms";
import { campaign, campaignRecipient, emailTemplate, message } from "@/modules/comms/schema";
import { form } from "@/modules/forms/schema";
import { answerSurveyAs, createSurveyInvites } from "@/modules/participation";
import { checkIn, occasion, pointEntry } from "@/modules/participation/schema";
import { committee, membership, person, segment } from "@/modules/people/schema";
import { appConfig } from "@/modules/system/schema";
import { logger } from "@/shared/log";

// Datos sintéticos de la fase 6 (ADR-038): dos plantillas, una campaña enviada (mensajes por consola,
// una baja) y una programada, preferencias variadas, unos push registrados, el formulario de encuesta
// con calificación como encuesta por defecto y una ocasión cerrada de un comité con seis respuestas
// anónimas. Idempotente por slug, nombre o publicId; nunca corre en producción (lo verifica seed.ts).

type Db = ReturnType<typeof getDb>;

const DAY = 24 * 60 * 60_000;

interface Member {
  id: string;
  email: string;
}

async function activeMembers(db: Db): Promise<Member[]> {
  return db
    .select({ id: person.id, email: person.email })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .where(and(eq(person.source, "SEED"), eq(membership.status, "ACTIVE")))
    .orderBy(asc(person.email));
}

async function templateBySlug(
  db: Db,
  admin: string,
  input: { slug: string; name: string; subject: string; body: string },
): Promise<string> {
  const [existing] = await db
    .select({ id: emailTemplate.id })
    .from(emailTemplate)
    .where(eq(emailTemplate.slug, input.slug))
    .limit(1);
  if (existing) return existing.id;
  const { id } = await runCommand({ personId: admin }, (ctx) => createTemplate(ctx, input));
  return id;
}

async function segmentByName(db: Db, admin: string, name: string): Promise<string> {
  const [existing] = await db
    .select({ id: segment.id })
    .from(segment)
    .where(eq(segment.name, name))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(segment)
    .values({ name, filter: { statuses: ["ACTIVE"] }, createdById: admin })
    .returning({ id: segment.id });
  if (!row) throw new Error("No se pudo crear el segmento");
  return row.id;
}

async function seedCampaigns(db: Db, admin: string, members: Member[]): Promise<void> {
  const welcome = await templateBySlug(db, admin, {
    slug: "bienvenida-semestre",
    name: "Bienvenida al semestre",
    subject: "¡Arrancamos {semestre}!",
    body: [
      "Hola **{nombre}**, ¡qué bueno tenerte este semestre!",
      "",
      "Este {semestre} estás en {comités}. En Mi OE encontrás tu agenda, tus GH Points y las convocatorias abiertas.",
      "",
      "[Entrar a Mi OE]({url})",
      "",
      "¡OE OE OE!",
    ].join("\n"),
  });
  const assembly = await templateBySlug(db, admin, {
    slug: "recordatorio-asamblea",
    name: "Recordatorio de asamblea",
    subject: "Asamblea ordinaria: te esperamos",
    body: [
      "Hola **{nombre}**,",
      "",
      "Esta semana tenemos asamblea ordinaria. Revisá la hora y el lugar en tu agenda de Mi OE.",
      "",
      "[Ver mi agenda]({url})",
    ].join("\n"),
  });
  const segmentId = await segmentByName(db, admin, "Activos del semestre");
  const now = Date.now();

  // Campaña enviada hace dos días: un mensaje por consola por persona y una baja omitida.
  const sentName = "Bienvenida al semestre (enviada)";
  const [sentExisting] = await db
    .select({ id: campaign.id })
    .from(campaign)
    .where(eq(campaign.name, sentName))
    .limit(1);
  if (!sentExisting) {
    const startedAt = new Date(now - 2 * DAY);
    const optedOut = new Set(
      members.filter((who) => who.email.includes("oe.demo.04")).map((w) => w.id),
    );
    const [row] = await db
      .insert(campaign)
      .values({
        name: sentName,
        templateId: welcome,
        segmentId,
        status: "SENT",
        scheduledAt: startedAt,
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 5 * 60_000),
        totalCount: members.length,
        sentCount: members.length - optedOut.size,
        failedCount: 0,
        skippedCount: optedOut.size,
        createdById: admin,
      })
      .returning({ id: campaign.id });
    if (!row) throw new Error("No se pudo crear la campaña");
    for (const [index, who] of members.entries()) {
      const sentAt = new Date(startedAt.getTime() + index * 1_500);
      if (optedOut.has(who.id)) {
        await db.insert(campaignRecipient).values({
          campaignId: row.id,
          personId: who.id,
          status: "SKIPPED",
          skipReason: "OPTED_OUT",
        });
        continue;
      }
      const [sent] = await db
        .insert(message)
        .values({
          personId: who.id,
          channel: "EMAIL",
          kind: "CAMPAIGN",
          campaignId: row.id,
          subject: "¡Arrancamos 2026-2!",
          status: "SENT",
          provider: "console",
          dedupeKey: `campaign:${row.id}`,
          sentAt,
          createdAt: sentAt,
        })
        .returning({ id: message.id });
      await db.insert(campaignRecipient).values({
        campaignId: row.id,
        personId: who.id,
        status: "SENT",
        messageId: sent?.id ?? null,
        sentAt,
      });
    }
  }

  // Campaña programada para dentro de tres días: el programado la arranca cuando llegue la hora.
  const scheduledName = "Recordatorio de asamblea (programada)";
  const [scheduledExisting] = await db
    .select({ id: campaign.id })
    .from(campaign)
    .where(eq(campaign.name, scheduledName))
    .limit(1);
  if (!scheduledExisting) {
    await db.insert(campaign).values({
      name: scheduledName,
      templateId: assembly,
      segmentId,
      status: "SCHEDULED",
      scheduledAt: new Date(now + 3 * DAY),
      createdById: admin,
    });
  }
}

async function seedPreferencesAndPushes(members: Member[], db: Db): Promise<void> {
  const byEmail = (fragment: string) => members.find((who) => who.email.includes(fragment));
  const base = {
    emailCampaigns: true,
    pushAnnouncements: true,
    pushPoints: true,
    pushReminders: true,
    pushWordle: true,
  };
  const variations: Array<[string, Partial<typeof base>]> = [
    ["oe.demo.04", { emailCampaigns: false }],
    ["oe.demo.07", { pushPoints: false }],
    ["oe.demo.08", { pushAnnouncements: false, pushReminders: false }],
    ["oe.demo.09", { pushWordle: false }],
  ];
  for (const [fragment, change] of variations) {
    const who = byEmail(fragment);
    if (!who) continue;
    await updatePreferencesAs({ personId: who.id }, { ...base, ...change });
  }
  // Unos push ya registrados, para que Mensajes y la Persona 360 muestren los tres tipos.
  const pushes: Array<[string, "ANNOUNCEMENT" | "POINTS" | "REMINDER", string]> = [
    ["oe.demo.01", "ANNOUNCEMENT", "Nuevo anuncio: Convocatoria abierta"],
    ["oe.demo.01", "POINTS", "Sumaste 10 GH Points"],
    ["oe.demo.02", "REMINDER", "Hoy: Integración de prueba"],
  ];
  for (const [index, [fragment, kind, subject]] of pushes.entries()) {
    const who = byEmail(fragment);
    if (!who) continue;
    const sentAt = new Date(Date.now() - (index + 1) * 6 * 60 * 60_000);
    await db
      .insert(message)
      .values({
        personId: who.id,
        channel: "PUSH",
        kind,
        subject,
        status: "SENT",
        provider: "console",
        dedupeKey: `seed:push:${index}`,
        sentAt,
        createdAt: sentAt,
      })
      .onConflictDoNothing();
  }
}

async function seedSurvey(db: Db, admin: string, termId: string, members: Member[]): Promise<void> {
  const fields = [
    { key: "calificacion", label: "¿Cómo estuvo la actividad?", type: "RATING", required: true },
    {
      key: "mejor",
      label: "¿Qué fue lo mejor?",
      type: "SELECT",
      required: false,
      options: ["La gente", "El contenido", "El lugar", "La comida"],
    },
    { key: "comentario", label: "¿Qué mejorarías?", type: "TEXTAREA", required: false },
  ];
  const values = {
    slug: "encuesta-actividad",
    title: "Encuesta de la actividad",
    description: "",
    audience: "MEMBERS" as const,
    status: "OPEN" as const,
    consentRequired: false,
    fields,
    actions: { createPerson: false },
    createdById: admin,
  };
  const [formRow] = await db
    .insert(form)
    .values(values)
    .onConflictDoUpdate({ target: form.slug, set: { title: values.title, fields, status: "OPEN" } })
    .returning({ id: form.id });
  if (!formRow) throw new Error("No se pudo crear el formulario de encuesta");
  await db
    .insert(appConfig)
    .values({ key: "survey.defaultFormId", value: formRow.id, updatedById: admin })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: formRow.id } });

  const [pixel] = await db
    .select({ id: committee.id })
    .from(committee)
    .orderBy(asc(committee.slug))
    .limit(1);
  const now = Date.now();
  const hours = (n: number) => new Date(now + n * 3_600_000);
  const occasionValues = {
    publicId: "demo000006",
    termId,
    title: "Salida de integración de prueba (cerrada, con encuesta)",
    category: "INTEGRATION" as const,
    location: "Parque Arví",
    points: 10,
    approval: "AUTO" as const,
    status: "CLOSED" as const,
    startsAt: hours(-24 * 3),
    checkInOpensAt: hours(-24 * 3 - 1),
    checkInClosesAt: hours(-24 * 3 + 5),
    closedAt: hours(-24 * 3 + 6),
    committeeId: pixel?.id ?? null,
    surveyFormId: formRow.id,
    createdById: admin,
  };
  const [closed] = await db
    .insert(occasion)
    .values(occasionValues)
    .onConflictDoUpdate({ target: occasion.publicId, set: occasionValues })
    .returning({ id: occasion.id });
  if (!closed) throw new Error("No se pudo crear la ocasión con encuesta");
  const attendees = members.slice(2, 10);
  for (const [index, who] of attendees.entries()) {
    const at = hours(-24 * 3 + index / 4);
    const [row] = await db
      .insert(checkIn)
      .values({
        occasionId: closed.id,
        personId: who.id,
        status: "APPROVED",
        source: index % 2 === 0 ? "SELF_QR" : "HOST",
        at,
        createdAt: at,
      })
      .onConflictDoNothing({ target: [checkIn.occasionId, checkIn.personId] })
      .returning({ id: checkIn.id });
    if (!row) continue;
    await db.insert(pointEntry).values({
      personId: who.id,
      termId,
      checkInId: row.id,
      kind: "CHECKIN",
      points: occasionValues.points,
      reason: occasionValues.title,
      createdAt: at,
    });
  }
  await enqueueEvent(
    db,
    eventOf(scoreRecompute, { occasionId: closed.id }, { dedupeKey: `score:${closed.id}` }),
  );

  // Invitaciones para los asistentes y seis respuestas anónimas (suficientes para ver los textos).
  const { created } = await createSurveyInvites(closed.id);
  const answers = [
    { calificacion: "5", mejor: "La gente", comentario: "Más tiempo para conversar" },
    { calificacion: "4", mejor: "El contenido", comentario: "Que haya más cupos" },
    { calificacion: "5", mejor: "La gente", comentario: "Todo muy bien organizado" },
    { calificacion: "3", mejor: "El lugar", comentario: "Empezar más temprano" },
    { calificacion: "4", mejor: "La gente", comentario: "Repetirla el próximo semestre" },
    { calificacion: "5", mejor: "La comida", comentario: "Más actividades al aire libre" },
  ];
  for (const [index, invite] of created.slice(0, answers.length).entries()) {
    const raw = answers[index];
    if (!raw) break;
    const result = await answerSurveyAs({ personId: invite.personId }, invite.token, raw);
    if (!result.ok) {
      logger.warn({ result }, "respuesta de encuesta sintética rechazada");
    }
  }
}

export async function seedFase6(db: Db, termId: string): Promise<void> {
  const [adminRow] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, "oe.demo.admin@eafit.edu.co"))
    .limit(1);
  if (!adminRow) throw new Error("falta el admin sintético");
  const members = await activeMembers(db);
  await seedPreferencesAndPushes(members, db);
  await seedCampaigns(db, adminRow.id, members);
  await seedSurvey(db, adminRow.id, termId, members);
  logger.info({ members: members.length }, "seed de la fase 6 aplicado");
}
