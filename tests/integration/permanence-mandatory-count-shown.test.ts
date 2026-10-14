import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { adjustRequirementAs } from "@/modules/participation";
import {
  closeTermPermanenceAs,
  confirmAllProposedAs,
  recomputeSnapshots,
} from "@/modules/permanence";
import { t, tList } from "@/shared/copy";
import {
  seedCheckIn,
  seedCommitteeMembership,
  seedMembership,
  seedOccasion,
  seedPerson,
  seedTerm,
} from "../factories";
import { type ClosingWorld, closingWorld } from "../helpers/closing-world";
import { copyPattern } from "../helpers/copy";
import { elements } from "../helpers/react-tree";
import { truncateAll } from "./db";

// Cuántas asambleas obligatorias lleva firmadas una persona y de cuántas, como lo muestra `permanence`
// en sus cuatro superficies: el Desglose en `/app/permanencia` y en la pestaña Permanencia de la
// Persona 360 (T-124), la celda «n / total» de la mesa de cumplimiento y la columna «n de total» de
// su CSV. El Desglose y la mesa hacían esa cuenta cada uno a mano sobre `MandatoryView`, con la
// fórmula de `requiredTotal` y `attendedRequired` de `participation` (DT-395). Acá queda fijado por
// valor lo que muestran, antes de que pasen a llamarlas. Las pantallas se montan enteras contra
// Postgres; solo se reemplaza quién tiene la sesión.
//
// La fuente no es la misma en las cuatro, y eso también queda fijado (ADR-036 regla 5): con el
// término abierto el Desglose calcula en vivo, y la mesa y su CSV leen el último snapshot guardado;
// con el término cerrado las cuatro leen el snapshot congelado.

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

const { default: PermanenciaPage } = await import("@/app/app/permanencia/page");
const { default: PersonaPage } = await import("@/app/admin/personas/[id]/page");
const { TabPermanencia } = await import("@/app/admin/personas/[id]/_ui/TabPermanencia");
const { default: CumplimientoPage } = await import("@/app/admin/permanencia/cumplimiento/page");
const { Desglose } = await import("@/modules/permanence/components/Desglose");
const { complianceResource } = await import("@/modules/permanence/admin");

/** La cabecera «Obligatorias» del exporte de cumplimiento, la última de T-836. */
const mandatoryHeader = tList("T-836").at(-1) ?? "";

/**
 * La línea de T-124 del Desglose que montó una pantalla, como queda dibujada; nulo si el Desglose
 * no la trae, que es lo que pasa con quien no se evalúa.
 */
function mandatoryLine(screen: ReactNode, where: string): string | null {
  const desglose = elements(screen).find((item) => item.type === Desglose);
  if (!desglose) {
    throw new Error(`${where} no montó el Desglose`);
  }
  return renderToStaticMarkup(desglose).match(copyPattern("T-124"))?.[0] ?? null;
}

