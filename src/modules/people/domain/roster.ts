import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { personImported } from "@/domain-events/people";
import { getEnv } from "@/env";
import {
  createImportJob,
  getImportJob,
  type ImportJobRow,
  type ImportJobType,
  requirePrivacyPolicyVersion,
  takeImportJobApplied,
  takeImportJobInPreview,
  updateImportJob,
} from "@/modules/system";
import { conventionalTermDates, createTerm, getTerm, listAllTerms } from "@/modules/terms";
import { getObject, putObject } from "@/shared/adapters/storage";
import { t, tLabels } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import {
  committee,
  committeeMembership,
  committeeRole,
  committeeRoleAssignment,
  membership,
  membershipTerm,
  person,
} from "../schema";
import {
  type CommitteeRoleRow,
  canHoldCommittees,
  listCommitteeRoles,
  setCommitteeMembershipsIfChanged,
} from "./committee-memberships";
import { listAllCommittees } from "./committees";
import { leadershipContext } from "./inhabilities";
import {
  type HeldRole,
  INHABILITY_CODES,
  inhabilities,
  inhabilityLabels,
} from "./inhabilities-pure";
import { leaveWindow } from "./leave-pure";
import {
  changeMembershipStatus,
  endMembership,
  honoraryBlockedAmong,
  reactivateMembership,
} from "./membership";
import { createCommitteeRole } from "./roles";
import { ROSTER_MAX_BYTES, readRosterCells, rosterFormat } from "./roster-file";
import {
  type DiffGroup,
  detectMapping,
  diffRoster,
  type ExistingPerson,
  ROSTER_COLUMNS,
  type RosterColumn,
  type RosterStatus,
  rowsFromCells,
  staysInactive,
  validateRoster,
} from "./roster-pure";
import { lockMembershipCycleByEmail, lockMembershipCycles } from "./wallet-member";

// El asistente del roster (13-importacion-del-roster.md, ADR-034): el archivo se guarda en el bucket, la
// vista previa vive en un ImportJob y confirmar aplica todo en una transacción, idempotente por correo.

/**
 * El tipo de los trabajos del roster: con él se crean y con él se toman. Un trabajo de otro tipo no
 * existe para el roster, esté en el estado que esté (ADR-116 regla 12).
 */
const ROSTER_JOB: ImportJobType = "ROSTER";

const columnSchema = z.enum(ROSTER_COLUMNS).nullable();
const mappingSchema = z.array(columnSchema);

