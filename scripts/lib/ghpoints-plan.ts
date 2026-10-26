import { createHash } from "node:crypto";
import { z } from "zod";
import { parseParams, ruleInputSchema } from "@/modules/permanence/domain/params";
import { stripAccents } from "@/shared/lib/accents";

export class GhImportError extends Error {}
const key = z.string().regex(/^[A-Za-z0-9-]{2,80}$/);
const day = z.iso.date();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const source = z.object({ key, path: z.string().min(1), sha256: hash }).strict();
const attendanceEvidence = z
  .object({
    list: z.enum(["FIRST", "SECOND"]),
    sourceKey: key,
    sourceSheet: z.string().min(1).max(31).optional(),
    sourceRow: z.number().int().positive(),
  })
  .strict();
const participant = z
  .object({
    recordId: key,
    email: z.email().toLowerCase(),
    sourceRow: z.number().int().positive(),
    attendanceExtent: z.enum(["FULL", "PARTIAL"]).optional(),
    attendanceEvidence: z.array(attendanceEvidence).min(1).max(2).optional(),
  })
  .strict();
export const ghManifestSchema = z
  .object({
    format: z.literal("oe-ghpoints/2"),
    batchId: key,
    termCode: z.string().regex(/^\d{4}-[12]$/),
    targetTermId: z.string().min(1),
    allowOnLeavePoints: z.boolean(),
    permanenceRules: z.array(ruleInputSchema).max(100).default([]),
    sources: z.array(source).min(1).max(100),
    confirmations: z.array(z.string()).default([]),
    activities: z
      .array(
        z
          .object({
            key,
            title: z.string().min(2).max(200),
            type: z.enum(["PARTIDO", "JUEGOS", "DECORACION", "ASAMBLEA"]),
            assemblyKind: z.enum(["ORDINARY", "BOARD_ELECTION", "RUNOFF"]).optional(),
            date: day,
            endDate: day,
            datePrecision: z.literal("DAY"),
            newMembersOnly: z.boolean(),
            existingOccasionId: z.string().min(1).nullable(),
            sourceKey: key,
            sourceSheet: z.string().min(1).max(31).optional(),
            evidenceEvaluation: z.enum(["PENDING", "GOOD"]).default("PENDING"),
            participants: z.array(participant).min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((m, ctx) => {
    const keys = new Set<string>();
    const sources = new Set(m.sources.map((s) => s.key));
    const records = new Set<string>();
    const assemblyDates = new Set<string>();
    if (m.activities.filter((a) => a.assemblyKind === "BOARD_ELECTION").length > 1)
      ctx.addIssue({ code: "custom", message: "El lote repite la elección de junta del término" });
    if (sources.size !== m.sources.length)
      ctx.addIssue({ code: "custom", message: "Fuentes repetidas" });
    if (new Set(m.permanenceRules.map((r) => r.key)).size !== m.permanenceRules.length)
      ctx.addIssue({ code: "custom", message: "Reglas de permanencia repetidas" });
    for (const a of m.activities) {
      if (
        keys.has(a.key) ||
        a.endDate < a.date ||
        !sources.has(a.sourceKey) ||
        (a.type === "DECORACION" && !a.newMembersOnly)
      )
        ctx.addIssue({
          code: "custom",
          message: "Actividad repetida, fechas/fuente inválidas o decoración abierta a veteranos",
        });
      keys.add(a.key);
      if (a.type === "ASAMBLEA") {
        if (assemblyDates.has(a.date))
          ctx.addIssue({
            code: "custom",
            message: "Conciliá las asambleas repetidas del mismo día",
          });
        assemblyDates.add(a.date);
      }
      if (
        a.type === "ASAMBLEA"
          ? !a.assemblyKind || a.newMembersOnly || a.endDate !== a.date
          : a.assemblyKind !== undefined
      )
        ctx.addIssue({ code: "custom", message: "Tipo o período de asamblea inválido" });
      const emails = new Set<string>();
      for (const p of a.participants) {
        if (emails.has(p.email) || records.has(p.recordId))
          ctx.addIssue({ code: "custom", message: "Participante o registro repetido" });
        const extent = p.attendanceExtent ?? "FULL";
        const evidence = p.attendanceEvidence;
        if (
          (a.type !== "ASAMBLEA" && (extent === "PARTIAL" || evidence)) ||
          (extent === "PARTIAL" && evidence?.length !== 1) ||
          (extent === "FULL" && evidence && evidence.length !== 2) ||
          (evidence &&
            (new Set(evidence.map((e) => e.list)).size !== evidence.length ||
              evidence.some((e) => !sources.has(e.sourceKey))))
        )
          ctx.addIssue({
            code: "custom",
            message: "La asistencia completa o parcial no coincide con sus listas y fuentes",
          });
        emails.add(p.email);
        records.add(p.recordId);
      }
    }
  });
export type GhManifest = z.infer<typeof ghManifestSchema>;
export type GhActivity = GhManifest["activities"][number];

export interface GhSnapshot {
  queriedAt: string;
  environment: string;
  projectId?: string;
  terms: {
    id: string;
    code: string;
    starts_on: string;
    ends_on: string;
    points_closed_at: string | null;
    permanence_closed_at: string | null;
  }[];
  people: {
    id: string;
    email: string;
    full_name: string | null;
    stage: string;
    anonymized_at: string | null;
    status: string | null;
    first_term_id: string | null;
  }[];
  occasions: {
    id: string;
    legacy_id: string | null;
    title: string;
    kind: string;
    assembly_kind?: string | null;
    category: string;
    new_members_only: boolean;
    status: string;
    points: number;
    starts_at: string;
    ends_at: string | null;
  }[];
  checkIns: {
    id: string;
    occasion_id: string;
    person_id: string;
    status: string;
    /** Las consultas privadas anteriores no incluían estos campos. */
    attendance_extent?: "FULL" | "PARTIAL" | null;
    attendance_list?: "FIRST" | "SECOND" | null;
  }[];
  entries: {
    id: string;
    person_id: string;
    check_in_id: string | null;
    kind: string;
    points: number;
    reason: string;
    reversal_of_id: string | null;
  }[];
  groups: { id: string; code: string | null; name: string; kind: string }[];
  groupMemberships: {
    id: string;
    group_id: string;
    person_id: string;
    evaluation: string;
    left_at: string | null;
  }[];
  rules: {
    id: string;
    key: string;
    weight: number | string;
    computation: string;
    params: unknown;
    applies_to: string;
  }[];
  generalTableLocked: boolean;
}
export const pointsFor = (type: GhActivity["type"]) =>
  ({ PARTIDO: 10, JUEGOS: 20, DECORACION: 30, ASAMBLEA: 0 })[type];
export const categoryFor = (type: GhActivity["type"]) =>
  (
    ({
      PARTIDO: "ATHLETIC_MATCH",
      JUEGOS: "INTEGRATION",
      DECORACION: "OTHER",
      ASAMBLEA: "OTHER",
    }) as const
  )[type];
export const kindFor = (type: GhActivity["type"]) =>
  type === "ASAMBLEA" ? "ASSEMBLY" : "ACTIVITY";
export const legacyKey = (m: GhManifest, a: GhActivity) => `gh-import:${m.batchId}:${a.key}`;
const normalize = (value: string) =>
  stripAccents(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
export function dayInBogota(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function dayWindow(a: Pick<GhActivity, "date" | "endDate">) {
  const startsAt = new Date(`${a.date}T00:00:00-05:00`);
  const endsAt = new Date(new Date(`${a.endDate}T00:00:00-05:00`).getTime() + 86_400_000);
  return { startsAt, endsAt };
}
export interface GhPlannedRow {
  recordId: string;
  email: string;
  personId: string | null;
  action: "ADD" | "EXISTS" | "BLOCKED";
  reason: string;
  attendanceExtent: "FULL" | "PARTIAL";
  attendanceList: "FIRST" | "SECOND" | null;
  points: number;
  decoration: "ADD_PENDING" | "ADD_GOOD" | "EXISTS" | "NONE";
  evidenceAction: "ADD" | "EVALUATE" | "EXISTS" | "NONE";
}
export interface GhPlannedActivity {
  key: string;
  occasionId: string | null;
  action: "CREATE" | "REUSE" | "BLOCKED";
  reason: string;
  rows: GhPlannedRow[];
}
export function evidenceGroup(a: GhActivity) {
  return a.type === "DECORACION"
    ? { code: "DECORACION", kind: "NEW_MEMBER_TASK" as const }
    : a.type === "PARTIDO"
      ? { code: "APOYO-ATHLETIC", kind: "BARRA_BRAVA" as const }
      : null;
}
export function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
    .join(",")}}`;
}
export function planGhImport(manifest: GhManifest, snapshot: GhSnapshot) {
  const term = snapshot.terms.find((t) => t.code === manifest.termCode);
  if (!term) throw new GhImportError("No existe el término del lote");
  if (term.id !== manifest.targetTermId)
    throw new GhImportError("El término no corresponde a la base de destino revisada");
  const people = new Map(snapshot.people.map((p) => [p.email, p]));
  if (people.size !== snapshot.people.length) throw new GhImportError("La consulta repite correos");
  const existingTargets = new Set<string>();
  const ruleChanges = manifest.permanenceRules.map((r) => {
    const existing = snapshot.rules.find((x) => x.key === r.key);
    const same =
      existing &&
      existing.computation === r.computation &&
      Number(existing.weight) === r.weight &&
      existing.applies_to === r.appliesTo &&
      stableJson(parseParams(r.computation, existing.params).params) ===
        stableJson(parseParams(r.computation, r.params).params);
    const action = existing ? (same ? "EXISTS" : "BLOCKED") : "CREATE";
    return {
      key: r.key,
      action: term.permanence_closed_at || snapshot.generalTableLocked ? "BLOCKED" : action,
      ruleId: existing?.id ?? null,
    };
  });
  const ruleConflict = ruleChanges.some((r) => r.action === "BLOCKED");
  const activities: GhPlannedActivity[] = manifest.activities.map((a) => {
    const owned = snapshot.occasions.filter((o) => o.legacy_id === legacyKey(manifest, a));
    const o = a.existingOccasionId
      ? snapshot.occasions.find((o) => o.id === a.existingOccasionId)
      : owned[0];
    const groupRef = evidenceGroup(a);
    const group = groupRef ? snapshot.groups.find((g) => g.code === groupRef.code) : undefined;
    const alternateGroup =
      groupRef && snapshot.groups.some((g) => g.kind === groupRef.kind && g.code !== groupRef.code);
    let reason = "";
    if (ruleConflict) reason = "PERMANENCE_RULE_CONFLICT";
    else if (term.points_closed_at) reason = "TERM_CLOSED";
    else if (a.type === "ASAMBLEA" && term.permanence_closed_at) reason = "PERMANENCE_CLOSED";
    else if (a.date < term.starts_on || a.endDate > term.ends_on) reason = "DATE_OUTSIDE_TERM";
    else if (a.existingOccasionId && !o) reason = "OCCASION_MISSING";
    else if (owned.length > 1 || (owned[0] && o?.id !== owned[0].id)) reason = "OCCASION_CONFLICT";
    else if (
      o &&
      (o.kind !== kindFor(a.type) ||
        (o.assembly_kind ?? null) !== (a.assemblyKind ?? null) ||
        o.category !== categoryFor(a.type) ||
        o.points !== pointsFor(a.type) ||
        o.new_members_only !== a.newMembersOnly ||
        dayInBogota(o.starts_at) !== a.date ||
        !["OPEN", "CLOSED"].includes(o.status))
    )
      reason = "OCCASION_METADATA_CONFLICT";
    else if (o && a.endDate > a.date && (!o.ends_at || new Date(o.ends_at) < dayWindow(a).endsAt))
      reason = "OCCASION_PERIOD_CONFLICT";
    else if (
      !o &&
      snapshot.occasions.some(
        (x) => normalize(x.title) === normalize(a.title) && dayInBogota(x.starts_at) === a.date,
      )
    )
      reason = "EXISTING_OCCASION_NEEDS_MAPPING";
    if (
      !reason &&
      a.type === "ASAMBLEA" &&
      snapshot.occasions.some(
        (x) =>
          x.id !== o?.id &&
          x.kind === "ASSEMBLY" &&
          x.status !== "CANCELLED" &&
          (dayInBogota(x.starts_at) === a.date ||
            (a.assemblyKind === "BOARD_ELECTION" && x.assembly_kind === "BOARD_ELECTION")),
      )
    )
      reason = "EXISTING_ASSEMBLY_NEEDS_MAPPING";
    if (o) {
      if (existingTargets.has(o.id)) reason = "REPEATED_OCCASION_MAPPING";
      existingTargets.add(o.id);
    }
    if (
      groupRef &&
      ((group && group.kind !== groupRef.kind) ||
        (!group && alternateGroup) ||
        term.permanence_closed_at)
    )
      reason = term.permanence_closed_at ? "PERMANENCE_CLOSED" : "EVIDENCE_GROUP_NEEDS_MAPPING";
    const rows = a.participants.map((p) => {
      const attendanceExtent = p.attendanceExtent ?? "FULL";
      const attendanceList =
        attendanceExtent === "PARTIAL" ? (p.attendanceEvidence?.[0]?.list ?? null) : null;
      const person = people.get(p.email);
      let block = reason;
      if (!block && !person) block = "PERSON_MISSING";
      const eligible = ["ACTIVE", "HONORARY", ...(manifest.allowOnLeavePoints ? ["ON_LEAVE"] : [])];
      if (
        !block &&
        person &&
        (person.anonymized_at ||
          person.stage !== "MEMBER" ||
          !eligible.includes(person.status ?? ""))
      )
        block = "MEMBER_NOT_ELIGIBLE";
      if (!block && person && a.newMembersOnly && person.first_term_id !== term.id)
        block = "NEW_MEMBERS_ONLY";
      const checks =
        person && o
          ? snapshot.checkIns.filter((c) => c.occasion_id === o.id && c.person_id === person.id)
          : [];
      const check = checks[0];
      const live = check
        ? snapshot.entries.filter(
            (e) =>
              e.check_in_id === check.id &&
              e.kind === "CHECKIN" &&
              !snapshot.entries.some((r) => r.reversal_of_id === e.id),
          )
        : [];
      const expectedPoints = pointsFor(a.type);
      const creditConflict =
        expectedPoints === 0
          ? snapshot.entries.some((e) => e.check_in_id === check?.id)
          : live.length !== 1 ||
            live[0]?.points !== expectedPoints ||
            live[0]?.person_id !== person?.id;
      if (!block && check) {
        const compatibleStatus =
          check.status === "APPROVED" || (a.type === "ASAMBLEA" && check.status === "EXCUSED");
        if (checks.length !== 1 || !compatibleStatus || creditConflict)
          block = "EXISTING_CHECKIN_CONFLICT";
        else {
          const storedExtent =
            check.attendance_extent === undefined
              ? check.status === "EXCUSED"
                ? null
                : "FULL"
              : check.attendance_extent;
          if (
            storedExtent !== attendanceExtent ||
            (check.attendance_list ?? null) !== attendanceList
          )
            block = "EXISTING_ATTENDANCE_CONFLICT";
        }
      }
      if (
        !block &&
        !check &&
        expectedPoints > 0 &&
        person &&
        snapshot.entries.some(
          (e) =>
            e.person_id === person.id &&
            ["ADJUSTMENT", "LEGACY"].includes(e.kind) &&
            e.points > 0 &&
            !snapshot.entries.some((r) => r.reversal_of_id === e.id),
        )
      )
        block = "MANUAL_CREDIT_REVIEW";
      const gm =
        person && group
          ? snapshot.groupMemberships.find(
              (x) => x.person_id === person.id && x.group_id === group.id,
            )
          : undefined;
      if (!block && groupRef && (gm?.left_at || gm?.evaluation === "INSUFFICIENT"))
        block = "EVIDENCE_MEMBERSHIP_CONFLICT";
      const action = block ? "BLOCKED" : check ? "EXISTS" : "ADD";
      const evidenceAction =
        !groupRef || block
          ? "NONE"
          : !gm
            ? "ADD"
            : gm.evaluation === "PENDING" && a.evidenceEvaluation === "GOOD"
              ? "EVALUATE"
              : "EXISTS";
      return {
        recordId: p.recordId,
        email: p.email,
        personId: person?.id ?? null,
        action,
        reason: block,
        attendanceExtent,
        attendanceList,
        points: action === "ADD" ? pointsFor(a.type) : 0,
        evidenceAction,
        decoration:
          a.type !== "DECORACION" || block
            ? "NONE"
            : evidenceAction === "EXISTS"
              ? "EXISTS"
              : a.evidenceEvaluation === "GOOD"
                ? "ADD_GOOD"
                : "ADD_PENDING",
      } satisfies GhPlannedRow;
    });
    return {
      key: a.key,
      occasionId: o?.id ?? null,
      action: reason ? "BLOCKED" : o ? "REUSE" : "CREATE",
      reason,
      rows,
    };
  });
  const rows = activities.flatMap((a) => a.rows);
  const summary = {
    activitiesToCreate: activities.filter(
      (a) => a.action === "CREATE" && a.rows.some((r) => r.action === "ADD"),
    ).length,
    activitiesToReuse: activities.filter((a) => a.action === "REUSE").length,
    rowsToAdd: rows.filter((r) => r.action === "ADD").length,
    fullToAdd: rows.filter((r) => r.action === "ADD" && r.attendanceExtent === "FULL").length,
    partialToAdd: rows.filter((r) => r.action === "ADD" && r.attendanceExtent === "PARTIAL").length,
    rowsExisting: rows.filter((r) => r.action === "EXISTS").length,
    rowsBlocked: rows.filter((r) => r.action === "BLOCKED").length,
    pointsToAdd: rows.reduce((s, r) => s + r.points, 0),
    decorationEvidence: rows.filter((r) => ["ADD_PENDING", "ADD_GOOD"].includes(r.decoration))
      .length,
  };
  const warnings = snapshot.rules.length === 0 ? ["NO_GENERAL_PERMANENCE_RULES"] : [];
  const core = { termId: term.id, activities, summary, warnings, ruleChanges };
  const planHash = createHash("sha256").update(stableJson({ manifest, core })).digest("hex");
  return { ...core, planHash, queriedAt: snapshot.queriedAt, environment: snapshot.environment };
}
