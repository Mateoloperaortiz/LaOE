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
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedTerm,
  seedVeteran,
} from "../factories";
import {
  firstThenSecond,
  type Held,
  holdCommand,
  holdTransaction,
  outcome,
  waitingOn,
} from "../helpers/locks";
import { truncateAll } from "./db";

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
const RESIGNED = {
  endReason: "RESIGNATION",
  memorialConsent: false,
  contactConsent: false,
} as const;

/** Mila, veterana y en A3, con un cambio de comité pedido y sin decidir: quiere sumar CIGMA. */
async function scenario() {
  const termId = await seedTerm();
  const a3 = await seedCommittee("a3", "A3");
  const pixel = await seedCommittee("pixel", "PIXEL");
  const cigma = await seedCommittee("cigma", "CIGMA");
  const gh = { personId: await seedMember("gh.cruce@eafit.edu.co"), ip: null };
  const member = await seedVeteran(EMAIL, { firstName: "Mila", lastName: "Miembro" });
  await seedCommitteeMembership(member, a3, termId);
  const { id: requestId } = await createRequestAs({ personId: member, ip: null }, "TRANSFER", {
    reason: "Quiero sumar un comité",
    leaveCommitteeIds: [],
    joinCommitteeIds: [cigma],
  });
  return { termId, a3, pixel, cigma, gh, member, requestId };
}

type Scenario = Awaited<ReturnType<typeof scenario>>;

interface Case {
  name: string;
  run: (s: Scenario) => Promise<unknown>;
  /**
   * Lo que, retenido por otro, detiene al comando con la fila de la membresía ya tomada y antes de
   * escribir lo que referencia la fila de `person`.
   */
  stopsAt: (tx: Tx, s: Scenario) => Promise<unknown>;
  /** Qué responde si llega cuando la persona ya fue anonimizada, y con eso dada de baja. */
  whenAnonymized: string;
  /** Qué responde si llega detrás de la reactivación de quien estaba de baja. */
  whenReactivated: string;
  /** Qué responde si llega con la persona de baja y sin anonimizar. */
  whenInactive: string;
}