const previewRowSchema = z.object({
  row: z.number(),
  email: z.string().nullable(),
  values: z.record(z.string(), z.string()),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  program: z.string().optional(),
  personalEmail: z.string().optional(),
  notes: z.string().optional(),
  documentType: z.string().optional(),
  documentNumber: z.string().optional(),
  epikId: z.string().optional(),
  birthDate: z.string().optional(),
  committees: z
    .array(
      z.object({
        committeeId: z.string(),
        slug: z.string(),
        name: z.string(),
        roleCode: z.string(),
        roles: z
          .array(
            z.object({
              roleCode: z.string(),
              coDirector: z.boolean().default(false),
              newLabel: z.string().optional(),
            }),
          )
          .default([]),
        newRoleLabel: z.string().optional(),
      }),
    )
    .optional(),
  entryTerm: z.string().optional(),
  status: z.enum(["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"]).optional(),
  probation: z.boolean().optional(),
  transferSlug: z.string().nullable().optional(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  group: z.enum(["NEW", "CHANGED", "UNCHANGED", "ERROR"]),
  changes: z.array(z.enum(ROSTER_COLUMNS)),
});

export const leaderProposalSchema = z.object({
  email: z.string(),
  personName: z.string(),
  committeeId: z.string(),
  committeeName: z.string(),
  /** La codirección de General también recibe la propuesta de líder (ADR-058). */
  coDirector: z.boolean().default(false),
});

const previewPayloadSchema = z.object({
  headers: z.array(z.string()),
  mapping: mappingSchema,
  format: z.enum(["csv", "xlsx"]),
  updateMode: z.boolean(),
  missingRequired: z.array(z.enum(ROSTER_COLUMNS)),
  missingTerms: z.array(z.string()),
  unknownRoles: z.array(z.string()),
  rows: z.array(previewRowSchema),
  proposals: z.array(leaderProposalSchema),
});

export type PreviewRow = z.infer<typeof previewRowSchema>;
export type LeaderProposal = z.infer<typeof leaderProposalSchema>;

export interface RosterPreview extends z.infer<typeof previewPayloadSchema> {
  jobId: string;
  filename: string;
  termId: string;
  termCode: string;
  status: ImportJobRow["status"];
  summary: Record<string, unknown>;
  counts: Record<DiffGroup, number>;
}

async function existingByEmail(
  emails: string[],
  termId: string,
): Promise<Map<string, ExistingPerson>> {
  const map = new Map<string, ExistingPerson>();
  if (emails.length === 0) {
    return map;
  }
  const db = getDb();
  const people = await db
    .select({
      id: person.id,
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone,
      program: person.program,
      personalEmail: person.personalEmail,
      documentType: person.documentType,
      documentNumber: person.documentNumber,
      epikId: person.epikId,
      birthDate: person.birthDate,
      firstTermId: membership.firstTermId,
      status: membership.status,
      endReason: membership.endReason,
    })
    .from(person)
    .leftJoin(membership, eq(membership.personId, person.id))
    .where(inArray(person.email, emails));
  const ids = people.map((row) => row.id);
  if (ids.length === 0) {
    return map;
  }
  const [committees, probations, terms, honoraryBlocked] = await Promise.all([
    db
      .select({
        personId: committeeMembership.personId,
        slug: committee.slug,
        roleCode: committeeMembership.roleCode,
        transferredIn: committeeMembership.transferredIn,
        leftAt: committeeMembership.leftAt,
      })
      .from(committeeMembership)
      .innerJoin(committee, eq(committee.id, committeeMembership.committeeId))
      .where(
        and(inArray(committeeMembership.personId, ids), eq(committeeMembership.termId, termId)),
      ),
    db
      .select({ personId: membershipTerm.personId, probation: membershipTerm.probation })
      .from(membershipTerm)
      .where(
        and(
          inArray(membershipTerm.personId, ids),
          eq(membershipTerm.termId, termId),
          isNull(membershipTerm.committeeId),
        ),
      ),
    listAllTerms(),
    // A quién el comando le rechazaría el paso a honorario: la fila que lo pida es un error de la
    // vista previa y no tumba la importación (ADR-123 regla 5).
    honoraryBlockedAmong(ids),
  ]);
  const assignments = await db
    .select({
      personId: committeeRoleAssignment.personId,
      slug: committee.slug,
      roleCode: committeeRoleAssignment.roleCode,
      coDirector: committeeRoleAssignment.coDirector,
    })
    .from(committeeRoleAssignment)
    .innerJoin(committee, eq(committee.id, committeeRoleAssignment.committeeId))
    .where(
      and(
        inArray(committeeRoleAssignment.personId, ids),
        eq(committeeRoleAssignment.termId, termId),
        isNull(committeeRoleAssignment.endedAt),
      ),
    );
  for (const row of people) {
    map.set(row.email, {
      personId: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      program: row.program,
      personalEmail: row.personalEmail,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      epikId: row.epikId,
      birthDate: row.birthDate,
      entryTerm: terms.find((term) => term.id === row.firstTermId)?.code ?? null,
      status: row.status,
      endReason: row.endReason,
      probation: probations.some((item) => item.personId === row.id && item.probation),
      honoraryBlocked: honoraryBlocked.has(row.id),
      committees: committees
        .filter((item) => item.personId === row.id && item.leftAt === null)
        .map((item) => ({
          slug: item.slug,
          roleCode: item.roleCode,
          roles: assignments
            .filter((role) => role.personId === row.id && role.slug === item.slug)
            .map((role) => ({ roleCode: role.roleCode, coDirector: role.coDirector })),
          transferredIn: item.transferredIn,
        })),
    });
  }
  return map;
}

interface BuiltPreview {
  headers: string[];
  mapping: Array<RosterColumn | null>;
  validation: ReturnType<typeof validateRoster>;
  rows: PreviewRow[];
  proposals: LeaderProposal[];
  existing: Map<string, ExistingPerson>;
}

/**
 * Aviso por fila cuando los cargos del roster chocan con una inhabilidad (ADR-060 regla 11): la
 * fila entera es el conjunto final de cargos de comité de la persona; quien no existe aún es nuevo.
 */
async function warnInhabilities(
  rows: PreviewRow[],
  existing: Map<string, ExistingPerson>,
  roles: CommitteeRoleRow[],
  termId: string,
): Promise<void> {
  const leadership = new Set(roles.filter((role) => role.isLeadership).map((role) => role.code));
  const labels = tLabels("T-2281", INHABILITY_CODES);
  for (const row of rows) {
    if (row.group === "ERROR" || !row.email || !row.committees) {
      continue;
    }
    const wanted: HeldRole[] = row.committees.flatMap((item) =>
      item.roles
        .filter((role) => leadership.has(role.roleCode))
        .map((role) => ({
          kind: "COMMITTEE" as const,
          scopeId: item.committeeId,
          roleCode: role.roleCode,
          coDirector: role.coDirector,
        })),
    );
    if (wanted.length === 0) {
      continue;
    }
    const who = existing.get(row.email);
    const context = who
      ? await leadershipContext(getDb(), who.personId, termId)
      : { existing: [], hasBoardAppointment: false, isNew: true, officeBan: false };
    const codes = inhabilities({
      existing: context.existing.filter((role) => role.kind === "MACROEVENT"),
      wanted,
      hasBoardAppointment: context.hasBoardAppointment,
      isNew: context.isNew,
      officeBan: context.officeBan,
    });
    if (codes.length > 0) {
      row.warnings.push(t("T-2285", { motivos: inhabilityLabels(codes, labels).join("; ") }));
    }
  }
}

async function buildPreview(
  cells: string[][],
  mapping: Array<RosterColumn | null> | null,
  termId: string,
): Promise<BuiltPreview> {
  const headers = cells[0] ?? [];
  const resolvedMapping = mapping ?? detectMapping(headers);
  const inputs = rowsFromCells(cells, resolvedMapping);
  const emails = inputs
    .map((input) => (input.values.email ?? "").trim().toLowerCase())
    .filter(Boolean);
  const [committees, roles, terms, existing] = await Promise.all([
    listAllCommittees(),
    listCommitteeRoles(),
    listAllTerms(),
    existingByEmail(emails, termId),
  ]);
  const validation = validateRoster(inputs, resolvedMapping, {
    committees,
    roles: roles.map((role) => ({
      code: role.code,
      label: role.label,
      retired: role.retired,
      replacedByCode: role.replacedByCode,
    })),
    termCodes: terms.map((term) => term.code),
    domains: getEnv().INSTITUTIONAL_EMAIL_DOMAINS,
    existing,
  });
  const diff = diffRoster(validation.rows, existing);
  const rows: PreviewRow[] = diff.map((item) => ({
    ...item.row,
    values: Object.fromEntries(
      Object.entries(item.row.values).map(([key, value]) => [key, value ?? ""]),
    ),
    group: item.group,
    changes: item.changes,
  }));
  await warnInhabilities(rows, existing, roles, termId);
  const proposals: LeaderProposal[] = [];
  for (const row of rows) {
    if (row.group === "ERROR" || !row.email) {
      continue;
    }
    for (const item of row.committees ?? []) {
      for (const role of item.roles.filter((role) => role.roleCode === "GENERAL")) {
        proposals.push({
          email: row.email,
          personName:
            `${row.firstName ?? existing.get(row.email)?.firstName ?? ""} ${row.lastName ?? existing.get(row.email)?.lastName ?? ""}`.trim(),
          committeeId: item.committeeId,
          committeeName: item.name,
          coDirector: role.coDirector,
        });
      }
    }
  }
  return { headers, mapping: resolvedMapping, validation, rows, proposals, existing };
}

function payloadOf(built: BuiltPreview, format: "csv" | "xlsx") {
  return {
    headers: built.headers,
    mapping: built.mapping,
    format,
    updateMode: built.validation.updateMode,
    missingRequired: built.validation.missingRequired,
    missingTerms: built.validation.missingTerms,
    unknownRoles: built.validation.unknownRoles,
    rows: built.rows,
    proposals: built.proposals,
  };
}

function countGroups(rows: PreviewRow[]): Record<DiffGroup, number> {
  const counts: Record<DiffGroup, number> = { NEW: 0, CHANGED: 0, UNCHANGED: 0, ERROR: 0 };
  for (const row of rows) {
    counts[row.group] += 1;
  }
  return counts;
}

export interface CreatePreviewInput {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  termId: string;
}

function fileKeyFor(jobId: string, format: "csv" | "xlsx", now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `imports/${year}/${month}/${jobId}.${format}`;
}

/** Paso 1: guarda el original en el bucket, lo lee, valida y deja la vista previa en un ImportJob. */
export async function createRosterPreviewAs(
  actor: Actor,
  input: CreatePreviewInput,
): Promise<{ jobId: string }> {
  const format = rosterFormat(input.filename, input.contentType);
  if (!format || input.bytes.byteLength === 0 || input.bytes.byteLength > ROSTER_MAX_BYTES) {
    throw new DomainError(t("T-488"), "file");
  }
  const terms = await listAllTerms();
  const term = terms.find((item) => item.id === input.termId);
  if (!term) {
    throw new DomainError(t("T-260"), "termId");
  }
  let cells: string[][];
  try {
    cells = await readRosterCells(input.bytes, format);
  } catch {
    throw new DomainError(t("T-488"), "file");
  }
  if (cells.length < 2) {
    throw new DomainError(t("T-488"), "file");
  }
  const built = await buildPreview(cells, null, term.id);
  const fileKey = fileKeyFor(createId(), format);
  await putObject(
    fileKey,
    input.bytes,
    format === "csv"
      ? "text/csv"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  const job = await runCommand(actor, (ctx) =>
    createImportJob(ctx, {
      type: ROSTER_JOB,
      filename: input.filename,
      fileKey,
      termId: term.id,
      mapping: { columns: built.mapping },
      payload: payloadOf(built, format),
      summary: countGroups(built.rows),
    }),
  );
  return { jobId: job.id };
}

export async function getRosterPreview(jobId: string): Promise<RosterPreview | null> {
  const job = await getImportJob(jobId);
  if (!job || job.type !== ROSTER_JOB || !job.termId) {
    return null;
  }
  const parsed = previewPayloadSchema.safeParse(job.payload);
  if (!parsed.success) {
    return null;
  }
  const terms = await listAllTerms();
  return {
    ...parsed.data,
    jobId: job.id,
    filename: job.filename,
    termId: job.termId,
    termCode: terms.find((term) => term.id === job.termId)?.code ?? "",
    status: job.status,
    summary: job.summary,
    counts: countGroups(parsed.data.rows),
  };
}

/**
 * Paso 2: el admin corrige el mapeo de columnas; se relee el archivo del bucket y se vuelve a validar.
 * Que el trabajo siga en vista previa lo decide la transacción, que lo toma antes de escribir.
 */
export async function remapRosterPreviewAs(
  actor: Actor,
  jobId: string,
  mapping: Array<RosterColumn | null>,
): Promise<void> {
  const job = await getImportJob(jobId);
  if (!job?.fileKey || !job.termId) {
    throw new DomainError(t("T-032"));
  }
  const current = previewPayloadSchema.safeParse(job.payload);
  if (!current.success) {
    throw new DomainError(t("T-032"));
  }
  const bytes = await getObject(job.fileKey);
  const cells = await readRosterCells(bytes, current.data.format);
  const built = await buildPreview(cells, mapping, job.termId);
  await runCommand(actor, async (ctx) => {
    await takeImportJobInPreview(ctx, jobId, ROSTER_JOB);
    await updateImportJob(ctx, jobId, {
      mapping: { columns: built.mapping },
      payload: payloadOf(built, current.data.format),
      summary: countGroups(built.rows),
    });
  });
}

export interface ApplySummary {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  termsCreated: string[];
  rolesCreated: string[];
  proposals: LeaderProposal[];
}

async function ensureTerms(ctx: CommandContext, codes: string[]): Promise<Map<string, string>> {
  const terms = await listAllTerms();
  const byCode = new Map(terms.map((term) => [term.code, term.id]));
  for (const code of codes) {
    if (byCode.has(code)) {
      continue;
    }
    const created = await createTerm(ctx, {
      code,
      ...conventionalTermDates(code),
      requiredOrdinaryAssemblies: 1,
      permanenceGeneralNominal: 50,
      permanenceCommitteeNominal: 60,
    });
    byCode.set(code, created.id);
  }
  return byCode;
}

async function ensureRoles(ctx: CommandContext, rows: PreviewRow[]): Promise<string[]> {
  const known = new Set(
    (await ctx.tx.select({ code: committeeRole.code }).from(committeeRole)).map((r) => r.code),
  );
  const created: string[] = [];
  for (const row of rows) {
    for (const item of row.committees ?? []) {
      const pending = item.roles
        .filter((role) => role.newLabel !== undefined)
        .map((role) => ({ code: role.roleCode, label: role.newLabel as string }));
      if (item.newRoleLabel && pending.length === 0) {
        pending.push({ code: item.roleCode, label: item.newRoleLabel });
      }
      for (const role of pending) {
        if (known.has(role.code)) {
          continue;
        }
        await createCommitteeRole(ctx, {
          code: role.code,
          label: role.label,
          isLeadership: false,
          required: false,
          capabilities: [],
          retired: false,
          replacedByCode: null,
          sortOrder: 50,
        });
        known.add(role.code);
        created.push(role.label);
      }
    }
  }
  return created;
}

/**
 * El roster no trae regreso previsto: una licencia importada vence al fin del término importado,
 * dentro de la ventana de un año desde hoy (Est. art. 5.4; ADR-060 regla 10).
 */
async function rosterLeaveUntil(
  ctx: CommandContext,
  status: RosterStatus,
  termId: string,
): Promise<{ leaveUntil?: string }> {
  if (status !== "ON_LEAVE") {
    return {};
  }
  const [rosterTerm, window] = [await getTerm(termId, ctx.tx), leaveWindow(todayKey())];
  const endsOn = rosterTerm?.endsOn ?? window.min;
  return {
    leaveUntil: endsOn < window.min ? window.min : endsOn > window.max ? window.max : endsOn,
  };
}

/**
 * La membresía que crea el roster, para una persona nueva o para una que existía sin ella. Si nace en
 * licencia lleva su fecha de regreso, igual que la que pasa a licencia (ADR-060 regla 10): sin ella
 * nunca vence ni abre la tarea de licencia vencida.
 */
async function insertRosterMembership(
  ctx: CommandContext,
  input: {
    personId: string;
    status: Parameters<typeof rosterLeaveUntil>[1];
    entryTermId: string;
    termId: string;
  },
): Promise<void> {
  const { personId, status, entryTermId, termId } = input;
  await ctx.tx.insert(membership).values({
    personId,
    status,
    firstTermId: entryTermId,
    ...(await rosterLeaveUntil(ctx, status, termId)),
    ...(status === "INACTIVE"
      ? { endedAt: new Date(), endReason: "OTHER" as const, lastTermId: termId }
      : {}),
  });
}

async function membershipHoldsCommittees(ctx: CommandContext, personId: string): Promise<boolean> {
  const [row] = await ctx.tx
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, personId));
  return canHoldCommittees(row?.status);
}

