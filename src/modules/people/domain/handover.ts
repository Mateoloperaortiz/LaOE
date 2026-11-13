import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { getCurrentTerm, listAllTerms, nextTermCode } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { committee, committeeRole, committeeRoleAssignment, handoverDoc, person } from "../schema";

// El empalme entre semestres (ADR-172): un documento por comité y cargo. Lo edita y lo verifica quien
// tiene ese cargo en el semestre actual; lo lee también quien lo va a tener en el siguiente. ADMIN lo
// edita desde la Operación con su propio camino. Editar después de verificar lo deja sin verificar.

export const HANDOVER_BODY_MAX = 20_000;

export interface HandoverDocView {
  committeeId: string;
  committeeName: string;
  roleCode: string;
  roleLabel: string;
  body: string;
  updatedAt: Date | null;
  verifiedAt: Date | null;
  verifiedByName: string | null;
  /** Si la persona lo edita: tiene el cargo en el semestre actual. */
  canEdit: boolean;
}

type Seat = { committeeId: string; roleCode: string; current: boolean };

/** Los cargos vivos de la persona en el semestre actual y en el siguiente. */
async function seatsOf(personId: string): Promise<Seat[]> {
  const [current, terms] = await Promise.all([getCurrentTerm(), listAllTerms()]);
  if (!current) return [];
  const next = terms.find((term) => term.code === nextTermCode(current.code));
  const termIds = [current.id, ...(next ? [next.id] : [])];
  const rows = await getDb()
    .select({
      committeeId: committeeRoleAssignment.committeeId,
      roleCode: committeeRoleAssignment.roleCode,
      termId: committeeRoleAssignment.termId,
    })
    .from(committeeRoleAssignment)
    .where(
      and(
        eq(committeeRoleAssignment.personId, personId),
        inArray(committeeRoleAssignment.termId, termIds),
        isNull(committeeRoleAssignment.endedAt),
      ),
    );
  const seats = new Map<string, Seat>();
  for (const row of rows) {
    const key = `${row.committeeId}:${row.roleCode}`;
    const current_ = row.termId === current.id;
    const seen = seats.get(key);
    seats.set(key, {
      committeeId: row.committeeId,
      roleCode: row.roleCode,
      current: current_ || (seen?.current ?? false),
    });
  }
  return [...seats.values()];
}

/** Los documentos de empalme de los cargos que la persona tiene o va a tener. */
export async function listHandoverDocsFor(personId: string): Promise<HandoverDocView[]> {
  const seats = await seatsOf(personId);
  if (seats.length === 0) return [];
  const committeeIds = [...new Set(seats.map((seat) => seat.committeeId))];
  const [docs, committees, roles] = await Promise.all([
    getDb().select().from(handoverDoc).where(inArray(handoverDoc.committeeId, committeeIds)),
    getDb()
      .select({ id: committee.id, name: committee.name })
      .from(committee)
      .where(inArray(committee.id, committeeIds)),
    getDb().select({ code: committeeRole.code, label: committeeRole.label }).from(committeeRole),
  ]);
  const verifierIds = docs.flatMap((doc) => (doc.verifiedById ? [doc.verifiedById] : []));
  const verifiers =
    verifierIds.length > 0
      ? await getDb()
          .select({ id: person.id, fullName: person.fullName })
          .from(person)
          .where(inArray(person.id, verifierIds))
      : [];
  const committeeName = new Map(committees.map((row) => [row.id, row.name]));
  const roleLabel = new Map(roles.map((row) => [row.code, row.label]));
  const verifierName = new Map(verifiers.map((row) => [row.id, row.fullName?.trim() ?? ""]));
  return seats
    .map((seat) => {
      const doc = docs.find(
        (row) => row.committeeId === seat.committeeId && row.roleCode === seat.roleCode,
      );
      return {
        committeeId: seat.committeeId,
        committeeName: committeeName.get(seat.committeeId) ?? "",
        roleCode: seat.roleCode,
        roleLabel: roleLabel.get(seat.roleCode) ?? seat.roleCode,
        body: doc?.body ?? "",
        updatedAt: doc?.updatedAt ?? null,
        verifiedAt: doc?.verifiedAt ?? null,
        verifiedByName: doc?.verifiedById ? (verifierName.get(doc.verifiedById) ?? null) : null,
        canEdit: seat.current,
      };
    })
    .sort((a, b) => a.committeeName.localeCompare(b.committeeName, "es"));
}

