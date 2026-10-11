import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import type { Tx } from "@/db/tx";
import { createRequestAs, decideRequestAs } from "@/modules/crm";
import {
  addCommitteeMemberAs,
  anonymizePersonAs,
  endMembershipAs,
  reactivateMembershipAs,
  requestDeletionAs,
  setCommitteeMembershipsAs,
  setRepresentativeAs,
} from "@/modules/people";
import { anonymizePerson } from "@/modules/people/domain/membership";
import {
  committeeMembership,
  committeeRepresentative,
  membership,
  person,
} from "@/modules/people/schema";
import { t } from "@/shared/copy";
import {
  firstThenSecond,
  type Held,
  holdCommand,
  holdTransaction,
  outcome,
  waitingOn,
} from "../helpers/locks";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedTerm,
  seedVeteran,
} from "./factories";

// ADR-123 regla 6: los tres comandos que le cambian los comités a una persona por su propia puerta
// toman el consultivo del ciclo de membresía, `wallet-member:<persona>`, antes que la fila de su
// membresía. Tomaban solo la fila y después escribían una pertenencia, que referencia la fila de
// `person`; `anonymizePerson` toma `person` y después la membresía, y las dos se quedaban esperándose
// (DT-328). `reactivateMembership` con correo nuevo va al revés que la anonimización, membresía y
// después `person`: por eso el remedio es el consultivo y no tomar antes la fila de `person`.
//
// El cuarto es nombrar a la persona representante de su comité (DT-341): tomaba la membresía con
// `for share` y después escribía la representación, que también referencia la fila de `person`.

const db = () => getDb();

const EMAIL = "prueba.cruce@eafit.edu.co";
const ADMIN = { isAdmin: true, allCapabilities: true };
const BAJA = { endReason: "RESIGNATION", memorialConsent: false, contactConsent: false } as const;

/** Mila, veterana y en A3, con un cambio de comité pedido y sin decidir: quiere sumar CIGMA. */
async function escenario() {
  const termId = await seedTerm();
  const a3 = await seedCommittee("a3", "A3");
  const pixel = await seedCommittee("pixel", "PIXEL");
  const cigma = await seedCommittee("cigma", "CIGMA");
  const gh = { personId: await seedMember("gh.cruce@eafit.edu.co"), ip: null };
  const persona = await seedVeteran(EMAIL, { firstName: "Mila", lastName: "Miembro" });
  await seedCommitteeMembership(persona, a3, termId);
  const { id: requestId } = await createRequestAs({ personId: persona, ip: null }, "TRANSFER", {
    reason: "Quiero sumar un comité",
    leaveCommitteeIds: [],
    joinCommitteeIds: [cigma],
  });
  return { termId, a3, pixel, cigma, gh, persona, requestId };
}

type Escenario = Awaited<ReturnType<typeof escenario>>;

interface Caso {
  nombre: string;
  run: (s: Escenario) => Promise<unknown>;
  /**
   * Lo que, retenido por otro, detiene al comando con la fila de la membresía ya tomada y antes de
   * escribir lo que referencia la fila de `person`.
   */
  seDetieneEn: (tx: Tx, s: Escenario) => Promise<unknown>;
  /** Qué responde si llega cuando la persona ya fue anonimizada, y con eso dada de baja. */
  deBaja: string;
  /** Qué responde si llega detrás de la reactivación de quien estaba de baja. */
  reactivada: string;
}