/**
 * La persona de un correo, tomada en el orden del ciclo de membresía (ADR-120 regla 3): primero el
 * candado consultivo `wallet-member:<persona>` y después su fila. Dar de baja, cambiar el estado,
 * reactivar y anonimizar toman ese consultivo antes que cualquier fila; con la fila tomada primero,
 * el roster y cualquiera de ellos se quedaban esperándose.
 *
 * La fila se lee con el consultivo ya tomado y por `id` y correo: si mientras se esperaba el correo
 * dejó de ser de esa persona (la anonimizaron o GH se lo corrigió), se vuelve a buscar. El consultivo
 * que quedó tomado de más se suelta con la transacción.
 *
 * La fila se toma con `for no key update`, que es el candado del `update` que le sigue: frena a quien
 * la actualice, la anonimice o la tome compartida, y no a quien solo la referencia por clave foránea.
 * La importación retiene hasta el final a todas las personas del archivo, y entre ellas está quien
 * actúa: el comando de GH sobre otra persona escribe su `id` como actor (`membership_event`,
 * `audit_log`) con el consultivo de esa persona tomado. Con `for update` esa escritura esperaba a la
 * importación mientras la importación esperaba ese consultivo.
 */
async function lockPersonByEmail(
  ctx: CommandContext,
  email: string,
): Promise<LockedPerson | undefined> {
  const personId = await lockMembershipCycleByEmail(ctx.tx, email);
  if (personId === null) {
    return undefined;
  }
  const [locked] = await ctx.tx
    .select(LOCKED_COLUMNS)
    .from(person)
    .where(and(eq(person.id, personId), eq(person.email, email)))
    .for("no key update");
  return locked ?? lockPersonByEmail(ctx, email);
}

