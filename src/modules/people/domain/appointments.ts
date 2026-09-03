import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { listAllTerms } from "@/modules/participation";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { appointment, committee } from "../schema";

// Cargos de junta y de GH (ADR-034, punto 13): visibles, con historia por término; no otorgan permisos.

export type AppointmentKind = (typeof appointment.$inferSelect)["kind"];

export const APPOINTMENT_KINDS: readonly AppointmentKind[] = [
  "PRESIDENT",
  "VP_GH",
  "VP_PUBLIC_RELATIONS",
  "VP_ADMIN",
  "VP_FINANCE",
  "GH_HEAD",
  "GH_DIRECTOR",
  "OTHER",
];

export const appointmentInputSchema = z
  .object({
    kind: z.enum([
      "PRESIDENT",
      "VP_GH",
      "VP_PUBLIC_RELATIONS",
      "VP_ADMIN",
      "VP_FINANCE",
      "GH_HEAD",
      "GH_DIRECTOR",
      "OTHER",
    ]),
    termId: z.string().trim().min(1),
    committeeId: z.string().trim().min(1).optional(),
    title: z.string().trim().max(80).optional(),
  })
  .refine((input) => input.kind !== "OTHER" || (input.title ?? "").length > 0, {
    path: ["title"],
    message: t("T-260"),
  });

export type AppointmentInput = z.infer<typeof appointmentInputSchema>;

export interface AppointmentView {
  id: string;
  kind: AppointmentKind;
  title: string | null;
  termId: string;
  termCode: string;
  committeeId: string | null;
  committeeName: string | null;
  createdAt: Date;
}

export async function listAppointments(personId: string): Promise<AppointmentView[]> {
  const [rows, terms] = await Promise.all([
    getDb()
      .select({
        id: appointment.id,
        kind: appointment.kind,
        title: appointment.title,
        termId: appointment.termId,
        committeeId: appointment.committeeId,
        committeeName: committee.name,
        createdAt: appointment.createdAt,
      })
      .from(appointment)
      .leftJoin(committee, eq(committee.id, appointment.committeeId))
      .where(eq(appointment.personId, personId)),
    listAllTerms(),
  ]);
  const termById = new Map(terms.map((term) => [term.id, term]));
  return rows
    .map((row) => ({
      ...row,
      termCode: termById.get(row.termId)?.code ?? "",
      committeeName: row.committeeName ?? null,
    }))
    .sort(
      (a, b) =>
        (termById.get(b.termId)?.startsOn ?? "").localeCompare(
          termById.get(a.termId)?.startsOn ?? "",
        ) || a.kind.localeCompare(b.kind),
    );
}

export async function addAppointment(
  ctx: CommandContext,
  personId: string,
  input: AppointmentInput,
): Promise<{ id: string }> {
  const values = {
    personId,
    kind: input.kind,
    termId: input.termId,
    committeeId: input.committeeId ?? null,
    title: input.title ?? null,
  };
  const [row] = await ctx.tx.insert(appointment).values(values).returning({ id: appointment.id });
  if (!row) {
    throw new Error("No se pudo crear el cargo");
  }
  await ctx.audit({
    action: "appointment.added",
    entityType: "appointment",
    entityId: row.id,
    after: values,
  });
  await ctx.emit({
    type: "appointment.changed",
    payload: { personId, action: "ADDED", kind: input.kind, termId: input.termId },
  });
  return row;
}

export async function removeAppointment(ctx: CommandContext, id: string): Promise<void> {
  const [row] = await ctx.tx.select().from(appointment).where(eq(appointment.id, id));
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  await ctx.tx.delete(appointment).where(eq(appointment.id, id));
  await ctx.audit({
    action: "appointment.removed",
    entityType: "appointment",
    entityId: id,
    before: row,
  });
  await ctx.emit({
    type: "appointment.changed",
    payload: { personId: row.personId, action: "REMOVED", kind: row.kind, termId: row.termId },
  });
}
