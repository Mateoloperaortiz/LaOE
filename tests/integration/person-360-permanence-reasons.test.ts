import { isValidElement, type ReactNode } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { adjustRequirementAs } from "@/modules/participation";
import { recordSanctionAs, revokeSanctionAs } from "@/modules/people";
import {
  closeTermPermanenceAs,
  confirmAllProposedAs,
  confirmDecisionsAs,
  grantManualCreditAs,
  listClosingRows,
  recomputeSnapshots,
} from "@/modules/permanence";
import { closeTermPoints } from "@/modules/terms";
import { tLabels, tList } from "@/shared/copy";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedManualCredit,
  seedMembership,
  seedOccasion,
  seedPerson,
  seedRule,
  seedTerm,
} from "../factories";
import { copyPattern } from "../helpers/copy";
import { drainOutbox } from "../helpers/outbox";
import { elements } from "../helpers/react-tree";
import { truncateAll } from "./db";

// El motivo que la pestaña de permanencia de la Persona 360 le muestra a GH junto a cada decisión
// confirmada del cierre (T-831), cuando GH confirmó la propuesta sin escribir motivo (DT-388).
// El cierre propone con su motivo automático, uno de los seis de T-801, y `confirmDecisions` lo guarda
// con la decisión: la pestaña muestra ese, cambien o no los hechos después de confirmar (DT-392). Va
// por el camino de verdad: el cierre propone, GH confirma con los comandos del
// módulo y la pantalla se monta entera contra Postgres; solo se reemplaza quién tiene la sesión.
//
// El motivo lo resuelve el dominio, con la misma regla con la que el cierre propone (ADR-128 regla 1).
// La pestaña lo armaba por su cuenta y no coincidía en tres casos: la salida por sanciones mostraba
// «no le queda un comité», y a un nuevo con la inducción pendiente le mostraba «faltó a una asamblea
// obligatoria», saliera por sanciones o por quedarse sin comité.

const session = vi.hoisted(() => ({ personId: "" }));

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
    requireAdminActor: () => Promise.resolve({ personId: session.personId, ip: null }),
  };
});

const { default: PersonaPage } = await import("@/app/admin/personas/[id]/page");
const { TabPermanencia } = await import("@/app/admin/personas/[id]/_ui/TabPermanencia");

const DECISIONS = ["CONTINUES", "PROBATION", "EXIT_COMMITTEE", "EXIT_OE"] as const;
type Decision = (typeof DECISIONS)[number];

const decisionLabels = tLabels("T-802", DECISIONS);
/** Los seis motivos automáticos del cierre, con el nombre de lo que dice cada uno. */
const [met, inBand, belowBand, noCommitteeLeft, lostAssembly, sanctions] = tList("T-801");
const [, , decisionsTitle] = tList("T-829");
/** ADMIN desde la Persona 360: declara su alcance, sin restricción de tipo ni de comité. */
const asAdmin = { by: "ADMIN" } as const;

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(text).join("");
  }
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : "";
}

/** Las líneas del bloque «Decisiones» de la pestaña, como las lee GH: primero el comité, al final la persona. */
async function decisionsShown(personId: string, termId: string): Promise<string[]> {
  const page = await PersonaPage({
    params: Promise.resolve({ id: personId }),
    searchParams: Promise.resolve({ pestana: "permanencia", semestre: termId }),
  });
  const tab = elements(page).find((element) => element.type === TabPermanencia);
  if (!tab) {
    throw new Error("la pantalla no montó la pestaña de permanencia");
  }
  const drawn = await TabPermanencia(tab.props as Parameters<typeof TabPermanencia>[0]);
  const block = elements(drawn).find((element) => element.props.titulo === decisionsTitle);
  return block
    ? elements(block)
        .filter((element) => element.type === "li")
        .map(text)
    : [];
}

/** Una línea de «Decisiones»: de quién es, qué se decidió y con qué motivo; quién y cuándo, lo que sea. */
function line(committee: string | null, decision: Decision, reason: string | undefined) {
  if (!reason) {
    throw new Error("a T-801 o al motivo escrito le falta el texto de esta línea");
  }
  const shown = copyPattern("T-831", { decisión: decisionLabels[decision], motivo: reason });
  return expect.stringMatching(
    new RegExp(`^${committee ? `${committee} · ` : ""}${shown.source}$`),
  );
}

