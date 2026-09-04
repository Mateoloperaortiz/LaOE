import { and, asc, eq, like, notLike } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { announcement, document, mediaAsset } from "@/modules/content/schema";
import { task } from "@/modules/crm/schema";
import { eventEdition } from "@/modules/events/schema";
import { otpChallenge, permission } from "@/modules/identity/schema";
import {
  committee,
  committeeMembership,
  consent,
  membership,
  membershipEvent,
  person,
  segment,
} from "@/modules/people/schema";
import { importJob } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";

// Persona sintética para las pruebas e2e; se recrea en cada corrida, nunca es una persona real.
export const E2E_EMAIL = "prueba.e2e@eafit.edu.co";
/** Segunda identidad: un miembro activo sin permisos, para Mi OE (ADR-034). */
export const E2E_MEMBER_EMAIL = "prueba.miembro@eafit.edu.co";

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
  // La suite cambia su estado desde la Persona 360: vuelve a activo en cada corrida.
  await db
    .update(membership)
    .set({ status: "ACTIVE", endedAt: null, endReason: null })
    .where(eq(membership.personId, who.id));
  await db.update(person).set({ stage: "MEMBER" }).where(eq(person.id, who.id));
  const [own] = await db
    .select({ id: membership.id })
    .from(membership)
    .where(eq(membership.personId, who.id));
  if (own) {
    await db.delete(membershipEvent).where(eq(membershipEvent.membershipId, own.id));
  }
  // Personas creadas por la suite (alta manual desde el admin).
  await db.delete(person).where(like(person.email, "e2e-%"));
  await db.delete(segment).where(like(segment.name, "e2e-%"));
  await db.delete(importJob).where(like(importJob.filename, "roster-e2e%"));
  // La persona de e2e es ADMIN para probar el admin; BOARD lo prueba la suite y se limpia aquí.
  await db.delete(permission).where(eq(permission.personId, who.id));
  await db.insert(permission).values({ personId: who.id, code: "ADMIN" });
  // Los límites de OTP por correo (5 cada 15 minutos) no deben depender de corridas anteriores.
  await db.delete(otpChallenge).where(eq(otpChallenge.email, E2E_EMAIL));
  // Comités y anuncios creados por corridas anteriores de la suite.
  await db.delete(committee).where(like(committee.slug, "e2e-%"));
  await db.delete(announcement).where(like(announcement.title, "e2e-%"));
  await db.delete(eventEdition).where(like(eventEdition.slug, "e2e-%"));
  await db.delete(mediaAsset).where(like(mediaAsset.originalFilename, "e2e-%"));
  await db.delete(document).where(like(document.title, "e2e-%"));
  // Miembro sin permisos: activo, en un comité del término, sin datos de contacto ni consentimientos.
  let [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!member) {
    [member] = await db
      .insert(person)
      .values({
        email: E2E_MEMBER_EMAIL,
        firstName: "Miembro",
        lastName: "E2E",
        stage: "MEMBER",
        source: "E2E",
      })
      .returning({ id: person.id });
  }
  if (!member) {
    throw new Error("sin miembro");
  }
  await db
    .insert(membership)
    .values({ personId: member.id, status: "ACTIVE", firstTermId: current.id })
    .onConflictDoNothing({ target: membership.personId });
  await db
    .update(membership)
    .set({ status: "ACTIVE", endedAt: null, endReason: null })
    .where(eq(membership.personId, member.id));
  await db
    .update(person)
    .set({
      stage: "MEMBER",
      phone: null,
      personalEmail: null,
      photoAssetId: null,
      deletionRequestedAt: null,
      anonymizedAt: null,
    })
    .where(eq(person.id, member.id));
  await db.delete(permission).where(eq(permission.personId, member.id));
  await db.delete(consent).where(eq(consent.personId, member.id));
  await db.delete(task).where(eq(task.personId, member.id));
  await db.delete(otpChallenge).where(eq(otpChallenge.email, E2E_MEMBER_EMAIL));
  const [home] = await db
    .select({ id: committee.id })
    .from(committee)
    .where(and(eq(committee.status, "ACTIVE"), notLike(committee.slug, "e2e-%")))
    .orderBy(asc(committee.name))
    .limit(1);
  if (home) {
    const [existing] = await db
      .select({ id: committeeMembership.id })
      .from(committeeMembership)
      .where(
        and(
          eq(committeeMembership.personId, member.id),
          eq(committeeMembership.termId, current.id),
          eq(committeeMembership.committeeId, home.id),
        ),
      );
    if (existing) {
      await db
        .update(committeeMembership)
        .set({ leftAt: null })
        .where(eq(committeeMembership.id, existing.id));
    } else {
      await db.insert(committeeMembership).values({
        personId: member.id,
        committeeId: home.id,
        termId: current.id,
        roleCode: "MIEMBRO",
        joinedAt: new Date(),
      });
    }
  }
  await closeDb();
}
