import { beforeEach, describe, expect, it, vi } from "vitest";
import { remapAction } from "@/app/admin/personas/importar/actions";
import { t } from "@/shared/copy";

const state = vi.hoisted(() => ({ remap: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/modules/identity", () => ({
  requireAdminActor: async () => ({ personId: "admin-sintetico" }),
  grantPermissionAs: vi.fn(),
  hasRecentStepUp: vi.fn(),
}));
vi.mock("@/modules/people", async () => {
  const { ROSTER_COLUMNS } = await import("@/modules/people/domain/roster-pure");
  const { rosterColumnCountSchema } = await import("@/modules/people/domain/roster");
  return {
    ROSTER_COLUMNS,
    rosterColumnCountSchema,
    applyRosterImportAs: vi.fn(),
    discardRosterImportAs: vi.fn(),
    getRosterPreview: vi.fn(),
    recordLeaderGrantsAs: vi.fn(),
    remapRosterPreviewAs: state.remap,
  };
});

beforeEach(() => vi.clearAllMocks());

describe("cantidad de columnas del remapeo del roster", () => {
  it.each([
    "1001",
    "1.5",
    "-1",
    "Infinity",
    "2columnas",
  ])("rechaza %s antes de construir o enviar el mapeo", async (columns) => {
    const form = new FormData();
    form.set("jobId", "job-sintetico");
    form.set("columns", columns);
    const get = form.get.bind(form);
    vi.spyOn(form, "get").mockImplementation((name) => {
      if (name.startsWith("col_")) throw new Error("Se empezó a construir el mapeo");
      return get(name);
    });
    const expected = new URLSearchParams({
      job: "job-sintetico",
      paso: "columnas",
      error: t("T-260"),
    });
    await expect(remapAction(form)).rejects.toThrow(
      `redirect:/admin/personas/importar?${expected}`,
    );
    expect(state.remap).not.toHaveBeenCalled();
    expect(state.revalidate).not.toHaveBeenCalled();
  });

  it("conserva columnas reconocidas e ignoradas en el mapeo normal", async () => {
    const form = new FormData();
    form.set("jobId", "job-sintetico");
    form.set("columns", "3");
    form.set("col_0", "email");
    form.set("col_1", "ignorada");
    form.set("col_2", "firstName");
    await expect(remapAction(form)).rejects.toThrow(
      "redirect:/admin/personas/importar?job=job-sintetico&paso=revision",
    );
    expect(state.remap).toHaveBeenCalledWith(
      { personId: "admin-sintetico", ip: null },
      "job-sintetico",
      ["email", null, "firstName"],
    );
  });
});
