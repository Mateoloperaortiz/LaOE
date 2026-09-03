import { eq, like } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { otpChallenge, permission } from "@/modules/identity/schema";
import { term } from "@/modules/participation/schema";
import { committee, membership, person } from "@/modules/people/schema";

// Persona sintética para las pruebas e2e; se recrea en cada corrida, nunca es una persona real.
export const E2E_EMAIL = "prueba.e2e@eafit.edu.co";

export default async function globalSetup(): Promise<void> {
  const db = getDb();
  let [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  if (!current) {
    [current] = await db
      .insert(term)
      .values({ code: "2026-2", semester: 2, startsOn: "2026-07-13", endsOn: "2026-12-05" })
      .returning({ id: term.id });
  }
  if (!current) {
    throw new Error("sin término");
  }
  let [who] = await db.select({ id: person.id }).from(person).where(eq(person.email, E2E_EMAIL));
  if (!who) {
    [who] = await db
      .insert(person)
      .values({
        email: E2E_EMAIL,
        firstName: "Prueba",
        lastName: "E2E",
        stage: "MEMBER",
        source: "E2E",
      })
      .returning({ id: person.id });
  }
  if (!who) {
    throw new Error("sin persona");
  }
  await db
    .insert(membership)
    .values({ personId: who.id, status: "ACTIVE", firstTermId: current.id })
    .onConflictDoNothing({ target: membership.personId });
  // La persona de e2e es ADMIN para probar el admin; BOARD lo prueba la suite y se limpia aquí.
  await db.delete(permission).where(eq(permission.personId, who.id));
  await db.insert(permission).values({ personId: who.id, code: "ADMIN" });
  // Los límites de OTP por correo (5 cada 15 minutos) no deben depender de corridas anteriores.
  await db.delete(otpChallenge).where(eq(otpChallenge.email, E2E_EMAIL));
  // Comités creados por corridas anteriores de la suite.
  await db.delete(committee).where(like(committee.slug, "e2e-%"));
  await closeDb();
}
