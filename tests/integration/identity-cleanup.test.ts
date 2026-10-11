import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { membershipChanged, personAnonymized } from "@/domain-events/people";
import { issueAccessGrantAs } from "@/modules/identity/domain/access-grant";
import { findPasswordHash } from "@/modules/identity/domain/password";
import { hashPassword } from "@/modules/identity/domain/pure";
import { createSession, resolveActor } from "@/modules/identity/domain/session";
import { accessGrant, credential, session } from "@/modules/identity/schema";
import { endMembershipAs } from "@/modules/people";
import { seedMembership, seedPerson, seedTerm } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Salir de la OE también retira la credencial (ADR-030, ADR-051): un hash de contraseña no es
// historia institucional, y la anonimización existe justamente para no dejar datos personales.

const db = () => getDb();
const CLAVE = "trapecio verde 41";
const sessionRowsOf = (personId: string) =>
  db().select({ id: session.id }).from(session).where(eq(session.personId, personId));

async function seedMember(email: string): Promise<string> {
  const termId = await seedTerm("2026-2", { startsOn: "2026-07-13", endsOn: "2026-12-05" });
  const personId = await seedPerson(email, { firstName: "Salida" });
  await seedMembership(personId, termId);
  await db()
    .insert(credential)
    .values({ personId, passwordHash: await hashPassword(CLAVE) });
  return personId;
}

describe("retiro y anonimización retiran la credencial", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("la baja borra la contraseña, los enlaces vivos y las sesiones", async () => {
    const emisor = await seedMember("junta-limpieza@eafit.edu.co");
    const personId = await seedMember("se-va@eafit.edu.co");
    await issueAccessGrantAs({ personId: emisor, ip: null }, { personId, kind: "RECOVERY" });
    const abierta = await createSession(db(), {
      personId,
      remember: true,
      userAgent: null,
      ip: null,
    });

    // Una baja de verdad: el handler vuelve a leer la membresía y un evento suelto, con la persona
    // todavía activa, ya no borra nada (ADR-118 regla 5).
    await endMembershipAs({ personId: emisor, ip: null }, personId, {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    });
    // La baja corta el acceso en su propia transacción (ADR-034): la sesión deja de valer antes de
    // que el evento se entregue, pero su fila sigue en la tabla. Borrarla es del handler, y por eso
    // se afirma sobre la tabla: `resolveActor` da `null` aunque el handler no borre nada.
    expect(await resolveActor(abierta.token)).toBeNull();
    expect(await sessionRowsOf(personId)).toHaveLength(1);
    await drainOutbox();

    expect(await findPasswordHash(personId)).toBeNull();
    expect(await db().select().from(accessGrant).where(eq(accessGrant.personId, personId))).toEqual(
      [],
    );
    expect(await sessionRowsOf(personId)).toEqual([]);
    // La credencial de quien sigue adentro no se toca.
    expect(await findPasswordHash(emisor)).not.toBeNull();
  });

  it("la anonimización no deja el hash de la contraseña atrás", async () => {
    const emisor = await seedMember("junta-limpieza@eafit.edu.co");
    const personId = await seedMember("se-borra@eafit.edu.co");
    await issueAccessGrantAs({ personId: emisor, ip: null }, { personId, kind: "ACTIVATION" });

    await enqueueEvent(db(), eventOf(personAnonymized, { actorId: null, personId }));
    await drainOutbox();

    expect(await findPasswordHash(personId)).toBeNull();
    expect(await db().select().from(accessGrant).where(eq(accessGrant.personId, personId))).toEqual(
      [],
    );
  });

  it("una licencia no toca la credencial: la persona vuelve", async () => {
    const personId = await seedMember("en-licencia@eafit.edu.co");

    await enqueueEvent(
      db(),
      eventOf(membershipChanged, {
        actorId: null,
        personId,
        from: "ACTIVE",
        to: "ON_LEAVE",
        reason: null,
      }),
    );
    await drainOutbox();

    expect(await findPasswordHash(personId)).not.toBeNull();
  });

  it("un cambio a un estado sin ingreso le cierra la sesión a quien no tiene membresía: sin estado que releer, se cierra", async () => {
    // Alguien con sesión y sin fila de membresía: el handler no tiene con qué comprobar que hoy puede
    // entrar, y ante la duda no conserva la sesión (ADR-118 regla 5).
    const personId = await seedPerson("sin-membresia@eafit.edu.co", {
      firstName: "Sesión",
      stage: "PROSPECT",
    });
    await createSession(db(), { personId, remember: true, userAgent: null, ip: null });
    expect(await sessionRowsOf(personId)).toHaveLength(1);

    await enqueueEvent(
      db(),
      eventOf(membershipChanged, {
        actorId: null,
        personId,
        from: "ACTIVE",
        to: "INACTIVE",
        reason: null,
      }),
    );
    await drainOutbox();

    expect(await sessionRowsOf(personId)).toEqual([]);
  });
});
