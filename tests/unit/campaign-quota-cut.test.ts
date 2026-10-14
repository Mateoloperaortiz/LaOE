import { describe, expect, it } from "vitest";
import {
  latestQuotaCut,
  providerDayEnd,
  providerDayStart,
  quotaCutFor,
  quotaCutUntil,
  readQuotaCut,
} from "@/modules/comms/domain/pure";

// DT-117 (ADR-116 regla 19): cuánto dura el corte de las campañas según la causa del rechazo, y cómo
// se lee lo que quedó guardado en `campaigns.quotaExhaustedAt`.

const ZONE = "America/Bogota";
// Las 22:00 del 9 de marzo de 2031 en Colombia: en UTC ya es 10.
const NIGHT = new Date("2031-03-10T03:00:00.000Z");
// El día del proveedor va en UTC (ADR-121 regla 5): el que contiene a `NIGHT` empieza a las 19:00 del 9
// en Colombia y termina a las 19:00 del 10.
const PROVIDER_DAY = new Date("2031-03-10T00:00:00.000Z");
const NEXT_PROVIDER_DAY = new Date("2031-03-11T00:00:00.000Z");
const minutesAfter = (at: Date, minutes: number): Date => new Date(at.getTime() + minutes * 60_000);

describe("cuánto dura el corte por cuota", () => {
  it("una ráfaga sin la espera del proveedor corta quince minutos", () => {
    expect(quotaCutUntil("BURST", NIGHT, ZONE, null)).toEqual(minutesAfter(NIGHT, 15));
  });

  it.each([
    ["noventa segundos son dos minutos", 90_000, 2],
    ["un segundo es un minuto", 1_000, 1],
    ["cero es un minuto", 0, 1],
    ["una hora justa es una hora", 3_600_000, 60],
    ["tres horas se quedan en una", 3 * 3_600_000, 60],
    ["una espera sin fin se queda en una", Number.POSITIVE_INFINITY, 60],
  ])("una ráfaga dura lo que pidió el proveedor, en minutos enteros y entre uno y sesenta: %s", (_case, retryAfterMs, minutes) => {
    expect(quotaCutUntil("BURST", NIGHT, ZONE, retryAfterMs)).toEqual(minutesAfter(NIGHT, minutes));
  });

  it.each([
    ["no es un número", Number.NaN],
    ["no llegó", undefined],
    ["llegó como texto", "pronto"],
  ])("una ráfaga con una espera que no se entiende corta quince minutos, como si el proveedor no la hubiera dicho: %s", (_case, retryAfterMs) => {
    expect(quotaCutUntil("BURST", NIGHT, ZONE, retryAfterMs as never)).toEqual(
      minutesAfter(NIGHT, 15),
    );
  });

  it.each([
    ["a las 22:00 de Colombia", NIGHT],
    ["a la medianoche de Colombia, que no lo termina", new Date("2031-03-10T05:00:00.000Z")],
    ["un segundo antes de la medianoche UTC", new Date("2031-03-10T23:59:59.000Z")],
    ["a la medianoche UTC en punto con que empezó ese día", PROVIDER_DAY],
  ])("el cupo del día corta hasta la medianoche UTC siguiente, que es cuando el proveedor empieza su día: %s", (_case, at) => {
    expect(quotaCutUntil("DAILY", at, ZONE, null)).toEqual(NEXT_PROVIDER_DAY);
  });

  it("el cupo del día no mira la espera del proveedor", () => {
    expect(quotaCutUntil("DAILY", NIGHT, ZONE, 1_000)).toEqual(NEXT_PROVIDER_DAY);
  });

  it("el cupo del día no mira la zona de la app: el día es del proveedor", () => {
    expect(quotaCutUntil("DAILY", NIGHT, "Asia/Tokyo", null)).toEqual(NEXT_PROVIDER_DAY);
  });

  it.each([
    ["a mitad de mes", NIGHT, "2031-04-01T05:00:00.000Z"],
    // Las 23:30 del 31 de marzo en Colombia: para UTC ya es abril, para el corte todavía es marzo.
    ["la última noche del mes", new Date("2031-04-01T04:30:00.000Z"), "2031-04-01T05:00:00.000Z"],
    ["el primer minuto del mes", new Date("2031-04-01T05:00:00.000Z"), "2031-05-01T05:00:00.000Z"],
    ["en diciembre", new Date("2031-12-15T15:00:00.000Z"), "2032-01-01T05:00:00.000Z"],
  ])("el cupo del mes corta hasta el primer día del mes siguiente de Colombia: %s", (_case, at, until) => {
    expect(quotaCutUntil("MONTHLY", at, ZONE, null)).toEqual(new Date(until));
  });

  it("una causa que no se reconoce corta como el cupo del día, que era lo que hacía todo rechazo", () => {
    expect(quotaCutUntil("OTRA" as never, NIGHT, ZONE, null)).toEqual(NEXT_PROVIDER_DAY);
  });
});

