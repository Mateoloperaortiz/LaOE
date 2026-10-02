import { describe, expect, it } from "vitest";
import { judgeStage } from "@/modules/competition/domain/judge-pure";

// Qué ve el líder en cada enfrentamiento (ADR-106): la base empieza con la rotación, los poderes siguen
// abiertos hasta confirmarlos o registrar el resultado, y el resultado queda bloqueado para él.

const open = { normal: true, powersClosed: false, recorded: false, declared: 0, available: 0 };

describe("pantalla del líder", () => {
  it("sin tarjetas, el resultado sale de una vez", () => {
    expect(judgeStage(open)).toEqual({
      powers: false,
      confirmFirst: false,
      results: true,
      locked: false,
    });
  });

  it("con tarjetas sin registrar, salen los poderes y el resultado a la vez", () => {
    expect(judgeStage({ ...open, available: 2 })).toMatchObject({
      powers: true,
      confirmFirst: false,
      results: true,
    });
  });

  it("con un poder registrado, se confirma antes del resultado", () => {
    expect(judgeStage({ ...open, declared: 1, available: 1 })).toMatchObject({
      powers: true,
      confirmFirst: true,
      results: false,
    });
  });

  it("con los poderes confirmados, solo queda el resultado", () => {
    expect(judgeStage({ ...open, powersClosed: true, declared: 1, available: 1 })).toMatchObject({
      powers: false,
      confirmFirst: false,
      results: true,
    });
  });

  it("con el resultado registrado, todo queda bloqueado", () => {
    expect(
      judgeStage({ ...open, powersClosed: true, recorded: true, declared: 1, available: 1 }),
    ).toEqual({ powers: false, confirmFirst: false, results: false, locked: true });
  });

  it("una inflable no tiene poderes", () => {
    expect(judgeStage({ ...open, normal: false, available: 3 })).toMatchObject({
      powers: false,
      results: true,
    });
  });
});
