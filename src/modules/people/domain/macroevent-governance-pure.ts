import { z } from "zod";

export const MACROEVENT_ORIGINS = ["ELECTED", "BOARD_SUBSTITUTE"] as const;
export const MACROEVENT_STATUSES = ["ENABLED", "DISABLED"] as const;
export const REACTIVATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
const evidence = z.string().trim().min(5).max(2000);
export const electionRecordSchema = z.object({
  origin: z.enum(MACROEVENT_ORIGINS),
  minutes: evidence,
  requirementsChecked: z.literal(true),
  lateCandidacy: z.boolean(),
  qualifiedPermission: z.string().trim().max(2000),
  experience: z.enum(["VERIFIED", "THIRD_ROUND", "NOT_APPLICABLE"]),
  generalFacultyChecked: z.boolean(),
  compositionChecked: z.boolean(),
  extraordinary: z.boolean(),
  workPlan: z.string().trim().max(2000),
});
export type ElectionRecord = z.infer<typeof electionRecordSchema>;

/** La constancia corresponde al cargo completo: titular y codirección, no a género inferido. */
export function electionRecordValid(slug: string, roleCode: string, record: ElectionRecord) {
  if (record.origin === "BOARD_SUBSTITUTE") return true;
  if (record.lateCandidacy && !record.qualifiedPermission) return false;
  if (record.experience === "NOT_APPLICABLE") return false;
  if (record.extraordinary && !record.workPlan) return false;
  if (slug === "inventiva" && roleCode === "GENERAL" && !record.generalFacultyChecked) return false;
  if (
    slug === "enfemenino" &&
    ["GENERAL", "MERCADEO", "AGENDA_ACADEMICA"].includes(roleCode) &&
    !record.compositionChecked
  )
    return false;
  return true;
}

export function macroeventViability(
  slug: string,
  roles: readonly { roleCode: string; origin: string | null }[],
  allowed: readonly string[],
) {
  const elected = [
    ...new Set(
      roles
        .filter((r) => r.origin === "ELECTED" && allowed.includes(r.roleCode))
        .map((r) => r.roleCode),
    ),
  ].sort();
  const minimum = slug === "inventiva" ? 2 : slug === "enfemenino" ? 3 : 4;
  const specialty =
    slug !== "dias-eafit" || elected.includes("THE_GAMES") || elected.includes("CARNIVAL");
  return {
    elected,
    minimum,
    specialty,
    unverified: roles.filter((r) => !r.origin).length,
    status: elected.length >= minimum && specialty ? ("ENABLED" as const) : ("DISABLED" as const),
  };
}

export const reactivationInputSchema = z.object({
  eventId: z.string().min(1),
  year: z.number().int().min(2026).max(2100),
  submittedOn: z.iso.date(),
  electionSession: evidence,
  mission: z.string().trim().min(10).max(10000),
  workPlan: z.string().trim().min(10).max(10000),
  roster: z
    .array(z.object({ roleCode: z.string().min(1), personId: z.string().min(1) }))
    .min(1)
    .max(18),
});
export type ReactivationInput = z.infer<typeof reactivationInputSchema>;

export function reactivationValid(
  roles: readonly string[],
  input: ReactivationInput,
  today: string,
) {
  return (
    input.submittedOn <= today &&
    input.submittedOn >= `${input.year - 1}-07-01` &&
    input.submittedOn <= `${input.year - 1}-12-31` &&
    roles.every((role) => input.roster.some((row) => row.roleCode === role)) &&
    input.roster.every((row) => roles.includes(row.roleCode)) &&
    new Set(input.roster.map((row) => row.roleCode)).size === input.roster.length &&
    new Set(input.roster.map((row) => row.personId)).size === input.roster.length
  );
}
