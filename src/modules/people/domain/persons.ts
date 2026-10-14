import { and, asc, count, eq, exists, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext, Executor, Tx } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { personEmailChanged, personUpdated } from "@/domain-events/people";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { committee, committeeMembership, committeeRole, membership, person } from "../schema";
import { committeeRolesLabel } from "./committee-direction-pure";
import { rolesOf } from "./committee-memberships";
import { listLiveRolesByMembership } from "./committee-role-assignments";
import { birthDateSchema, documentTypeSchema, normalizePhone } from "./person-pure";

// La persona como eje del CRM (ADR-002): alta manual, edición por ADMIN y listado del admin.

export type PersonRecord = typeof person.$inferSelect;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254));

export const personInputSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  kind: z.enum(["STUDENT", "EXTERNAL"]).default("STUDENT"),
  preferredName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  personalEmail: emailSchema.optional(),
  program: z.string().trim().max(120).optional(),
  documentType: documentTypeSchema
    .or(z.literal("").transform(() => null))
    .nullable()
    .optional(),
  documentNumber: z
    .string()
    .trim()
    .max(80)
    .transform((value) => value || null)
    .nullable()
    .optional(),
  epikId: z
    .string()
    .trim()
    .max(80)
    .transform((value) => value || null)
    .nullable()
    .optional(),
  birthDate: birthDateSchema
    .or(z.literal("").transform(() => null))
    .nullable()
    .optional(),
});

export type PersonInput = z.infer<typeof personInputSchema>;

function toValues(input: PersonInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    kind: input.kind,
    preferredName: input.preferredName ?? null,
    phone: input.phone ? normalizePhone(input.phone).value : null,
    personalEmail: input.personalEmail ?? null,
    program: input.program ?? null,
    ...(input.documentType !== undefined ? { documentType: input.documentType } : {}),
    ...(input.documentNumber !== undefined ? { documentNumber: input.documentNumber } : {}),
    ...(input.epikId !== undefined ? { epikId: input.epikId } : {}),
    ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
  };
}

/** Alta manual de un prospecto o contacto externo; los miembros entran por el roster o por "dar de alta". */
export async function createPerson(
  ctx: CommandContext,
  input: PersonInput,
): Promise<{ id: string }> {
  const values = toValues(input);
  try {
    const [row] = await ctx.tx
      .insert(person)
      .values({ ...values, stage: "PROSPECT", source: "ADMIN" })
      .returning({ id: person.id });
    if (!row) {
      throw new Error("No se pudo crear la persona");
    }
    await ctx.audit({
      action: "person.created",
      entityType: "person",
      entityId: row.id,
      after: values,
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "person_email_unique")) {
      throw new DomainError(t("T-430"), "email");
    }
    throw error;
  }
}

export const formPersonSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional(),
  program: z.string().trim().max(120).optional(),
});

export type FormPersonInput = z.infer<typeof formPersonSchema>;

/**
 * Vincula o crea la persona de una respuesta de formulario por correo normalizado (ADR-013, ADR-037):
 * si existe, no toca sus datos; si no, nace como prospecto con `source = FORM`. Nunca crea miembros.
 */
export async function findOrCreatePersonFromForm(
  ctx: CommandContext,
  input: FormPersonInput,
): Promise<{
  id: string;
  created: boolean;
  stage: PersonRecord["stage"];
  kind: PersonRecord["kind"];
}> {
  const [existing] = await ctx.tx
    .select({ id: person.id, stage: person.stage, kind: person.kind })
    .from(person)
    .where(eq(person.email, input.email))
    .for("update");
  if (existing) {
    return { ...existing, created: false };
  }
  const values = {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone ? normalizePhone(input.phone).value : null,
    program: input.program ?? null,
  };
  const [row] = await ctx.tx
    .insert(person)
    .values({ ...values, kind: "STUDENT", stage: "PROSPECT", source: "FORM" })
    .returning({ id: person.id });
  if (!row) {
    throw new Error("No se pudo crear la persona");
  }
  await ctx.audit({
    action: "person.created",
    entityType: "person",
    entityId: row.id,
    after: { ...values, source: "FORM" },
  });
  return { id: row.id, created: true, stage: "PROSPECT", kind: "STUDENT" };
}