/**
 * Un término ya vencido (2024-2), con el comité A3 y su tabla de 60 puntos por crédito manual, y una
 * asamblea ordinaria celebrada. Quien llega con `credit` 60 cumple, con 55 queda en la banda de prueba
 * y con 10 queda fuera de ella.
 */
async function setup() {
  const termId = await seedTerm("2024-2");
  const previous = await seedTerm("2024-1");
  const a3 = await seedCommittee("a3", "A3");
  const gh = await seedPerson("gh.motivos@eafit.edu.co");
  await seedMembership(gh, previous);
  session.personId = gh;
  const rule = await seedRule(termId, "eventos", {
    committeeId: a3,
    weight: 60,
    computation: "MANUAL",
    params: {},
  });
  const assembly = await seedOccasion(termId, {
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    points: 0,
    status: "CLOSED",
    startsAt: new Date("2024-09-10T22:00:00Z"),
    checkInOpensAt: new Date("2024-09-10T21:00:00Z"),
    checkInClosesAt: new Date("2024-09-10T23:00:00Z"),
  });
  const actor = { personId: gh, ip: null };

  /** Un miembro de A3; `since` es su término de ingreso: el del cierre lo hace nuevo, con inducción pendiente. */
  async function member(
    email: string,
    options: { credit: number; attends?: boolean; since?: string },
  ): Promise<string> {
    const personId = await seedPerson(email);
    await seedMembership(personId, options.since ?? previous);
    await seedCommitteeMembership(personId, a3, termId, "MIEMBRO", {
      joinedAt: new Date("2024-07-20T12:00:00Z"),
    });
    await seedManualCredit(termId, rule, personId, options.credit, {
      reason: "seed",
      grantedById: gh,
    });
    if (options.attends ?? true) {
      await seedCheckIn(assembly.id, personId);
    }
    return personId;
  }

  /**
   * Una falta grave más un llamado de atención, vivos al cierre: la advertencia de expulsión (Regl. art. 69).
   * Devuelve la falta grave, que es la que hay que revocar para que la advertencia se caiga.
   */
  async function sanction(personId: string): Promise<string> {
    const recorded: string[] = [];
    for (const [kind, occurredOn] of [
      ["MAJOR", "2024-10-01"],
      ["WARNING", "2024-10-20"],
    ] as const) {
      const { id } = await recordSanctionAs(
        actor,
        personId,
        { termId, kind, cause: "Sanción sembrada para el cierre de permanencia", occurredOn },
        asAdmin,
      );
      recorded.push(id);
    }
    return recorded[0] as string;
  }

  /** Los puntos del término quedan cerrados, que es lo que el cierre pide para confirmar decisiones. */
  async function closePoints(): Promise<void> {
    await recomputeSnapshots(termId);
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
  }

  /** Lo que el cierre le propone hoy a una persona, con el motivo que calculó el dominio. */
  async function proposalOf(personId: string) {
    const { rows } = await listClosingRows(termId);
    return rows.find((row) => row.personId === personId);
  }

  return { termId, a3, rule, actor, member, sanction, closePoints, proposalOf };
}

