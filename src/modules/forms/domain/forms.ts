import { and, asc, count, desc, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { t } from "@/shared/copy";
import { bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { form, formSubmission } from "../schema";
import {
  actionsSchema,
  FORM_SLUG,
  type FormActions,
  type FormField,
  type FormOpenState,
  fieldsSchema,
  formOpenState,
  parseActions,
  parseFields,
} from "./pure";

// Formularios propios (ADR-013, ADR-037): recurso del kit para lo simple (crear, editar, abrir, cerrar) y
// constructor a medida para campos y acciones.

export type FormRecord = typeof form.$inferSelect;

const localDateTime = z
  .string()
  .trim()
  .regex(LOCAL_INPUT, { message: t("T-298") });

export const formInputSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(FORM_SLUG, { message: t("T-914") }),
    title: z.string().trim().min(2).max(120),
    description: z.string().max(20_000).default(""),
    audience: z.enum(["PUBLIC", "MEMBERS"]).default("PUBLIC"),
    status: z.enum(["DRAFT", "OPEN", "CLOSED"]).default("DRAFT"),
    opensAt: localDateTime.transform(bogotaInputToUtc).optional(),
    closesAt: localDateTime.transform(bogotaInputToUtc).optional(),
    maxSubmissions: z.coerce.number().int().min(1).max(100_000).optional(),
    allowMultiple: z.boolean().default(false),
    consentRequired: z.boolean().default(true),
    thanks: z.string().max(4000).optional(),
  })
  .refine(
    (input) =>
      input.opensAt === undefined || input.closesAt === undefined || input.closesAt > input.opensAt,
    { path: ["closesAt"], message: t("T-917") },
  )
  .transform((input) => ({
    ...input,
    // Un formulario público siempre pide el consentimiento (T-934).
    consentRequired: input.audience === "PUBLIC" ? true : input.consentRequired,
  }));

export type FormInput = z.infer<typeof formInputSchema>;

export interface FormListRow extends FormRecord {
  submissionCount: number;
}

export interface FormListParams {
  q: string;
  audience?: string | undefined;
  status?: string | undefined;
  page: number;
  pageSize: number;
}

/** Vista de un formulario con campos y acciones ya validados. */
export interface FormView extends FormRecord {
  parsedFields: FormField[];
  parsedActions: FormActions;
}

function toView(row: FormRecord): FormView {
  return {
    ...row,
    parsedFields: parseFields(row.fields),
    parsedActions: parseActions(row.actions),
  };
}

// La tabla exterior va literal: dentro de una plantilla `sql` las columnas salen sin calificar.
const submissionCount =
  sql<number>`(select count(*) from form_submission fs where fs.form_id = form.id)`.mapWith(Number);

export async function listForms(
  params: FormListParams,
): Promise<{ rows: FormListRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(or(ilike(form.title, `%${params.q}%`), ilike(form.slug, `%${params.q}%`)));
  }
  if (params.audience === "PUBLIC" || params.audience === "MEMBERS") {
    conditions.push(eq(form.audience, params.audience));
  }
  if (params.status === "DRAFT" || params.status === "OPEN" || params.status === "CLOSED") {
    conditions.push(eq(form.status, params.status));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select({ row: form, submissionCount })
      .from(form)
      .where(where)
      .orderBy(desc(form.updatedAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(form).where(where),
  ]);
  return {
    rows: rows.map((item) => ({ ...item.row, submissionCount: item.submissionCount })),
    total: total?.n ?? 0,
  };
}

export async function getForm(id: string): Promise<FormListRow | null> {
  const [row] = await getDb()
    .select({ row: form, submissionCount })
    .from(form)
    .where(eq(form.id, id))
    .limit(1);
  return row ? { ...row.row, submissionCount: row.submissionCount } : null;
}

export async function getFormView(
  id: string,
): Promise<(FormView & { submissionCount: number }) | null> {
  const row = await getForm(id);
  return row ? { ...toView(row), submissionCount: row.submissionCount } : null;
}

