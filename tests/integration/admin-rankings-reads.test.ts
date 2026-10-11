import { eq } from "drizzle-orm";
import { isValidElement, type ReactNode } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { adjustPointsAs } from "@/modules/participation";
import { rankingsResource } from "@/modules/participation/admin";
import { person } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { elements } from "../helpers/react-tree";
import { truncateAll } from "./db";
import { currentTermCode, seedMember, seedTerm, seedVeteran } from "./factories";

// Los rankings del término para GH (ADR-008, ADR-024): la pantalla del admin con los tableros de
// nuevos, veteranos y comités, y el exporte de los tableros de personas. Lo que muestran y lo que
// traen se fija primero, y después cuánto leen para armarlo (DT-309).

let adminId = "";

// La pantalla monta componentes de marca que cargan sus fuentes con `next/font`, que fuera de Next no
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
    requireAdminActor: () =>
      Promise.resolve({
        personId: adminId,
        sessionId: "sesion-test",
        email: "admin@test.dev",
        name: "Admin Veterano",
        firstName: "Admin",
        membershipStatus: "ACTIVE" as const,
        permissions: [{ code: "ADMIN" as const, committeeId: null }],
        otpVerifiedAt: new Date(),
        sessionLastSeenAt: new Date(),
        sessionRemembered: false,
        isAdmin: true,
      }),
  };
});

const { default: RankingsPage } = await import("@/app/admin/rankings/page");

function render(search: Record<string, string>) {
  return RankingsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(search) });
}

/** El texto de una celda; de un numeral de marca, su valor. */
function text(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (Array.isArray(node)) {
    return node.map(text).join("");
  }
  if (isValidElement<Record<string, unknown>>(node)) {
    return "valor" in node.props
      ? String(node.props.valor)
      : text(node.props.children as ReactNode);
  }
  return String(node);
}

/** Cada tablero de la pantalla por su título: las celdas de cada fila y, tras el nombre, su enlace. */
function shown(tree: Awaited<ReturnType<typeof render>>) {
  const sections = elements(tree).filter((item) => item.type === "section");
  return Object.fromEntries(
    sections.map((section) => {
      const body = elements(section).find((item) => item.type === "tbody");
      const rows = body ? elements(body).filter((item) => item.type === "tr") : [];
      return [
        String(section.props["aria-label"]),
        rows.map((row) => {
          const cells = elements(row).filter((item) => item.type === "td");
          const link = elements(row).find((item) => "href" in item.props);
          const [rank, name, ...rest] = cells.map((cell) => text(cell.props.children as ReactNode));
          return [rank, name, link?.props.href ?? null, ...rest];
        }),
      ];
    }),
  );
}

interface Cast {
  termId: string;
  nuevas: [string, string, string];
  veterana: string;
}

/**
 * Tres nuevas (dos empatadas con puntos y una sin puntos) y tres veteranos: una con puntos, una con
 * puntos y los datos ya anonimizados, y el admin sin puntos.
 */
async function seedBoards(): Promise<Cast> {
  const termId = await seedTerm(currentTermCode());
  adminId = await seedVeteran("admin@test.dev", { firstName: "Admin", lastName: "Veterano" });
  const give = (personId: string, points: number) =>
    adjustPointsAs(
      { personId: adminId, ip: null },
      { personId, termId, points, reason: "bono de prueba" },
    );
  const nuevaA = await seedMember("nueva.a@test.dev", { firstName: "Nueva", lastName: "A" });
  const nuevaB = await seedMember("nueva.b@test.dev", { firstName: "Nueva", lastName: "B" });
  const nuevaC = await seedMember("nueva.c@test.dev", { firstName: "Nueva", lastName: "C" });
  const veterana = await seedVeteran("veterana.a@test.dev", {
    firstName: "Veterana",
    lastName: "A",
  });
  const anonima = await seedVeteran("veterana.b@test.dev", {
    firstName: "Veterana",
    lastName: "B",
  });
  await give(nuevaA, 40);
  await give(nuevaB, 40);
  await give(veterana, 80);
  await give(anonima, 20);
  await getDb().update(person).set({ anonymizedAt: new Date() }).where(eq(person.id, anonima));
  return { termId, nuevas: [nuevaA, nuevaB, nuevaC], veterana };
}

