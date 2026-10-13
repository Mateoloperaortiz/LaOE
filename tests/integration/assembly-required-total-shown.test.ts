import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { adjustRequirementAs } from "@/modules/participation";
import { t } from "@/shared/copy";
import { seedCheckIn, seedMember, seedOccasion, seedTerm } from "../factories";
import { type AnyElement, elements } from "../helpers/react-tree";
import { truncateAll } from "./db";

// El total de asambleas obligatorias que lee el miembro en GH Points (T-545) y GH en el Resumen de la
// Persona 360 (T-670): las ordinarias que exige el requisito, más la elección de junta y la segunda
// vuelta cuando aplican. Las dos pantallas lo sumaban cada una a mano, sin llamar a `requiredTotal`
// (DT-358, auditoría C6). Acá queda fijado lo que muestran, antes de que pasen a llamarla. Las
// pantallas se montan enteras contra Postgres; solo se reemplaza quién tiene la sesión.
//
// Y cuántas de esas lleva firmadas la persona, la `n` de los dos textos, que cada pantalla también
// suma a mano (DT-385, la otra mitad de C6): las ordinarias firmadas hasta las que exige el
// requisito, más la elección de junta y la segunda vuelta si el requisito las exige y están
// firmadas. Queda fijada por las dos pantallas antes de sacar esa cuenta a una función.

const session = vi.hoisted(() => ({ member: "", admin: "" }));

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
  const actor = (personId: string, isAdmin: boolean) => ({
    personId,
    sessionId: "sesion-test",
    email: "sesion@test.dev",
    name: "Persona Sintética",
    firstName: "Persona",
    membershipStatus: "ACTIVE" as const,
    permissions: isAdmin ? [{ code: "ADMIN" as const, committeeId: null }] : [],
    otpVerifiedAt: new Date(),
    sessionLastSeenAt: new Date(),
    sessionRemembered: false,
    isAdmin,
    ip: null,
  });
  return {
    ...mod,
    requireActor: () => Promise.resolve(actor(session.member, false)),
    requireAdminActor: () => Promise.resolve(actor(session.admin, true)),
  };
});

const { default: GhPointsPage } = await import("@/app/app/gh-points/page");
const { default: PersonaPage } = await import("@/app/admin/personas/[id]/page");
const { TabResumen } = await import("@/app/admin/personas/[id]/_ui/Tabs");

/** La línea de asambleas obligatorias que GH Points le muestra al miembro. */
async function memberReads(personId: string): Promise<unknown> {
  session.member = personId;
  const tree = await GhPointsPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({}),
  });
  const section = elements(tree).find((item) => item.props["aria-labelledby"] === "asambleas");
  if (!section) {
    throw new Error("GH Points no montó la sección de asambleas");
  }
  const line = elements(section.props.children as AnyElement).find((item) => item.type === "p");
  return line?.props.children;
}

/** Lo que el Resumen de la Persona 360 recibe para pintar en «Asambleas». */
async function ghReads(personId: string): Promise<unknown> {
  const tree = await PersonaPage({
    params: Promise.resolve({ id: personId }),
    searchParams: Promise.resolve({}),
  });
  const tab = elements(tree).find((item) => item.type === TabResumen);
  if (!tab) {
    throw new Error("la Persona 360 no montó el Resumen");
  }
  return tab.props.assemblies;
}

/** Las dos pantallas dicen lo mismo: cuántas obligatorias firmó y de cuántas. */
async function expectBoth(personId: string, n: number, total: number): Promise<void> {
  expect(await memberReads(personId)).toBe(t("T-545", { n, total }));
  expect(await ghReads(personId)).toBe(t("T-670", { n, total }));
}