/** Opciones para selectores (convocatorias, ediciones): título e identificador. */
/** Formularios que sirven de encuesta tras una ocasión (ADR-038 regla 13): de miembros y sin crear personas. */
export async function listSurveyFormOptions(): Promise<Array<{ id: string; label: string }>> {
  const rows = await getDb()
    .select({ id: form.id, title: form.title, slug: form.slug, actions: form.actions })
    .from(form)
    .where(eq(form.audience, "MEMBERS"))
    .orderBy(asc(form.title));
  return rows
    .filter((row) => !parseActions(row.actions).createPerson)
    .map((row) => ({ id: row.id, label: `${row.title} (${row.slug})` }));
}

export async function listFormOptions(): Promise<
  Array<{ id: string; label: string; audience: string }>
> {
  const rows = await getDb()
    .select({ id: form.id, title: form.title, slug: form.slug, audience: form.audience })
    .from(form)
    .orderBy(asc(form.title));
  return rows.map((row) => ({
    id: row.id,
    label: `${row.title} (${row.slug})`,
    audience: row.audience,
  }));
}

export interface PublicForm extends FormView {
  state: FormOpenState;
}

/** El formulario por su identificador, con su estado de apertura; nulo si no existe. */
export const getPublicForm = cache(
  async (slug: string, now = new Date()): Promise<PublicForm | null> => {
    const [row] = await getDb()
      .select({ row: form, submissionCount })
      .from(form)
      .where(eq(form.slug, slug))
      .limit(1);
    if (!row) {
      return null;
    }
    return { ...toView(row.row), state: formOpenState(row.row, row.submissionCount, now) };
  },
);

async function openFormsWhere(extra: SQL | undefined, now: Date) {
  const rows = await getDb()
    .select({ row: form, submissionCount })
    .from(form)
    .where(and(eq(form.status, "OPEN"), extra))
    .orderBy(desc(form.updatedAt));
  return rows
    .map((item) => ({
      ...toView(item.row),
      state: formOpenState(item.row, item.submissionCount, now),
    }))
    .filter((item) => item.state === "OPEN");
}

/** El formulario público abierto que lleva a uno de esos pipelines (la convocatoria de admisión, T-027). */
export async function findOpenPublicFormForPipelines(
  pipelineIds: string[],
  now = new Date(),
): Promise<PublicForm | null> {
  if (pipelineIds.length === 0) {
    return null;
  }
  // Drizzle expande un arreglo dentro de `sql` como una lista: `inArray` arma el `in (...)` correcto.
  const open = await openFormsWhere(
    and(eq(form.audience, "PUBLIC"), inArray(sql`${form.actions}->>'pipelineId'`, pipelineIds)),
    now,
  );
  return open[0] ?? null;
}

/** El formulario público abierto de prospecto: crea la persona sin pipeline ni edición (T-028, T-868). */
export async function findOpenProspectForm(now = new Date()): Promise<PublicForm | null> {
  const open = await openFormsWhere(
    sql`${form.audience} = 'PUBLIC' and coalesce(${form.actions}->>'pipelineId', '') = '' and coalesce(${form.actions}->>'editionId', '') = '' and (${form.actions}->>'createPerson')::boolean = true`,
    now,
  );
  return open[0] ?? null;
}

/** El formulario abierto con la acción de inscribir a esa edición (T-019). */
export async function findOpenRegistrationForm(
  editionId: string,
  now = new Date(),
): Promise<PublicForm | null> {
  const open = await openFormsWhere(sql`${form.actions}->>'editionId' = ${editionId}`, now);
  return open[0] ?? null;
}

function toValues(input: FormInput) {
  return {
    slug: input.slug,
    title: input.title,
    description: input.description,
    audience: input.audience,
    status: input.status,
    opensAt: input.opensAt ?? null,
    closesAt: input.closesAt ?? null,
    maxSubmissions: input.maxSubmissions ?? null,
    allowMultiple: input.allowMultiple,
    consentRequired: input.consentRequired,
    thanks: input.thanks?.trim() ? input.thanks.trim() : null,
  };
}

export async function createForm(ctx: CommandContext, input: FormInput): Promise<{ id: string }> {
  try {
    const [row] = await ctx.tx
      .insert(form)
      .values({ ...toValues(input), createdById: ctx.actor.personId })
      .returning({ id: form.id });
    if (!row) {
      throw new Error("No se pudo crear el formulario");
    }
    await ctx.audit({
      action: "form.created",
      entityType: "form",
      entityId: row.id,
      after: toValues(input),
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "form_slug_unique")) {
      throw new DomainError(t("T-915"), "slug");
    }
    throw error;
  }
}

