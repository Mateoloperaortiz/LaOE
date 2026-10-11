import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { adjustPointsAs, collectionFor, unseenBadgesFor } from "@/modules/participation";
import type { achievement } from "@/modules/participation/schema";
import { setConfig } from "@/modules/system";
import { t } from "@/shared/copy";
import {
  seedBooster,
  seedMember,
  seedOccasion,
  seedSpecialBadge,
  seedTerm,
  seedAchievement as seedUnlocked,
  seedVeteran,
} from "../factories";
import { type CountedQuery, countQueries } from "../helpers/queries";
import { type AnyElement, elements } from "../helpers/react-tree";
import { truncateAll } from "./db";

// La pestaña GH Points de Mi OE (ADR-035 reglas 9 y 10, ADR-067 regla 9): el puesto propio, el top
// 10 del tablero elegido y el diálogo de las insignias sin ver. Lo que la vista muestra se fija
// primero, y después cuánto lee para armarlo (DT-224).

let currentPerson = "";

// La vista monta componentes de marca que cargan sus fuentes con `next/font`, que fuera de Next no
// existe; ninguno se ejecuta acá, solo se lee el árbol que la página devuelve.
vi.mock("next/font/local", () => ({ default: () => ({ className: "", variable: "" }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/modules/identity", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/modules/identity")>();
  return {
    ...mod,
    requireActor: () =>
      Promise.resolve({
        personId: currentPerson,
        sessionId: "sesion-test",
        email: "miembro@test.dev",
        name: "Miembro Sintético",
        firstName: "Miembro",
        membershipStatus: "ACTIVE" as const,
        permissions: [],
        otpVerifiedAt: new Date(),
        sessionLastSeenAt: new Date(),
      }),
  };
});

const { default: GhPointsPage } = await import("@/app/app/gh-points/page");

async function render(personId: string, search: Record<string, string> = {}) {
  currentPerson = personId;
  return GhPointsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(search) });
}

/** Lo que la vista muestra del puesto, del tablero y del diálogo de insignias. */
function shown(tree: Awaited<ReturnType<typeof render>>) {
  const all = elements(tree);
  const position = all.find((item) => "data-puesto" in item.props);
  const list = all.find((item) => item.type === "ol");
  const rows = list
    ? elements(list.props.children as AnyElement).filter((item) => item.type === "li")
    : [];
  const dialog = all.find((item) => "unseen" in item.props);
  return {
    puesto: position?.props["data-puesto"],
    texto: position?.props.children,
    tablero: rows.map((row) => {
      const [numeral, name, total] = elements(row.props.children as AnyElement);
      return [
        numeral?.props.valor,
        name?.props.children,
        total?.props.children,
        row.props["aria-current"] === "true",
      ];
    }),
    sinVer: dialog?.props.unseen,
  };
}

interface Cast {
  termId: string;
  nuevos: string[];
  sinPuntos: string;
  veteranas: string[];
}

/** Doce nuevos con puntos (dos empatados arriba), uno sin puntos y dos veteranas con puntos. */
async function seedBoards(): Promise<Cast> {
  const termId = await seedTerm();
  const admin = await seedVeteran("admin@test.dev", { firstName: "Admin", lastName: "Veterano" });
  const give = (personId: string, points: number) =>
    adjustPointsAs(
      { personId: admin, ip: null },
      { personId, termId, points, reason: "bono de prueba" },
    );
  const nuevos: string[] = [];
  for (const [index, points] of [90, 90, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25].entries()) {
    const personId = await seedMember(`nuevo${index}@test.dev`, {
      firstName: "Nuevo",
      lastName: String.fromCharCode(65 + index),
    });
    await give(personId, points);
    nuevos.push(personId);
  }
  const sinPuntos = await seedMember("nuevo.sin@test.dev", {
    firstName: "Sin",
    lastName: "Puntos",
  });
  const veteranas: string[] = [];
  for (const [index, points] of [80, 20].entries()) {
    const personId = await seedVeteran(`veterana${index}@test.dev`, {
      firstName: "Veterana",
      lastName: String.fromCharCode(65 + index),
    });
    await give(personId, points);
    veteranas.push(personId);
  }
  return { termId, nuevos, sinPuntos, veteranas };
}

const TOP_NUEVOS = [
  [1, "Nuevo A", "90"],
  [1, "Nuevo B", "90"],
  [3, "Nuevo C", "70"],
  [4, "Nuevo D", "65"],
  [5, "Nuevo E", "60"],
  [6, "Nuevo F", "55"],
  [7, "Nuevo G", "50"],
  [8, "Nuevo H", "45"],
  [9, "Nuevo I", "40"],
  [10, "Nuevo J", "35"],
] as const;