/** El consultivo de las inhabilidades, que los tres cambios de comités piden después de la membresía. */
const enLasInhabilidades = (tx: Tx, s: Escenario) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`leadership:${s.persona}`}, 0))`);

/** La pertenencia a A3, que el nombramiento lee bajo candado después de la membresía. */
const enSuPertenencia = (tx: Tx, s: Escenario) =>
  tx
    .select({ id: committeeMembership.id })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, s.persona),
        eq(committeeMembership.committeeId, s.a3),
        eq(committeeMembership.termId, s.termId),
      ),
    )
    .for("update");

const CASOS: Caso[] = [
  {
    nombre: "el «Agregar» de la dirección de un comité",
    run: (s) =>
      addCommitteeMemberAs(s.gh, { committeeId: s.pixel, termId: s.termId }, ADMIN, {
        personId: s.persona,
        roles: [],
      }),
    seDetieneEn: enLasInhabilidades,
    // A quien ya fue anonimizado el «Agregar» no lo encuentra: no llega a mirar su estado.
    deBaja: t("T-032"),
    reactivada: "ok",
  },
  {
    nombre: "el cambio de comités desde la Persona 360",
    run: (s) =>
      setCommitteeMembershipsAs(s.gh, s.persona, s.termId, [
        { committeeId: s.a3 },
        { committeeId: s.pixel },
      ]),
    seDetieneEn: enLasInhabilidades,
    deBaja: t("T-3246"),
    reactivada: "ok",
  },
  {
    nombre: "la aprobación de un cambio de comité",
    run: (s) => decideRequestAs(s.gh, s.requestId, { decision: "APPROVED" }),
    seDetieneEn: enLasInhabilidades,
    deBaja: t("T-3246"),
    reactivada: "ok",
  },
  {
    nombre: "el nombramiento como representante de su comité",
    run: (s) =>
      setRepresentativeAs(s.gh, {
        committeeId: s.a3,
        termId: s.termId,
        role: "TITULAR",
        personId: s.persona,
      }),
    seDetieneEn: enSuPertenencia,
    // Quien no está activa no es elegible, y a quien vuelve de una baja no le queda pertenencia: la
    // baja las cerró y la reactivación no las reabre. En los dos casos hace cola y después se niega.
    deBaja: t("T-2255"),
    reactivada: t("T-2255"),
  },
];

async function comoQuedo(personId: string) {
  const [row] = await db()
    .select({ anonymizedAt: person.anonymizedAt, status: membership.status })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(eq(person.id, personId));
  const vivas = await db()
    .select({ id: committeeMembership.id })
    .from(committeeMembership)
    .where(and(eq(committeeMembership.personId, personId), isNull(committeeMembership.leftAt)));
  const representa = await db()
    .select({ id: committeeRepresentative.id })
    .from(committeeRepresentative)
    .where(eq(committeeRepresentative.personId, personId));
  return {
    anonimizada: row?.anonymizedAt != null,
    estado: row?.status,
    vivas: vivas.length,
    representa: representa.length,
  };
}

/** Anonimizada y de baja: sin pertenencia viva y sin representar a ningún comité. */
const ANONIMIZADA = { anonimizada: true, estado: "INACTIVE", vivas: 0, representa: 0 };

/** Lanza `command` detrás de lo retenido, espera a que haga cola, suelta y dice cómo terminó. */
async function detrasDe(held: Held, command: () => Promise<unknown>): Promise<string> {
  const running = Promise.allSettled([command()]);
  try {
    await expect.poll(() => waitingOn(held.pid)).toBe(1);
  } finally {
    held.release();
    await held.done;
  }
  const [result] = await running;
  return result ? outcome(result) : "no corrió";
}

describe.each(CASOS)("$nombre y el ciclo de membresía de la misma persona", ({
  run,
  seDetieneEn,
  deBaja,
  reactivada,
}) => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("si anonimizan a la persona cuando el comando ya tomó su membresía, la anonimización hace cola y los dos terminan, sin interbloqueo", async () => {
    const s = await escenario();
    await requestDeletionAs({ personId: s.persona, ip: null });
    // El comando ya tomó la fila de la membresía y se detiene antes de escribir la pertenencia o la
    // representación, que es lo que referencia la fila de `person`.
    const held = await holdTransaction((tx) => seDetieneEn(tx, s));

    const [changed, anonymized] = await firstThenSecond(
      held,
      () => run(s),
      () => anonymizePersonAs(s.gh, s.persona),
    );

    expect([outcome(changed), outcome(anonymized)]).toEqual(["ok", "ok"]);
    // La anonimización entró después: cierra también la pertenencia recién escrita y retira la
    // representación recién nombrada.
    expect(await comoQuedo(s.persona)).toEqual(ANONIMIZADA);
  });

  it("si la anonimización ya está escrita, el comando hace cola y después se niega, sin escribir", async () => {
    const s = await escenario();
    await requestDeletionAs({ personId: s.persona, ip: null });
    const held = await holdCommand(s.gh, (ctx) => anonymizePerson(ctx, s.persona));

    expect(await detrasDe(held, () => run(s))).toBe(deBaja);
    expect(await comoQuedo(s.persona)).toEqual(ANONIMIZADA);
  });

  it("si reactivan a la persona con correo nuevo y la reactivación ya tomó su membresía, el comando hace cola y los dos terminan, sin interbloqueo", async () => {
    const s = await escenario();
    await endMembershipAs(s.gh, s.persona, BAJA);
    // La reactivación ya tomó la fila de la membresía y se detiene al escribir el correo: cambiar una
    // columna única pide la fila de `person` entera, y alguien la retiene compartida. Un comando que
    // tomara `person` con `for key share` antes que la membresía la conseguiría acá, y los dos se
    // quedarían esperándose (ADR-122 regla 4).
    const held = await holdTransaction((tx) =>
      tx.select({ id: person.id }).from(person).where(eq(person.id, s.persona)).for("key share"),
    );

    const [reactivated, changed] = await firstThenSecond(
      held,
      () => reactivateMembershipAs(s.gh, s.persona, { email: "prueba.vuelve@eafit.edu.co" }),
      () => run(s),
    );

    expect([outcome(reactivated), outcome(changed)]).toEqual(["ok", reactivada]);
    expect(await comoQuedo(s.persona)).toMatchObject({ anonimizada: false, estado: "ACTIVE" });
  });
});
