import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { listActiveMemberRefs } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { assemblyRequirement, checkIn, occasion } from "../schema";
import {
  type AssemblyCompliance,
  type AssemblyRequirementView,
  assemblyCompliance,
  defaultRequirement,
} from "./assembly-pure";
import type { OccasionRow } from "./occasions";

// Asambleas (ADR-024, ADR-028, ADR-035 regla 12): el requisito se deriva del término y solo los
// ajustes se guardan; el cumplimiento se calcula con los check-ins aprobados en asambleas.

export type AssemblyRequirementRow = typeof assemblyRequirement.$inferSelect;

interface TermLike {
  id: string;
  semester: number;
  requiredOrdinaryAssemblies: number;
}

/** Asambleas no canceladas del término, de la más reciente a la más vieja. */
export async function listTermAssemblies(termId: string): Promise<OccasionRow[]> {
  return getDb()
    .select()
    .from(occasion)
    .where(
      and(
        eq(occasion.termId, termId),
        eq(occasion.kind, "ASSEMBLY"),
        ne(occasion.status, "CANCELLED"),
      ),
    )
    .orderBy(occasion.startsAt);
}

/** Qué asambleas especiales existen en el término: las que el requisito por defecto exige. */
function existingKinds(assemblies: readonly OccasionRow[]) {
  return {
    hasBoardElection: assemblies.some((item) => item.assemblyKind === "BOARD_ELECTION"),
    hasRunoff: assemblies.some((item) => item.assemblyKind === "RUNOFF"),
  };
}

function toView(row: AssemblyRequirementRow): AssemblyRequirementView {
  return {
    requiredOrdinary: row.requiredOrdinary,
    requiresBoardElection: row.requiresBoardElection,
    requiresRunoff: row.requiresRunoff,
    adjusted: true,
    reason: row.adjustedReason,
  };
}

export interface PersonAssemblyStatus {
  requirement: AssemblyRequirementView;
  compliance: AssemblyCompliance;
  assemblies: Array<{
    occasion: OccasionRow;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXCUSED" | null;
  }>;
}

/** Requisito y cumplimiento de una persona en un término, con cada asamblea y su check-in. */
export async function assemblyStatusFor(
  personId: string,
  term: TermLike,
): Promise<PersonAssemblyStatus> {
  const assemblies = await listTermAssemblies(term.id);
  const existing = existingKinds(assemblies);
  const [adjustment] = await getDb()
    .select()
    .from(assemblyRequirement)
    .where(and(eq(assemblyRequirement.termId, term.id), eq(assemblyRequirement.personId, personId)))
    .limit(1);
  const requirement = adjustment ? toView(adjustment) : defaultRequirement(term, existing);
  const checkIns =
    assemblies.length === 0
      ? []
      : await getDb()
          .select({ occasionId: checkIn.occasionId, status: checkIn.status })
          .from(checkIn)
          .where(
            and(
              eq(checkIn.personId, personId),
              inArray(
                checkIn.occasionId,
                assemblies.map((item) => item.id),
              ),
            ),
          );
  const statusByOccasion = new Map(checkIns.map((item) => [item.occasionId, item.status]));
  const attended = assemblies
    .filter((item) => item.assemblyKind !== null && statusByOccasion.has(item.id))
    .map((item) => ({
      assemblyKind: item.assemblyKind as "ORDINARY" | "BOARD_ELECTION" | "RUNOFF",
      status: statusByOccasion.get(item.id) ?? "PENDING",
    }));
  return {
    requirement,
    compliance: assemblyCompliance(requirement, attended),
    assemblies: assemblies.map((item) => ({
      occasion: item,
      status: statusByOccasion.get(item.id) ?? null,
    })),
  };
}

/**
 * El requisito de asambleas de cada persona pedida en el término: su ajuste si tiene, y si no el del
 * término. Lee las asambleas del término y los ajustes de esas personas, nada más: lo que trae no
 * depende de cuánta gente tenga la OE. No mira si la persona es miembro activo; eso lo decide quien
 * llama.
 */