describe("las asambleas obligatorias que muestra permanencia: cuántas lleva firmadas y de cuántas, en el Desglose, en la mesa de cumplimiento y en su CSV", () => {
  let w: ClosingWorld;

  beforeEach(async () => {
    await truncateAll();
    w = await closingWorld();
    session.admin = w.actor.personId;
  });
  afterAll(closeDb);

  /** Lo que lee el miembro en `/app/permanencia`. */
  async function memberReads(personId: string): Promise<string | null> {
    session.member = personId;
    const page = await PermanenciaPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ semestre: w.termId }),
    });
    return mandatoryLine(page, "/app/permanencia");
  }

  /** Lo que lee GH en la pestaña Permanencia de la Persona 360. */
  async function ghReadsInTab(personId: string): Promise<string | null> {
    const page = await PersonaPage({
      params: Promise.resolve({ id: personId }),
      searchParams: Promise.resolve({ pestana: "permanencia", semestre: w.termId }),
    });
    const tab = elements(page).find((item) => item.type === TabPermanencia);
    if (!tab) {
      throw new Error("la Persona 360 no montó la pestaña de permanencia");
    }
    const drawn = await TabPermanencia(tab.props as Parameters<typeof TabPermanencia>[0]);
    return mandatoryLine(drawn, "la pestaña de permanencia");
  }

  /** La última celda de la fila de la persona en la mesa de cumplimiento. */
  async function ghReadsInTable(personId: string): Promise<unknown> {
    const page = await CumplimientoPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({ termId: w.termId }),
    });
    const row = elements(page)
      .filter((item) => item.type === "tr")
      .find((item) =>
        elements(item).some(
          (cell) => cell.props.href === `/admin/personas/${personId}?pestana=permanencia`,
        ),
      );
    if (!row) {
      throw new Error("la mesa de cumplimiento no trae a la persona");
    }
    return elements(row)
      .filter((item) => item.type === "td")
      .at(-1)?.props.children;
  }

  /** La columna «Obligatorias» de la fila de la persona en el exporte de cumplimiento. */
  async function ghReadsInCsv(personId: string): Promise<unknown> {
    const { rows } = await complianceResource.list({
      q: "",
      page: 1,
      pageSize: 500,
      filters: { termId: w.termId },
    });
    const row = rows.find((item) => item.personId === personId);
    if (!row || !complianceResource.exportRow) {
      throw new Error("el exporte de cumplimiento no trae a la persona");
    }
    return complianceResource.exportRow(row)[mandatoryHeader];
  }

  /** Las cuatro superficies, como están ahora mismo. */
  async function shown(personId: string) {
    return {
      memberPage: await memberReads(personId),
      personTab: await ghReadsInTab(personId),
      complianceCell: await ghReadsInTable(personId),
      csvColumn: await ghReadsInCsv(personId),
    };
  }

  /** Lo que dice cada superficie cuando la persona lleva `n` de `total`. */
  const says = (n: number, total: number) => ({
    memberPage: t("T-124", { n, total }),
    personTab: t("T-124", { n, total }),
    complianceCell: `${n} / ${total}`,
    csvColumn: `${n} de ${total}`,
  });

  /** Con los snapshots del término recién calculados, las cuatro dicen lo mismo. */
  async function expectAll(personId: string, n: number, total: number): Promise<void> {
    await recomputeSnapshots(w.termId);
    expect(await shown(personId)).toEqual(says(n, total));
  }

  /** Otra asamblea ya celebrada en el término; una asamblea no da puntos. */
  const held = (assemblyKind: "ORDINARY" | "BOARD_ELECTION" | "RUNOFF") =>
    seedOccasion(w.termId, {
      kind: "ASSEMBLY",
      assemblyKind,
      points: 0,
      status: "CLOSED",
      startsAt: new Date("2024-10-15T22:00:00Z"),
      checkInOpensAt: new Date("2024-10-15T21:00:00Z"),
      checkInClosesAt: new Date("2024-10-15T23:00:00Z"),
    });

  /** GH le ajusta el requisito a la persona, con motivo (ADR-024). */
  const adjust = (
    personId: string,
    requiredOrdinary: number,
    requiresBoardElection: boolean,
    requiresRunoff: boolean,
  ) =>
    adjustRequirementAs(w.actor, {
      termId: w.termId,
      personId,
      requiredOrdinary,
      requiresBoardElection,
      requiresRunoff,
      reason: "Ajuste sintético",
    });

  it("con la ordinaria del semestre firmada lleva una de una, y quien no la firmó, cero de una", async () => {
    const signed = await w.member("firmo.obligatorias@eafit.edu.co", { level: "MEETS" });
    const absent = await w.member("falto.obligatorias@eafit.edu.co", {
      level: "MEETS",
      attends: false,
    });

    await expectAll(signed, 1, 1);
    await expectAll(absent, 0, 1);
  });

  it("las ordinarias firmadas cuentan hasta las que exige el requisito: una firmada de más no suma", async () => {
    const personId = await w.member("tope.obligatorias@eafit.edu.co", { level: "MEETS" });
    for (const assembly of [await held("ORDINARY"), await held("ORDINARY")]) {
      await seedCheckIn(assembly.id, personId);
    }
    // El semestre exige una: con las tres firmadas sigue llevando una de una.
    await expectAll(personId, 1, 1);

    // El tope es el del requisito de la persona: sube con el ajuste, y por debajo del tope cuentan
    // todas las firmadas.
    await adjust(personId, 2, false, false);
    await expectAll(personId, 2, 2);
    await adjust(personId, 4, false, false);
    await expectAll(personId, 3, 4);
  });

  it("la elección de junta y la segunda vuelta citadas suman una cada una al total, y firmadas, a lo que lleva", async () => {
    const personId = await w.member("vueltas.obligatorias@eafit.edu.co", { level: "MEETS" });
    const election = await held("BOARD_ELECTION");
    await expectAll(personId, 1, 2);
    const runoff = await held("RUNOFF");
    await expectAll(personId, 1, 3);

    await seedCheckIn(runoff.id, personId);
    await expectAll(personId, 2, 3);
    await seedCheckIn(election.id, personId);
    await expectAll(personId, 3, 3);
  });

  it("con el requisito ajustado a la persona, el total sale del ajuste y la firmada que el ajuste no exige no cuenta", async () => {
    const personId = await w.member("ajuste.obligatorias@eafit.edu.co", { level: "MEETS" });
    for (const assembly of [await held("BOARD_ELECTION"), await held("RUNOFF")]) {
      await seedCheckIn(assembly.id, personId);
    }
    await expectAll(personId, 3, 3);

    await adjust(personId, 4, false, false);
    await expectAll(personId, 1, 4);
    await adjust(personId, 4, true, false);
    await expectAll(personId, 2, 5);
    await adjust(personId, 4, false, true);
    await expectAll(personId, 2, 5);
    await adjust(personId, 4, true, true);
    await expectAll(personId, 3, 6);
    // Sin nada exigido no lleva nada, por más que haya firmado.
    await adjust(personId, 0, false, false);
    await expectAll(personId, 0, 0);
  });

  it("con el término abierto la mesa de cumplimiento y su CSV leen el último cálculo guardado: hasta que se recalcula muestran lo de antes, y el Desglose ya va en vivo", async () => {
    const personId = await w.member("fuente.obligatorias@eafit.edu.co", { level: "MEETS" });
    await expectAll(personId, 1, 1);

    await held("RUNOFF");
    expect(await shown(personId)).toEqual({
      ...says(1, 2),
      complianceCell: says(1, 1).complianceCell,
      csvColumn: says(1, 1).csvColumn,
    });

    await expectAll(personId, 1, 2);
  });

  it("en un término cerrado las cuatro muestran lo que quedó congelado, aunque después cambie lo que en uno abierto movería la cuenta", async () => {
    const personId = await w.member("cerrado.obligatorias@eafit.edu.co", { level: "MEETS" });
    const runoff = await held("RUNOFF");
    await seedCheckIn(runoff.id, personId);
    await expectAll(personId, 2, 2);

    await w.closePoints();
    await confirmAllProposedAs(w.actor, w.termId);
    await closeTermPermanenceAs(w.actor, w.termId);
    await expectAll(personId, 2, 2);

    // Una elección de junta citada y dos ordinarias más firmadas: abierto, serían dos de tres.
    await held("BOARD_ELECTION");
    await seedCheckIn((await held("ORDINARY")).id, personId);
    expect(await recomputeSnapshots(w.termId)).toBe(0);
    await expectAll(personId, 2, 2);
  });

  it("a quien no se evalúa, el Desglose no le muestra la cuenta y la mesa deja la celda vacía, pero el CSV sí la trae (decisión abierta 81)", async () => {
    // En licencia y con su comité: el término le guarda su snapshot, sin resultados que evaluar.
    const personId = await seedPerson("licencia.obligatorias@eafit.edu.co");
    await seedMembership(personId, await seedTerm("2024-1"), "ON_LEAVE");
    await seedCommitteeMembership(personId, w.a3, w.termId, "MIEMBRO", {
      joinedAt: new Date("2024-07-20T12:00:00Z"),
    });
    await seedCheckIn((await held("ORDINARY")).id, personId);
    await recomputeSnapshots(w.termId);

    expect(await shown(personId)).toEqual({
      memberPage: null,
      personTab: null,
      complianceCell: "",
      csvColumn: says(1, 1).csvColumn,
    });
  });
});
