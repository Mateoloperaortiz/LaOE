import { describe, expect, it } from "vitest";
import {
  completeBoardYears,
  HONORARY_REQUIREMENTS,
  honoraryEligibility,
} from "@/modules/people/domain/honorary-pure";
import { tList } from "@/shared/copy";

// Elegibilidad a honorario (Regl. art. 23; ADR-060 regla 13): cuatro de cinco requisitos derivados.

const now = new Date("2026-09-13T12:00:00Z");
const terms = [
  { id: "t23-1", code: "2023-1", endsOn: "2023-06-30" },
  { id: "t23-2", code: "2023-2", endsOn: "2023-12-15" },
  { id: "t24-1", code: "2024-1", endsOn: "2024-06-30" },
  { id: "t24-2", code: "2024-2", endsOn: "2024-12-15" },
  { id: "t25-1", code: "2025-1", endsOn: "2025-06-30" },
  { id: "t25-2", code: "2025-2", endsOn: "2025-12-15" },
  { id: "t26-2", code: "2026-2", endsOn: "2026-12-15" },
];
const base = {
  terms,
  committeeRoles: [],
  macroeventRoles: [],
  memberTermIds: [],
  boardTermIds: [],
  workCommitteeTermIds: [],
};

describe("elegibilidad a honorario", () => {
  it("tiene una etiqueta por requisito y arranca sin ninguno cumplido", () => {
    expect(tList("T-2316")).toHaveLength(HONORARY_REQUIREMENTS.length);
    const result = honoraryEligibility(base, now);
    expect(result.metCount).toBe(0);
    expect(result.eligible).toBe(false);
  });

  it("cuenta cargos completos, semestres, junta por año y comités de trabajo", () => {
    const result = honoraryEligibility(
      {
        ...base,
        // Vivo hasta el fin del término cerrado: completo; cerrado antes: no; término en curso: no.
        committeeRoles: [
          { termId: "t24-1", startedAt: new Date("2024-01-20T00:00:00Z"), endedAt: null },
          {
            termId: "t24-2",
            startedAt: new Date("2024-07-20T00:00:00Z"),
            endedAt: new Date("2024-10-01T00:00:00Z"),
          },
          { termId: "t26-2", startedAt: new Date("2026-07-20T00:00:00Z"), endedAt: null },
        ],
        macroeventRoles: [
          { editionStartsAt: new Date("2025-10-20T00:00:00Z") },
          { editionStartsAt: new Date("2099-10-20T00:00:00Z") },
          { editionStartsAt: null },
        ],
        memberTermIds: ["t23-1", "t23-2", "t24-1", "t24-2", "t25-1", "t25-2", "t26-2"],
        boardTermIds: ["t25-1", "t25-2", "t26-2"],
        workCommitteeTermIds: ["t24-1", "t24-2"],
      },
      now,
    );
    expect(result.items.map((item) => [item.code, item.count, item.met])).toEqual([
      ["COMMITTEE_ROLE_COMPLETE", 1, true],
      ["MACROEVENT_ROLE_COMPLETE", 1, true],
      ["ACTIVE_SEMESTERS", 6, true],
      ["BOARD_COMPLETE", 1, true],
      ["WORK_COMMITTEE_YEAR", 2, true],
    ]);
    expect(result.eligible).toBe(true);
    expect(completeBoardYears(["t25-1"], terms, now)).toBe(0);
    expect(completeBoardYears(["t25-1", "t25-2"], terms, now)).toBe(1);
  });

  it("con tres requisitos no es elegible", () => {
    const result = honoraryEligibility(
      {
        ...base,
        memberTermIds: ["t23-1", "t23-2", "t24-1", "t24-2", "t25-1", "t25-2"],
        boardTermIds: ["t24-1", "t24-2"],
        workCommitteeTermIds: ["t25-1", "t25-2"],
      },
      now,
    );
    expect(result.metCount).toBe(3);
    expect(result.eligible).toBe(false);
  });

  it("la prueba o suspensión bloquea la elegibilidad aunque cumpla cuatro requisitos", () => {
    const facts = {
      ...base,
      benefitsBlocked: true,
      memberTermIds: terms.map((row) => row.id),
      boardTermIds: ["t24-1", "t24-2"],
      workCommitteeTermIds: ["t24-1", "t24-2"],
      macroeventRoles: [{ editionStartsAt: new Date("2025-01-01T12:00:00Z") }],
    };
    expect(honoraryEligibility(facts, now)).toMatchObject({ metCount: 4, eligible: false });
    expect(honoraryEligibility({ ...facts, benefitsBlocked: false }, now).eligible).toBe(true);
  });
});