const puestoText = (puesto: number, total: number) =>
  `${t("T-559")}: ${t("T-540", { puesto, total })}`;

let badgeCounter = 0;

/** Un logro de la persona sobre una insignia propia de la prueba. */
async function seedAchievement(
  personId: string,
  termId: string,
  occasionId: string,
  overrides: Partial<typeof achievement.$inferInsert> & { active?: boolean } = {},
) {
  badgeCounter += 1;
  const { active, ...rest } = overrides;
  const name = `Insignia de la vista ${badgeCounter}`;
  const badgeId = await seedSpecialBadge(
    `vista-${String(badgeCounter).padStart(3, "0")}`,
    { occasionId },
    { name, active: active ?? true },
  );
  const id = await seedUnlocked(personId, badgeId, termId, {
    unlockedAt: new Date(Date.parse("2026-03-02T19:00:00.000Z") + badgeCounter * 60_000),
    ...rest,
  });
  return { badge: { id: badgeId, name }, achievement: { id } };
}

/** Dos logros sin ver (uno con booster) y los cuatro que el diálogo no muestra, más uno ajeno. */
async function seedUnseen(personId: string, otherId: string, termId: string) {
  const { id: occasionId } = await seedOccasion(termId, { title: "Ocasión de la insignia" });
  const first = await seedAchievement(personId, termId, occasionId);
  await seedBooster(personId, termId, "PLUS_100", { sourceAchievementId: first.achievement.id });
  await seedAchievement(personId, termId, occasionId, { seenAt: new Date() });
  await seedAchievement(personId, termId, occasionId, { historical: true });
  await seedAchievement(personId, termId, occasionId, {
    revokedAt: new Date(),
    revokeReason: "Retiro de prueba",
  });
  await seedAchievement(personId, termId, occasionId, { active: false });
  const second = await seedAchievement(personId, termId, occasionId);
  await seedAchievement(otherId, termId, occasionId);
  return [
    {
      achievementId: first.achievement.id,
      name: first.badge.name,
      family: "SPECIAL",
      level: 1,
      boosterKind: "PLUS_100",
    },
    {
      achievementId: second.achievement.id,
      name: second.badge.name,
      family: "SPECIAL",
      level: 1,
      boosterKind: null,
    },
  ];
}

const enableGamification = () =>
  runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "gamification.enabled", true));

describe("GH Points: lo que la vista muestra", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("un nuevo ve su puesto y el top 10 de su tablero, con los empates y su fila marcada", async () => {
    const cast = await seedBoards();

    const view = shown(await render(cast.nuevos[2] ?? ""));

    expect(view.puesto).toBe(3);
    expect(view.texto).toBe(puestoText(3, 12));
    expect(view.tablero).toEqual(TOP_NUEVOS.map((row, index) => [...row, index === 2]));
  });

  it("quien quedó fuera del top 10 conserva su puesto y no aparece en la lista", async () => {
    const cast = await seedBoards();

    const view = shown(await render(cast.nuevos[11] ?? "", { tablero: "nuevos" }));

    expect(view.puesto).toBe(12);
    expect(view.texto).toBe(puestoText(12, 12));
    expect(view.tablero).toEqual(TOP_NUEVOS.map((row) => [...row, false]));
  });

  it("una veterana en el tablero de nuevos ve su puesto entre veteranos y el top 10 de nuevos", async () => {
    const cast = await seedBoards();

    const view = shown(await render(cast.veteranas[1] ?? ""));

    expect(view.puesto).toBe(2);
    expect(view.texto).toBe(puestoText(2, 2));
    expect(view.tablero).toEqual(TOP_NUEVOS.map((row) => [...row, false]));
  });

  it("una veterana en su tablero ve solo a quienes suman puntos, con su fila marcada", async () => {
    const cast = await seedBoards();

    const view = shown(await render(cast.veteranas[0] ?? "", { tablero: "veteranos" }));

    expect(view.puesto).toBe(1);
    expect(view.tablero).toEqual([
      [1, "Veterana A", "80", true],
      [2, "Veterana B", "20", false],
    ]);
  });

  it("quien no suma puntos no tiene puesto y ve el tablero de los demás", async () => {
    const cast = await seedBoards();

    const view = shown(await render(cast.sinPuntos));

    expect(view.puesto).toBe("");
    expect(view.texto).toBe(t("T-541"));
    expect(view.tablero).toEqual(TOP_NUEVOS.map((row) => [...row, false]));
  });

  it("en el tablero de comités el puesto propio sigue saliendo", async () => {
    const cast = await seedBoards();

    const view = shown(await render(cast.nuevos[0] ?? "", { tablero: "comites" }));

    expect(view.puesto).toBe(1);
    expect(view.tablero).toEqual([]);
  });

  it("el diálogo recibe los logros vivos sin ver, del más viejo al más nuevo y con su booster", async () => {
    const cast = await seedBoards();
    await enableGamification();
    const expected = await seedUnseen(cast.nuevos[0] ?? "", cast.nuevos[1] ?? "", cast.termId);

    expect(shown(await render(cast.nuevos[0] ?? "")).sinVer).toEqual(expected);
    expect(shown(await render(cast.sinPuntos)).sinVer).toEqual([]);
  });

  it("con la gamificación apagada el diálogo no recibe nada", async () => {
    const cast = await seedBoards();
    await seedUnseen(cast.nuevos[0] ?? "", cast.nuevos[1] ?? "", cast.termId);

    expect(shown(await render(cast.nuevos[0] ?? "")).sinVer).toEqual([]);
  });
});

