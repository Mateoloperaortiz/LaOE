import { beforeEach, describe, expect, it, vi } from "vitest";
import { activateAction } from "@/app/activar/[token]/actions";
import {
  codeLoginAction,
  initialCodeLoginState,
  initialLoginState,
  loginAction,
  signOutAction,
} from "@/modules/identity/actions";
import { t } from "@/shared/copy";

// La cookie de sesión (DT-034). Se reemplaza la tienda de cookies de Next y el comando del dominio
// de cada camino; lo que se afirma es lo que la casa le manda a escribir al navegador. El nombre va
// literal: es lo que tienen guardado los navegadores con sesión abierta, y cambiarlo las cierra.

const state = vi.hoisted(() => ({
  appUrl: "",
  set: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  signIn: vi.fn(),
  verifyOtp: vi.fn(),
  consume: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: state.set, get: state.get, delete: state.remove }),
  headers: async () =>
    new Headers({ "x-forwarded-for": "203.0.113.7", "user-agent": "navegador-sintetico" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/env", () => ({ getEnv: () => ({ APP_URL: state.appUrl }) }));
vi.mock("@/modules/identity/domain/password", async (original) => ({
  ...(await original<typeof import("@/modules/identity/domain/password")>()),
  signInWithPassword: state.signIn,
}));
vi.mock("@/modules/identity/domain/otp", async (original) => ({
  ...(await original<typeof import("@/modules/identity/domain/otp")>()),
  verifyOtp: state.verifyOtp,
}));
vi.mock("@/modules/identity/domain/access-grant", async (original) => ({
  ...(await original<typeof import("@/modules/identity/domain/access-grant")>()),
  consumeAccessGrant: state.consume,
}));
vi.mock("@/modules/identity/domain/session", async (original) => ({
  ...(await original<typeof import("@/modules/identity/domain/session")>()),
  signOut: state.signOut,
}));

const SESSION_NAME = "oe_sesion";
const token = "token-de-sesion-sintetico";
const expiresAt = new Date("2027-01-10T15:00:00.000Z");
const opened = { ok: true, token, sessionId: "sesion-sintetica", expiresAt, personId: "persona" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

async function enterWithPassword(remember: boolean): Promise<unknown> {
  return loginAction(
    await initialLoginState("/app/ajustes"),
    form({
      email: "persona@eafit.edu.co",
      password: "contraseña-sintetica",
      ...(remember ? { remember: "on" } : {}),
    }),
  );
}

async function enterWithCode(remember: boolean): Promise<unknown> {
  return codeLoginAction(
    await initialCodeLoginState("/app/ajustes"),
    form({
      intent: "verify",
      email: "persona@eafit.edu.co",
      code: "123456",
      ...(remember ? { remember: "on" } : {}),
    }),
  );
}

function activate(): Promise<unknown> {
  return activateAction(
    { error: null },
    form({
      token: "enlace-sintetico",
      password: "contraseña-sintetica",
      confirmation: "contraseña-sintetica",
    }),
  );
}

/** Lo único que la casa le mandó a escribir al navegador en la solicitud. */
function written(): unknown {
  expect(state.set).toHaveBeenCalledTimes(1);
  return state.set.mock.calls[0];
}

// Sin `expires` ni `maxAge` la cookie dura lo que el navegador abierto; sin `domain` es solo del
// host que la escribe (ADR-085 regla 6). `toStrictEqual` falla también si aparece una clave de más.
const browserSession = {
  name: SESSION_NAME,
  value: token,
  httpOnly: true,
  sameSite: "lax",
  secure: true,
  path: "/",
};
const remembered = { ...browserSession, expires: expiresAt };

beforeEach(() => {
  vi.clearAllMocks();
  state.appUrl = "https://oe-sintetica.example";
  state.signIn.mockResolvedValue(opened);
  state.verifyOtp.mockResolvedValue(opened);
  state.consume.mockResolvedValue(opened);
  state.get.mockReturnValue(undefined);
});

describe("la cookie de sesión que escribe cada camino de entrada", () => {
  it("entrar con contraseña sin «recordar» la deja sin vencimiento: dura lo que el navegador abierto", async () => {
    await expect(enterWithPassword(false)).rejects.toThrow("redirect:/app/ajustes");
    expect(written()).toStrictEqual([browserSession]);
    expect(state.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ remember: false, ip: "203.0.113.7" }),
    );
  });

  it("entrar con contraseña y «recordar» la deja hasta el vencimiento de la sesión", async () => {
    await expect(enterWithPassword(true)).rejects.toThrow("redirect:/app/ajustes");
    expect(written()).toStrictEqual([remembered]);
    expect(state.signIn).toHaveBeenCalledWith(expect.objectContaining({ remember: true }));
  });

  it("entrar con código sin «recordar» la deja sin vencimiento", async () => {
    await expect(enterWithCode(false)).rejects.toThrow("redirect:/app/ajustes");
    expect(written()).toStrictEqual([browserSession]);
    expect(state.verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ remember: false }));
  });

  it("entrar con código y «recordar» la deja hasta el vencimiento de la sesión", async () => {
    await expect(enterWithCode(true)).rejects.toThrow("redirect:/app/ajustes");
    expect(written()).toStrictEqual([remembered]);
    expect(state.verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ remember: true }));
  });

  it("activar por enlace la deja siempre hasta el vencimiento de la sesión: el formulario no pregunta si recordar", async () => {
    await expect(activate()).rejects.toThrow("redirect:/app");
    expect(written()).toStrictEqual([remembered]);
  });

  it.each([
    ["contraseña", () => enterWithPassword(true)],
    ["código", () => enterWithCode(true)],
    ["enlace", activate],
  ])("por %s va sin `secure` cuando la casa se sirve por http, que es el caso local", async (_path, enter) => {
    state.appUrl = "http://localhost:3000";
    await expect(enter()).rejects.toThrow("redirect:");
    expect(written()).toStrictEqual([{ ...remembered, secure: false }]);
  });
});

