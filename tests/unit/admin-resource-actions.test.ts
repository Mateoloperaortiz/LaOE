import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { saveResourceAction } from "@/app/admin/_kit/actions";
import type { FormState } from "@/shared/admin-kit/types";
import { t } from "@/shared/copy";

const state = vi.hoisted(() => ({
  actor: vi.fn(),
  resource: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/modules/identity", async () => ({
  ...(await import("@/modules/identity/domain/guards")),
  ...(await import("@/modules/identity/domain/errors")),
  ...(await import("@/modules/identity/domain/pure")),
  getActor: state.actor,
}));
vi.mock("@/shared/admin-kit", async () => ({
  ...(await import("@/shared/admin-kit/types")),
  ...(await import("@/shared/admin-kit/DomainError")),
}));
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
  });
});

describe("edición de recursos y valores inmutables", () => {
  it.each([
    undefined,
    "CAMBIADO",
  ])("guarda con el valor inmutable del servidor aunque el cliente envíe %s", async (kind) => {
    const data = form();
    if (kind) data.set("kind", kind);
    await expect(saveResourceAction(initial, data)).rejects.toThrow(
      "redirect:/admin/ejemplo?status=ACTIVE&guardado=1",
    );
    expect(state.update).toHaveBeenCalledWith(
      { personId: "admin-sintetico", isAdmin: true },
      "registro-sintetico",
      { name: "Nombre editado", kind: "ORIGINAL" },
    );
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
