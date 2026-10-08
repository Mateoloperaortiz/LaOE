import { describe, expect, it } from "vitest";
import { atHourIn } from "@/shared/lib/dates-pure";

describe("una hora en punto de un día, en una zona", () => {
  it("las nueve de la mañana de Colombia son las dos de la tarde de ese día en UTC", () => {
    expect(atHourIn("America/Bogota", "2026-10-07", 9)).toEqual(
      new Date("2026-10-07T14:00:00.000Z"),
    );
  });

  it("las once de la noche de Colombia ya son del día siguiente en UTC", () => {
    expect(atHourIn("America/Bogota", "2026-10-07", 23)).toEqual(
      new Date("2026-10-08T04:00:00.000Z"),
    );
  });

  it("el mediodía de un día en UTC es ese mismo instante", () => {
    expect(atHourIn("UTC", "2026-12-05", 12)).toEqual(new Date("2026-12-05T12:00:00.000Z"));
  });

  it("un día que no viene como AAAA-MM-DD o una hora fuera de 0 a 23 se rechazan", () => {
    expect(() => atHourIn("UTC", "2026-10-7", 9)).toThrow();
    expect(() => atHourIn("UTC", "2026-10-07", 24)).toThrow();
    expect(() => atHourIn("UTC", "2026-10-07", 9.5)).toThrow();
  });
});
