import { describe, expect, it } from "vitest";
import { macroeventRoleCodes } from "@/modules/events/domain/macroevents-pure";
import {
  electionRecordSchema,
  electionRecordValid,
  reactivationValid,
  macroeventViability as viability,
} from "@/modules/people/domain/macroevent-governance-pure";
import { probationMarginsForTerm } from "@/modules/permanence/domain/normative-policy-pure";
import { finalStateFor } from "@/modules/permanence/domain/permanence-pure";

const macroeventViability = (slug: string, roles: Parameters<typeof viability>[1]) =>
  viability(slug, roles, macroeventRoleCodes(slug));
const legacy = { active: 20, new: 0, probation: 0, transfer: 0 };
const current = { ...legacy, active: 10 };
const election = electionRecordSchema.parse({
  origin: "ELECTED",
  minutes: "Acta de prueba",
  requirementsChecked: true,
  lateCandidacy: false,
  qualifiedPermission: "",
  experience: "VERIFIED",
  generalFacultyChecked: true,
  compositionChecked: true,
  extraordinary: false,
  workPlan: "",
});

describe("normativa desde 2026-2", () => {
  it.each([
    [49.99, "NO_CUMPLE"],
    [50, "PRUEBA"],
    [59.99, "PRUEBA"],
    [60, "CUMPLE"],
  ] as const)("un activo con %s obtiene %s", (score, state) => {
    expect(
      finalStateFor(score, 60, probationMarginsForTerm("2026-2", legacy, current).active),
    ).toBe(state);
  });
  it("mantiene la banda anterior en términos anteriores y conserva las otras condiciones", () => {
    expect(finalStateFor(45, 60, probationMarginsForTerm("2026-1", legacy, current).active)).toBe(
      "PRUEBA",
    );
    expect(finalStateFor(45, 60, probationMarginsForTerm("2027-1", legacy, current).active)).toBe(
      "NO_CUMPLE",
    );
    for (const condition of ["new", "probation", "transfer"] as const) {
      const threshold = condition === "transfer" ? 70 : 80;
      expect(
        finalStateFor(
          threshold - 0.01,
          threshold,
          probationMarginsForTerm("2026-2", legacy, current)[condition],
        ),
      ).toBe("NO_CUMPLE");
    }
    expect(legacy.active).toBe(20);
  });
});

describe("continuidad y requisitos de macroeventos", () => {
  const elected = (roleCode: string) => ({ roleCode, origin: "ELECTED" });
  it("cuenta una codirección una sola vez y no cuenta suplencias ni registros sin constancia", () => {
    expect(
      macroeventViability("inventiva", [
        elected("GENERAL"),
        elected("GENERAL"),
        { roleCode: "FINANZAS", origin: "BOARD_SUBSTITUTE" },
        { roleCode: "LOGISTICA", origin: null },
      ]),
    ).toMatchObject({ elected: ["GENERAL"], minimum: 2, status: "DISABLED", unverified: 1 });
    expect(
      macroeventViability("inventiva", [elected("GENERAL"), elected("LOGISTICA")]).status,
    ).toBe("ENABLED");
    expect(
      macroeventViability("enfemenino", [elected("GENERAL"), elected("LOGISTICA")]).status,
    ).toBe("DISABLED");
    expect(
      macroeventViability("enfemenino", [
        elected("GENERAL"),
        elected("LOGISTICA"),
        elected("FINANZAS"),
      ]).status,
    ).toBe("ENABLED");
  });
  it("DÍAS requiere cuatro cargos con The Games o Carnival", () => {
    const base = ["GENERAL", "LOGISTICA", "FINANZAS"].map(elected);
    expect(macroeventViability("dias-eafit", [...base, elected("MERCADEO")]).status).toBe(
      "DISABLED",
    );
    for (const role of ["THE_GAMES", "CARNIVAL"])
      expect(macroeventViability("dias-eafit", [...base, elected(role)]).status).toBe("ENABLED");
  });
  it("exige permiso tardío y plan extraordinario, y acepta experiencia de la candidatura conjunta o tercera vuelta", () => {
    expect(
      electionRecordValid("inventiva", "LOGISTICA", { ...election, generalFacultyChecked: false }),
    ).toBe(true);
    expect(
      electionRecordValid("inventiva", "GENERAL", { ...election, generalFacultyChecked: false }),
    ).toBe(false);
    expect(electionRecordValid("inventiva", "GENERAL", { ...election, lateCandidacy: true })).toBe(
      false,
    );
    expect(
      electionRecordValid("inventiva", "GENERAL", {
        ...election,
        lateCandidacy: true,
        qualifiedPermission: "Acta con mayoría calificada",
      }),
    ).toBe(true);
    expect(electionRecordValid("inventiva", "GENERAL", { ...election, extraordinary: true })).toBe(
      false,
    );
    expect(
      electionRecordValid("inventiva", "GENERAL", { ...election, experience: "THIRD_ROUND" }),
    ).toBe(true);
    expect(
      electionRecordValid("inventiva", "GENERAL", { ...election, experience: "NOT_APPLICABLE" }),
    ).toBe(false);
    for (const role of ["GENERAL", "MERCADEO", "AGENDA_ACADEMICA"])
      expect(
        electionRecordValid("enfemenino", role, { ...election, compositionChecked: false }),
      ).toBe(false);
  });
  it("reactivar exige todos los cargos y presentación en el segundo semestre del año anterior", () => {
    const proposal = {
      eventId: "evento",
      year: 2028,
      submittedOn: "2027-09-10",
      electionSession: "Acta de elección",
      mission: "Misión de prueba",
      workPlan: "Plan de prueba",
      roster: macroeventRoleCodes("inventiva").map((roleCode, i) => ({
        roleCode,
        personId: `persona-${i}`,
      })),
    };
    expect(reactivationValid(macroeventRoleCodes("inventiva"), proposal, "2027-09-11")).toBe(true);
    expect(
      reactivationValid(
        macroeventRoleCodes("inventiva"),
        { ...proposal, roster: proposal.roster.slice(0, 2) },
        "2027-09-11",
      ),
    ).toBe(false);
    expect(
      reactivationValid(
        macroeventRoleCodes("inventiva"),
        { ...proposal, submittedOn: "2027-06-30" },
        "2027-09-11",
      ),
    ).toBe(false);
    expect(
      reactivationValid(
        macroeventRoleCodes("inventiva"),
        { ...proposal, year: 2027 },
        "2027-09-11",
      ),
    ).toBe(false);
    expect(reactivationValid(macroeventRoleCodes("inventiva"), proposal, "2027-09-09")).toBe(false);
    expect(
      reactivationValid(
        macroeventRoleCodes("inventiva"),
        {
          ...proposal,
          roster: proposal.roster.map((row) => ({ ...row, personId: "misma-persona" })),
        },
        "2027-09-11",
      ),
    ).toBe(false);
  });
});
