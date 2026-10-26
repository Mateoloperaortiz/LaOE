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
  it("admite la asistencia parcial de una asamblea con su lista y la fila de origen", () => {
    const m = manifest();
    const a = first(m.activities);
    const parsed = ghManifestSchema.parse({
      ...m,
      activities: [
        {
          ...a,
          type: "ASAMBLEA",
          assemblyKind: "ORDINARY",
          newMembersOnly: false,
          endDate: a.date,
          participants: [
            {
              ...first(a.participants),
              attendanceExtent: "PARTIAL",
              attendanceEvidence: [
                { list: "FIRST", sourceKey: "SOURCE", sourceSheet: "Primera", sourceRow: 7 },
              ],
            },
          ],
        },
      ],
    });
    expect(first(first(parsed.activities).participants)).toMatchObject({
      attendanceExtent: "PARTIAL",
      attendanceEvidence: [
        { list: "FIRST", sourceKey: "SOURCE", sourceSheet: "Primera", sourceRow: 7 },
      ],
    });
  });
  it("retiene una clasificación que no coincide con las listas o sus fuentes", () => {
    const m = manifest();
    const a = first(m.activities);
    const p = first(a.participants);
    const firstEvidence = { list: "FIRST", sourceKey: "SOURCE", sourceRow: 7 };
    const secondEvidence = { list: "SECOND", sourceKey: "SOURCE", sourceRow: 9 };
    const assembly = {
      ...a,
      type: "ASAMBLEA",
      assemblyKind: "ORDINARY",
      newMembersOnly: false,
      endDate: a.date,
    };
    for (const invalid of [
      { ...p, attendanceExtent: "PARTIAL" },
      { ...p, attendanceExtent: "FULL", attendanceEvidence: [firstEvidence] },
      {
        ...p,
        attendanceExtent: "PARTIAL",
        attendanceEvidence: [firstEvidence, secondEvidence],
      },
      {
        ...p,
        attendanceExtent: "FULL",
        attendanceEvidence: [firstEvidence, firstEvidence],
      },
      {
        ...p,
        attendanceExtent: "PARTIAL",
        attendanceEvidence: [{ ...firstEvidence, sourceKey: "UNKNOWN" }],
      },
    ])
      expect(
        ghManifestSchema.safeParse({ ...m, activities: [{ ...assembly, participants: [invalid] }] })
          .success,
      ).toBe(false);
    expect(
      ghManifestSchema.safeParse({
        ...m,
        activities: [
          {
            ...a,
            participants: [
              { ...p, attendanceExtent: "PARTIAL", attendanceEvidence: [firstEvidence] },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ghManifestSchema.safeParse({
        ...m,
        activities: [
          {
            ...a,
            participants: [{ ...p, attendanceEvidence: [firstEvidence, secondEvidence] }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ghManifestSchema.safeParse({
        ...m,
        activities: [
          {
            ...assembly,
            participants: [
              {
                ...p,
                attendanceExtent: "FULL",
                attendanceEvidence: [firstEvidence, secondEvidence],
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });
  it("la vista previa separa completas y parciales y conserva la lista acreditada", () => {
    const m = manifest();
    const a = first(m.activities);
    const p = first(a.participants);
    Object.assign(a, {
      type: "ASAMBLEA",
      assemblyKind: "ORDINARY",
      newMembersOnly: false,
      endDate: a.date,
      participants: [
        {
          ...p,
          attendanceExtent: "PARTIAL",
          attendanceEvidence: [{ list: "FIRST", sourceKey: "SOURCE", sourceRow: 7 }],
        },
        { recordId: "FULL-RECORD", email: "other@example.test", sourceRow: 8 },
      ],
    });
    const s = snapshot();
    s.people.push({ ...first(s.people), id: "other-person", email: "other@example.test" });
    const plan = planGhImport(m, s);
    expect(plan.summary).toMatchObject({
      rowsToAdd: 2,
      fullToAdd: 1,
      partialToAdd: 1,
      pointsToAdd: 0,
    });
    expect(first(first(plan.activities).rows)).toMatchObject({
      action: "ADD",
      attendanceExtent: "PARTIAL",
      attendanceList: "FIRST",
      points: 0,
    });
    expect(first(plan.activities).rows[1]).toMatchObject({
      action: "ADD",
      attendanceExtent: "FULL",
      attendanceList: null,
    });
  });
  it("reconoce una parcial ya excusada sin perder su lista ni cambiar la decisión", () => {
    const m = manifest();
    const a = first(m.activities);
    Object.assign(a, {
      type: "ASAMBLEA",
      assemblyKind: "ORDINARY",
      newMembersOnly: false,
      endDate: a.date,
    });
    Object.assign(first(a.participants), {
      attendanceExtent: "PARTIAL",
      attendanceEvidence: [{ list: "FIRST", sourceKey: "SOURCE", sourceRow: 7 }],
    });
    const s = snapshot();
    s.occasions = [
      {
        id: "assembly-test",
        legacy_id: legacyKey(m, a),
        title: a.title,
        kind: "ASSEMBLY",
        assembly_kind: "ORDINARY",
        category: "OTHER",
        new_members_only: false,
        status: "CLOSED",
        points: 0,
        starts_at: "2025-09-08T05:00:00Z",
        ends_at: "2025-09-09T05:00:00Z",
      },
    ];
    s.checkIns = [
      {
        id: "check-test",
        occasion_id: "assembly-test",
        person_id: "person-test",
        status: "EXCUSED",
      },
    ];
    Object.assign(first(s.checkIns), { attendance_extent: "PARTIAL", attendance_list: "FIRST" });
    expect(row(s, m)).toMatchObject({ action: "EXISTS", attendanceExtent: "PARTIAL", points: 0 });
    Object.assign(first(s.checkIns), { attendance_list: "SECOND" });
    expect(row(s, m)?.reason).toBe("EXISTING_ATTENDANCE_CONFLICT");
    Object.assign(first(s.checkIns), {
      attendance_extent: "FULL",
      attendance_list: null,
      status: "APPROVED",
    });
    expect(row(s, m)?.reason).toBe("EXISTING_ATTENDANCE_CONFLICT");
    Object.assign(first(s.checkIns), { attendance_extent: null, status: "EXCUSED" });
    Object.assign(first(a.participants), {
      attendanceExtent: "FULL",
      attendanceEvidence: undefined,
    });
    expect(row(s, m)?.reason).toBe("EXISTING_ATTENDANCE_CONFLICT");
  });
  it("exige clasificar las asambleas y no admite tipo de asamblea en actividades", () => {
    const m = manifest(),
      a = first(m.activities);
    for (const invalid of [
      { ...a, type: "ASAMBLEA", newMembersOnly: false },
      { ...a, assemblyKind: "ORDINARY" },
      { ...a, type: "ASAMBLEA", assemblyKind: "ORDINARY" },
    ])
      expect(() => ghManifestSchema.parse({ ...m, activities: [invalid] })).toThrow();
    const assembly = {
      ...a,
      type: "ASAMBLEA",
      assemblyKind: "ORDINARY",
      newMembersOnly: false,
      endDate: a.date,
    };
    expect(() =>
      ghManifestSchema.parse({
        ...m,
        activities: [
          assembly,
          {
            ...assembly,
            key: "SECOND",
            participants: [
              { recordId: "SECOND-RECORD", email: "person@example.test", sourceRow: 2 },
            ],
          },
        ],
      }),
    ).toThrow("mismo día");
  });
  it("reconoce la asamblea aprobada sin crédito y retiene ledger o tipo incompatibles", () => {
    const m = manifest(),
      a = first(m.activities),
      s = snapshot();
    Object.assign(a, {
      type: "ASAMBLEA",
      assemblyKind: "ORDINARY",
      newMembersOnly: false,
      endDate: a.date,
    });
    s.occasions = [
      {
        id: "assembly-test",
        legacy_id: legacyKey(m, a),
        title: a.title,
        kind: "ASSEMBLY",
        assembly_kind: "ORDINARY",
        category: "OTHER",
        new_members_only: false,
        status: "CLOSED",
        points: 0,
        starts_at: "2025-09-08T05:00:00Z",
        ends_at: "2025-09-09T05:00:00Z",
      },
    ];
    s.entries = [
      {
        id: "manual",
        person_id: "person-test",
        check_in_id: null,
        kind: "ADJUSTMENT",
        points: 50,
        reason: "Otro concepto",
        reversal_of_id: null,
      },
    ];
    expect(row(s, m)).toMatchObject({ action: "ADD", points: 0, evidenceAction: "NONE" });
    s.checkIns = [
      {
        id: "check-test",
        occasion_id: "assembly-test",
        person_id: "person-test",
        status: "APPROVED",
      },
    ];
    expect(row(s, m)).toMatchObject({ action: "EXISTS", points: 0 });
    first(s.entries).check_in_id = "check-test";
    expect(row(s, m)?.reason).toBe("EXISTING_CHECKIN_CONFLICT");
    s.entries = [];
    first(s.occasions).assembly_kind = "BOARD_ELECTION";
    expect(row(s, m)?.reason).toBe("OCCASION_METADATA_CONFLICT");
  });
  it("retiene asambleas del mismo día sin conciliar y la permanencia cerrada", () => {
    const m = manifest(),
      a = first(m.activities),
      s = snapshot();
    Object.assign(a, {
      type: "ASAMBLEA",
      assemblyKind: "ORDINARY",
      newMembersOnly: false,
      endDate: a.date,
    });
    s.occasions = [
      {
        id: "another",
        legacy_id: null,
        title: "Otro título",
        kind: "ASSEMBLY",
        assembly_kind: "ORDINARY",
        category: "OTHER",
        new_members_only: false,
        status: "CLOSED",
        points: 0,
        starts_at: "2025-09-08T20:00:00Z",
        ends_at: null,
      },
    ];
    expect(row(s, m)?.reason).toBe("EXISTING_ASSEMBLY_NEEDS_MAPPING");
    s.occasions = [];
    first(s.terms).permanence_closed_at = "2025-12-31";
    expect(row(s, m)?.reason).toBe("PERMANENCE_CLOSED");
  });
  it("admite varias vueltas adicionales en el lote aunque ya exista otra en el término", () => {
    const m = manifest(),
      a = first(m.activities),
      s = snapshot();
    Object.assign(a, {
      type: "ASAMBLEA",
      assemblyKind: "RUNOFF",
      newMembersOnly: false,
      endDate: a.date,
    });
    s.occasions = [
      {
        id: "another",
        legacy_id: null,
        title: "Segunda vuelta",
        kind: "ASSEMBLY",
        assembly_kind: "RUNOFF",
        category: "OTHER",
        new_members_only: false,
        status: "CLOSED",
        points: 0,
        starts_at: "2025-09-01T20:00:00Z",
        ends_at: null,
      },
    ];
    expect(row(s, m)).toMatchObject({ action: "ADD", points: 0 });
    m.activities.push({
      ...a,
      key: "SECOND",
      date: "2025-09-09",
      endDate: "2025-09-09",
      participants: [{ recordId: "SECOND-RECORD", email: "person@example.test", sourceRow: 2 }],
    });
    const parsed = ghManifestSchema.parse(m);
    const plan = planGhImport(parsed, s);
    expect(plan.activities.map((activity) => activity.action)).toEqual(["CREATE", "CREATE"]);
    expect(plan.summary).toMatchObject({ activitiesToCreate: 2, rowsToAdd: 2, pointsToAdd: 0 });
  });
  it("concilia cada vuelta adicional por su referencia y reintenta sin mezclar sus asistencias", () => {
    const m = manifest();
    const a = first(m.activities);
    Object.assign(a, {
      type: "ASAMBLEA",
      assemblyKind: "RUNOFF",
      newMembersOnly: false,
      endDate: a.date,
    });
    m.activities.push({
      ...a,
      key: "NEXT-RUNOFF",
      date: "2025-09-09",
      endDate: "2025-09-09",
      participants: [{ recordId: "NEXT-RECORD", email: "person@example.test", sourceRow: 2 }],
    });
    const parsed = ghManifestSchema.parse(m);
    const s = snapshot();
    s.occasions = parsed.activities.map((activity, index) => ({
      id: `runoff-${index}`,
      legacy_id: legacyKey(parsed, activity),
      title: activity.title,
      kind: "ASSEMBLY",
      assembly_kind: "RUNOFF",
      category: "OTHER",
      new_members_only: false,
      status: "CLOSED",
      points: 0,
      starts_at: `${activity.date}T05:00:00Z`,
      ends_at: null,
    }));
    s.checkIns = [
      {
        id: "first-check",
        occasion_id: "runoff-0",
        person_id: "person-test",
        status: "APPROVED",
      },
    ];
    const plan = planGhImport(parsed, s);
    expect(plan.activities.map((activity) => activity.occasionId)).toEqual([
      "runoff-0",
      "runoff-1",
    ]);
    expect(plan.activities.map((activity) => first(activity.rows).action)).toEqual([
      "EXISTS",
      "ADD",
    ]);

    // La referencia explícita identifica la misma ocasión que la clave estable del lote.
    parsed.activities.forEach((activity, index) => {
      activity.existingOccasionId = `runoff-${index}`;
    });
    s.checkIns.push({ ...first(s.checkIns), id: "next-check", occasion_id: "runoff-1" });
    expect(planGhImport(parsed, s).summary).toMatchObject({
      activitiesToReuse: 2,
      rowsExisting: 2,
      rowsToAdd: 0,
      rowsBlocked: 0,
    });
    first(parsed.activities).existingOccasionId = "runoff-1";
    expect(first(planGhImport(parsed, s).activities).reason).toBe("OCCASION_CONFLICT");
  });
  it("mantiene una sola elección de junta y exige conciliar la ya existente", () => {
    const m = manifest();
    const a = first(m.activities);
    Object.assign(a, {
      type: "ASAMBLEA",
      assemblyKind: "BOARD_ELECTION",
      newMembersOnly: false,
      endDate: a.date,
    });
    const s = snapshot();
    s.occasions = [
      {
        id: "existing-election",
        legacy_id: null,
        title: "Elección de junta",
        kind: "ASSEMBLY",
        assembly_kind: "BOARD_ELECTION",
        category: "OTHER",
        new_members_only: false,
        status: "CLOSED",
        points: 0,
        starts_at: "2025-09-01T20:00:00Z",
        ends_at: null,
      },
    ];
    expect(row(s, m)?.reason).toBe("EXISTING_ASSEMBLY_NEEDS_MAPPING");
    first(s.occasions).status = "CANCELLED";
    expect(row(s, m)).toMatchObject({ action: "ADD" });
    m.activities.push({
      ...a,
      key: "SECOND-ELECTION",
      date: "2025-09-09",
      endDate: "2025-09-09",
      participants: [{ recordId: "SECOND-RECORD", email: "person@example.test", sourceRow: 2 }],
    });
    expect(() => ghManifestSchema.parse(m)).toThrow("elección de junta");
  });
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
