import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { pruneIdentity } from "@/modules/identity/domain/maintenance";
import { hashToken } from "@/modules/identity/domain/pure";
import { accessGrant, loginAttempt, session } from "@/modules/identity/schema";
import { seedMembership, seedPerson, seedTerm } from "../factories";
import { truncateAll } from "./db";

// La depuración diaria también limpia lo que ADR-051 agrega: intentos de ingreso y enlaces que ya
// no pueden servir. Lo que se conserva de un enlace vive en la auditoría, no en su fila.

const db = () => getDb();
const DAY = 24 * 60 * 60_000;

async function seedMember(email: string): Promise<string> {
  const termId = await seedTerm("2026-2", { startsOn: "2026-07-13", endsOn: "2026-12-05" });
  const personId = await seedPerson(email);
  await seedMembership(personId, termId);
  return personId;
}

describe("pruneIdentity", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("borra los intentos viejos y conserva los de la ventana", async () => {
    const ahora = new Date();
    await db()
      .insert(loginAttempt)
      .values([
        {
          email: "viejo@eafit.edu.co",
          ip: "1.1.1.1",
          createdAt: new Date(ahora.getTime() - 2 * DAY),
        },
        {
          email: "nuevo@eafit.edu.co",
          ip: "1.1.1.1",
          createdAt: new Date(ahora.getTime() - 60_000),
        },
      ]);

    const result = await pruneIdentity(ahora);

    expect(result.attempts).toBe(1);
    const quedan = await db().select({ email: loginAttempt.email }).from(loginAttempt);
    expect(quedan.map((row) => row.email)).toEqual(["nuevo@eafit.edu.co"]);
  });

  it("borra los enlaces vencidos y los consumidos hace más de un día, no el que sigue vivo", async () => {
    const ahora = new Date();
    const personId = await seedMember("enlaces@eafit.edu.co");
    await db()
      .insert(accessGrant)
      .values([
        {
          personId,
          kind: "ACTIVATION",
          tokenHash: hashToken("vencido"),
          expiresAt: new Date(ahora.getTime() - 2 * DAY),
        },
        {
          personId,
          kind: "RECOVERY",
          tokenHash: hashToken("consumido"),
          expiresAt: new Date(ahora.getTime() + 30 * 60_000),
          consumedAt: new Date(ahora.getTime() - 2 * DAY),
        },
        {
          personId,
          kind: "RECOVERY",
          tokenHash: hashToken("vivo"),
          expiresAt: new Date(ahora.getTime() + 30 * 60_000),
        },
      ]);

    const result = await pruneIdentity(ahora);

    expect(result.grants).toBe(2);
    const quedan = await db().select({ tokenHash: accessGrant.tokenHash }).from(accessGrant);
    expect(quedan.map((row) => row.tokenHash)).toEqual([hashToken("vivo")]);
  });

  it("sigue borrando las sesiones vencidas", async () => {
    const ahora = new Date();
    const personId = await seedMember("sesiones@eafit.edu.co");
    await db()
      .insert(session)
      .values([
        {
          personId,
          tokenHash: hashToken("vieja"),
          expiresAt: new Date(ahora.getTime() - 60_000),
          otpVerifiedAt: ahora,
        },
        {
          personId,
          tokenHash: hashToken("viva"),
          expiresAt: new Date(ahora.getTime() + DAY),
          otpVerifiedAt: ahora,
        },
      ]);

    const result = await pruneIdentity(ahora);

    expect(result.sessions).toBe(1);
    const [quedan] = await db()
      .select({ tokenHash: session.tokenHash })
      .from(session)
      .where(eq(session.personId, personId));
    expect(quedan?.tokenHash).toBe(hashToken("viva"));
  });
});