const EDITABLE = [
  "firstName",
  "lastName",
  "email",
  "kind",
  "preferredName",
  "phone",
  "personalEmail",
  "program",
  "documentType",
  "documentNumber",
  "epikId",
  "birthDate",
] as const;

/** Edición por ADMIN; cambiar el correo invalida las sesiones anteriores (ADR-034). */
export async function updatePerson(
  ctx: CommandContext,
  id: string,
  input: PersonInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(person).where(eq(person.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const values = toValues(input);
  const changed = EDITABLE.filter(
    (field) => values[field] !== undefined && before[field] !== values[field],
  );
  if (changed.length === 0) {
    return;
  }
  const emailChanged = changed.includes("email");
  try {
    await ctx.tx
      .update(person)
      .set({ ...values, ...(emailChanged ? { sessionsRevokedAt: sql`now()` } : {}) })
      .where(eq(person.id, id));
  } catch (error) {
    if (isUniqueViolation(error, "person_email_unique")) {
      throw new DomainError(t("T-430"), "email");
    }
    throw error;
  }
  await ctx.audit({
    action: "person.updated",
    entityType: "person",
    entityId: id,
    before: Object.fromEntries(changed.map((field) => [field, before[field]])),
    after: Object.fromEntries(changed.map((field) => [field, values[field]])),
  });
  await ctx.emit(
    eventOf(personUpdated, { actorId: ctx.actor.personId, personId: id, fields: changed }),
  );
  if (emailChanged) {
    await ctx.emit(eventOf(personEmailChanged, { actorId: ctx.actor.personId, personId: id }));
  }
}

export interface PersonRow {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  documentType: string | null;
  documentNumber: string | null;
  epikId: string | null;
  birthDate: string | null;
  kind: PersonRecord["kind"];
  stage: PersonRecord["stage"];
  membershipStatus: (typeof membership.$inferSelect)["status"] | null;
  firstTermCode: string | null;
  /** "A3 · General", en el término actual. */
  committees: string[];
  anonymized: boolean;
}

export interface PersonListParams {
  q: string;
  stage?: string | undefined;
  status?: string | undefined;
  committeeId?: string | undefined;
  /** Ids de personas a las que se acota el listado (un segmento); vacío devuelve nada. */
  personIds?: string[] | undefined;
  page: number;
  pageSize: number;
}

const STAGES = ["PROSPECT", "APPLICANT", "MEMBER", "ALUMNI"] as const;
const STATUSES = ["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"] as const;

function isOneOf<T extends string>(value: string | undefined, options: readonly T[]): value is T {
  return value !== undefined && (options as readonly string[]).includes(value);
}

/** Códigos de término por id: los términos son pocos y viven en otro módulo (sin join entre esquemas). */
export async function termCodesById(): Promise<Map<string, string>> {
  return new Map((await listAllTerms()).map((row) => [row.id, row.code]));
}

export async function listPeople(
  params: PersonListParams,
): Promise<{ rows: PersonRow[]; total: number }> {
  const db = getDb();
  const current = await getCurrentTerm();
  const conditions = [];
  if (params.q) {
    const pattern = `%${params.q}%`;
    conditions.push(
      or(
        sql`similarity(${person.fullName}, ${params.q}) > 0.2`,
        ilike(person.fullName, pattern),
        ilike(person.email, pattern),
      ),
    );
  }
  if (isOneOf(params.stage, STAGES)) {
    conditions.push(eq(person.stage, params.stage));
  }
  if (isOneOf(params.status, STATUSES)) {
    conditions.push(eq(membership.status, params.status));
  }
  if (params.committeeId && current) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(committeeMembership)
          .where(
            and(
              eq(committeeMembership.personId, person.id),
              eq(committeeMembership.committeeId, params.committeeId),
              eq(committeeMembership.termId, current.id),
              isNull(committeeMembership.leftAt),
            ),
          ),
      ),
    );
  }
  if (params.personIds !== undefined) {
    if (params.personIds.length === 0) {
      return { rows: [], total: 0 };
    }
    conditions.push(inArray(person.id, params.personIds));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [rows, [total], termCodes] = await Promise.all([
    db
      .select({
        id: person.id,
        fullName: person.fullName,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        documentType: person.documentType,
        documentNumber: person.documentNumber,
        epikId: person.epikId,
        birthDate: person.birthDate,
        kind: person.kind,
        stage: person.stage,
        anonymizedAt: person.anonymizedAt,
        membershipStatus: membership.status,
        firstTermId: membership.firstTermId,
      })
      .from(person)
      .leftJoin(membership, eq(membership.personId, person.id))
      .where(where)
      .orderBy(asc(person.fullName))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db
      .select({ n: count() })
      .from(person)
      .leftJoin(membership, eq(membership.personId, person.id))
      .where(where),
    termCodesById(),
  ]);
  const committeesByPerson = current
    ? await currentCommitteesFor(
        rows.map((row) => row.id),
        current.id,
      )
    : new Map<string, string[]>();
  return {
    total: total?.n ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      fullName: row.fullName ?? "",
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      epikId: row.epikId,
      birthDate: row.birthDate,
      kind: row.kind,
      stage: row.stage,
      membershipStatus: row.membershipStatus,
      firstTermCode: row.firstTermId ? (termCodes.get(row.firstTermId) ?? null) : null,
      committees: committeesByPerson.get(row.id) ?? [],
      anonymized: row.anonymizedAt !== null,
    })),
  };
}