const activeMemberReads = (queries: CountedQuery[]) =>
  reads(queries, 'from "membership" inner join "person"');
const reads = (queries: CountedQuery[], fragment: string) =>
  queries.filter((query) => query.text.includes(fragment)).length;
const boardTotals = (queries: CountedQuery[]) =>
  queries.filter(
    (query) => query.text.includes('from "point_entry"') && query.text.includes("group by"),
  ).length;

describe("GH Points: cuánto lee la vista (DT-224)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("con el tablero propio lee a los activos una vez y suma el tablero una vez", async () => {
    const cast = await seedBoards();

    const { result, queries } = await countQueries(() => render(cast.nuevos[2] ?? ""));

    expect(shown(result).puesto).toBe(3);
    expect(shown(result).tablero).toHaveLength(10);
    expect(activeMemberReads(queries)).toBe(1);
    expect(boardTotals(queries)).toBe(1);
  });

  it("con el tablero ajeno lee a los activos una vez y suma cada tablero una vez", async () => {
    const cast = await seedBoards();

    const { result, queries } = await countQueries(() => render(cast.veteranas[1] ?? ""));

    expect(shown(result).puesto).toBe(2);
    expect(shown(result).tablero).toHaveLength(10);
    expect(activeMemberReads(queries)).toBe(1);
    expect(boardTotals(queries)).toBe(2);
  });

  it("para el diálogo de insignias trae solo los logros sin ver, no la colección ni la historia que la sostiene", async () => {
    const cast = await seedBoards();
    await enableGamification();
    const expected = await seedUnseen(cast.nuevos[0] ?? "", cast.nuevos[1] ?? "", cast.termId);

    const { result, queries } = await countQueries(() => render(cast.nuevos[0] ?? ""));

    expect(shown(result).sinVer).toEqual(expected);
    const achievementReads = queries.filter((query) => query.text.includes('from "achievement"'));
    expect(achievementReads.map((query) => query.rows)).toEqual([expected.length]);
    expect(reads(queries, 'from "wordle_game"')).toBe(0);
    expect(reads(queries, 'from "challenge_participation"')).toBe(0);
  });
  it("cada vista lee de nuevo: un ajuste entre una y otra cambia el puesto", async () => {
    const cast = await seedBoards();
    const personId = cast.nuevos[2] ?? "";
    expect(shown(await render(personId)).puesto).toBe(3);

    await adjustPointsAs(
      { personId: cast.veteranas[0] ?? "", ip: null },
      { personId, termId: cast.termId, points: 100, reason: "bono de prueba" },
    );

    expect(shown(await render(personId)).puesto).toBe(1);
  });
});

describe("insignias sin ver: la lectura directa (DT-224)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("devuelve lo mismo que la colección: vivos, no históricos, sin ver y de insignia activa", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("sinver1@test.dev");
    const otherId = await seedMember("sinver2@test.dev");
    const expected = await seedUnseen(personId, otherId, termId);

    const unseen = await unseenBadgesFor(personId);

    expect(unseen.map((item) => [item.achievement.id, item.boosterKind])).toEqual(
      expected.map((item) => [item.achievementId, item.boosterKind]),
    );
    expect(unseen).toEqual((await collectionFor(personId)).unseen);
    expect(await unseenBadgesFor(otherId)).toEqual((await collectionFor(otherId)).unseen);
  });

  it("cuesta dos consultas, y una sola cuando no hay nada sin ver", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("sinver3@test.dev");
    const otherId = await seedMember("sinver4@test.dev");
    const nobody = await seedMember("sinver5@test.dev");
    await seedUnseen(personId, otherId, termId);

    const some = await countQueries(() => unseenBadgesFor(personId));
    const none = await countQueries(() => unseenBadgesFor(nobody));

    expect(some.result).toHaveLength(2);
    expect(some.queries).toHaveLength(2);
    expect(none.result).toEqual([]);
    expect(none.queries).toHaveLength(1);
  });
});