/** El consultivo de las inhabilidades, que los tres cambios de comités piden después de la membresía. */
const atLeadershipLock = (tx: Tx, s: Scenario) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`leadership:${s.member}`}, 0))`);

/** La pertenencia a A3, que el nombramiento lee bajo candado después de la membresía. */
const atOwnCommitteeMembership = (tx: Tx, s: Scenario) =>
  tx
    .select({ id: committeeMembership.id })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, s.member),
        eq(committeeMembership.committeeId, s.a3),
        eq(committeeMembership.termId, s.termId),
      ),
    )
    .for("update");

const CASES: Case[] = [
  {
    name: "el «Agregar» de la dirección de un comité",
    run: (s) =>
      addCommitteeMemberAs(s.gh, { committeeId: s.pixel, termId: s.termId }, ADMIN, {
        personId: s.member,
        roles: [],
      }),
    stopsAt: atLeadershipLock,
    // A quien ya fue anonimizado el «Agregar» no lo encuentra: no llega a mirar su estado.
    whenAnonymized: t("T-032"),
    whenReactivated: "ok",
    whenInactive: t("T-2164"),
  },
  {
    name: "el cambio de comités desde la Persona 360",
    run: (s) =>
      setCommitteeMembershipsAs(s.gh, s.member, s.termId, [
        { committeeId: s.a3 },
        { committeeId: s.pixel },
      ]),
    stopsAt: atLeadershipLock,
    whenAnonymized: t("T-3246"),
    whenReactivated: "ok",
    whenInactive: t("T-3246"),
  },
  {
    name: "la aprobación de un cambio de comité",
    run: (s) => decideRequestAs(s.gh, s.requestId, { decision: "APPROVED" }),
    stopsAt: atLeadershipLock,
    whenAnonymized: t("T-3246"),
    whenReactivated: "ok",
    whenInactive: t("T-3246"),
  },
  {
    name: "el nombramiento como representante de su comité",
    run: (s) =>
      setRepresentativeAs(s.gh, {
        committeeId: s.a3,
        termId: s.termId,
        role: "TITULAR",
        personId: s.member,
      }),
    stopsAt: atOwnCommitteeMembership,
    // Quien no está activa no es elegible, y a quien vuelve de una baja no le queda pertenencia: la
    // baja las cerró y la reactivación no las reabre. En los dos casos hace cola y después se niega.
    whenAnonymized: t("T-2255"),
    whenReactivated: t("T-2255"),
    whenInactive: t("T-2255"),
  },
];

async function stateOf(personId: string) {
  const [row] = await db()
    .select({ anonymizedAt: person.anonymizedAt, status: membership.status })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(eq(person.id, personId));
  const open = await db()
    .select({ id: committeeMembership.id })
    .from(committeeMembership)
    .where(and(eq(committeeMembership.personId, personId), isNull(committeeMembership.leftAt)));
  const representing = await db()
    .select({ id: committeeRepresentative.id })
    .from(committeeRepresentative)
    .where(eq(committeeRepresentative.personId, personId));
  return {
    anonymized: row?.anonymizedAt != null,
    status: row?.status,
    open: open.length,
    representing: representing.length,
  };
}

/** Anonimizada y de baja: sin pertenencia viva y sin representar a ningún comité. */
const ANONYMIZED = { anonymized: true, status: "INACTIVE", open: 0, representing: 0 };

/** Lanza `command` detrás de lo retenido, espera a que haga cola, suelta y dice cómo terminó. */
async function behind(held: Held, command: () => Promise<unknown>): Promise<string> {
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

describe.each(CASES)("$name y el ciclo de membresía de la misma persona", ({
  run,
  stopsAt,
  whenAnonymized,
  whenReactivated,
  whenInactive,
}) => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("si anonimizan a la persona cuando el comando ya tomó su membresía, la anonimización hace cola y los dos terminan, sin interbloqueo", async () => {
    const s = await scenario();
    await requestDeletionAs({ personId: s.member, ip: null });
    // El comando ya tomó la fila de la membresía y se detiene antes de escribir la pertenencia o la
    // representación, que es lo que referencia la fila de `person`.
    const held = await holdTransaction((tx) => stopsAt(tx, s));

    const [changed, anonymized] = await firstThenSecond(
      held,
      () => run(s),
      () => anonymizePersonAs(s.gh, s.member),
    );

    expect([outcome(changed), outcome(anonymized)]).toEqual(["ok", "ok"]);
    // La anonimización entró después: cierra también la pertenencia recién escrita y retira la
    // representación recién nombrada.
    expect(await stateOf(s.member)).toEqual(ANONYMIZED);
  });

  it("si la anonimización ya está escrita, el comando hace cola y después se niega, sin escribir", async () => {
    const s = await scenario();
    await requestDeletionAs({ personId: s.member, ip: null });
    const held = await holdCommand(s.gh, (ctx) => anonymizePerson(ctx, s.member));

    expect(await behind(held, () => run(s))).toBe(whenAnonymized);
    expect(await stateOf(s.member)).toEqual(ANONYMIZED);
  });

  it("si reactivan a la persona con correo nuevo y la reactivación ya tomó su membresía, el comando hace cola y los dos terminan, sin interbloqueo", async () => {
    const s = await scenario();
    await endMembershipAs(s.gh, s.member, RESIGNED);
    // La reactivación ya tomó la fila de la membresía y se detiene al escribir el correo: cambiar una
    // columna única pide la fila de `person` entera, y alguien la retiene compartida. Un comando que
    // tomara `person` con `for key share` antes que la membresía la conseguiría acá, y los dos se
    // quedarían esperándose (ADR-122 regla 4).
    const held = await holdTransaction((tx) =>
      tx.select({ id: person.id }).from(person).where(eq(person.id, s.member)).for("key share"),
    );

    const [reactivated, changed] = await firstThenSecond(
      held,
      () => reactivateMembershipAs(s.gh, s.member, { email: "prueba.vuelve@eafit.edu.co" }),
      () => run(s),
    );

    expect([outcome(reactivated), outcome(changed)]).toEqual(["ok", whenReactivated]);
    expect(await stateOf(s.member)).toMatchObject({ anonymized: false, status: "ACTIVE" });
  });

  it("si la reactivación con correo nuevo llega cuando el comando ya tomó el consultivo de la persona, hace cola y los dos terminan: con ella de baja el comando se niega, sin escribir", async () => {
    const s = await scenario();
    await endMembershipAs(s.gh, s.member, RESIGNED);
    // El orden inverso al del caso anterior. Reactivar pide a la persona de baja, y con ella de baja
    // el comando se niega apenas lee la membresía, antes de escribir lo que referencia la fila de
    // `person`: no hay dónde detenerlo con la membresía tomada y a punto de escribir. Se detiene un
    // paso antes, en la fila de la membresía, que retiene otro, y con el consultivo ya suyo.
    const held = await holdTransaction((tx) =>
      tx
        .select({ id: membership.id })
        .from(membership)
        .where(eq(membership.personId, s.member))
        .for("update"),
    );

    const [changed, reactivated] = await firstThenSecond(
      held,
      () => run(s),
      () => reactivateMembershipAs(s.gh, s.member, { email: "prueba.vuelve@eafit.edu.co" }),
    );

    expect([outcome(changed), outcome(reactivated)]).toEqual([whenInactive, "ok"]);
    // La baja cerró su pertenencia, reactivar no la reabre y el comando no escribió ninguna.
    expect(await stateOf(s.member)).toEqual({
      anonymized: false,
      status: "ACTIVE",
      open: 0,
      representing: 0,
    });
  });
});
