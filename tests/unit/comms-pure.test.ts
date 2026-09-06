import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  NOTIFICATION_MAX_RECIPIENTS,
  notificationRequestedSchema,
  shouldDeliver,
  splitPush,
} from "@/modules/comms/domain/pure";
import {
  campaignEligibility,
  markdownToMailHtml,
  markdownToPlain,
  renderTemplate,
} from "@/modules/comms/domain/templates-pure";

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

describe("plantillas de correo (ADR-038 regla 8)", () => {
  const values = {
    nombre: "Ana",
    apellido: "Pérez",
    correo: "ana@eafit.edu.co",
    comités: "Pixel, A3",
    semestre: "2026-2",
    url: "https://oeeafit.com",
  };

  it("sustituye las variables conocidas y deja las demás tal cual", () => {
    expect(renderTemplate("Hola {nombre} {apellido}, sos de {comités} en {semestre}", values)).toBe(
      "Hola Ana Pérez, sos de Pixel, A3 en 2026-2",
    );
    expect(renderTemplate("{desconocida} y {url}", values)).toBe(
      "{desconocida} y https://oeeafit.com",
    );
  });

  it("convierte el subconjunto Markdown a HTML con estilos y escapa el HTML crudo", () => {
    const html = markdownToMailHtml(
      "# Título\n\nHola **vos** con *énfasis* y [Mi OE](https://oeeafit.com/app).\n\n- uno\n- dos\n\n1. primero\n2. segundo\n\n<script>alert(1)</script>",
    );
    expect(html).toContain("<h1");
    expect(html).toContain("Título</h1>");
    expect(html).toContain("<strong>vos</strong>");
    expect(html).toContain("<em>énfasis</em>");
    expect(html).toContain(
      '<a href="https://oeeafit.com/app" style="color:#001f3e;text-decoration:underline">Mi OE</a>',
    );
    expect(html).toContain("<ul");
    expect(html).toContain('<li style="margin:4px 0">dos</li>');
    expect(html).toContain("<ol");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(markdownToMailHtml("[x](javascript:alert(1))")).not.toContain("<a ");
  });

  it("el texto plano quita las marcas y deja los enlaces como texto (url)", () => {
    expect(markdownToPlain("## Hola\n\nMirá **esto** y [acá](https://x.co).\n\n- a\n- b")).toBe(
      "HOLA\n\nMirá esto y acá (https://x.co).\n\n- a\n- b",
    );
  });

  it("la elegibilidad sigue la decisión 2: roster por defecto, resto con consentimiento", () => {
    const base = {
      email: "a@eafit.edu.co",
      personalEmail: null,
      membershipStatus: "ACTIVE",
      emailCampaigns: true,
      hasCommunicationsConsent: false,
    };
    expect(campaignEligibility(base)).toEqual({ ok: true, address: "a@eafit.edu.co" });
    expect(campaignEligibility({ ...base, membershipStatus: "ON_LEAVE" }).ok).toBe(true);
    expect(campaignEligibility({ ...base, emailCampaigns: false })).toEqual({
      ok: false,
      reason: "OPTED_OUT",
    });
    expect(campaignEligibility({ ...base, membershipStatus: "INACTIVE" })).toEqual({
      ok: false,
      reason: "NO_CONSENT",
    });
    expect(
      campaignEligibility({
        ...base,
        membershipStatus: "INACTIVE",
        hasCommunicationsConsent: true,
        personalEmail: "ana@gmail.com",
      }),
    ).toEqual({ ok: true, address: "ana@gmail.com" });
    expect(campaignEligibility({ ...base, membershipStatus: null, email: "" })).toEqual({
      ok: false,
      reason: "NO_EMAIL",
    });
  });
});
