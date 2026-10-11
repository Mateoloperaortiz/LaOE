import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { createRequestAs, decideRequestAs } from "@/modules/crm";
import {
  addCommitteeMemberAs,
  anonymizePersonAs,
  endMembershipAs,
  reactivateMembershipAs,
  requestDeletionAs,
  setCommitteeMembershipsAs,
} from "@/modules/people";
import { anonymizePerson } from "@/modules/people/domain/membership";
import { committeeMembership, membership, person } from "@/modules/people/schema";
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
  /** Qué responde si llega cuando la persona ya fue anonimizada, y con eso dada de baja. */
  deBaja: string;
}

const CASOS: Caso[] = [
  {
    nombre: "el «Agregar» de la dirección de un comité",
    run: (s) =>
      addCommitteeMemberAs(s.gh, { committeeId: s.pixel, termId: s.termId }, ADMIN, {
        personId: s.persona,
        roles: [],
      }),
    // A quien ya fue anonimizado el «Agregar» no lo encuentra: no llega a mirar su estado.
    deBaja: t("T-032"),
  },
  {
    nombre: "el cambio de comités desde la Persona 360",
    run: (s) =>
      setCommitteeMembershipsAs(s.gh, s.persona, s.termId, [
        { committeeId: s.a3 },
        { committeeId: s.pixel },
      ]),
    deBaja: t("T-3246"),
  },
  {
    nombre: "la aprobación de un cambio de comité",
    run: (s) => decideRequestAs(s.gh, s.requestId, { decision: "APPROVED" }),
    deBaja: t("T-3246"),
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
  return { anonimizada: row?.anonymizedAt != null, estado: row?.status, vivas: vivas.length };
}

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

describe.each(CASOS)("$nombre y el ciclo de membresía de la misma persona", ({ run, deBaja }) => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("si anonimizan a la persona cuando el comando ya tomó su membresía, la anonimización hace cola y los dos terminan, sin interbloqueo", async () => {
    const s = await escenario();
    await requestDeletionAs({ personId: s.persona, ip: null });
    // El comando ya tomó la fila de la membresía y se detiene en el consultivo de las inhabilidades,
    // antes de escribir la pertenencia, que es lo que referencia la fila de `person`.
    const held = await holdTransaction((tx) =>
      tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`leadership:${s.persona}`}, 0))`,
      ),
    );

    const [changed, anonymized] = await firstThenSecond(
      held,
      () => run(s),
      () => anonymizePersonAs(s.gh, s.persona),
    );

    expect([outcome(changed), outcome(anonymized)]).toEqual(["ok", "ok"]);
    // La anonimización entró después: cierra también la pertenencia recién escrita.
    expect(await comoQuedo(s.persona)).toEqual({ anonimizada: true, estado: "INACTIVE", vivas: 0 });
  });

  it("si la anonimización ya está escrita, el comando hace cola y después se niega, sin escribir", async () => {
    const s = await escenario();
    await requestDeletionAs({ personId: s.persona, ip: null });
    const held = await holdCommand(s.gh, (ctx) => anonymizePerson(ctx, s.persona));

    expect(await detrasDe(held, () => run(s))).toBe(deBaja);
    expect(await comoQuedo(s.persona)).toEqual({ anonimizada: true, estado: "INACTIVE", vivas: 0 });
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

    expect([outcome(reactivated), outcome(changed)]).toEqual(["ok", "ok"]);
    expect(await comoQuedo(s.persona)).toMatchObject({ anonimizada: false, estado: "ACTIVE" });
  });
});
