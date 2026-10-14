import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import RetoPage from "@/app/admin/gamificacion/retos/[id]/page";
import RevisionPage from "@/app/admin/gamificacion/revision/page";
import { challengeParticipationStatus } from "@/modules/participation/schema";
import { tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { type AnyElement, elements } from "../helpers/react-tree";

// Qué le muestran hoy las dos tablas del admin que listan entregas de retos, la bandeja de revisión y
// el detalle de un reto, a cada uno de los cuatro estados de una entrega (DT-344). Las dos leen el
// estado con la lista del miembro (T-2410), que no nombra el anulado: una entrega anulada sale con el
// código del enum. Es una caracterización, no una regla: mostrar «Anulado» espera la decisión abierta
// 75 (ADR-126, consecuencias). El día que se decida, primero se invierte esta prueba y después
// cambia la página. Que la anulada llega a las dos lecturas lo muestra, contra Postgres,
// `tests/integration/gamification-challenges.test.ts`.

type DeliveryStatus = (typeof challengeParticipationStatus.enumValues)[number];

const fake = vi.hoisted(() => {
  const at = new Date("2026-09-01T15:00:00.000Z");
  const challenge = {
    id: "retosintetico",
    termId: "terminosintetico",
    status: "PUBLISHED",
    state: "OPEN",
    kind: "EVIDENCE",
    title: "Reto sintético",
    description: "",
    audience: "ALL",
    audienceCommitteeIds: [],
    opensAt: at,
    closesAt: at,
    basePoints: 10,
    passPercent: null,
    occasionId: null,
  };
  /** Los estados de las entregas que devuelven las dos lecturas: los pone la prueba. */
  const statuses: string[] = [];
  return {
    at,
    challenge,
    statuses,
    /** Una entrega por estado. Su id es el estado: así se encuentra su fila en lo que se pinta. */
    deliveries: () =>
      statuses.map((status) => ({
        challenge,
        personName: `Persona ${status}`,
        participation: { id: status, status, submittedAt: at, evidenceText: "", decidedById: null },
        reward: null,
        boosterKind: null,
        files: [],
      })),
    /** Componentes y actions que la pantalla monta pero estas pruebas no ejecutan. */
    stubs: (...names: string[]) => Object.fromEntries(names.map((name) => [name, () => null])),
  };
});

vi.mock("@/env", () => ({
  getEnv: () => ({ APP_URL: "https://oe-sintetica.example", APP_TIMEZONE: "America/Bogota" }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/modules/identity", () => ({
  requireAdminActor: async () => ({ personId: "persona-sintetica", isAdmin: true }),
  hasRecentStepUp: () => true,
}));
vi.mock("@/modules/terms", () => {
  const term = { id: "terminosintetico", code: "2026-2" };
  return { getCurrentTerm: async () => term, listAllTerms: async () => [term] };
});
vi.mock("@/modules/participation", () => ({
  listPendingReviews: async () => fake.deliveries(),
  getChallengeAdmin: async () => ({
    challenge: fake.challenge,
    questions: [],
    occasion: null,
    participants: fake.deliveries(),
  }),
  hasGrantedRewards: async () => false,
  listOccasionsForTerm: async () => [],
  loadGamificationSettings: async () => ({ defaults: {} }),
}));
vi.mock("@/modules/people", () => ({
  getPeopleByIds: async () => new Map(),
  listCommitteesForSelection: async () => [],
}));
vi.mock("@/shared/admin-kit", () => fake.stubs("ResourcePanel"));
vi.mock("@/modules/participation/components/ChallengeCard", () => fake.stubs("ChallengeCard"));
vi.mock("@/modules/participation/components/ChallengeEditor", () => fake.stubs("ChallengeEditor"));
vi.mock("@/app/admin/gamificacion/revision/actions", () =>
  fake.stubs("annulAction", "reviewAction"),
);
vi.mock("@/app/admin/gamificacion/retos/actions", () =>
  fake.stubs(
    "cancelChallengeAction",
    "duplicateChallengeAction",
    "publishChallengeAction",
    "saveChallengeAction",
  ),
);

// Los seis estados que T-2410 nombra, en su orden: la lista del miembro, con la que leen las dos
// páginas. La de una entrega es T-3266, en el orden del enum, y hoy no la lee ninguna de las dos.
const MEMBER_STATES = ["AVAILABLE", "SENT", "PENDING", "COMPLETED", "REJECTED", "EXPIRED"] as const;
const member = tLabels("T-2410", MEMBER_STATES);
const delivery = tLabels("T-3266", challengeParticipationStatus.enumValues);

/** Lo que cada tabla le muestra hoy a cada estado de una entrega. */
const SHOWN = {
  PENDING: member.PENDING,
  COMPLETED: member.COMPLETED,
  REJECTED: member.REJECTED,
  ANNULLED: "ANNULLED",
} satisfies Record<DeliveryStatus, string>;

/** El texto de lo pintado, con el de los elementos que lleva adentro. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join("");
  }
  return isValidElement<{ children?: ReactNode }>(node) ? textOf(node.props.children) : "";
}

/** El elemento con esa llave: la fila de la entrega en ese estado. */
function rowOf(tree: AnyElement[], status: DeliveryStatus, type: string): AnyElement {
  const row = tree.find((element) => element.type === type && element.key === status);
  if (!row) {
    throw new Error(`la pantalla no pinta la entrega ${status}`);
  }
  return row;
}

function props<P>(params: P) {
  return { params: Promise.resolve(params), searchParams: Promise.resolve({}) };
}

const screens = {
  /** La bandeja: el estado cierra la línea del reto, después de la fecha de la entrega. */
  bandeja: async (): Promise<Record<string, string>> => {
    const tree = elements(await RevisionPage(props({})));
    const prefix = `${fake.challenge.title} · ${formatDateTime(fake.at)} · `;
    return Object.fromEntries(
      challengeParticipationStatus.enumValues.map((status) => {
        const line = elements(rowOf(tree, status, "li"))
          .filter((element) => element.type === "p")
          .map(textOf)
          .find((text) => text.startsWith(prefix));
        if (line === undefined) {
          throw new Error(`la bandeja no pinta la línea del reto en la entrega ${status}`);
        }
        return [status, line.slice(prefix.length)];
      }),
    );
  },
  /** El detalle del reto: la celda de la columna «Estado» de la tabla de participantes. */
  reto: async (): Promise<Record<string, string>> => {
    const tree = elements(await RetoPage(props({ id: fake.challenge.id })));
    const column = tList("T-2518")[1];
    return Object.fromEntries(
      challengeParticipationStatus.enumValues.map((status) => {
        const cell = elements(rowOf(tree, status, "tr")).find(
          (element) => element.type === "td" && element.props["data-label"] === column,
        );
        if (!cell) {
          throw new Error(`el detalle del reto no pinta el estado de la entrega ${status}`);
        }
        return [status, textOf(cell)];
      }),
    );
  },
};

describe("el estado de una entrega de reto en las tablas del admin (DT-344, decisión abierta 75)", () => {
  it.each([
    ["la bandeja de revisión", screens.bandeja],
    ["el detalle de un reto", screens.reto],
  ])("%s nombra la entrega pendiente, la completada y la rechazada con la lista del miembro, y la anulada sale con su código", async (_name, shown) => {
    fake.statuses.splice(0, fake.statuses.length, ...challengeParticipationStatus.enumValues);
    expect(await shown()).toEqual(SHOWN);
  });

  it("la lista de una entrega ya existe y ninguna de las dos la lee: nombra la anulada, y a la pendiente la llama distinto que la del miembro", () => {
    // Lo que cambiaría en pantalla con T-3266: la anulada deja de mostrar su código y la pendiente
    // cambia de palabras. La completada y la rechazada dicen lo mismo en las dos listas.
    expect(delivery.ANNULLED).not.toBe(SHOWN.ANNULLED);
    expect(delivery.PENDING).not.toBe(SHOWN.PENDING);
    expect(delivery.COMPLETED).toBe(SHOWN.COMPLETED);
    expect(delivery.REJECTED).toBe(SHOWN.REJECTED);
  });
});