describe("la entrada que no procede no escribe la cookie", () => {
  it("una contraseña equivocada devuelve el error del formulario", async () => {
    state.signIn.mockResolvedValue({ ok: false, reason: "INVALID" });
    await expect(enterWithPassword(true)).resolves.toMatchObject({ error: t("T-2096") });
    expect(state.set).not.toHaveBeenCalled();
  });

  it("un código vencido devuelve el error del formulario", async () => {
    state.verifyOtp.mockResolvedValue({ ok: false, reason: "EXPIRED", attemptsLeft: 0 });
    await expect(enterWithCode(true)).resolves.toMatchObject({ error: t("T-048") });
    expect(state.set).not.toHaveBeenCalled();
  });

  it("un enlace que ya no sirve devuelve el error del formulario", async () => {
    state.consume.mockResolvedValue({ ok: false, reason: "INVALID" });
    await expect(activate()).resolves.toEqual({ error: t("T-2107") });
    expect(state.set).not.toHaveBeenCalled();
  });
});

describe("cerrar sesión", () => {
  it("cierra en la casa la sesión que trae la cookie, la borra por su nombre y manda al inicio", async () => {
    state.get.mockReturnValue({ name: SESSION_NAME, value: token });
    await expect(signOutAction(null)).rejects.toThrow("redirect:/");
    expect(state.get.mock.calls).toEqual([[SESSION_NAME]]);
    expect(state.signOut.mock.calls).toEqual([[token, { pushEndpoint: null, ip: "203.0.113.7" }]]);
    expect(state.remove.mock.calls).toEqual([[SESSION_NAME]]);
    expect(state.set).not.toHaveBeenCalled();
  });

  it("sin cookie no hay sesión que cerrar, y la borra igual", async () => {
    await expect(signOutAction(null)).rejects.toThrow("redirect:/");
    expect(state.signOut).not.toHaveBeenCalled();
    expect(state.remove.mock.calls).toEqual([[SESSION_NAME]]);
  });
});