describe("las asambleas obligatorias que muestran GH Points y la Persona 360: cuántas lleva firmadas y de cuántas", () => {
  let termId = "";
  let personId = "";

  beforeEach(async () => {
    await truncateAll();
    termId = await seedTerm();
    session.admin = await seedMember("admin.asambleas@test.dev");
    personId = await seedMember("miembro.asambleas@test.dev");
  });
  afterAll(closeDb);

  /** Una asamblea citada en el semestre; una asamblea no da puntos. */
  const seedAssembly = (assemblyKind: "ORDINARY" | "BOARD_ELECTION" | "RUNOFF") =>
    seedOccasion(termId, { kind: "ASSEMBLY", assemblyKind, points: 0 });

  /** GH le ajusta el requisito a la persona, con motivo (ADR-024). */
  const adjustRequirement = (requirement: {
    requiredOrdinary: number;
    requiresBoardElection: boolean;
    requiresRunoff: boolean;
  }) =>
    adjustRequirementAs(
      { personId: session.admin, ip: null },
      { termId, personId, ...requirement, reason: "Ajuste sintético" },
    );

  it("sin elección de junta ni segunda vuelta citadas, el total es el de las ordinarias del semestre", async () => {
    await expectBoth(personId, 0, 1);
  });

  it("la elección de junta y la segunda vuelta citadas suman una cada una, y la firmada cuenta en lo que lleva", async () => {
    const election = await seedAssembly("BOARD_ELECTION");
    await expectBoth(personId, 0, 2);

    await seedAssembly("RUNOFF");
    await expectBoth(personId, 0, 3);

    await seedCheckIn(election.id, personId);
    await expectBoth(personId, 1, 3);
  });

  it("con el requisito ajustado a la persona, el total sale del ajuste: sus ordinarias y solo lo que el ajuste exige", async () => {
    await seedAssembly("BOARD_ELECTION");
    await seedAssembly("RUNOFF");
    const adjust = (requiresBoardElection: boolean, requiresRunoff: boolean) =>
      adjustRequirement({ requiredOrdinary: 4, requiresBoardElection, requiresRunoff });

    await adjust(false, false);
    await expectBoth(personId, 0, 4);
    await adjust(true, false);
    await expectBoth(personId, 0, 5);
    await adjust(false, true);
    await expectBoth(personId, 0, 5);
    await adjust(true, true);
    await expectBoth(personId, 0, 6);
  });

  it("las ordinarias firmadas cuentan hasta las que exige el requisito: una firmada de más no suma", async () => {
    const ordinaries = [
      await seedAssembly("ORDINARY"),
      await seedAssembly("ORDINARY"),
      await seedAssembly("ORDINARY"),
    ];
    const [first, ...rest] = ordinaries;
    if (!first) {
      throw new Error("sin asambleas ordinarias sembradas");
    }
    await seedCheckIn(first.id, personId);
    await expectBoth(personId, 1, 1);

    // El semestre exige una: con las tres firmadas sigue llevando una de una.
    for (const assembly of rest) {
      await seedCheckIn(assembly.id, personId);
    }
    await expectBoth(personId, 1, 1);

    // El tope es el del requisito de la persona: sube con el ajuste, y por debajo del tope cuentan
    // todas las firmadas.
    const adjust = (requiredOrdinary: number) =>
      adjustRequirement({ requiredOrdinary, requiresBoardElection: false, requiresRunoff: false });
    await adjust(2);
    await expectBoth(personId, 2, 2);
    await adjust(4);
    await expectBoth(personId, 3, 4);
  });

  it("la segunda vuelta firmada cuenta en lo que lleva, y con la elección de junta firmada son dos", async () => {
    const election = await seedAssembly("BOARD_ELECTION");
    const runoff = await seedAssembly("RUNOFF");

    await seedCheckIn(runoff.id, personId);
    await expectBoth(personId, 1, 3);

    await seedCheckIn(election.id, personId);
    await expectBoth(personId, 2, 3);
  });

  it("la asamblea firmada que el requisito ajustado no exige no cuenta en lo que lleva", async () => {
    const election = await seedAssembly("BOARD_ELECTION");
    const runoff = await seedAssembly("RUNOFF");
    await seedCheckIn(election.id, personId);
    await seedCheckIn(runoff.id, personId);
    const adjust = (requiresBoardElection: boolean, requiresRunoff: boolean) =>
      adjustRequirement({ requiredOrdinary: 4, requiresBoardElection, requiresRunoff });

    await adjust(false, false);
    await expectBoth(personId, 0, 4);
    await adjust(true, false);
    await expectBoth(personId, 1, 5);
    await adjust(false, true);
    await expectBoth(personId, 1, 5);
    await adjust(true, true);
    await expectBoth(personId, 2, 6);
  });
});
