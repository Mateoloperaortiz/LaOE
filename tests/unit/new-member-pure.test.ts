import { describe, expect, it } from "vitest";
import { isNewMemberInTerm } from "@/modules/people/domain/new-member-pure";

// Quién es nuevo en un término para la permanencia y para la guarda de cargos (ADR-060 reglas 8 y
// 11; ADR-121 regla 4). La otra definición, la de la agenda, el check-in «solo nuevos» y el
// onboarding, mira solo el término de ingreso y no pasa por acá (decisión abierta 56).

const TERM_ID = "termino-actual";
const facts = (overrides: Partial<Parameters<typeof isNewMemberInTerm>[0]> = {}) => ({
  firstTermId: "termino-anterior",
  resumedNew: false,
  reportAsVeteran: false,
  ...overrides,
});

describe("quién es nuevo en un término", () => {
  it("quien ingresó en este término es nuevo; quien ingresó antes, no", () => {
    expect(isNewMemberInTerm(facts({ firstTermId: TERM_ID }), TERM_ID)).toBe(true);
    expect(isNewMemberInTerm(facts(), TERM_ID)).toBe(false);
  });

  it("quien retoma como nuevo es nuevo aunque haya ingresado en un término anterior", () => {
    expect(isNewMemberInTerm(facts({ resumedNew: true }), TERM_ID)).toBe(true);
  });

  it("quien se reporta como activo no es nuevo, ni por ingresar en este término ni por retomar como nuevo (Est. art. 5 par. 1)", () => {
    expect(isNewMemberInTerm(facts({ firstTermId: TERM_ID, reportAsVeteran: true }), TERM_ID)).toBe(
      false,
    );
    expect(isNewMemberInTerm(facts({ resumedNew: true, reportAsVeteran: true }), TERM_ID)).toBe(
      false,
    );
  });

  it("sin membresía no hay término de ingreso que comparar: no es nuevo", () => {
    expect(isNewMemberInTerm(facts({ firstTermId: null }), TERM_ID)).toBe(false);
  });
});
