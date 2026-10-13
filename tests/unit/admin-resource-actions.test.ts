import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { rowActionAction, saveResourceAction } from "@/app/admin/_kit/actions";
import type { FormState } from "@/shared/admin-kit/types";
import { t } from "@/shared/copy";

const state = vi.hoisted(() => ({
  actor: vi.fn(),
  resource: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  rowAction: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
// Lo que la action toma de `identity` va nombrado, con el código de verdad: un archivo esparcido
// entero le tapaba a knip los exports sin uso de `guards.ts`, `errors.ts` y `pure.ts` (DT-356).
vi.mock("@/modules/identity", async () => {
  const { assertAdmin, hasRecentStepUp } = await import("@/modules/identity/domain/guards");
  const { ForbiddenError } = await import("@/modules/identity/domain/errors");
  const { safeNextPath } = await import("@/modules/identity/domain/pure");
  return { assertAdmin, ForbiddenError, getActor: state.actor, hasRecentStepUp, safeNextPath };
});
vi.mock("@/shared/admin-kit", async () => await import("@/shared/admin-kit/types"));
vi.mock("@/app/admin/_kit/registry", () => ({ getResource: state.resource }));
const initial: FormState = { ok: false, message: null, errors: {}, values: {} };
function form() {
  const data = new FormData();
  data.set("__resource", "ejemplo");
  data.set("__id", "registro-sintetico");
  data.set("__returnTo", "/admin/ejemplo?status=ACTIVE");
  data.set("name", "Nombre editado");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.actor.mockResolvedValue({
    personId: "admin-sintetico",
    membershipStatus: "ACTIVE",
    isAdmin: true,
    permissions: [{ code: "ADMIN", committeeId: null }],
  });
  state.get.mockResolvedValue({ id: "registro-sintetico", kind: "ORIGINAL" });
  state.resource.mockReturnValue({
    fields: [
      { name: "name", label: "Nombre", type: "text" },
      { name: "kind", label: "Tipo", type: "select", lockedOnEdit: true },
    ],
    schema: z.object({ name: z.string().min(2), kind: z.literal("ORIGINAL") }),
    get: state.get,
    toFormValues: (row: { kind: string }) => ({ kind: row.kind }),
    update: state.update,
    create: state.create,
    runRowAction: state.rowAction,
  });
});

// El actor que el kit le entrega a un recurso: quién y desde dónde, armado con `actorContext`, y nada
// más de la sesión (ADR-082 regla 2; ADR-116 regla 10).
const kitActor = { personId: "admin-sintetico", ip: "203.0.113.7" };

describe("edición de recursos y valores inmutables", () => {
  it("rechaza la escritura de un ADMIN en licencia antes de consultar sus datos", async () => {
    state.actor.mockResolvedValue({
      personId: "admin-sintetico",
      membershipStatus: "ON_LEAVE",
      isAdmin: true,
      permissions: [{ code: "ADMIN", committeeId: null }],
    });
    await expect(saveResourceAction(initial, form())).rejects.toThrow("redirect:/app");
    expect(state.get).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "CAMBIADO",
  ])("guarda con el valor inmutable del servidor aunque el cliente envíe %s", async (kind) => {
    const data = form();
    if (kind) data.set("kind", kind);
    await expect(saveResourceAction(initial, data)).rejects.toThrow(
      "redirect:/admin/ejemplo?status=ACTIVE&guardado=1",
    );
    expect(state.update).toHaveBeenCalledWith(kitActor, "registro-sintetico", {
      name: "Nombre editado",
      kind: "ORIGINAL",
    });
    expect(state.create).not.toHaveBeenCalled();
  });

  it("si el registro desapareció conserva el formulario y no crea otro", async () => {
    state.get.mockResolvedValue(null);
    expect(await saveResourceAction(initial, form())).toMatchObject({
      ok: false,
      message: t("T-032"),
      values: { name: "Nombre editado" },
    });
    expect(state.update).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });
});

describe("el actor que el kit le entrega a un recurso", () => {
  it("al crear, el recurso recibe quién escribe y desde qué IP", async () => {
    const data = form();
    data.delete("__id");
    data.set("kind", "ORIGINAL");
    await expect(saveResourceAction(initial, data)).rejects.toThrow(
      "redirect:/admin/ejemplo?status=ACTIVE&guardado=1",
    );
    expect(state.create).toHaveBeenCalledWith(kitActor, {
      name: "Nombre editado",
      kind: "ORIGINAL",
    });
  });

  it("en una acción por fila, el recurso recibe quién la ejecuta y desde qué IP", async () => {
    const data = form();
    data.set("__action", "archivar");
    await expect(rowActionAction(data)).rejects.toThrow("redirect:/admin/ejemplo?status=ACTIVE");
    expect(state.rowAction).toHaveBeenCalledWith(kitActor, "archivar", "registro-sintetico");
  });
});
