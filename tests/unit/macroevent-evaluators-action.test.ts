import { beforeEach, describe, expect, it, vi } from "vitest";
import { macroeventAction } from "@/app/admin/macroeventos/[slug]/actions";
import { t } from "@/shared/copy";

const state = vi.hoisted(() => ({ configure: vi.fn(), members: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/modules/identity", () => ({
  requireAdminActor: async () => ({ personId: "admin-sintetico", isAdmin: true }),
  assertAdmin: vi.fn(),
}));
vi.mock("@/modules/events", () => ({
  listMacroevents: async () => [{ id: "event-sintetico", slug: "inventiva" }],
  getMacroeventEdition: vi.fn(),
}));
vi.mock("@/modules/terms", () => ({
  getTerm: async () => ({ id: "term-sintetico", permanenceClosedAt: null }),
}));
vi.mock("@/modules/people", () => ({
  listActiveMemberRefs: state.members,
  addMacroeventDirectorAs: vi.fn(),
  listMacroeventBoard: vi.fn(),
  MACROEVENT_ROLE_CODES: ["GENERAL"],
  removeAppointmentAs: vi.fn(),
  requireEditionTerm: vi.fn(),
}));
vi.mock("@/modules/permanence", async () => {
  const { evaluatorIdsSchema } = await import("@/modules/permanence/domain/groups");
  return {
    evaluatorIdsSchema,
    configureMacroeventGroupAs: state.configure,
    findMacroeventGroup: async () => ({ id: "group-sintetico" }),
    evaluateAs: vi.fn(),
    evaluationInputSchema: {},
    prepareMacroeventGroupAs: vi.fn(),
    removeMemberAs: vi.fn(),
    saveMacroeventMemberAs: vi.fn(),
    teamMemberInputSchema: {},
  };
});

function configureForm() {
  const form = new FormData();
  form.set("slug", "inventiva");
  form.set("termId", "term-sintetico");
  form.set("area", "equipo");
  form.set("operation", "configure");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.members.mockResolvedValue([{ personId: "persona-sintetica", anonymized: false }]);
});

describe("evaluadores enviados al macroevento", () => {
  it("rechaza el exceso antes de recorrer los ids o consultar la membresía", async () => {
    const form = configureForm();
    const values: FormDataEntryValue[] = [];
    Object.defineProperty(values, 0, {
      get() {
        throw new Error("Se recorrieron los evaluadores");
      },
    });
    values.length = 1_001;
    const getAll = form.getAll.bind(form);
    vi.spyOn(form, "getAll").mockImplementation((name) => {
      if (name === "evaluatorIds") return values;
      return getAll(name);
    });
    await expect(macroeventAction(form)).rejects.toThrow(
      `redirect:/admin/macroeventos/inventiva?termId=term-sintetico&area=equipo&error=${encodeURIComponent(t("T-260"))}`,
    );
    expect(state.configure).not.toHaveBeenCalled();
    expect(state.members).not.toHaveBeenCalled();
    expect(state.revalidate).not.toHaveBeenCalled();
  });

  it("conserva la configuración de evaluadores válidos", async () => {
    const form = configureForm();
    form.append("evaluatorIds", "persona-sintetica");
    await expect(macroeventAction(form)).rejects.toThrow(
      "redirect:/admin/macroeventos/inventiva?termId=term-sintetico&area=equipo&guardado=1",
    );
    expect(state.configure).toHaveBeenCalledWith(
      { personId: "admin-sintetico", ip: null },
      "group-sintetico",
      { evaluatorIds: ["persona-sintetica"], leaderPersonId: undefined, editionId: undefined },
    );
  });
});
