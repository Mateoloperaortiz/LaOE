import { and, asc, count, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { opportunity, organization } from "../schema";

// Oportunidades de los aliados (ADR-186): prácticas, empleos, voluntariados y eventos que una
// organización aliada le ofrece a la OE. ADMIN las publica desde la Operación; Mi OE muestra las
// publicadas que no han cerrado, a miembros, a egresados (ADR-184) o a los dos.

export const OPPORTUNITY_KINDS = ["INTERNSHIP", "JOB", "VOLUNTEER", "EVENT", "OTHER"] as const;
export const OPPORTUNITY_AUDIENCES = ["MEMBERS", "ALUMNI", "BOTH"] as const;

export type OpportunityAudience = (typeof OPPORTUNITY_AUDIENCES)[number];

export const opportunityInputSchema = z.object({
  organizationId: z.string().trim().min(1),
  kind: z.enum(OPPORTUNITY_KINDS).default("OTHER"),
  audience: z.enum(OPPORTUNITY_AUDIENCES).default("BOTH"),
  title: z.string().trim().min(3).max(140),
  description: z.string().max(5_000).default(""),
  url: z.url().optional(),
  closesOn: z.iso.date().optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

export type OpportunityInput = z.infer<typeof opportunityInputSchema>;

export type OpportunityRecord = typeof opportunity.$inferSelect;

export interface OpportunityRow extends OpportunityRecord {
  organizationName: string;
}

function toValues(input: OpportunityInput) {
  return {
    organizationId: input.organizationId,
    kind: input.kind,
    audience: input.audience,
    title: input.title,
    description: input.description,
    url: input.url ?? null,
    closesOn: input.closesOn ?? null,
    status: input.status,
  };
}

async function requireOrganization(ctx: CommandContext, organizationId: string): Promise<void> {
  const [row] = await ctx.tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId));
  if (!row) throw new DomainError(t("T-5019"), "organizationId");
}

export async function createOpportunity(
  ctx: CommandContext,
  input: OpportunityInput,
): Promise<{ id: string }> {
  await requireOrganization(ctx, input.organizationId);
  const values = toValues(input);
  const [row] = await ctx.tx
    .insert(opportunity)
    .values({ ...values, createdById: ctx.actor.personId })
    .returning({ id: opportunity.id });
  if (!row) throw new Error("No se pudo crear la oportunidad");
  await ctx.audit({
    action: "opportunity.created",
    entityType: "opportunity",
    entityId: row.id,
    after: values,
  });
  return row;
}

export async function updateOpportunity(
  ctx: CommandContext,
  id: string,
  input: OpportunityInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(opportunity).where(eq(opportunity.id, id));
  if (!before) throw new DomainError(t("T-032"));
  await requireOrganization(ctx, input.organizationId);
  const values = toValues(input);
  await ctx.tx
    .update(opportunity)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(opportunity.id, id));
  await ctx.audit({
    action: "opportunity.updated",
    entityType: "opportunity",
    entityId: id,
    before,
    after: values,
  });
}

function rowsQuery() {
  return getDb()
    .select({ opportunity, organizationName: organization.name })
    .from(opportunity)
    .innerJoin(organization, eq(organization.id, opportunity.organizationId));
}

function flatten(rows: { opportunity: OpportunityRecord; organizationName: string }[]) {
  return rows.map((row) => ({ ...row.opportunity, organizationName: row.organizationName }));
}

export async function listOpportunities(params: {
  page: number;
  pageSize: number;
}): Promise<{ rows: OpportunityRow[]; total: number }> {
  const [rows, [total]] = await Promise.all([
    rowsQuery()
      .orderBy(desc(opportunity.createdAt), asc(opportunity.id))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    getDb().select({ n: count() }).from(opportunity),
  ]);
  return { rows: flatten(rows), total: total?.n ?? 0 };
}

export async function getOpportunity(id: string): Promise<OpportunityRow | null> {
  const [row] = await rowsQuery().where(eq(opportunity.id, id));
  return row ? (flatten([row])[0] ?? null) : null;
}

/**
 * Lo que ve una persona en Mi OE: publicadas, sin cerrar (la fecha de cierre es hoy o después) y para
 * su público. Primero las que cierran antes; las que no tienen fecha, al final.
 */
export async function listOpenOpportunitiesFor(
  access: "MEMBER" | "ALUMNI",
  today = todayKey(),
): Promise<OpportunityRow[]> {
  const audiences: OpportunityAudience[] =
    access === "ALUMNI" ? ["ALUMNI", "BOTH"] : ["MEMBERS", "BOTH"];
  const rows = await rowsQuery()
    .where(
      and(
        eq(opportunity.status, "PUBLISHED"),
        inArray(opportunity.audience, audiences),
        or(isNull(opportunity.closesOn), gte(opportunity.closesOn, today)),
      ),
    )
    .orderBy(asc(opportunity.closesOn), desc(opportunity.createdAt), asc(opportunity.id));
  return flatten(rows);
}
