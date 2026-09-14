import { describe, expect, it } from "vitest";
import { referenceGeneralRules } from "@/modules/permanence/domain/templates";
import {
  type GhSnapshot,
  ghManifestSchema,
  legacyKey,
  planGhImport,
} from "../../scripts/lib/ghpoints-plan";

const manifest = () =>
  ghManifestSchema.parse({
    format: "oe-ghpoints/2",
    batchId: "synthetic-batch",
    termCode: "2025-2",
    targetTermId: "term-test",
    allowOnLeavePoints: true,
    sources: [{ key: "SOURCE", path: "source.txt", sha256: "0".repeat(64) }],
    activities: [
      {
        key: "ACTIVITY",
        title: "Actividad sintética",
        type: "DECORACION",
        date: "2025-09-08",
        endDate: "2025-09-10",
        datePrecision: "DAY",
        newMembersOnly: true,
        existingOccasionId: null,
        sourceKey: "SOURCE",
        evidenceEvaluation: "GOOD",
        participants: [{ recordId: "RECORD", email: "person@example.test", sourceRow: 1 }],
      },
    ],
  });
const snapshot = (): GhSnapshot => ({
  queriedAt: "2025-09-14T18:00:00Z",
  environment: "test",
  terms: [
    {
      id: "term-test",
      code: "2025-2",
      starts_on: "2025-07-01",
      ends_on: "2025-12-31",
      points_closed_at: null,
      permanence_closed_at: null,
    },
  ],
  people: [
    {
      id: "person-test",
      email: "person@example.test",
      full_name: "Persona sintética",
      stage: "MEMBER",
      anonymized_at: null,
      status: "ACTIVE",
      first_term_id: "term-test",
    },
  ],
  occasions: [],
  checkIns: [],
  entries: [],
  groups: [],
  groupMemberships: [],
  rules: [],
  generalTableLocked: false,
});
const row = (s: GhSnapshot, m = manifest()) => planGhImport(m, s).activities[0]?.rows[0];

describe("preparación de GH Points", () => {
  it("acepta licencia para los puntos solo con la política explícita y exige nuevos en decoración", () => {
    const s = snapshot();
    first(s.people).status = "ON_LEAVE";
    expect(row(s)).toMatchObject({ action: "ADD", points: 30, decoration: "ADD_GOOD" });
    expect(row(s, { ...manifest(), allowOnLeavePoints: false })?.reason).toBe(
      "MEMBER_NOT_ELIGIBLE",
    );
    first(s.people).first_term_id = "older";
    expect(row(s)?.reason).toBe("NEW_MEMBERS_ONLY");
  });
  it("rechaza filas repetidas, fechas invertidas y decoración abierta a veteranos", () => {
    const m = manifest();
    const a = first(m.activities);
    for (const invalid of [
      { ...a, newMembersOnly: false },
      { ...a, endDate: "2025-09-07" },
      { ...a, participants: [...a.participants, ...a.participants] },
    ])
      expect(() => ghManifestSchema.parse({ ...m, activities: [invalid] })).toThrow();
  });
  it("retiene desconocidos y rechaza otra base de destino", () => {
    expect(row({ ...snapshot(), people: [] })?.reason).toBe("PERSON_MISSING");
    expect(() => planGhImport({ ...manifest(), targetTermId: "different" }, snapshot())).toThrow();
  });
  it("reconoce el crédito existente y no reactiva uno revertido", () => {
    const s = snapshot(),
      m = manifest(),
      a = first(m.activities);
    s.occasions = [
      {
        id: "occasion-test",
        legacy_id: legacyKey(m, a),
        title: a.title,
        kind: "ACTIVITY",
        category: "OTHER",
        new_members_only: true,
        status: "CLOSED",
        points: 30,
        starts_at: "2025-09-08T05:00:00Z",
        ends_at: "2025-09-11T05:00:00Z",
      },
    ];
    s.checkIns = [
      {
        id: "check-test",
        person_id: "person-test",
        occasion_id: "occasion-test",
        status: "APPROVED",
      },
    ];
    s.entries = [
      {
        id: "credit-test",
        person_id: "person-test",
        check_in_id: "check-test",
        kind: "CHECKIN",
        points: 30,
        reason: "Prueba",
        reversal_of_id: null,
      },
    ];
    expect(row(s)).toMatchObject({ action: "EXISTS", points: 0 });
    s.entries.push({
      ...first(s.entries),
      id: "reversal-test",
      kind: "REVERSAL",
      points: -30,
      reversal_of_id: "credit-test",
    });
    expect(row(s)?.reason).toBe("EXISTING_CHECKIN_CONFLICT");
  });
  it("distingue Wordle de créditos manuales que requieren revisión", () => {
    const s = snapshot();
    s.entries = [
      {
        id: "entry-test",
        person_id: "person-test",
        check_in_id: null,
        kind: "WORDLE",
        points: 10,
        reason: "Prueba",
        reversal_of_id: null,
      },
    ];
    expect(row(s)?.action).toBe("ADD");
    first(s.entries).kind = "ADJUSTMENT";
    expect(row(s)?.reason).toBe("MANUAL_CREDIT_REVIEW");
  });
  it("bloquea cierres, evaluaciones insuficientes y conflictos de reglas", () => {
    const s = snapshot();
    first(s.terms).points_closed_at = "2025-09-12";
    expect(row(s)?.reason).toBe("TERM_CLOSED");
    first(s.terms).points_closed_at = null;
    s.groups = [
      { id: "group-test", code: "DECORACION", name: "Decoración", kind: "NEW_MEMBER_TASK" },
    ];
    s.groupMemberships = [
      {
        id: "gm-test",
        group_id: "group-test",
        person_id: "person-test",
        evaluation: "INSUFFICIENT",
        left_at: null,
      },
    ];
    expect(row(s)?.reason).toBe("EVIDENCE_MEMBERSHIP_CONFLICT");
    const m = { ...manifest(), permanenceRules: referenceGeneralRules(3) };
    s.rules = [
      {
        id: "rule-test",
        key: first(m.permanenceRules).key,
        weight: 9,
        computation: "CHECKIN_COUNT",
        params: first(m.permanenceRules).params,
        applies_to: "ALL",
      },
    ];
    expect(row(s, m)?.reason).toBe("PERMANENCE_RULE_CONFLICT");
  });
  it("el hash ignora la hora de consulta y el orden de claves JSON", () => {
    const s = snapshot(),
      m = manifest();
    expect(planGhImport(m, s).planHash).toBe(
      planGhImport(m, { ...s, queriedAt: "2025-09-14T19:00:00Z" }).planHash,
    );
  });
});

function first<T>(items: T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("Falta dato sintético");
  return item;
}