/** Lo que una fila del roster le puede escribir a una persona que ya existe. */
const PATCH_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "program",
  "personalEmail",
  "documentType",
  "documentNumber",
  "epikId",
  "birthDate",
] as const;

type PersonPatch = Partial<Pick<typeof person.$inferInsert, (typeof PATCH_FIELDS)[number]>>;
type LockedPerson = Pick<typeof person.$inferSelect, "id" | (typeof PATCH_FIELDS)[number]>;

const LOCKED_COLUMNS = {
  id: person.id,
  firstName: person.firstName,
  lastName: person.lastName,
  phone: person.phone,
  program: person.program,
  personalEmail: person.personalEmail,
  documentType: person.documentType,
  documentNumber: person.documentNumber,
  epikId: person.epikId,
  birthDate: person.birthDate,
};

/**
 * De lo que trae la fila, lo que de verdad le cambia a la persona, comparado con su fila ya tomada:
 * el diff se calculó antes de los candados y alguien pudo editarla en ese rato (ADR-120 regla 2).
 */
function onlyChanges(current: LockedPerson, patch: PersonPatch): PersonPatch {
  const changes: PersonPatch = {};
  for (const field of PATCH_FIELDS) {
    const value = patch[field];
    if (value !== undefined && value !== current[field]) {
      Object.assign(changes, { [field]: value });
    }
  }
  return changes;
}

