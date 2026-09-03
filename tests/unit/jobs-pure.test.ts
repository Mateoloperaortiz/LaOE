import { describe, expect, it } from "vitest";
import { BACKOFF_MS, backoffFor, isDeadAfter, MAX_ATTEMPTS } from "@/jobs/backoff";
import { chooseRoute } from "@/modules/comms/domain/pure";
import { buildPushPayload, PUSH_BODY_MAX, PUSH_TITLE_MAX } from "@/shared/adapters/pusher";
import { startOfTodayIn } from "@/shared/lib/dates";

describe("backoff del outbox", () => {
  it("sigue la escala 1 min, 5 min, 30 min, 2 h, 12 h y muere al quinto fallo", () => {
    expect(backoffFor(1)).toBe(60_000);
    expect(backoffFor(2)).toBe(5 * 60_000);
    expect(backoffFor(3)).toBe(30 * 60_000);
    expect(backoffFor(4)).toBe(2 * 60 * 60_000);
    expect(backoffFor(5)).toBe(12 * 60 * 60_000);
    expect(backoffFor(9)).toBe(BACKOFF_MS[4]);
    expect(MAX_ATTEMPTS).toBe(5);
    expect(isDeadAfter(4)).toBe(false);
    expect(isDeadAfter(5)).toBe(true);
  });
});

describe("enrutamiento del correo", () => {
  it("usa Resend hasta el límite diario y luego SES; sin SES, siempre Resend", () => {
    expect(chooseRoute(0, 95, true)).toBe("primary");
    expect(chooseRoute(94, 95, true)).toBe("primary");
    expect(chooseRoute(95, 95, true)).toBe("overflow");
    expect(chooseRoute(500, 95, false)).toBe("primary");
  });
});

describe("push", () => {
  it("recorta título a 40 y cuerpo a 120 caracteres", () => {
    const payload = buildPushPayload({ title: "a".repeat(60), body: "b".repeat(200), url: "/app" });
    expect(payload.title).toHaveLength(PUSH_TITLE_MAX);
    expect(payload.title.endsWith("…")).toBe(true);
    expect(payload.body).toHaveLength(PUSH_BODY_MAX);
    expect(buildPushPayload({ title: "Hoy", body: "Corto", url: "/app" })).toMatchObject({
      title: "Hoy",
      body: "Corto",
    });
  });
});

describe("startOfTodayIn", () => {
  it("devuelve la medianoche de Bogotá como instante UTC (05:00Z)", () => {
    const at = new Date("2026-09-03T06:41:00Z"); // 01:41 en Bogotá
    expect(startOfTodayIn("America/Bogota", at).toISOString()).toBe("2026-09-03T05:00:00.000Z");
    const late = new Date("2026-09-04T03:30:00Z"); // 22:30 del 3 en Bogotá
    expect(startOfTodayIn("America/Bogota", late).toISOString()).toBe("2026-09-03T05:00:00.000Z");
  });
});
