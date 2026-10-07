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
import { accessGrant, credential } from "@/modules/identity/schema";
import { membership, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Salir de la OE también retira la credencial (ADR-030, ADR-051): un hash de contraseña no es
// historia institucional, y la anonimización existe justamente para no dejar datos personales.

const db = () => getDb();
const CLAVE = "trapecio verde 41";

async function seedMember(email: string): Promise<string> {
  let [current] = await db().select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  if (!current) {
    [current] = await db()
      .insert(term)
      .values({ code: "2026-2", semester: 2, startsOn: "2026-07-13", endsOn: "2026-12-05" })
      .returning({ id: term.id });
  }
  const [who] = await db()
    .insert(person)
    .values({ email, firstName: "Salida", lastName: "Sintética", stage: "MEMBER" })
    .returning({ id: person.id });
  if (!who || !current) throw new Error("seed");
  await db()
    .insert(membership)
    .values({ personId: who.id, status: "ACTIVE", firstTermId: current.id });
  await db()
    .insert(credential)
    .values({ personId: who.id, passwordHash: await hashPassword(CLAVE) });
  return who.id;
}

describe("retiro y anonimización retiran la credencial", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("la baja borra la contraseña, los enlaces vivos y las sesiones", async () => {
    const emisor = await seedMember("junta-limpieza@eafit.edu.co");
    const personId = await seedMember("se-va@eafit.edu.co");
    await issueAccessGrantAs({ personId: emisor }, { personId, kind: "RECOVERY" });
    const abierta = await createSession(db(), {
      personId,
      remember: true,
      userAgent: null,
      ip: null,
    });

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

    expect(await findPasswordHash(personId)).toBeNull();
    expect(await db().select().from(accessGrant).where(eq(accessGrant.personId, personId))).toEqual(
      [],
    );
    expect(await resolveActor(abierta.token)).toBeNull();
    // La credencial de quien sigue adentro no se toca.
    expect(await findPasswordHash(emisor)).not.toBeNull();
  });

  it("la anonimización no deja el hash de la contraseña atrás", async () => {
    const emisor = await seedMember("junta-limpieza@eafit.edu.co");
    const personId = await seedMember("se-borra@eafit.edu.co");
    await issueAccessGrantAs({ personId: emisor }, { personId, kind: "ACTIVATION" });

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
});
