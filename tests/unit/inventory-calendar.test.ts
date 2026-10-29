import { describe, expect, it } from "vitest";
import { reservationOnCalendarDay } from "@/modules/inventory/components/calendar-pure";

describe("los días ocupados del calendario del inventario", () => {
  const overnight = {
    startsAt: new Date("2027-03-03T19:00:00-05:00"),
    endsAt: new Date("2027-03-04T00:00:00-05:00"),
  };
  it("una devolución a medianoche deja libre el día que comienza", () => {
    expect(reservationOnCalendarDay(overnight, "2027-03-03")).toBe(true);
    expect(reservationOnCalendarDay(overnight, "2027-03-04")).toBe(false);
  });
  it("un préstamo que empieza a medianoche ocupa ese día y no el anterior", () => {
    const reservation = {
      startsAt: new Date("2027-03-04T00:00:00-05:00"),
      endsAt: new Date("2027-03-04T07:00:00-05:00"),
    };
    expect(reservationOnCalendarDay(reservation, "2027-03-03")).toBe(false);
    expect(reservationOnCalendarDay(reservation, "2027-03-04")).toBe(true);
  });
  it("un préstamo que atraviesa la medianoche ocupa ambos días civiles de Colombia", () => {
    const reservation = { ...overnight, endsAt: new Date("2027-03-04T00:01:00-05:00") };
    expect(reservationOnCalendarDay(reservation, "2027-03-03")).toBe(true);
    expect(reservationOnCalendarDay(reservation, "2027-03-04")).toBe(true);
    expect(reservationOnCalendarDay(reservation, "2027-03-05")).toBe(false);
  });
});