async function applyRow(
  ctx: CommandContext,
  row: PreviewRow,
  termId: string,
  termCode: string,
  termsByCode: Map<string, string>,
  jobId: string,
): Promise<"created" | "updated" | "unchanged"> {
  const email = row.email;
  if (!email) {
    return "unchanged";
  }
  const reason = `roster ${termCode}`;
  const existing = await lockPersonByEmail(ctx, email);
  let personId: string;
  let outcome: "created" | "updated" | "unchanged" =
    row.group === "UNCHANGED" ? "unchanged" : "updated";
  const status: RosterStatus = row.status ?? "ACTIVE";
  // Quien ya estaba de baja y esta fila no lo saca de ahí: se decide con la membresía leída acá, no
  // con la de la vista previa.
  let keepsOut = false;
  if (!existing) {
    const entryTermId = row.entryTerm ? termsByCode.get(row.entryTerm) : undefined;
    if (!entryTermId) {
      return "unchanged";
    }
    const [created] = await ctx.tx
      .insert(person)
      .values({
        email,
        firstName: row.firstName ?? "",
        lastName: row.lastName ?? "",
        phone: row.phone || null,
        program: row.program || null,
        personalEmail: row.personalEmail || null,
        documentType: row.documentType || null,
        documentNumber: row.documentNumber || null,
        epikId: row.epikId || null,
        birthDate: row.birthDate || null,
        stage: status === "INACTIVE" ? "ALUMNI" : "MEMBER",
        source: "ROSTER",
      })
      .returning({ id: person.id });
    if (!created) {
      throw new Error("No se pudo crear la persona");
    }
    personId = created.id;
    await insertRosterMembership(ctx, { personId, status, entryTermId, termId });
    outcome = "created";
  } else {
    personId = existing.id;
    const patch: PersonPatch = {};
    if (row.firstName !== undefined && row.firstName) patch.firstName = row.firstName;
    if (row.lastName !== undefined && row.lastName) patch.lastName = row.lastName;
    if (row.phone !== undefined) patch.phone = row.phone || null;
    if (row.program !== undefined) patch.program = row.program || null;
    if (row.personalEmail !== undefined) patch.personalEmail = row.personalEmail || null;
    for (const field of ["documentType", "documentNumber", "epikId", "birthDate"] as const) {
      if (row[field]) patch[field] = row[field];
    }
    // Se escribe lo que cambia, y la fila se cuenta por eso y no por el diff (ADR-120 regla 2): esta
    // escritura no deja otra auditoría que la de la importación.
    const changes = onlyChanges(existing, patch);
    if (Object.keys(changes).length > 0) {
      await ctx.tx.update(person).set(changes).where(eq(person.id, personId));
      if (outcome === "unchanged") outcome = "updated";
    }
    const [current] = await ctx.tx
      .select({ status: membership.status, endReason: membership.endReason })
      .from(membership)
      .where(eq(membership.personId, personId));
    keepsOut = staysInactive(current, row.status);
    if (!current) {
      const entryTermId = (row.entryTerm ? termsByCode.get(row.entryTerm) : undefined) ?? termId;
      await insertRosterMembership(ctx, { personId, status, entryTermId, termId });
      await ctx.tx
        .update(person)
        .set({ stage: status === "INACTIVE" ? "ALUMNI" : "MEMBER" })
        .where(eq(person.id, personId));
      // Le nació la membresía: la fila cambió a la persona, y eso se cuenta por lo que se escribió
      // acá y no por lo que haya anotado el diff (ADR-120 regla 2).
      outcome = "updated";
    } else if (row.status !== undefined && current.status !== status) {
      if (status === "INACTIVE") {
        await endMembership(ctx, personId, {
          endReason: "OTHER",
          note: reason,
          memorialConsent: false,
          contactConsent: false,
        });
      } else if (current.status === "INACTIVE") {
        // Quien fue expulsado no vuelve por el roster (Regl. art. 61.3; ADR-060 regla 3): la fila
        // conserva sus datos y su estado; la vista previa ya lo avisó.
        if (current.endReason !== "EXPULSION") {
          await reactivateMembership(ctx, personId, { reason });
          if (status !== "ACTIVE") {
            await changeMembershipStatus(ctx, personId, {
              to: status,
              reason,
              ...(await rosterLeaveUntil(ctx, status, termId)),
            });
          }
        }
      } else {
        await changeMembershipStatus(ctx, personId, {
          to: status,
          reason,
          ...(await rosterLeaveUntil(ctx, status, termId)),
        });
      }
    }
  }
  // La fila del término se le escribe a quien queda adentro o a quien esta fila da de baja; a quien
  // sigue de baja no (ADR-120 regla 1): conserva la prueba y el motivo que tuviera.
  if (row.probation !== undefined && !keepsOut) {
    const [held] = await ctx.tx
      .select({ probation: membershipTerm.probation, reason: membershipTerm.reason })
      .from(membershipTerm)
      .where(
        and(
          eq(membershipTerm.personId, personId),
          eq(membershipTerm.termId, termId),
          isNull(membershipTerm.committeeId),
        ),
      );
    // Se escribe lo de siempre: la prueba y el motivo del roster, aunque la prueba no cambie (DT-297).
    // Pero solo si algo de eso es distinto, y la fila que lo escribe se cuenta: «sin cambios» es no
    // haber escrito nada (ADR-120 regla 2).
    if (!held || held.probation !== row.probation || held.reason !== reason) {
      await ctx.tx
        .insert(membershipTerm)
        .values({
          personId,
          termId,
          probation: row.probation,
          reason,
          decidedById: ctx.actor.personId,
        })
        .onConflictDoUpdate({
          target: [membershipTerm.personId, membershipTerm.termId],
          targetWhere: isNull(membershipTerm.committeeId),
          set: { probation: row.probation, reason },
        });
      if (outcome === "unchanged") outcome = "updated";
    }
  }
  // Los comités se cambian solo a quien queda con membresía vigente (ADR-118 regla 11), y eso se
  // decide con el estado que quedó en la base, no con el que pide la fila: quien sigue de baja (el
  // archivo no trae ESTADO, o fue expulsado y el roster no lo reactiva) conserva su fila tal cual. La
  // vista previa ya lo avisó (T-2208, T-3247). A quien ya tiene esas mismas pertenencias no se le
  // escribe nada: se valida igual, y no queda auditoría ni evento de sus comités (ADR-120 regla 2).
  if (row.committees !== undefined && (await membershipHoldsCommittees(ctx, personId))) {
    await setCommitteeMembershipsIfChanged(
      ctx,
      personId,
      termId,
      row.committees.map((item) => ({
        committeeId: item.committeeId,
        roleCode: item.roleCode,
        roles: item.roles.map((role) => ({ roleCode: role.roleCode, coDirector: role.coDirector })),
        transferredIn: row.transferSlug === item.slug,
      })),
      new Date(),
      // Inhabilidades (ADR-060 regla 11): el roster de ADMIN las fuerza y quedan auditadas con su motivo.
      { reason },
    );
  }
  // La auditoría y el evento dicen que la importación le cambió algo a la persona: una fila que
  // quedó igual no los deja (ADR-120 regla 2). El trabajo conserva la fila en su vista previa.
  if (outcome === "unchanged") {
    return outcome;
  }
  await ctx.audit({
    action: "person.imported",
    entityType: "person",
    entityId: personId,
    after: { jobId, termCode, outcome, changes: row.changes },
  });
  await ctx.emit(
    eventOf(personImported, {
      actorId: ctx.actor.personId,
      personId,
      termCode,
      jobId,
      outcome,
      changes: row.changes,
      notes: row.notes ?? null,
    }),
  );
  return outcome;
}