/** "A3 · General" por persona en un término (pertenencias vivas). */
export async function currentCommitteesFor(
  personIds: string[],
  termId: string,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (personIds.length === 0) {
    return map;
  }
  const rows = await getDb()
    .select({
      id: committeeMembership.id,
      personId: committeeMembership.personId,
      name: committee.name,
      role: committeeRole.label,
    })
    .from(committeeMembership)
    .innerJoin(committee, eq(committee.id, committeeMembership.committeeId))
    .innerJoin(committeeRole, eq(committeeRole.code, committeeMembership.roleCode))
    .where(
      and(
        inArray(committeeMembership.personId, personIds),
        eq(committeeMembership.termId, termId),
        isNull(committeeMembership.leftAt),
      ),
    )
    .orderBy(asc(committee.name));
  const roles = await listLiveRolesByMembership(
    getDb(),
    rows.map((row) => row.id),
  );
  for (const row of rows) {
    const list = map.get(row.personId) ?? [];
    list.push(`${row.name} · ${committeeRolesLabel(rolesOf(roles, row.id), row.role)}`);
    map.set(row.personId, list);
  }
  return map;
}

export async function getPersonRecord(
  id: string,
  exec: Executor = getDb(),
): Promise<PersonRecord | null> {
  const [row] = await exec.select().from(person).where(eq(person.id, id)).limit(1);
  return row ?? null;
}

/**
 * Para quien va a escribir texto que la persona aportó (ADR-114 regla 4): dice si ya fue anonimizada
 * y la toma con candado compartido de fila hasta el fin de la transacción. `anonymizePerson` la toma
 * `for update`, así que se serializan: o la anonimización ya pasó y se ve aquí, o espera a que esta
 * transacción termine y su aviso encuentra el texto ya escrito. Compartido y no `for update`: no hace
 * cola con quien solo referencia a la persona por clave foránea. `null` si la persona no existe.
 */
export async function lockPersonAnonymization(
  tx: Tx,
  personId: string,
): Promise<{ anonymized: boolean } | null> {
  const [row] = await tx
    .select({ anonymizedAt: person.anonymizedAt })
    .from(person)
    .where(eq(person.id, personId))
    .for("share");
  return row ? { anonymized: row.anonymizedAt !== null } : null;
}