async function assertHolder(personId: string, committeeId: string, roleCode: string) {
  const seat = (await seatsOf(personId)).find(
    (item) => item.committeeId === committeeId && item.roleCode === roleCode && item.current,
  );
  if (!seat) throw new DomainError(t("T-4956"));
}

async function saveHandover(
  ctx: CommandContext,
  input: { committeeId: string; roleCode: string; body: string },
): Promise<void> {
  const personId = ctx.actor.personId;
  if (!personId) throw new DomainError(t("T-032"));
  await assertHolder(personId, input.committeeId, input.roleCode);
  const body = input.body.trim();
  if (body.length > HANDOVER_BODY_MAX) {
    throw new DomainError(t("T-4957", { n: HANDOVER_BODY_MAX }), "body");
  }
  await ctx.tx
    .insert(handoverDoc)
    .values({
      committeeId: input.committeeId,
      roleCode: input.roleCode,
      body,
      updatedById: personId,
    })
    .onConflictDoUpdate({
      target: [handoverDoc.committeeId, handoverDoc.roleCode],
      // Editar deja el documento sin verificar (ADR-172 regla 3).
      set: {
        body,
        updatedById: personId,
        updatedAt: new Date(),
        verifiedAt: null,
        verifiedById: null,
      },
    });
  await ctx.audit({
    action: "handover-doc.saved",
    entityType: "handover_doc",
    entityId: `${input.committeeId}:${input.roleCode}`,
    after: { length: body.length },
  });
}

async function verifyHandover(
  ctx: CommandContext,
  input: { committeeId: string; roleCode: string },
): Promise<void> {
  const personId = ctx.actor.personId;
  if (!personId) throw new DomainError(t("T-032"));
  await assertHolder(personId, input.committeeId, input.roleCode);
  const [row] = await ctx.tx
    .update(handoverDoc)
    .set({ verifiedAt: new Date(), verifiedById: personId })
    .where(
      and(eq(handoverDoc.committeeId, input.committeeId), eq(handoverDoc.roleCode, input.roleCode)),
    )
    .returning({ id: handoverDoc.id });
  if (!row) throw new DomainError(t("T-4958"));
  await ctx.audit({
    action: "handover-doc.verified",
    entityType: "handover_doc",
    entityId: `${input.committeeId}:${input.roleCode}`,
  });
}

/** Guardar el documento de empalme de un cargo propio. */
export function saveHandoverAs(
  actor: Actor,
  input: { committeeId: string; roleCode: string; body: string },
): Promise<void> {
  return runCommand(actor, (ctx) => saveHandover(ctx, input));
}

/** Marcar como verificado el documento de un cargo propio. */
export function verifyHandoverAs(
  actor: Actor,
  input: { committeeId: string; roleCode: string },
): Promise<void> {
  return runCommand(actor, (ctx) => verifyHandover(ctx, input));
}

export interface CommitteeHandoverStatus {
  roleCode: string;
  roleLabel: string;
  hasDoc: boolean;
  verifiedAt: Date | null;
}

/** El estado de los documentos de un comité, para su pantalla en la Operación (ADR-172 regla 4). */
export async function listCommitteeHandover(
  committeeId: string,
): Promise<CommitteeHandoverStatus[]> {
  const rows = await getDb()
    .select({
      roleCode: handoverDoc.roleCode,
      roleLabel: committeeRole.label,
      body: handoverDoc.body,
      verifiedAt: handoverDoc.verifiedAt,
    })
    .from(handoverDoc)
    .innerJoin(committeeRole, eq(committeeRole.code, handoverDoc.roleCode))
    .where(eq(handoverDoc.committeeId, committeeId));
  return rows.map((row) => ({
    roleCode: row.roleCode,
    roleLabel: row.roleLabel,
    hasDoc: row.body.length > 0,
    verifiedAt: row.verifiedAt,
  }));
}
