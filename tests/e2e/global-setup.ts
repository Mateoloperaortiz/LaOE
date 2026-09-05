import { and, asc, eq, inArray, isNotNull, like, notLike } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { announcement, document, mediaAsset } from "@/modules/content/schema";
import { organization, pipeline, recognition, task } from "@/modules/crm/schema";
import { eventEdition } from "@/modules/events/schema";
import { editionRegistration, form } from "@/modules/forms/schema";
import { otpChallenge, permission } from "@/modules/identity/schema";
import { checkIn, occasion, pointEntry, termStanding } from "@/modules/participation/schema";
import {
  committee,
  committeeMembership,
  consent,
  membership,
  membershipEvent,
  person,
  segment,
} from "@/modules/people/schema";
import {
  leaderScore,
  manualCredit,
  permanenceDecision,
  permanenceRule,
  permanenceSnapshot,
  permanenceTable,
  workGroup,
} from "@/modules/permanence/schema";
import { importJob } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";

// Persona sintética para las pruebas e2e; se recrea en cada corrida, nunca es una persona real.
export const E2E_EMAIL = "prueba.e2e@eafit.edu.co";
/** Segunda identidad: un miembro activo sin permisos, para Mi OE (ADR-034). */
export const E2E_MEMBER_EMAIL = "prueba.miembro@eafit.edu.co";
/** Término viejo de pruebas para el cierre de puntos (ADR-035): se reabre y vacía en cada corrida. */
export const E2E_CLOSING_TERM = "2019-2";
/** Término viejo para el cierre de permanencia (ADR-036): puntos cerrados, permanencia abierta y vacía. */
export const E2E_PERMANENCE_TERM = "2019-1";
/** Persona desechable que sale de la OE en el cierre de permanencia; se recrea en cada corrida. */
export const E2E_CLOSING_EMAIL = "e2e-cierre@eafit.edu.co";

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
  await db.delete(editionRegistration).where(eq(editionRegistration.personId, who.id));
  // Comités y anuncios creados por corridas anteriores de la suite.
  await db.delete(committee).where(like(committee.slug, "e2e-%"));
  await db.delete(announcement).where(like(announcement.title, "e2e-%"));
  await db.delete(eventEdition).where(like(eventEdition.slug, "e2e-%"));
  await db.delete(mediaAsset).where(like(mediaAsset.originalFilename, "e2e-%"));
  await db.delete(document).where(like(document.title, "e2e-%"));
  // Ocasiones de la suite: primero el ledger de sus check-ins (no se borra en cascada), luego la ocasión
  // (que arrastra check-ins y score).
  const e2eOccasions = db
    .select({ id: occasion.id })
    .from(occasion)
    .where(like(occasion.title, "e2e-%"));
  const e2eCheckIns = db
    .select({ id: checkIn.id })
    .from(checkIn)
    .where(inArray(checkIn.occasionId, e2eOccasions));
  await db.delete(pointEntry).where(inArray(pointEntry.checkInId, e2eCheckIns));
  await db.delete(pointEntry).where(like(pointEntry.reason, "e2e-%"));
  await db.delete(occasion).where(like(occasion.title, "e2e-%"));
  // Término de pruebas del cierre: existe, abierto, sin standing ni ocasiones.
  let [closing] = await db
    .select({ id: term.id })
    .from(term)
    .where(eq(term.code, E2E_CLOSING_TERM));
  if (!closing) {
    [closing] = await db
      .insert(term)
      .values({ code: E2E_CLOSING_TERM, semester: 2, startsOn: "2019-07-01", endsOn: "2019-12-31" })
      .returning({ id: term.id });
  }
  if (closing) {
    await db.update(term).set({ pointsClosedAt: null }).where(eq(term.id, closing.id));
    await db.delete(termStanding).where(eq(termStanding.termId, closing.id));
    const closingCheckIns = db
      .select({ id: checkIn.id })
      .from(checkIn)
      .where(
        inArray(
          checkIn.occasionId,
          db.select({ id: occasion.id }).from(occasion).where(eq(occasion.termId, closing.id)),
        ),
      );
    await db.delete(pointEntry).where(inArray(pointEntry.checkInId, closingCheckIns));
    await db.delete(pointEntry).where(eq(pointEntry.termId, closing.id));
    await db.delete(occasion).where(eq(occasion.termId, closing.id));
    // Permanencia (fase 4): el término de pruebas arranca sin tablas ni bloqueos.
    await db.update(term).set({ permanenceClosedAt: null }).where(eq(term.id, closing.id));
    await db.delete(permanenceTable).where(eq(permanenceTable.termId, closing.id));
    await db.delete(permanenceRule).where(eq(permanenceRule.termId, closing.id));
  }
  // Término del cierre de permanencia: puntos cerrados, permanencia reabierta, sin decisiones,
  // snapshots, reglas ni tablas (la persona desechable ya salió por el prefijo e2e-).
  let [permanenceTerm] = await db
    .select({ id: term.id })
    .from(term)
    .where(eq(term.code, E2E_PERMANENCE_TERM));
  if (!permanenceTerm) {
    [permanenceTerm] = await db
      .insert(term)
      .values({
        code: E2E_PERMANENCE_TERM,
        semester: 1,
        startsOn: "2019-01-01",
        endsOn: "2019-06-30",
      })
      .returning({ id: term.id });
  }
  if (permanenceTerm) {
    await db
      .update(term)
      .set({ pointsClosedAt: new Date(), permanenceClosedAt: null })
      .where(eq(term.id, permanenceTerm.id));
    await db.delete(permanenceDecision).where(eq(permanenceDecision.termId, permanenceTerm.id));
    await db.delete(permanenceSnapshot).where(eq(permanenceSnapshot.termId, permanenceTerm.id));
    await db.delete(permanenceTable).where(eq(permanenceTable.termId, permanenceTerm.id));
    await db.delete(permanenceRule).where(eq(permanenceRule.termId, permanenceTerm.id));
  }
  // Criterios y bloqueos que crean las suites de permanencia sobre el término actual (los puntajes y
  // créditos de esos criterios salen antes: la clave foránea es restrict).
  const e2eRules = db
    .select({ id: permanenceRule.id })
    .from(permanenceRule)
    .where(like(permanenceRule.key, "e2e-%"));
  await db.delete(manualCredit).where(inArray(manualCredit.ruleId, e2eRules));
  await db.delete(leaderScore).where(inArray(leaderScore.ruleId, e2eRules));
  await db.delete(permanenceRule).where(like(permanenceRule.key, "e2e-%"));
  await db.delete(permanenceTable).where(like(permanenceTable.comment, "e2e-%"));
  await db.delete(workGroup).where(like(workGroup.name, "e2e-%"));
  // Fase 5: formularios y organizaciones de prueba (respuestas, contactos y tarjetas caen en cascada).
  await db.delete(form).where(like(form.slug, "e2e-%"));
  await db.delete(organization).where(like(organization.name, "e2e-%"));
  await db.delete(pipeline).where(like(pipeline.name, "e2e-%"));
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
  await db.delete(editionRegistration).where(eq(editionRegistration.personId, member.id));
  // Reconocimientos que el miembro (como líder de pruebas) nombró y sus anuncios de comité.
  await db.delete(recognition).where(eq(recognition.grantedById, member.id));
  await db
    .delete(announcement)
    .where(and(eq(announcement.createdById, member.id), isNotNull(announcement.committeeId)));
  const [home] = await db
    .select({ id: committee.id })
    .from(committee)
    .where(and(eq(committee.status, "ACTIVE"), notLike(committee.slug, "e2e-%")))
    .orderBy(asc(committee.name))
    .limit(1);
  if (home && permanenceTerm) {
    // La persona desechable del cierre de permanencia: nueva en 2019-1, en el mismo comité.
    const [disposable] = await db
      .insert(person)
      .values({
        email: E2E_CLOSING_EMAIL,
        firstName: "Cierre",
        lastName: "E2E",
        stage: "MEMBER",
        source: "E2E",
      })
      .returning({ id: person.id });
    if (disposable) {
      await db
        .insert(membership)
        .values({ personId: disposable.id, status: "ACTIVE", firstTermId: permanenceTerm.id });
      await db.insert(committeeMembership).values({
        personId: disposable.id,
        committeeId: home.id,
        termId: permanenceTerm.id,
        roleCode: "MIEMBRO",
        joinedAt: new Date("2019-01-20T12:00:00Z"),
      });
    }
  }
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
