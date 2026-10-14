import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { retryOutboxAction } from "@/app/admin/sistema/jobs/actions";

const state = vi.hoisted(() => ({
  actor: vi.fn(),
  retry: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/modules/system", () => ({ retryDeadLetterAs: state.retry }));
// Se simula la sesión, no el guard: `requireAdminActor` corre de verdad, con su regla de licencia.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token-sintetico" }) }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("@/modules/identity/domain/session", () => ({
  resolveActor: state.actor,
  findSessionByToken: vi.fn().mockResolvedValue(null),
  touchSession: vi.fn(),
}));

const path = "/admin/sistema/jobs";
const eventId = "eventosintetico123";
const actor = {
  personId: "admin-sintetico",
  membershipStatus: "ACTIVE",
  isAdmin: true,
  permissions: [{ code: "ADMIN", committeeId: null }],
};
function retry(id: string | null) {
  const form = new FormData();
  if (id !== null) form.set("id", id);
  return retryOutboxAction(form);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.actor.mockResolvedValue(actor);
  state.retry.mockResolvedValue(true);
});

describe("reintento de un evento en dead letter desde la pantalla de jobs", () => {
  it("sin sesión manda a ingresar para volver a la pantalla de jobs, y no reintenta", async () => {
    state.actor.mockResolvedValue(null);
    await expect(retry(eventId)).rejects.toThrow(
      `redirect:/ingresar?next=${encodeURIComponent(path)}`,
    );
    expect(state.retry).not.toHaveBeenCalled();
  });

  it.each([
    { ...actor, isAdmin: false, permissions: [{ code: "BOARD", committeeId: null }] },
    { ...actor, membershipStatus: "ON_LEAVE" },
  ])("quien no es ADMIN en condición de operar sale a Mi OE sin reintentar: %j", async (session) => {
    state.actor.mockResolvedValue(session);
    await expect(retry(eventId)).rejects.toThrow("redirect:/app");
    expect(state.retry).not.toHaveBeenCalled();
    expect(state.revalidate).not.toHaveBeenCalled();
  });

  it.each(["", null])("un id vacío o ausente (%j) no llega al comando", async (id) => {
    await expect(retry(id)).rejects.toBeInstanceOf(ZodError);
    expect(state.retry).not.toHaveBeenCalled();
    expect(state.revalidate).not.toHaveBeenCalled();
  });

  it("reintenta el evento con quien ejecuta y su IP, y refresca la pantalla de jobs", async () => {
    await expect(retry(eventId)).resolves.toBeUndefined();
    // La action entrega al dominio quién ejecuta y desde dónde (ADR-082), no el actor de sesión.
    expect(state.retry).toHaveBeenCalledWith(
      { personId: actor.personId, ip: "203.0.113.7" },
      eventId,
    );
    expect(state.revalidate).toHaveBeenCalledWith(path);
  });
});
