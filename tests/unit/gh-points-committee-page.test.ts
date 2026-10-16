import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CommitteePodium } from "@/app/app/gh-points/CommitteePodium";
import GhPointsPage from "@/app/app/gh-points/page";
import { elements } from "../helpers/react-tree";

const historicalTerm = vi.hoisted(() => ({
  id: "termino-sintetico",
  code: "1900-1",
  pointsClosedAt: new Date("1900-06-30T17:00:00Z"),
}));

vi.mock("@/modules/identity", () => ({
  requireActor: async () => ({ personId: "persona-sintetica" }),
}));
vi.mock("@/modules/terms", () => ({
  getCurrentTerm: async () => historicalTerm,
  listAllTerms: async () => [historicalTerm],
}));
vi.mock("@/modules/people", () => ({
  getMembershipRef: async () => null,
  listCommitteesByIds: async () => [{ id: "comite-sintetico", name: "Nombre del catálogo actual" }],
}));
vi.mock("@/modules/system", () => ({ requireConfig: async () => [0] }));
vi.mock("@/modules/participation", async () => {
  const { POINT_ENTRY_KINDS } = await import("@/modules/participation/domain/ledger-pure");
  const { ASSEMBLY_KINDS } = await import("@/modules/participation/domain/occasion-pure");
  return {
    POINT_ENTRY_KINDS,
    ASSEMBLY_KINDS,
    balanceFor: async () => 0,
    listEntriesFor: async () => [],
    peopleBoards: () => ({}),
    assemblyStatusFor: async () => ({ assemblies: [] }),
    getPresenceStreak: async () => null,
    requiredTotal: () => 0,
    attendedRequired: () => 0,
    levelCutoffsForTerm: () => [0],
    levelFor: () => ({ index: 0, next: null, remaining: null }),
    loadGamificationSettings: async () => ({ enabled: false }),
    rankCommittees: async () => [
      {
        rank: 1,
        total: 903,
        row: {
          committeeId: "comite-sintetico",
          name: "Nombre congelado",
          rankingMetric: "ATTENDANCE",
          score: 0.0903,
          attendanceScore: 0.0903,
          rawScore: 0.09,
          occasions: 2,
          ghAverage: null,
          ghTotal: null,
          activeMembers: null,
          ghNormalized: null,
          attendanceNormalized: null,
          policy: null,
        },
      },
    ],
  };
});
vi.mock("@/app/app/gh-points/coleccion/actions", () => ({ markSeenAction: async () => {} }));
vi.mock("next/font/local", () => ({ default: () => ({ className: "", variable: "" }) }));
vi.mock("@/env", () => ({ getEnv: () => ({ APP_TIMEZONE: "America/Bogota" }) }));

describe("nombre del comité en un cierre de GH Points", () => {
  it("renderiza el nombre congelado de la foto aunque el catálogo vigente tenga otro", async () => {
    const page = await GhPointsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ tablero: "comites", semestre: historicalTerm.id }),
    });
    const podium = elements(page).find((element) => element.type === CommitteePodium);
    if (!podium) throw new Error("La página no montó el podio histórico");
    const html = renderToStaticMarkup(podium);
    expect(html).toContain("Nombre congelado");
    expect(html).not.toContain("Nombre del catálogo actual");
    expect(html).toContain("9,03");
  });
});
