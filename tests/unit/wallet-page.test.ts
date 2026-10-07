import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CarnetPage from "@/app/app/carnet/page";
import type { CarnetMetadata } from "@/modules/identity";
import type { WalletPassRecord } from "@/modules/wallet";
import { t } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { copyPattern } from "../helpers/copy";

const state = vi.hoisted(() => ({
  actor: vi.fn(),
  credential: vi.fn(),
  issueApp: vi.fn(),
  membership: vi.fn(),
  person: vi.fn(),
  passes: vi.fn(),
  available: vi.fn(),
}));

vi.mock("@/modules/identity", () => ({
  requireActor: state.actor,
  getCarnetMetadata: state.credential,
  issueCarnet: state.issueApp,
}));
vi.mock("@/modules/people", async () => ({
  canParticipate: (await import("@/modules/people/domain/access-pure")).canParticipate,
  getMyMembership: state.membership,
  getPersonRecord: state.person,
}));
vi.mock("@/modules/wallet", async () => ({
  isStalePass: (await import("@/modules/wallet/domain/pass-pure")).isStalePass,
  listPassesFor: state.passes,
  walletAvailability: state.available,
}));
vi.mock("@/app/app/carnet/actions", () => ({ revokeCarnetAction: async () => {} }));
vi.mock("@/env", () => ({ getEnv: () => ({ APP_TIMEZONE: "America/Bogota" }) }));
// Se conserva el Cartel real; se evita cargar next/font desde el barrel de marca.
vi.mock("@/shared/brand", async () => ({
  Cartel: (await import("@/shared/brand/Cartel")).Cartel,
}));
vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ src, alt, width, height, className }: ComponentProps<"img">) =>
      createElement("img", { src, alt, width, height, className }),
  };
});

const issuedAt = new Date("2026-08-18T15:00:00.000Z");
const credential: CarnetMetadata = {
  personId: "miembro-sintetico",
  walletEpoch: 0,
  revision: 2,
  createdAt: issuedAt,
  lastUsedAt: null,
};

function pass(
  platform: WalletPassRecord["platform"],
  overrides: Partial<WalletPassRecord> = {},
): WalletPassRecord {
  return {
    id: `pase-sintetico-${platform}`,
    personId: credential.personId,
    platform,
    externalId: `emisor.sintetico.${credential.personId}`,
    walletEpoch: 0,
    tokenRevision: credential.revision,
    renderedTermId: "termino-sintetico",
    issuedAt,
    lastIssuedAt: issuedAt,
    lastRefreshedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

async function render(searchParams: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(
    await CarnetPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }),
  );
}

function walletLinks(html: string): string[] {
  return html.match(/<a\b[^>]*href="\/api\/wallet\/(?:apple|google)"[^>]*>[\s\S]*?<\/a>/g) ?? [];
}

function outputs(html: string): string[] {
  return [...html.matchAll(/<output\b[^>]*>([\s\S]*?)<\/output>/g)].map((match) => match[1] ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  state.actor.mockResolvedValue({
    personId: credential.personId,
    name: "Miembro Sintético",
    membershipStatus: "ACTIVE",
  });
  state.credential.mockResolvedValue(null);
  state.issueApp.mockResolvedValue({
    token: "oe1.carnet-sintetico-de-la-app",
    expiresAt: new Date("2026-09-07T15:00:00.000Z"),
  });
  state.membership.mockResolvedValue({
    term: { id: "termino-sintetico", code: "2026-2" },
    committees: [],
  });
  state.person.mockResolvedValue({ fullName: "Miembro Sintético" });
  state.passes.mockResolvedValue([]);
  state.available.mockReturnValue({ apple: false, google: false });
});