describe("el día por el que el proveedor cuenta su cupo", () => {
  it.each([
    ["a las 19:00 de Colombia en punto, que es su medianoche", PROVIDER_DAY],
    ["a las 22:00 de Colombia", NIGHT],
    ["pasada la medianoche de Colombia", new Date("2031-03-10T05:05:00.000Z")],
    ["en su último milisegundo", new Date("2031-03-10T23:59:59.999Z")],
  ])("empieza y termina en la medianoche UTC: %s", (_case, at) => {
    expect(providerDayStart(at)).toEqual(PROVIDER_DAY);
    expect(providerDayEnd(at)).toEqual(NEXT_PROVIDER_DAY);
  });

  it("el milisegundo anterior a su medianoche es de su día anterior", () => {
    const before = new Date(PROVIDER_DAY.getTime() - 1);
    expect(providerDayStart(before)).toEqual(new Date("2031-03-09T00:00:00.000Z"));
    expect(providerDayEnd(before)).toEqual(PROVIDER_DAY);
  });
});

describe("el corte que deja un rechazo", () => {
  it("una causa que no se reconoce deja un corte por el cupo del día, hasta la medianoche UTC siguiente", () => {
    // Con la espera de una ráfaga, que tampoco se sigue: lo que queda es un corte que se puede guardar.
    expect(
      quotaCutFor(
        { provider: "resend", reason: "OTRA" as never, retryAfterMs: 90_000 },
        NIGHT,
        ZONE,
      ),
    ).toEqual({
      provider: "resend",
      reason: "DAILY",
      at: NIGHT,
      until: NEXT_PROVIDER_DAY,
    });
  });
});

describe("lo que quedó guardado del corte", () => {
  it("sin valor no hay corte", () => {
    expect(readQuotaCut(null, ZONE)).toBeNull();
  });

  it("el valor viejo, una fecha sola, se lee como un corte de Resend por el cupo del día", () => {
    expect(readQuotaCut(NIGHT.toISOString(), ZONE)).toEqual({
      provider: "resend",
      reason: "DAILY",
      at: NIGHT,
      until: NEXT_PROVIDER_DAY,
    });
  });

  it("el valor con causa se lee tal cual, con sus dos horas", () => {
    expect(
      readQuotaCut(
        {
          provider: "resend",
          reason: "MONTHLY",
          at: NIGHT.toISOString(),
          until: "2031-04-01T05:00:00.000Z",
        },
        ZONE,
      ),
    ).toEqual({
      provider: "resend",
      reason: "MONTHLY",
      at: NIGHT,
      until: new Date("2031-04-01T05:00:00.000Z"),
    });
  });
});

describe("el corte que rige entre la clave de hoy y la que escribían las versiones anteriores", () => {
  const cut = (at: Date, until: Date) => ({
    provider: "resend",
    reason: "DAILY" as const,
    at,
    until,
  });
  const hour = (n: number) => new Date(Date.UTC(2026, 9, 8, n));

  it("sin nada en la clave de hoy rige el de antes, y sin ninguno no hay corte", () => {
    const legacy = cut(hour(1), hour(5));
    expect(latestQuotaCut(null, legacy)).toBe(legacy);
    expect(latestQuotaCut(null, null)).toBeNull();
  });

  it("el de la clave de hoy rige sobre uno de antes de la misma hora o más viejo: así se levanta", () => {
    const legacy = cut(hour(1), hour(5));
    const lifted = cut(hour(1), hour(2));
    expect(latestQuotaCut(lifted, legacy)).toBe(lifted);
    expect(latestQuotaCut(cut(hour(3), hour(4)), legacy)).toMatchObject({ at: hour(3) });
  });

  it("el de antes rige si es más reciente: lo escribió una versión anterior después de volver a ella", () => {
    const stored = cut(hour(1), hour(2));
    const legacy = cut(hour(3), hour(5));
    expect(latestQuotaCut(stored, legacy)).toBe(legacy);
  });
});
