import { beforeEach, describe, expect, it, vi } from "vitest";
import { savePrivacyPolicyVersionAction } from "@/app/admin/sistema/politica/actions";
import type { Actor } from "@/modules/identity";
import type { FormState } from "@/shared/admin-kit";
import { t } from "@/shared/copy";

const state = vi.hoisted(() => ({
  actor: vi.fn(),
  page: vi.fn(),
  save: vi.fn(),
  ip: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/modules/content", () => ({ findPublicPage: state.page }));
vi.mock("@/modules/identity", async () => ({
  ...(await import("@/modules/identity/domain/guards")),
  ...(await import("@/modules/identity/domain/errors")),
  getActor: state.actor,
}));
vi.mock("@/modules/system", async () => ({
  ...(await import("@/modules/system/domain/privacy-pure")),
  setPrivacyPolicyVersionAs: state.save,
}));
vi.mock("@/shared/lib/request", () => ({ clientIp: state.ip }));

const path = "/admin/sistema/politica";
const initial: FormState = { ok: false, message: null, errors: {}, values: {} };
function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    personId: "admin-sintetico",
    sessionId: "sesion-sintetica",
    email: "politica.admin@eafit.edu.co",
    name: "Admin Sintético",
    firstName: "Admin",
    membershipStatus: "ACTIVE",
    permissions: [{ code: "ADMIN", committeeId: null }],
    otpVerifiedAt: new Date(),
    sessionLastSeenAt: new Date(),
    sessionRemembered: false,
    isAdmin: true,
    ...overrides,
  };
}
function save(version: string) {
  const form = new FormData();
  form.set("version", version);
  return savePrivacyPolicyVersionAction(initial, form);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.actor.mockResolvedValue(actor());
  state.page.mockResolvedValue({ status: "PUBLISHED", body: "Texto sintético de prueba" });
  state.save.mockResolvedValue(undefined);
  state.ip.mockResolvedValue("127.0.0.1");
});

describe("control administrativo de la versión de política", () => {
  it("exige sesión antes de leer la publicación o guardar", async () => {
    state.actor.mockResolvedValue(null);
    await expect(save("prueba-v2")).rejects.toThrow(
      `redirect:/ingresar?next=${encodeURIComponent(path)}`,
    );
    expect(state.page).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it.each<{ permissions: Actor["permissions"] }>([
    { permissions: [] },
    { permissions: [{ code: "BOARD", committeeId: null }] },
  ])("rechaza a quien no es ADMIN, aunque tenga otros permisos: %j", async ({ permissions }) => {
    state.actor.mockResolvedValue(actor({ isAdmin: false, permissions }));
    await expect(save("pendiente")).rejects.toThrow("redirect:/app");
    expect(state.page).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it.each(["prueba-v2", "pendiente"])("exige step-up también al guardar %s", async (version) => {
    state.actor.mockResolvedValue(actor({ otpVerifiedAt: new Date(Date.now() - 16 * 60_000) }));
    await expect(save(version)).rejects.toThrow(
      `redirect:/ingresar/paso?next=${encodeURIComponent(path)}`,
    );
    expect(state.page).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it.each(["", "  ", "a".repeat(121)])("rechaza un identificador inválido", async (version) => {
    expect(await save(version)).toMatchObject({ ok: false, errors: { version: t("T-1188") } });
    expect(state.page).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });

  it.each([
    null, // findPublicPage devuelve null si no existe o su audiencia es MEMBERS.
    { status: "DRAFT", body: "Texto de prueba" },
    { status: "PUBLISHED", body: " \n " },
  ])("no habilita sin una página pública publicada con cuerpo: %j", async (page) => {
    state.page.mockResolvedValue(page);
    expect(await save("prueba-v2")).toMatchObject({ ok: false, message: t("T-1187") });
    expect(state.page).toHaveBeenCalledWith("privacidad");
    expect(state.save).not.toHaveBeenCalled();
  });

  it("comprueba la publicación antes de guardar la versión con actor e IP del servidor", async () => {
    await expect(save("  prueba-v2  ")).rejects.toThrow(`redirect:${path}?guardado=1`);
    expect(state.save).toHaveBeenCalledWith(
      { personId: "admin-sintetico", ip: "127.0.0.1" },
      "prueba-v2",
    );
    expect(state.page.mock.invocationCallOrder[0]).toBeLessThan(
      state.save.mock.invocationCallOrder[0] ?? 0,
    );
    expect(state.revalidate).toHaveBeenCalledWith(path);
  });

  it("permite bloquear de nuevo sin exigir que la publicación siga disponible", async () => {
    state.page.mockResolvedValue(null);
    await expect(save(" Pendiente ")).rejects.toThrow(`redirect:${path}?guardado=1`);
    expect(state.page).not.toHaveBeenCalled();
    expect(state.save).toHaveBeenCalledWith(expect.anything(), "pendiente");
  });
});
