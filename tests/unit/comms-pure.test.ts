import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  NOTIFICATION_MAX_RECIPIENTS,
  notificationRequestedSchema,
  shouldDeliver,
  splitPush,
} from "@/modules/comms/domain/pure";

describe("shouldDeliver (ADR-038 regla 2)", () => {
  it("cada tipo de push obedece a su preferencia y lo transaccional llega siempre", () => {
    const off = {
      emailCampaigns: false,
      pushAnnouncements: false,
      pushPoints: false,
      pushReminders: false,
    };
    expect(shouldDeliver("ANNOUNCEMENT", DEFAULT_PREFERENCES)).toBe(true);
    expect(shouldDeliver("ANNOUNCEMENT", off)).toBe(false);
    expect(shouldDeliver("POINTS", { ...off, pushPoints: true })).toBe(true);
    expect(shouldDeliver("POINTS", off)).toBe(false);
    expect(shouldDeliver("REMINDER", { ...off, pushReminders: true })).toBe(true);
    expect(shouldDeliver("SURVEY", off)).toBe(false);
    expect(shouldDeliver("SURVEY", { ...off, pushReminders: true })).toBe(true);
    expect(shouldDeliver("TRANSACTIONAL", off)).toBe(true);
  });
  it("la preferencia de campañas por correo no gobierna ningún push", () => {
    const onlyMail = { ...DEFAULT_PREFERENCES, emailCampaigns: false };
    expect(shouldDeliver("ANNOUNCEMENT", onlyMail)).toBe(true);
    expect(shouldDeliver("REMINDER", onlyMail)).toBe(true);
  });
});

describe("notificationRequestedSchema", () => {
  it("acepta destinatarios con URL propia y rechaza listas vacías o demasiado largas", () => {
    const ok = notificationRequestedSchema.parse({
      kind: "SURVEY",
      recipients: [{ personId: "a" }, { personId: "b", url: "/app/encuesta/x" }],
      title: "¿Cómo estuvo?",
      url: "/app",
      dedupeKey: "survey:1",
    });
    expect(ok.body).toBe("");
    expect(ok.recipients[1]?.url).toBe("/app/encuesta/x");
    expect(() =>
      notificationRequestedSchema.parse({
        kind: "SURVEY",
        recipients: [],
        title: "x",
        url: "/app",
        dedupeKey: "k",
      }),
    ).toThrow();
    const many = Array.from({ length: NOTIFICATION_MAX_RECIPIENTS + 1 }, (_, i) => ({
      personId: `p${i}`,
    }));
    expect(() =>
      notificationRequestedSchema.parse({
        kind: "REMINDER",
        recipients: many,
        title: "x",
        url: "/app",
        dedupeKey: "k",
      }),
    ).toThrow();
    expect(() =>
      notificationRequestedSchema.parse({
        kind: "OTRO",
        recipients: [{ personId: "a" }],
        title: "x",
        url: "/app",
        dedupeKey: "k",
      }),
    ).toThrow();
  });
});

describe("splitPush", () => {
  it("separa título y cuerpo por el primer ' · ' y conserva los demás", () => {
    expect(splitPush("Hoy: Integración · 18:00 en el Bloque 29 · abre a las 17:30")).toEqual({
      title: "Hoy: Integración",
      body: "18:00 en el Bloque 29 · abre a las 17:30",
    });
    expect(splitPush("Solo título")).toEqual({ title: "Solo título", body: "" });
  });
});