/**
 * Toma, antes de aplicar la primera fila, el consultivo del ciclo de membresía de cada persona del
 * archivo que ya existe, de menor a mayor `id` (ADR-122 regla 5). La importación los retiene todos
 * hasta el final: tomados en el orden de las filas se cruzaba con la emisión de un enlace entre dos
 * personas del archivo, que toma los suyos por `id`. Cada fila vuelve a pedir el suyo al aplicarse
 * (`lockPersonByEmail`), que ya es de esta transacción, y ahí se toma el de quien recibió ese correo
 * después de esta lectura.
 */
async function lockRosterMembers(ctx: CommandContext, rows: readonly PreviewRow[]): Promise<void> {
  const emails = rows.flatMap((row) => (row.group !== "ERROR" && row.email ? [row.email] : []));
  if (emails.length === 0) {
    return;
  }
  const people = await ctx.tx
    .select({ id: person.id })
    .from(person)
    .where(inArray(person.email, emails));
  await lockMembershipCycles(
    ctx.tx,
    people.map((row) => row.id),
  );
}

/**
 * Paso 3: relee el archivo, vuelve a validar contra la base de hoy y aplica todo en una transacción.
 * Que el trabajo siga en vista previa lo decide la transacción, que lo toma antes de escribir; de la
 * fila tomada salen las columnas que se aplican.
 */