describe("el motivo de una decisión del cierre en la pestaña de permanencia de la Persona 360", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("sin motivo escrito, cada decisión de comité muestra el motivo de su propuesta: cumplió, quedó en la banda de prueba o fuera de ella", async () => {
    const { termId, actor, member, closePoints } = await setup();
    const meets = await member("cumple.motivos@eafit.edu.co", { credit: 60 });
    const onProbation = await member("prueba.motivos@eafit.edu.co", { credit: 55 });
    const below = await member("no-alcanza.motivos@eafit.edu.co", { credit: 10 });
    await closePoints();
    await confirmAllProposedAs(actor, termId);

    expect(await decisionsShown(meets, termId)).toEqual([
      line("A3", "CONTINUES", met),
      line(null, "CONTINUES", met),
    ]);
    expect(await decisionsShown(onProbation, termId)).toEqual([
      line("A3", "PROBATION", inBand),
      line(null, "CONTINUES", met),
    ]);
    // A quien no le queda un comité donde cumpla o esté en prueba, el cierre le propone salir de la OE.
    expect(await decisionsShown(below, termId)).toEqual([
      line("A3", "EXIT_COMMITTEE", belowBand),
      line(null, "EXIT_OE", noCommitteeLeft),
    ]);
  });

  it("a quien sale por faltar a una asamblea obligatoria celebrada le muestra ese motivo", async () => {
    const { termId, actor, member, closePoints, proposalOf } = await setup();
    const absent = await member("falto.motivos@eafit.edu.co", { credit: 60, attends: false });
    await closePoints();
    expect(await proposalOf(absent)).toMatchObject({
      personProposed: "EXIT_OE",
      personReason: 4,
      mandatoryMet: false,
    });
    await confirmAllProposedAs(actor, termId);

    expect(await decisionsShown(absent, termId)).toEqual([
      line("A3", "CONTINUES", met),
      line(null, "EXIT_OE", lostAssembly),
    ]);
  });

  it("a quien sale por una falta grave más otra sanción le muestra ese motivo, antes y después de aplicar el cierre", async () => {
    const { termId, actor, member, sanction, closePoints, proposalOf } = await setup();
    const warned = await member("sancionado.motivos@eafit.edu.co", { credit: 60 });
    await sanction(warned);
    await closePoints();
    // El cierre lo propone por las sanciones: cumple en su comité y no faltó a ninguna obligatoria.
    expect(await proposalOf(warned)).toMatchObject({
      personProposed: "EXIT_OE",
      personReason: 5,
      mandatoryMet: true,
    });
    await confirmAllProposedAs(actor, termId);

    const shown = [line("A3", "CONTINUES", met), line(null, "EXIT_OE", sanctions)];
    expect(await decisionsShown(warned, termId)).toEqual(shown);
    // Cerrado el término, la pestaña lee el resultado congelado.
    await closeTermPermanenceAs(actor, termId);
    expect(await decisionsShown(warned, termId)).toEqual(shown);
    // Y aplicado el cierre, que es trabajo del outbox y le da la baja, lo sigue mostrando.
    await drainOutbox();
    expect(await decisionsShown(warned, termId)).toEqual(shown);
  });

  it("a un nuevo que sale por sanciones le muestra ese motivo aunque tenga la inducción pendiente", async () => {
    const { termId, actor, member, sanction, closePoints, proposalOf } = await setup();
    const warned = await member("nuevo-sancionado.motivos@eafit.edu.co", {
      credit: 60,
      since: termId,
    });
    await sanction(warned);
    await closePoints();
    // Fue a la única asamblea que se celebró: lo que no tiene cumplido es la inducción, que nadie registró.
    expect(await proposalOf(warned)).toMatchObject({
      isNew: true,
      personProposed: "EXIT_OE",
      personReason: 5,
      mandatoryMet: false,
    });
    await confirmAllProposedAs(actor, termId);

    expect(await decisionsShown(warned, termId)).toEqual([
      line("A3", "EXIT_COMMITTEE", belowBand),
      line(null, "EXIT_OE", sanctions),
    ]);
  });

  it("a un nuevo que se queda sin comité le muestra ese motivo: la inducción pendiente no es una asamblea perdida", async () => {
    const { termId, actor, member, closePoints, proposalOf } = await setup();
    const below = await member("nuevo-sin-comite.motivos@eafit.edu.co", {
      credit: 10,
      since: termId,
    });
    await closePoints();
    // El cierre lo propone porque no le queda comité; la obligatoria no cumplida no es una perdida.
    expect(await proposalOf(below)).toMatchObject({
      isNew: true,
      personProposed: "EXIT_OE",
      personReason: 3,
      mandatoryMet: false,
    });
    await confirmAllProposedAs(actor, termId);

    expect(await decisionsShown(below, termId)).toEqual([
      line("A3", "EXIT_COMMITTEE", belowBand),
      line(null, "EXIT_OE", noCommitteeLeft),
    ]);
  });

  it("una decisión con motivo escrito muestra ese motivo en todas sus líneas, no el automático", async () => {
    const { termId, a3, actor, member, closePoints } = await setup();
    const below = await member("con-motivo.motivos@eafit.edu.co", { credit: 10 });
    await closePoints();
    const written = "Se queda en prueba: entregó su plan de mejora";
    await confirmDecisionsAs(actor, termId, {
      personId: below,
      person: "CONTINUES",
      committees: [{ committeeId: a3, decision: "PROBATION" }],
      reason: written,
    });

    expect(await decisionsShown(below, termId)).toEqual([
      line("A3", "PROBATION", written),
      line(null, "CONTINUES", written),
    ]);
  });

  it("si los hechos cambian después de confirmar, cada línea sigue mostrando el motivo de lo que se propuso y no el de lo que hoy se propondría", async () => {
    const { termId, rule, actor, member, closePoints, proposalOf } = await setup();
    const below = await member("credito-tardio.motivos@eafit.edu.co", { credit: 10 });
    await closePoints();
    await confirmAllProposedAs(actor, termId);
    // GH le reconoce después el crédito que le faltaba: hoy el cierre le propondría continuar.
    await grantManualCreditAs(actor, {
      ruleId: rule,
      personId: below,
      value: 60,
      reason: "Crédito reconocido después de confirmar",
    });
    await recomputeSnapshots(termId);
    expect(await proposalOf(below)).toMatchObject({
      personProposed: "CONTINUES",
      personReason: 0,
      drifted: true,
    });

    expect(await decisionsShown(below, termId)).toEqual([
      line("A3", "EXIT_COMMITTEE", belowBand),
      line(null, "EXIT_OE", noCommitteeLeft),
    ]);
  });

  it("si a un nuevo le ajustan el requisito después de confirmar su salida por una asamblea perdida, la línea sigue mostrando ese motivo, que se guardó con la decisión (DT-392)", async () => {
    const { termId, a3, actor, member, closePoints, proposalOf } = await setup();
    const absent = await member("nuevo-falto.motivos@eafit.edu.co", {
      credit: 60,
      attends: false,
      since: termId,
    });
    // Para que cumpla en A3 con el umbral de un nuevo: 40 puntos más por una segunda regla del comité.
    const extra = await seedRule(termId, "proyectos", {
      committeeId: a3,
      weight: 40,
      computation: "MANUAL",
      params: {},
    });
    await seedManualCredit(termId, extra, absent, 40, {
      reason: "seed",
      grantedById: actor.personId,
    });
    await closePoints();
    // Faltó a la única ordinaria celebrada: el cierre lo propone por esa asamblea, y le queda comité.
    expect(await proposalOf(absent)).toMatchObject({
      isNew: true,
      personProposed: "EXIT_OE",
      personReason: 4,
      mandatoryMet: false,
    });
    await confirmAllProposedAs(actor, termId);
    expect(await decisionsShown(absent, termId)).toEqual([
      line("A3", "CONTINUES", met),
      line(null, "EXIT_OE", lostAssembly),
    ]);

    // GH le ajusta el requisito: ya no se le exige ninguna ordinaria, y esa asamblea deja de estar perdida.
    await adjustRequirementAs(actor, {
      termId,
      personId: absent,
      requiredOrdinary: 0,
      requiresBoardElection: false,
      requiresRunoff: false,
      reason: "Ajuste del requisito después de confirmar",
    });
    await recomputeSnapshots(termId);
    // Hoy el cierre le propondría continuar; lo obligatorio sigue sin cumplir por la inducción pendiente.
    expect(await proposalOf(absent)).toMatchObject({
      personProposed: "CONTINUES",
      personReason: 0,
      mandatoryMet: false,
      drifted: true,
    });

    // La línea dice el motivo con que se propuso, que `confirmDecisions` guardó con la decisión. Sin
    // guardarlo, la lectura lo sacaba del resultado de hoy y decía «no le queda un comité», y comité
    // le queda (DT-392).
    expect(await decisionsShown(absent, termId)).toEqual([
      line("A3", "CONTINUES", met),
      line(null, "EXIT_OE", lostAssembly),
    ]);
  });

  it("si le revocan la falta grave después de confirmar su salida por sanciones, la línea sigue mostrando ese motivo (DT-392)", async () => {
    const { termId, actor, member, sanction, closePoints, proposalOf } = await setup();
    const warned = await member("revocada.motivos@eafit.edu.co", { credit: 60 });
    const major = await sanction(warned);
    await closePoints();
    expect(await proposalOf(warned)).toMatchObject({
      personProposed: "EXIT_OE",
      personReason: 5,
      mandatoryMet: true,
    });
    await confirmAllProposedAs(actor, termId);

    await revokeSanctionAs(
      actor,
      warned,
      major,
      "Descargos aceptados después de confirmar",
      asAdmin,
    );
    await recomputeSnapshots(termId);
    // Sin la falta grave no hay advertencia de expulsión: hoy el cierre le propondría continuar.
    expect(await proposalOf(warned)).toMatchObject({
      personProposed: "CONTINUES",
      personReason: 0,
      mandatoryMet: true,
      drifted: true,
    });

    expect(await decisionsShown(warned, termId)).toEqual([
      line("A3", "CONTINUES", met),
      line(null, "EXIT_OE", sanctions),
    ]);
  });
});