describe("HTML del carnet y sus billeteras", () => {
  it("al volver de un pase que pidió sesión avisa en las billeteras que hay que pedirlo otra vez, y solo con la marca", async () => {
    state.available.mockReturnValue({ apple: true, google: true });
    expect(outputs(await render({ descarga: "1" }))).toContain(t("T-3211"));
    for (const search of [{}, { descarga: "0" }, { descarga: "si" }]) {
      expect(outputs(await render(search))).not.toContain(t("T-3211"));
    }
  });

  it("la licencia muestra su aviso sin generar QR ni ofrecer emisión o rotación de billeteras", async () => {
    state.actor.mockResolvedValue({
      personId: credential.personId,
      name: "Miembro Sintético",
      membershipStatus: "ON_LEAVE",
    });
    state.available.mockReturnValue({ apple: true, google: true });
    state.credential.mockResolvedValue(credential);
    state.passes.mockResolvedValue([pass("APPLE"), pass("GOOGLE")]);
    const html = await render();
    expect(html).toContain(t("T-2042"));
    expect(html).not.toContain("data-token=");
    expect(html).not.toContain("oe1.");
    expect(walletLinks(html)).toEqual([]);
    expect(html).not.toContain("<form");
    expect(state.issueApp).not.toHaveBeenCalled();
    expect(state.credential).not.toHaveBeenCalled();
    expect(state.passes).not.toHaveBeenCalled();
  });

  it("oculta billeteras sin configuración ni historial y conserva el carnet de Mi OE", async () => {
    const html = await render();
    expect(html).toMatch(new RegExp(`<h1\\b[^>]*>${copyPattern("T-131").source}<\\/h1>`));
    expect(html).toMatch(/<h2\b[^>]*>Miembro Sintético<\/h2>/);
    expect(html).toContain('data-token="oe1.carnet-sintetico-de-la-app"');
    expect(html).not.toContain('id="billeteras"');
    expect(walletLinks(html)).toEqual([]);
  });

  it("mantiene confirmación y aviso Apple tras revocación ADMIN aunque ambos proveedores estén apagados", async () => {
    state.credential.mockResolvedValue(credential);
    state.passes.mockResolvedValue([pass("APPLE", { tokenRevision: 1 })]);
    // Una visita nueva, sin guardado en la URL, debe explicar la revisión pendiente.
    const html = await render();
    expect(html).toMatch(/<section\b[^>]*aria-labelledby="billeteras-titulo"/);
    expect(walletLinks(html)).toEqual([]);
    expect(html).toMatch(
      new RegExp(`<summary\\b[^>]*>${copyPattern("T-1193").source}<\\/summary>`),
    );
    expect(html).toMatch(/<input\b[^>]*name="confirm"[^>]*value="1"/);
    expect(html).toMatch(
      new RegExp(`<button\\b[^>]*type="submit"[^>]*>${copyPattern("T-1193").source}<\\/button>`),
    );
    expect(html).toContain(t("T-1194"));
    expect(outputs(html)).toContain(t("T-1196", { fecha: formatDateTime(issuedAt) }));
    expect(outputs(html)).not.toContain(t("T-1195"));
  });

  it("conserva la explicación del pase anterior aunque ya no exista su credencial", async () => {
    state.passes.mockResolvedValue([pass("APPLE")]);
    const html = await render();
    expect(html).toContain('id="billeteras"');
    expect(walletLinks(html)).toEqual([]);
    expect(outputs(html)).toContain(t("T-1196", { fecha: formatDateTime(issuedAt) }));
  });

  it.each([
    { apple: true, google: false },
    { apple: false, google: true },
    { apple: true, google: true },
  ])("ofrece enlaces y avisos de privacidad para los proveedores configurados: %j", async (available) => {
    state.available.mockReturnValue(available);
    const html = await render();
    const links = walletLinks(html);
    expect(links).toHaveLength(Number(available.apple) + Number(available.google));
    for (const [platform, enabled, alt, privacy] of [
      ["apple", available.apple, t("T-1191"), t("T-1215")],
      ["google", available.google, t("T-1192"), t("T-1214")],
    ] as const) {
      const link = links.find((entry) => entry.includes(`/api/wallet/${platform}`));
      if (enabled) {
        expect(link).toContain(`alt="${alt}"`);
        expect(link).toContain(`src="/wallet/${platform}-wallet-badge.svg"`);
        expect(html).toContain(privacy);
        if (platform === "apple") {
          expect(link).toContain('target="_blank"');
          expect(link).toContain('rel="noopener"');
        }
      } else {
        expect(link).toBeUndefined();
        expect(html).not.toContain(privacy);
      }
    }
    expect(outputs(html)).toEqual([]);
  });

  it.each([
    { issuedAt: null, lastIssuedAt: null },
    { tokenRevision: 1 },
    { renderedTermId: "termino-anterior" },
  ])("explica la espera de Google para una reserva o versión pendiente: %j", async (pending) => {
    state.available.mockReturnValue({ apple: false, google: true });
    state.credential.mockResolvedValue(credential);
    state.passes.mockResolvedValue([pass("GOOGLE", pending)]);
    const html = await render();
    expect(outputs(html)).toEqual([t("T-1218")]);
    expect(outputs(html).join(" ")).not.toMatch(/instalad[oa]|ya se guardó|guardado en tu cuenta/i);
  });

  it("retira los avisos al reemitir Apple y completar la actualización Google", async () => {
    state.available.mockReturnValue({ apple: true, google: true });
    state.credential.mockResolvedValue(credential);
    state.passes.mockResolvedValue([pass("APPLE"), pass("GOOGLE")]);
    expect(outputs(await render())).toEqual([]);
  });

  it("no promete una actualización pendiente para un objeto Google revocado", async () => {
    state.credential.mockResolvedValue(credential);
    state.passes.mockResolvedValue([pass("GOOGLE", { tokenRevision: 1, revokedAt: issuedAt })]);
    expect(outputs(await render())).toEqual([]);
  });

  it.each([
    { error: "apple", message: t("T-1216") },
    { error: "google", message: t("T-1208") },
  ])("identifica el proveedor que falló mediante una alerta: $error", async ({
    error,
    message,
  }) => {
    state.available.mockReturnValue({ apple: true, google: true });
    const html = await render({ error });
    expect(html).toContain(`role="alert"`);
    expect(html).toContain(message);
    expect(outputs(html)).toEqual([]);
  });
});