const [tabNuevos = "", tabVeteranos = "", tabComites = ""] = tList("T-083");
const VETERAN_TERM = "2025-1";

describe("rankings del admin: lo que muestra la pantalla y lo que trae el exporte", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("la pantalla muestra el tablero de nuevos y el de veteranos completos: puesto, nombre con su enlace, semestre de ingreso y puntos", async () => {
    const { termId, nuevas, veterana } = await seedBoards();
    const code = currentTermCode();

    const boards = shown(await render({ termId }));

    expect(boards).toEqual({
      [tabNuevos]: [
        ["1", "Nueva A", `/admin/personas/${nuevas[0]}`, code, "40"],
        ["1", "Nueva B", `/admin/personas/${nuevas[1]}`, code, "40"],
        ["3", "Nueva C", `/admin/personas/${nuevas[2]}`, code, "0"],
      ],
      [tabVeteranos]: [
        ["1", "Veterana A", `/admin/personas/${veterana}`, VETERAN_TERM, "80"],
        ["2", t("T-223"), null, VETERAN_TERM, "20"],
        ["3", "Admin Veterano", `/admin/personas/${adminId}`, VETERAN_TERM, "0"],
      ],
      [tabComites]: [],
    });
  });

  it("el exporte trae los dos tableros, nuevos primero, con puesto, tablero, nombre, semestre de ingreso y puntos", async () => {
    const { termId } = await seedBoards();
    const code = currentTermCode();

    const listed = await rankingsResource.list({
      q: "",
      page: 1,
      pageSize: 100,
      filters: { termId },
    });

    expect(listed.total).toBe(6);
    expect(listed.rows.map((row) => rankingsResource.exportRow(row))).toEqual([
      { puesto: 1, tablero: tabNuevos, nombre: "Nueva A", semestre_de_ingreso: code, puntos: 40 },
      { puesto: 1, tablero: tabNuevos, nombre: "Nueva B", semestre_de_ingreso: code, puntos: 40 },
      { puesto: 3, tablero: tabNuevos, nombre: "Nueva C", semestre_de_ingreso: code, puntos: 0 },
      {
        puesto: 1,
        tablero: tabVeteranos,
        nombre: "Veterana A",
        semestre_de_ingreso: VETERAN_TERM,
        puntos: 80,
      },
      {
        puesto: 2,
        tablero: tabVeteranos,
        nombre: t("T-223"),
        semestre_de_ingreso: VETERAN_TERM,
        puntos: 20,
      },
      {
        puesto: 3,
        tablero: tabVeteranos,
        nombre: "Admin Veterano",
        semestre_de_ingreso: VETERAN_TERM,
        puntos: 0,
      },
    ]);
  });

  it("el exporte filtrado por tablero trae solo ese tablero", async () => {
    const { termId } = await seedBoards();
    const params = { q: "", page: 1, pageSize: 100 };

    const nuevos = await rankingsResource.list({ ...params, filters: { termId, board: "NEW" } });
    const veteranos = await rankingsResource.list({
      ...params,
      filters: { termId, board: "VETERAN" },
    });

    expect(nuevos.rows.map((row) => [row.board, row.rank, row.name])).toEqual([
      ["NEW", 1, "Nueva A"],
      ["NEW", 1, "Nueva B"],
      ["NEW", 3, "Nueva C"],
    ]);
    expect(veteranos.rows.map((row) => [row.board, row.rank, row.name])).toEqual([
      ["VETERAN", 1, "Veterana A"],
      ["VETERAN", 2, t("T-223")],
      ["VETERAN", 3, "Admin Veterano"],
    ]);
  });
});
