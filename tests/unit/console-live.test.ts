import { describe, expect, it } from "vitest";
import { afterPoll, showsAsCurrent } from "@/modules/participation/components/console-live";

// Qué muestra como vigente la consola en vivo según cómo terminó su último sondeo (ADR-122 regla 14).

describe("vigencia de lo que muestra la consola en vivo", () => {
  const code = { secondsLeft: 12 };

  it("recién cargada muestra el QR y el código como vigentes", () => {
    expect(showsAsCurrent("live", code)).toBe(true);
    expect(showsAsCurrent("live", null)).toBe(true);
  });

  it("un sondeo que la casa responde con error deja de mostrarlos como vigentes, le quede o no tiempo al código", () => {
    const status = afterPoll("live", "rejected");
    expect(showsAsCurrent(status, code)).toBe(false);
    expect(showsAsCurrent(status, null)).toBe(false);
  });

  it("un sondeo sin respuesta conserva el código mientras le queden segundos y lo retira cuando se le acaban", () => {
    const status = afterPoll("live", "unreachable");
    expect(showsAsCurrent(status, { secondsLeft: 3 })).toBe(true);
    expect(showsAsCurrent(status, { secondsLeft: 0 })).toBe(false);
  });

  it("sin código rotativo, un sondeo sin respuesta no cambia lo que se muestra: el siguiente lo intenta de nuevo", () => {
    expect(showsAsCurrent(afterPoll("live", "unreachable"), null)).toBe(true);
  });

  it("un sondeo sin respuesta no borra el rechazo que la casa ya dio", () => {
    const status = afterPoll(afterPoll("live", "rejected"), "unreachable");
    expect(showsAsCurrent(status, code)).toBe(false);
  });

  it("un sondeo que responde bien devuelve la consola a vigente", () => {
    expect(showsAsCurrent(afterPoll(afterPoll("live", "rejected"), "fresh"), code)).toBe(true);
    // El hueco normal entre una rotación y el sondeo siguiente no es un código vencido.
    expect(
      showsAsCurrent(afterPoll(afterPoll("live", "unreachable"), "fresh"), { secondsLeft: 0 }),
    ).toBe(true);
  });
});
