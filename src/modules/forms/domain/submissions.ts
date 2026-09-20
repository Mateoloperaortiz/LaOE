import { and, count, desc, eq, gt, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { getEdition } from "@/modules/events";
import {
  addPersonTags,
  canParticipate,
  findOrCreatePersonFromForm,
  findPersonByEmail,
  getMembershipRef,
  getPeopleByIds,
  recordConsent,
} from "@/modules/people";
import { PrivacyPolicyPendingError, requirePrivacyPolicyVersion } from "@/modules/system";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { logger } from "@/shared/log";
import { editionRegistration, form, formSubmission } from "../schema";
import type { FormView, PublicForm } from "./forms";
import {
  type AnswerValue,
  FORM_MAX_PER_IP,
  FORM_WINDOW_MS,
  formOpenState,
  parseFields,
  personDataFromAnswers,
  publicIdentitySchema,
  validateAnswers,
} from "./pure";

// Respuestas (ADR-013, ADR-037 reglas 3 y 4): vinculan o crean la persona por correo, registran el
// consentimiento de tratamiento de datos y ejecutan solo las acciones declaradas; nunca crean miembros,
// puntos ni check-ins. La tarjeta del pipeline la crea `crm` al drenar `submission.received`.

export type SubmissionRecord = typeof formSubmission.$inferSelect;

class ParticipationUnavailableError extends DomainError {}

export interface CreateSubmissionInput {
  form: FormView;
  personId: string | null;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  answers: Record<string, AnswerValue>;
  consentAcceptedAt: Date | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Inserta la respuesta y ejecuta las acciones que necesitan persona (consentimiento, etiquetas,
 * inscripción) en la misma transacción; emite `submission.received` con payload autosuficiente.
 */
export async function createSubmission(
  ctx: CommandContext,
  input: CreateSubmissionInput,
): Promise<{ id: string; registered: boolean }> {
  const member = input.personId ? await getMembershipRef(input.personId, ctx.tx) : null;
  if (
    member?.status === "ON_LEAVE" ||
    (input.form.audience === "MEMBERS" && !canParticipate(member?.status))
  ) {
    throw new ParticipationUnavailableError(t("T-2041"));
  }
  const [currentForm] = await ctx.tx
    .select({ consentRequired: form.consentRequired })
    .from(form)
    .where(eq(form.id, input.form.id))
    .for("share");
  const approvedVersion =
    currentForm?.consentRequired || input.consentAcceptedAt
      ? await requirePrivacyPolicyVersion(ctx)
      : null;
  const policyVersion = input.consentAcceptedAt ? approvedVersion : null;
  const [row] = await ctx.tx
    .insert(formSubmission)
    .values({
      formId: input.form.id,
      personId: input.personId,
      email: input.email,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      answers: input.answers,
      consentAcceptedAt: input.consentAcceptedAt,
      policyVersion,
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
    })
    .returning({ id: formSubmission.id });
  if (!row) {
    throw new Error("No se pudo guardar la respuesta");
  }
  let registered = false;
  const actions = input.form.parsedActions;
  if (input.personId) {
    if (input.consentAcceptedAt) {
      await recordConsent(ctx, input.personId, {
        purpose: "DATA_PROCESSING",
        source: "FORM",
        ip: input.ip ?? null,
      });
    }
    if (actions.tagIds.length > 0) {
      await addPersonTags(ctx, input.personId, actions.tagIds);
    }
    if (actions.editionId) {
      const inserted = await ctx.tx
        .insert(editionRegistration)
        .values({ editionId: actions.editionId, personId: input.personId, submissionId: row.id })
        .onConflictDoNothing({
          target: [editionRegistration.editionId, editionRegistration.personId],
        })
        .returning({ id: editionRegistration.id });
      registered = inserted.length > 0;
      if (registered) {
        const edition = await getEdition(actions.editionId);
        await ctx.emit({
          type: "registration.created",
          payload: {
            actorId: ctx.actor.personId,
            personId: input.personId,
            editionId: actions.editionId,
            editionName: edition?.name ?? "",
            submissionId: row.id,
          },
        });
      }
    }
  }
  await ctx.audit({
    action: "submission.received",
    entityType: "form",
    entityId: input.form.id,
    after: { submissionId: row.id, personId: input.personId, email: input.email },
  });
  await ctx.emit({
    type: "submission.received",
    payload: {
      actorId: ctx.actor.personId,
      submissionId: row.id,
      formId: input.form.id,
      formTitle: input.form.title,
      formSlug: input.form.slug,
      personId: input.personId,
      email: input.email,
      actions,
    },
  });
  return { id: row.id, registered };
}

export interface SubmitInput {
  identity?: { firstName: string; lastName: string; email: string };
  answers: Record<string, unknown>;
  consent: boolean;
  honeypot?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export type SubmitResult =
  | { ok: true; submissionId: string | null; registered: boolean; honeypot: boolean }
  | {
      ok: false;
      code:
        | "CLOSED"
        | "FULL"
        | "DUPLICATE"
        | "RATE_LIMITED"
        | "CONSENT"
        | "INVALID"
        | "POLICY_PENDING";
      errors: Record<string, string>;
    };

async function countRecentByIp(ip: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - FORM_WINDOW_MS);
  const [row] = await getDb()
    .select({ n: count() })
    .from(formSubmission)
    .where(and(eq(formSubmission.ip, ip), gt(formSubmission.createdAt, since)));
  return row?.n ?? 0;
}

/**
 * Envío desde `/f/[slug]`: público sin sesión o de miembros con el actor. Honeypot lleno responde
 * "gracias" sin guardar; rate limit por IP; una respuesta por correo salvo `allowMultiple`; tope y
 * ventana comprobados con el formulario bloqueado. Todo lo demás en una transacción.
 */
export async function submitFormAs(
  actor: (Actor & { personId: string; email: string; firstName: string }) | null,
  target: PublicForm,
  input: SubmitInput,
  now = new Date(),
): Promise<SubmitResult> {
  if (input.honeypot?.trim()) {
    logger.warn(
      { formId: target.id, ip: input.ip },
      "formulario: campo trampa lleno, respuesta descartada",
    );
    return { ok: true, submissionId: null, registered: false, honeypot: true };
  }
  if (target.state !== "OPEN") {
    return { ok: false, code: target.state, errors: {} };
  }
  if (actor && (await getMembershipRef(actor.personId))?.status === "ON_LEAVE") {
    return { ok: false, code: "INVALID", errors: {} };
  }
  let identity: { firstName: string | null; lastName: string | null; email: string };
  let personId: string | null = null;
  if (target.audience === "MEMBERS") {
    if (!actor) {
      return { ok: false, code: "INVALID", errors: {} };
    }
    identity = { firstName: actor.firstName, lastName: null, email: actor.email.toLowerCase() };
    personId = actor.personId;
  } else {
    const parsed = publicIdentitySchema.safeParse(input.identity ?? {});
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "email");
        errors[key] = key === "email" ? "T-854" : "T-853";
      }
      return { ok: false, code: "INVALID", errors };
    }
    identity = parsed.data;
  }
  const answers = validateAnswers(target.parsedFields, input.answers);
  if (!answers.ok) {
    return { ok: false, code: "INVALID", errors: answers.errors };
  }
  const needsConsent = target.audience === "PUBLIC" && target.consentRequired;
  if (needsConsent && !input.consent) {
    return { ok: false, code: "CONSENT", errors: { consent: "T-858" } };
  }
  if (target.audience === "PUBLIC" && input.ip) {
    if ((await countRecentByIp(input.ip, now)) >= FORM_MAX_PER_IP) {
      return { ok: false, code: "RATE_LIMITED", errors: {} };
    }
  }
  const commandActor = actor
    ? { personId: actor.personId, ip: input.ip ?? null }
    : { personId: null, ip: input.ip ?? null };
  return runCommand(commandActor, async (ctx): Promise<SubmitResult> => {
    const [locked] = await ctx.tx.select().from(form).where(eq(form.id, target.id)).for("update");
    if (!locked) {
      return { ok: false, code: "CLOSED", errors: {} };
    }
    const [current] = await ctx.tx
      .select({ n: count() })
      .from(formSubmission)
      .where(eq(formSubmission.formId, target.id));
    const state = formOpenState(locked, current?.n ?? 0, now);
    if (state !== "OPEN") {
      return { ok: false, code: state, errors: {} };
    }
    if (!locked.allowMultiple) {
      const [existing] = await ctx.tx
        .select({ id: formSubmission.id })
        .from(formSubmission)
        .where(and(eq(formSubmission.formId, target.id), eq(formSubmission.email, identity.email)))
        .limit(1);
      if (existing) {
        return { ok: false, code: "DUPLICATE", errors: { email: "T-862" } };
      }
    }
    if (!personId) {
      if (target.parsedActions.createPerson) {
        const created = await findOrCreatePersonFromForm(ctx, {
          email: identity.email,
          firstName: identity.firstName ?? "",
          lastName: identity.lastName ?? "",
          ...personDataFromAnswers(answers.answers),
        });
        personId = created.id;
      } else {
        personId = (await findPersonByEmail(identity.email))?.id ?? null;
      }
    }
    const created = await createSubmission(ctx, {
      form: target,
      personId,
      email: identity.email,
      firstName: identity.firstName,
      lastName: identity.lastName,
      answers: answers.answers,
      consentAcceptedAt:
        needsConsent || (target.audience === "PUBLIC" && input.consent) ? now : null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
    return { ok: true, submissionId: created.id, registered: created.registered, honeypot: false };
  }).catch((error: unknown): SubmitResult => {
    // Fuera de runCommand: la persona y todos los efectos anteriores también se revierten.
    if (error instanceof PrivacyPolicyPendingError) {
      return { ok: false, code: "POLICY_PENDING", errors: {} };
    }
    if (error instanceof ParticipationUnavailableError) {
      return { ok: false, code: "INVALID", errors: {} };
    }
    throw error;
  });
}

export interface SubmissionListRow extends SubmissionRecord {
  personName: string | null;
  formTitle: string;
  formSlug: string;
}

export interface SubmissionListParams {
  formId?: string | undefined;
  q: string;
  page: number;
  pageSize: number;
}

async function withPeople(rows: Array<SubmissionRecord & { formTitle: string; formSlug: string }>) {
  const people = await getPeopleByIds(
    rows.map((row) => row.personId).filter((id): id is string => id !== null),
  );
  return rows.map((row) => ({
    ...row,
    personName: row.personId ? (people.get(row.personId)?.fullName ?? null) : null,
  }));
}

export async function listSubmissions(
  params: SubmissionListParams,
): Promise<{ rows: SubmissionListRow[]; total: number }> {
  const conditions = [];
  if (params.formId) {
    conditions.push(eq(formSubmission.formId, params.formId));
  }
  if (params.q) {
    const pattern = `%${params.q}%`;
    conditions.push(
      or(
        ilike(formSubmission.email, pattern),
        ilike(formSubmission.firstName, pattern),
        ilike(formSubmission.lastName, pattern),
      ),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total], target] = await Promise.all([
    db
      .select({ row: formSubmission, formTitle: form.title, formSlug: form.slug })
      .from(formSubmission)
      .innerJoin(form, eq(form.id, formSubmission.formId))
      .where(where)
      .orderBy(desc(formSubmission.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(formSubmission).where(where),
    params.formId
      ? db.select({ fields: form.fields }).from(form).where(eq(form.id, params.formId)).limit(1)
      : Promise.resolve([]),
  ]);
  // Con el formulario fijado, cada fila lleva todas las claves de sus campos (el CSV sale parejo).
  const keys = target[0] ? parseFields(target[0].fields).map((field) => field.key) : null;
  return {
    rows: await withPeople(
      rows.map((item) => ({
        ...item.row,
        answers: keys
          ? Object.fromEntries(keys.map((key) => [key, item.row.answers[key] ?? null]))
          : item.row.answers,
        formTitle: item.formTitle,
        formSlug: item.formSlug,
      })),
    ),
    total: total?.n ?? 0,
  };
}

export async function getSubmission(id: string): Promise<SubmissionListRow | null> {
  const [row] = await getDb()
    .select({ row: formSubmission, formTitle: form.title, formSlug: form.slug })
    .from(formSubmission)
    .innerJoin(form, eq(form.id, formSubmission.formId))
    .where(eq(formSubmission.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  const [withPerson] = await withPeople([
    { ...row.row, formTitle: row.formTitle, formSlug: row.formSlug },
  ]);
  return withPerson ?? null;
}

/** Respuestas de una persona, de la más reciente a la más vieja (pestaña Formularios de la 360). */
export async function listSubmissionsByPerson(personId: string): Promise<SubmissionListRow[]> {
  const rows = await getDb()
    .select({ row: formSubmission, formTitle: form.title, formSlug: form.slug })
    .from(formSubmission)
    .innerJoin(form, eq(form.id, formSubmission.formId))
    .where(eq(formSubmission.personId, personId))
    .orderBy(desc(formSubmission.createdAt));
  return withPeople(
    rows.map((item) => ({ ...item.row, formTitle: item.formTitle, formSlug: item.formSlug })),
  );
}

/** Al salir de la OE o anonimizar se borran las respuestas (ADR-030); devuelve cuántas. */
export async function deleteSubmissionsFor(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(formSubmission)
    .where(eq(formSubmission.personId, personId))
    .returning({ id: formSubmission.id });
  return rows.length;
}

/** Respuestas por id (las inscripciones a convocatorias muestran lo que respondió cada persona). */
export async function getSubmissionsByIds(ids: string[]): Promise<Map<string, SubmissionRecord>> {
  const map = new Map<string, SubmissionRecord>();
  if (ids.length === 0) {
    return map;
  }
  const rows = await getDb().select().from(formSubmission).where(inArray(formSubmission.id, ids));
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}