export async function applyRosterImportAs(actor: Actor, jobId: string): Promise<ApplySummary> {
  const job = await getImportJob(jobId);
  if (!job?.fileKey || !job.termId) {
    throw new DomainError(t("T-032"));
  }
  const current = previewPayloadSchema.safeParse(job.payload);
  if (!current.success) {
    throw new DomainError(t("T-032"));
  }
  const terms = await listAllTerms();
  const termCode = terms.find((term) => term.id === job.termId)?.code ?? "";
  const bytes = await getObject(job.fileKey);
  const cells = await readRosterCells(bytes, current.data.format);
  const termId = job.termId;
  return runCommand(actor, async (ctx) => {
    // Las columnas son las del trabajo ya tomado y no las de la lectura de arriba: un cambio de
    // columnas que confirmó entre las dos es el que vale.
    const taken = previewPayloadSchema.safeParse(
      (await takeImportJobInPreview(ctx, jobId, ROSTER_JOB)).payload,
    );
    if (!taken.success) {
      throw new DomainError(t("T-032"));
    }
    const built = await buildPreview(cells, taken.data.mapping, termId);
    await requirePrivacyPolicyVersion(ctx, "admin");
    const termsByCode = await ensureTerms(ctx, built.validation.missingTerms);
    for (const term of terms) {
      termsByCode.set(term.code, term.id);
    }
    const rolesCreated = await ensureRoles(ctx, built.rows);
    const summary: ApplySummary = {
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      termsCreated: built.validation.missingTerms,
      rolesCreated,
      proposals: built.proposals,
    };
    await lockRosterMembers(ctx, built.rows);
    for (const row of built.rows) {
      if (row.group === "ERROR") {
        summary.skipped += 1;
        continue;
      }
      const outcome = await applyRow(ctx, row, termId, termCode, termsByCode, jobId);
      summary[outcome] += 1;
    }
    await updateImportJob(ctx, jobId, {
      status: "APPLIED",
      appliedAt: new Date(),
      payload: payloadOf(built, current.data.format),
      summary: { ...summary, leaders: { granted: [], failed: [] } },
    });
    return summary;
  });
}

export async function discardRosterImportAs(actor: Actor, jobId: string): Promise<void> {
  await runCommand(actor, async (ctx) => {
    await takeImportJobInPreview(ctx, jobId, ROSTER_JOB);
    await updateImportJob(ctx, jobId, { status: "DISCARDED" });
  });
}

/**
 * Los permisos de líder se otorgan después del commit, uno por uno; el resultado queda en el resumen.
 * El resumen que se completa es el del trabajo tomado en la transacción, que tiene que estar aplicado
 * (ADR-114 regla 7): no se lee antes ni se escribe sobre una importación en otro estado.
 */
export async function recordLeaderGrantsAs(
  actor: Actor,
  jobId: string,
  result: { granted: string[]; failed: string[] },
): Promise<void> {
  await runCommand(actor, async (ctx) => {
    const job = await takeImportJobApplied(ctx, jobId, ROSTER_JOB);
    await updateImportJob(ctx, jobId, { summary: { ...job.summary, leaders: result } });
  });
}