export async function updateForm(ctx: CommandContext, id: string, input: FormInput): Promise<void> {
  const [before] = await ctx.tx.select().from(form).where(eq(form.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const values = toValues(input);
  try {
    await ctx.tx.update(form).set(values).where(eq(form.id, id));
  } catch (error) {
    if (isUniqueViolation(error, "form_slug_unique")) {
      throw new DomainError(t("T-915"), "slug");
    }
    throw error;
  }
  await ctx.audit({
    action: "form.updated",
    entityType: "form",
    entityId: id,
    before,
    after: values,
  });
}

export async function setFormStatus(
  ctx: CommandContext,
  id: string,
  status: "OPEN" | "CLOSED",
): Promise<void> {
  const [before] = await ctx.tx.select({ status: form.status }).from(form).where(eq(form.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  if (before.status === status) {
    return;
  }
  await ctx.tx.update(form).set({ status }).where(eq(form.id, id));
  await ctx.audit({
    action: status === "OPEN" ? "form.opened" : "form.closed",
    entityType: "form",
    entityId: id,
    before,
    after: { status },
  });
}

/** Reemplaza los campos del formulario; las claves de campo repetidas o sin opciones se rechazan (T-926, T-927). */
export async function setFormFields(
  ctx: CommandContext,
  id: string,
  raw: unknown,
): Promise<FormField[]> {
  const parsed = fieldsSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const code = issue?.message.startsWith("T-") ? issue.message : "T-925";
    throw new DomainError(t(code as "T-925" | "T-926" | "T-927"), String(issue?.path[0] ?? ""));
  }
  const [before] = await ctx.tx.select({ fields: form.fields }).from(form).where(eq(form.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  await ctx.tx.update(form).set({ fields: parsed.data }).where(eq(form.id, id));
  await ctx.audit({
    action: "form.fields-set",
    entityType: "form",
    entityId: id,
    before: before.fields,
    after: parsed.data,
  });
  return parsed.data;
}

export async function setFormActions(
  ctx: CommandContext,
  id: string,
  raw: unknown,
): Promise<FormActions> {
  const parsed = actionsSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new DomainError(t("T-032"));
  }
  const [before] = await ctx.tx.select({ actions: form.actions }).from(form).where(eq(form.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  await ctx.tx.update(form).set({ actions: parsed.data }).where(eq(form.id, id));
  await ctx.audit({
    action: "form.actions-set",
    entityType: "form",
    entityId: id,
    before: before.actions,
    after: parsed.data,
  });
  return parsed.data;
}

/** Cantidad de respuestas de los últimos `days` días por formulario (tablero del admin, T-1042). */
export async function recentSubmissionCounts(
  days = 7,
  now = new Date(),
): Promise<Array<{ formId: string; title: string; slug: string; count: number }>> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await getDb()
    .select({ formId: form.id, title: form.title, slug: form.slug, n: count(formSubmission.id) })
    .from(formSubmission)
    .innerJoin(form, eq(form.id, formSubmission.formId))
    .where(sql`${formSubmission.createdAt} >= ${since}`)
    .groupBy(form.id, form.title, form.slug)
    .orderBy(desc(count(formSubmission.id)));
  return rows.map((row) => ({
    formId: row.formId,
    title: row.title,
    slug: row.slug,
    count: row.n,
  }));
}

/** Formularios por id, para resolver títulos en listados de otros módulos. */
export async function getFormsByIds(
  ids: string[],
): Promise<Map<string, { title: string; slug: string }>> {
  const map = new Map<string, { title: string; slug: string }>();
  if (ids.length === 0) {
    return map;
  }
  const rows = await getDb()
    .select({ id: form.id, title: form.title, slug: form.slug })
    .from(form)
    .where(inArray(form.id, ids));
  for (const row of rows) {
    map.set(row.id, { title: row.title, slug: row.slug });
  }
  return map;
}

// Wrappers con transacción para las acciones del constructor (src/app no abre transacciones).

export function setFormFieldsAs(actor: Actor, id: string, raw: unknown): Promise<FormField[]> {
  return runCommand(actor, (ctx) => setFormFields(ctx, id, raw));
}

export function setFormActionsAs(actor: Actor, id: string, raw: unknown): Promise<FormActions> {
  return runCommand(actor, (ctx) => setFormActions(ctx, id, raw));
}