export async function assemblyRequirementsFor(
  term: TermLike,
  personIds: readonly string[],
): Promise<Map<string, AssemblyRequirementView>> {
  if (personIds.length === 0) {
    return new Map();
  }
  const fallback = defaultRequirement(term, existingKinds(await listTermAssemblies(term.id)));
  const adjustments = await getDb()
    .select()
    .from(assemblyRequirement)
    .where(
      and(
        eq(assemblyRequirement.termId, term.id),
        inArray(assemblyRequirement.personId, [...personIds]),
      ),
    );
  const adjusted = new Map(adjustments.map((row) => [row.personId, toView(row)]));
  return new Map(personIds.map((personId) => [personId, adjusted.get(personId) ?? fallback]));
}

export interface AssemblyOverviewRow {
  personId: string;
  name: string;
  anonymized: boolean;
  requirement: AssemblyRequirementView;
  compliance: AssemblyCompliance;
}

/** Cumplimiento de todos los activos en el término, para GH. */
export async function assemblyOverview(term: TermLike): Promise<AssemblyOverviewRow[]> {
  const [members, assemblies, adjustments] = await Promise.all([
    listActiveMemberRefs(),
    listTermAssemblies(term.id),
    getDb().select().from(assemblyRequirement).where(eq(assemblyRequirement.termId, term.id)),
  ]);
  const existing = existingKinds(assemblies);
  const kindByOccasion = new Map(assemblies.map((item) => [item.id, item.assemblyKind]));
  const checkIns =
    assemblies.length === 0
      ? []
      : await getDb()
          .select({
            occasionId: checkIn.occasionId,
            personId: checkIn.personId,
            status: checkIn.status,
          })
          .from(checkIn)
          .where(
            inArray(
              checkIn.occasionId,
              assemblies.map((item) => item.id),
            ),
          );
  const byPerson = new Map<
    string,
    Array<{
      assemblyKind: "ORDINARY" | "BOARD_ELECTION" | "RUNOFF";
      status: typeof checkIn.$inferSelect.status;
    }>
  >();
  for (const item of checkIns) {
    const kind = kindByOccasion.get(item.occasionId);
    if (!kind) continue;
    const list = byPerson.get(item.personId) ?? [];
    list.push({ assemblyKind: kind, status: item.status });
    byPerson.set(item.personId, list);
  }
  const adjustmentByPerson = new Map(adjustments.map((row) => [row.personId, row]));
  return members
    .map((member) => {
      const adjustment = adjustmentByPerson.get(member.personId);
      const requirement = adjustment ? toView(adjustment) : defaultRequirement(term, existing);
      return {
        personId: member.personId,
        name: member.fullName.trim(),
        anonymized: member.anonymized,
        requirement,
        compliance: assemblyCompliance(requirement, byPerson.get(member.personId) ?? []),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export interface AdjustRequirementInput {
  termId: string;
  personId: string;
  requiredOrdinary: number;
  requiresBoardElection: boolean;
  requiresRunoff: boolean;
  reason: string;
}

/** Ajuste individual de ADMIN con motivo; una fila por persona y término. */
export async function adjustRequirement(
  ctx: CommandContext,
  input: AdjustRequirementInput,
): Promise<{ id: string }> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new DomainError(t("T-628"), "reason");
  }
  if (!Number.isInteger(input.requiredOrdinary) || input.requiredOrdinary < 0) {
    throw new DomainError(t("T-260"), "requiredOrdinary");
  }
  const values = {
    termId: input.termId,
    personId: input.personId,
    requiredOrdinary: input.requiredOrdinary,
    requiresBoardElection: input.requiresBoardElection,
    requiresRunoff: input.requiresRunoff,
    adjustedReason: reason,
    adjustedById: ctx.actor.personId,
  };
  const [before] = await ctx.tx
    .select()
    .from(assemblyRequirement)
    .where(
      and(
        eq(assemblyRequirement.termId, input.termId),
        eq(assemblyRequirement.personId, input.personId),
      ),
    )
    .limit(1);
  const [row] = await ctx.tx
    .insert(assemblyRequirement)
    .values(values)
    .onConflictDoUpdate({
      target: [assemblyRequirement.termId, assemblyRequirement.personId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning({ id: assemblyRequirement.id });
  if (!row) {
    throw new Error("No se pudo ajustar el requisito");
  }
  await ctx.audit({
    action: "assembly-requirement.adjusted",
    entityType: "assembly_requirement",
    entityId: row.id,
    before: before ?? null,
    after: values,
  });
  return row;
}
