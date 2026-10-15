import { describe, expect, it } from "vitest";
import {
  presenceCommitteeIntervals,
  presenceStatusChanges,
} from "@/modules/people/domain/presence-membership-history-pure";

const at = (day: string) => new Date(`${day}T17:00:00Z`);
const termId = "semestre";
const row = (
  committeeId: string,
  overrides: Partial<Parameters<typeof presenceCommitteeIntervals>[0][number]> = {},
) => ({
  committeeId,
  createdAt: at("2026-09-01"),
  joinedAt: at("2026-09-01"),
  leftAt: null,
  ...overrides,
});
const snapshot = (day: string, before: string[], after: string[]) => ({
  action: "committee-membership.set",
  at: at(day),
  before: { termId, committees: before.map((committeeId) => ({ committeeId })) },
  after: { termId, committees: after.map((committeeId) => ({ committeeId })) },
});

describe("historia de pertenencias para oportunidades presenciales", () => {
  it("A→B→A conserva dos intervalos de A, sin inventar pertenencia durante B", () => {
    expect(
      presenceCommitteeIntervals(
        [row("A"), row("B", { leftAt: at("2026-09-21") })],
        [
          snapshot("2026-09-01", [], ["A"]),
          snapshot("2026-09-14", ["A"], ["B"]),
          snapshot("2026-09-21", ["B"], ["A"]),
        ],
        termId,
      ),
    ).toEqual([
      { committeeId: "A", joinedAt: at("2026-09-01"), leftAt: at("2026-09-14") },
      { committeeId: "B", joinedAt: at("2026-09-14"), leftAt: at("2026-09-21") },
      { committeeId: "A", joinedAt: at("2026-09-21"), leftAt: null },
    ]);
  });

  it("un regreso con salida desconocida no extiende el primer intervalo sobre el hueco", () => {
    expect(
      presenceCommitteeIntervals(
        [row("A")],
        [
          snapshot("2026-09-01", [], ["A"]),
          {
            action: "committee-membership.added",
            at: at("2026-09-21"),
            before: null,
            after: { termId, committeeId: "A", revived: true },
          },
        ],
        termId,
      ),
    ).toEqual([{ committeeId: "A", joinedAt: at("2026-09-21"), leftAt: null }]);
  });

  it("el cierre auditado por baja o permanencia conserva el intervalo anterior al reingreso", () => {
    expect(
      presenceCommitteeIntervals(
        [row("A", { joinedAt: at("2026-09-21") })],
        [
          snapshot("2026-09-01", [], ["A"]),
          {
            action: "committee-membership.closed",
            at: at("2026-09-14"),
            before: null,
            after: { termId, committeeId: "A" },
          },
          {
            action: "committee-membership.added",
            at: at("2026-09-21"),
            before: null,
            after: { termId, committeeId: "A", revived: true },
          },
        ],
        termId,
      ),
    ).toEqual([
      { committeeId: "A", joinedAt: at("2026-09-01"), leftAt: at("2026-09-14") },
      { committeeId: "A", joinedAt: at("2026-09-21"), leftAt: null },
    ]);
  });

  it("usa la fecha efectiva del cambio y no la del registro SQL", () => {
    const change = snapshot("2026-10-15", [], ["A"]);
    expect(
      presenceCommitteeIntervals(
        [row("A")],
        [{ ...change, after: { ...change.after, effectiveAt: at("2026-09-01").toISOString() } }],
        termId,
      )[0]?.joinedAt,
    ).toEqual(at("2026-09-01"));
  });

  it("una auditoría borrada o incompleta no demuestra continuidad de la fila final", () => {
    expect(
      presenceCommitteeIntervals(
        [row("A")],
        [
          snapshot("2026-09-01", [], ["A"]),
          { action: "committee-membership.set", at: at("2026-09-14"), before: null, after: null },
        ],
        termId,
      ),
    ).toEqual([]);
  });

  it("sin cambios auditados la fila solo demuestra pertenencia desde su propia creación", () => {
    expect(
      presenceCommitteeIntervals(
        [row("A", { createdAt: at("2026-09-14"), joinedAt: null })],
        [],
        termId,
      ),
    ).toEqual([{ committeeId: "A", joinedAt: at("2026-09-14"), leftAt: null }]);
  });

  it("no mezcla cambios de otro semestre ni reinicia intervalos por cambios solo de cargos", () => {
    const other = snapshot("2026-09-14", ["A"], []);
    expect(
      presenceCommitteeIntervals(
        [row("A")],
        [
          snapshot("2026-09-01", [], ["A"]),
          snapshot("2026-09-07", ["A"], ["A"]),
          {
            ...other,
            before: { ...other.before, termId: "otro" },
            after: { ...other.after, termId: "otro" },
          },
        ],
        termId,
      ),
    ).toEqual([{ committeeId: "A", joinedAt: at("2026-09-01"), leftAt: null }]);
  });
});

describe("primera evidencia del estado de membresía", () => {
  it("no aplica el estado actual de un ingreso tardío a las semanas anteriores", () => {
    expect(
      presenceStatusChanges({ createdAt: at("2026-09-18"), status: "ACTIVE", changes: [] }),
    ).toEqual([{ at: at("2026-09-18"), from: "INACTIVE", to: "ACTIVE" }]);
  });

  it("conserva la licencia y regreso reales aunque el estado actual ya sea activo", () => {
    const changes = [
      { at: at("2026-09-14"), from: "ACTIVE", to: "ON_LEAVE" },
      { at: at("2026-09-21"), from: "ON_LEAVE", to: "ACTIVE" },
    ] as const;
    expect(
      presenceStatusChanges({ createdAt: at("2026-09-01"), status: "ACTIVE", changes }),
    ).toEqual([{ at: at("2026-09-01"), from: "INACTIVE", to: "ACTIVE" }, ...changes]);
  });

  it("una evidencia histórica anterior a una importación tardía conserva su fecha demostrable", () => {
    const change = { at: at("2026-09-01"), from: null, to: "ACTIVE" } as const;
    expect(
      presenceStatusChanges({ createdAt: at("2026-10-15"), status: "ACTIVE", changes: [change] })[0]
        ?.at,
    ).toEqual(at("2026-09-01"));
  });
});
