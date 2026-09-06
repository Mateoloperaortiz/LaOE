import { asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { getEnv } from "@/env";
import { listCommitteesByIds, listMailingRefs, listTermCommitteeMembers } from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { emailTemplate } from "../schema";
import { sendTransactionalEmail } from "./send";
import {
  markdownToMailHtml,
  markdownToPlain,
  renderTemplate,
  type TemplateValues,
  wrapEmail,
} from "./templates-pure";

// Plantillas de correo (ADR-038 regla 8): Markdown con variables por persona; vista previa y prueba
// al propio correo desde el admin.

export type TemplateRow = typeof emailTemplate.$inferSelect;

export const templateInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,60}$/, { message: "T-1117" }),
  name: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(2).max(120),
  body: z.string().max(50_000).default(""),
});

export type TemplateInput = z.infer<typeof templateInputSchema>;

export async function listTemplates(params: {
  q: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: TemplateRow[]; total: number }> {
  const where = params.q
    ? or(ilike(emailTemplate.name, `%${params.q}%`), ilike(emailTemplate.slug, `%${params.q}%`))
    : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(emailTemplate)
      .where(where)
      .orderBy(desc(emailTemplate.updatedAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(emailTemplate).where(where),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export async function getTemplate(id: string): Promise<TemplateRow | null> {
  const [row] = await getDb().select().from(emailTemplate).where(eq(emailTemplate.id, id)).limit(1);
  return row ?? null;
}

export async function listTemplateOptions(): Promise<Array<{ id: string; name: string }>> {
  return getDb()
    .select({ id: emailTemplate.id, name: emailTemplate.name })
    .from(emailTemplate)
    .orderBy(asc(emailTemplate.name));
}

export async function createTemplate(
  ctx: CommandContext,
  input: TemplateInput,
): Promise<{ id: string }> {
  let row: { id: string } | undefined;
  try {
    [row] = await ctx.tx
      .insert(emailTemplate)
      .values({ ...input, createdById: ctx.actor.personId })
      .returning({ id: emailTemplate.id });
  } catch (error) {
    if (isUniqueViolation(error, "email_template_slug_unique")) {
      throw new DomainError(t("T-1122"), "slug");
    }
    throw error;
  }
  if (!row) {
    throw new Error("No se pudo crear la plantilla");
  }
  await ctx.audit({
    action: "email-template.created",
    entityType: "email_template",
    entityId: row.id,
    after: input,
  });
  return row;
}

export async function updateTemplate(
  ctx: CommandContext,
  id: string,
  input: TemplateInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(emailTemplate).where(eq(emailTemplate.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  try {
    await ctx.tx.update(emailTemplate).set(input).where(eq(emailTemplate.id, id));
  } catch (error) {
    if (isUniqueViolation(error, "email_template_slug_unique")) {
      throw new DomainError(t("T-1122"), "slug");
    }
    throw error;
  }
  await ctx.audit({
    action: "email-template.updated",
    entityType: "email_template",
    entityId: id,
    before: { slug: before.slug, name: before.name, subject: before.subject, body: before.body },
    after: input,
  });
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  /** El cuerpo sin `html` ni `body`, para la vista previa del admin. */
  preview: string;
}

/** Asunto y cuerpo de una plantilla para una persona, envueltos según T-207 y T-208. */
export function renderEmail(
  template: { subject: string; body: string },
  values: TemplateValues,
  unsubscribeUrl: string | null,
): RenderedEmail {
  const subject = renderTemplate(template.subject, values);
  const body = renderTemplate(template.body, values);
  const { html, text, preview } = wrapEmail({
    siteName: t("T-001"),
    bodyHtml: markdownToMailHtml(body),
    bodyText: markdownToPlain(body),
    closing: t("T-002"),
    footer: t("T-208"),
    ...(unsubscribeUrl ? { unsubscribe: { label: t("T-210"), url: unsubscribeUrl } } : {}),
  });
  return { subject, html, text, preview };
}

export interface CommitteeIndex {
  /** Comités del término vigente por persona, con sus nombres. */
  byPerson: Map<string, string[]>;
}

/** Comités del término vigente por persona, para la variable {comités}. */
export async function loadCommitteeIndex(personIds: string[]): Promise<CommitteeIndex> {
  const term = await getCurrentTerm();
  const byPerson = new Map<string, string[]>();
  if (!term || personIds.length === 0) {
    return { byPerson };
  }
  const wanted = new Set(personIds);
  const rows = (await listTermCommitteeMembers(term.id)).filter(
    (row) => wanted.has(row.personId) && row.leftAt === null,
  );
  const names = new Map(
    (await listCommitteesByIds([...new Set(rows.map((row) => row.committeeId))])).map((item) => [
      item.id,
      item.name,
    ]),
  );
  for (const row of rows) {
    const list = byPerson.get(row.personId) ?? [];
    const name = names.get(row.committeeId);
    if (name) {
      list.push(name);
    }
    byPerson.set(row.personId, list);
  }
  return { byPerson };
}

export function valuesFor(
  ref: { firstName: string; lastName: string; preferredName: string | null; email: string },
  committees: string[],
  semester: string,
): TemplateValues {
  return {
    nombre: ref.preferredName || ref.firstName,
    apellido: ref.lastName,
    correo: ref.email,
    comités: committees.join(", "),
    semestre: semester,
    url: getEnv().APP_URL,
  };
}

/** Vista previa con los datos de una persona (el actor, desde el admin). */
export async function previewTemplateFor(
  templateId: string,
  personId: string,
): Promise<RenderedEmail | null> {
  const template = await getTemplate(templateId);
  if (!template) {
    return null;
  }
  const refs = await listMailingRefs([personId]);
  const ref = refs.get(personId);
  if (!ref) {
    return null;
  }
  const [{ byPerson }, term] = await Promise.all([
    loadCommitteeIndex([personId]),
    getCurrentTerm(),
  ]);
  return renderEmail(
    template,
    valuesFor(ref, byPerson.get(personId) ?? [], term?.code ?? ""),
    `${getEnv().APP_URL}/baja/ejemplo`,
  );
}

/** "Enviarme una prueba": la plantilla al correo del actor por el mailer transaccional, asunto con T-209. */
export async function sendTemplateTestAs(
  actor: Actor,
  templateId: string,
): Promise<{ to: string } | null> {
  const personId = actor.personId;
  if (!personId) {
    throw new Error("Sin persona");
  }
  const rendered = await previewTemplateFor(templateId, personId);
  const ref = (await listMailingRefs([personId])).get(personId);
  if (!rendered || !ref) {
    return null;
  }
  await sendTransactionalEmail({
    personId,
    to: ref.email,
    subject: `${t("T-209")} ${rendered.subject}`,
    text: rendered.text,
    html: rendered.html,
  });
  await runCommand(actor, (ctx) =>
    ctx.audit({
      action: "email-template.test-sent",
      entityType: "email_template",
      entityId: templateId,
      after: { to: ref.email },
    }),
  );
  return { to: ref.email };
}
