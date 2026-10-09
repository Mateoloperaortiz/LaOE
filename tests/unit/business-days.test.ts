import { describe, expect, it } from "vitest";
import { addBusinessDaysIn, dateKeyIn } from "@/shared/lib/dates-pure";

// Los días hábiles se cuentan sobre el día civil de Colombia (ADR-118 regla 12; DT-198). El plazo de
// una excusa (ADR-060 regla 5) y el vencimiento de las tareas de GH salen de la misma cuenta. Antes se
// contaban sobre el día de UTC, que desde las 7 p. m. de Colombia ya es el día siguiente.

const BOGOTA = "America/Bogota";
const HOUR = 3_600_000;
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Colombia va cinco horas detrás de UTC todo el año: su reloj de pared es el de UTC corrido cinco horas. */
function wallClock(at: Date): Date {
  return new Date(at.getTime() - 5 * HOUR);
}

/** La cuenta a mano: avanza el reloj de Colombia de a un día y cuenta los que caen de lunes a viernes. */
function countedByCivilDay(from: Date, days: number): Date {
  const local = wallClock(from);
  let remaining = days;
  while (remaining > 0) {
    local.setUTCDate(local.getUTCDate() + 1);
    if (local.getUTCDay() !== 0 && local.getUTCDay() !== 6) {
      remaining -= 1;
    }
  }
  return new Date(local.getTime() + 5 * HOUR);
}

function label(at: Date): string {
  const local = wallClock(at);
  const hour = String(local.getUTCHours()).padStart(2, "0");
  return `${WEEKDAYS[local.getUTCDay()]} ${local.toISOString().slice(0, 10)} ${hour}:00`;
}

// Una semana de inicios, hora por hora: del lunes 5 al domingo 11 de octubre de 2026 en Colombia.
const MONDAY = new Date("2026-10-05T05:00:00Z");
const STARTS = Array.from(
  { length: 7 * 24 },
  (_, index) => new Date(MONDAY.getTime() + index * HOUR),
);

/** Los inicios de la semana donde sumar `days` hábiles no da lo que da la cuenta por día civil. */
function differing(days: number): string[] {
  return STARTS.flatMap((start) => {
    const got = addBusinessDaysIn(BOGOTA, start, days);
    const expected = countedByCivilDay(start, days);
    return got.getTime() === expected.getTime()
      ? []
      : [`${label(start)} + ${days}: da ${label(got)}, es ${label(expected)}`];
  });
}

describe("días hábiles sobre el día civil de Colombia", () => {
  it("los tres días hábiles de una excusa dan lo mismo que contarlos por día civil, a cualquier hora de la semana", () => {
    expect(differing(3)).toEqual([]);
  });

  it.each([
    1, 2, 5, 10, 15, 20,
  ])("sumar %i días hábiles da lo mismo que contarlos por día civil, a cualquier hora de la semana", (days) => {
    expect(differing(days)).toEqual([]);
  });

  it("la excusa de una ocasión del viernes a las 7 p. m. se recibe hasta el miércoles", () => {
    // Viernes 9 de octubre de 2026 a las 19:00 de Colombia: en UTC ya es sábado.
    const deadline = addBusinessDaysIn(BOGOTA, new Date("2026-10-10T00:00:00Z"), 3);
    expect(dateKeyIn(BOGOTA, deadline)).toBe("2026-10-14");
    expect(deadline).toEqual(new Date("2026-10-15T00:00:00Z"));
  });

  it("la de una ocasión del martes a las 7 p. m. se recibe hasta el viernes, no hasta el domingo", () => {
    const deadline = addBusinessDaysIn(BOGOTA, new Date("2026-10-07T00:00:00Z"), 3);
    expect(dateKeyIn(BOGOTA, deadline)).toBe("2026-10-09");
  });

  it("el plazo vence a la misma hora en que empezó la ocasión, no al terminar el día (decisión abierta 33, tercera pregunta)", () => {
    // Lunes 5 a las 18:00 de Colombia: vence el jueves 8 a las 18:00.
    expect(addBusinessDaysIn(BOGOTA, new Date("2026-10-05T23:00:00Z"), 3)).toEqual(
      new Date("2026-10-08T23:00:00Z"),
    );
  });

  it("un festivo cuenta como día hábil (decisión abierta 33, tercera pregunta)", () => {
    // Viernes 9 a las 10:00 de Colombia. El lunes 12 de octubre de 2026 es festivo y aun así cuenta:
    // el plazo cae el miércoles 14 y no el jueves 15.
    expect(addBusinessDaysIn(BOGOTA, new Date("2026-10-09T15:00:00Z"), 3)).toEqual(
      new Date("2026-10-14T15:00:00Z"),
    );
  });

  it("el día civil es el de la zona que se le pasa", () => {
    // El mismo instante es sábado en UTC y viernes en Colombia.
    const start = new Date("2026-10-10T00:00:00Z");
    expect(addBusinessDaysIn("UTC", start, 3)).toEqual(new Date("2026-10-14T00:00:00Z"));
    expect(addBusinessDaysIn(BOGOTA, start, 3)).toEqual(new Date("2026-10-15T00:00:00Z"));
  });

  it("sumar cero días devuelve el mismo instante", () => {
    const start = new Date("2026-10-10T00:00:00Z");
    expect(addBusinessDaysIn(BOGOTA, start, 0)).toEqual(start);
  });
});
