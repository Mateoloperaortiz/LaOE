import { and, asc, eq, inArray, isNotNull, like, notLike, or } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import {
  campaign,
  emailTemplate,
  notificationPreference,
  pushSubscription,
} from "@/modules/comms/schema";
import { announcement, document, mediaAsset } from "@/modules/content/schema";
import { internalCall, organization, pipeline, recognition, task } from "@/modules/crm/schema";
import { eventEdition } from "@/modules/events/schema";
import { editionRegistration, form } from "@/modules/forms/schema";
import { hashPassword, personAttemptKey } from "@/modules/identity/domain/pure";
import {
  accessGrant,
  carnetToken,
  credential,
  loginAttempt,
  otpChallenge,
  permission,
} from "@/modules/identity/schema";
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
import { appConfig, importJob } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { walletPass } from "@/modules/wallet/schema";
import { E2E_TERM } from "./calendar";
import { alignSeedCalendar } from "./calendar-seed";
import { assertOwnedDatabase } from "./environment";

// Persona sintética para las pruebas e2e; se recrea en cada corrida, nunca es una persona real.
export const E2E_EMAIL = "prueba.e2e@eafit.edu.co";
/** Segunda identidad: un miembro activo sin permisos, para Mi OE (ADR-034). */
export const E2E_MEMBER_EMAIL = "prueba.miembro@eafit.edu.co";
/** Contraseña de las dos identidades sintéticas (ADR-051): la suite entra sin pedir códigos. */
export const E2E_PASSWORD = "trapecio verde 41";
/** Término viejo de pruebas para el cierre de puntos (ADR-035): se reabre y vacía en cada corrida. */
export const E2E_CLOSING_TERM = "2019-2";
/** Término viejo para el cierre de permanencia (ADR-036): puntos cerrados, permanencia abierta y vacía. */
export const E2E_PERMANENCE_TERM = "2019-1";
/** Persona desechable que sale de la OE en el cierre de permanencia; se recrea en cada corrida. */
export const E2E_CLOSING_EMAIL = "e2e-cierre@eafit.edu.co";
/** Miembro desechable que pide una licencia desde Mi OE (fase 5); activo en el término actual. */
export const E2E_LEAVE_EMAIL = "e2e-licencia@eafit.edu.co";

/**
 * Deja la contraseña de una identidad sintética y borra lo que un bloqueo de otra corrida hubiera
 * dejado (ADR-051): la suite entra con contraseña, así que ya no depende del límite de OTP.
 */
async function setE2ePassword(personId: string, email: string): Promise<void> {
  const db = getDb();
  await db
    .delete(loginAttempt)
    .where(inArray(loginAttempt.email, [email, personAttemptKey(personId)]));
  await db.delete(accessGrant).where(eq(accessGrant.personId, personId));
  await db
    .insert(credential)
    .values({ personId, passwordHash: await hashPassword(E2E_PASSWORD) })
    .onConflictDoUpdate({
      target: credential.personId,
      set: { passwordHash: await hashPassword(E2E_PASSWORD) },
    });
}

export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_RUN !== "1")
    throw new Error("Usá npm run test:e2e para preparar una base aislada");
  assertOwnedDatabase(process.env.DATABASE_URL ?? "");
  // Las identidades y archivos sintéticos solo se limpian en servicios de loopback.
  for (const key of ["DATABASE_URL", "S3_ENDPOINT"]) {
    const hostname = new URL(process.env[key] ?? "http://sin-configurar.invalid").hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
      throw new Error(`La suite E2E necesita ${key} local; no puede usar un servicio remoto`);
    }
  }
  const db = getDb();
  // El seed compartido conserva sus ejemplos históricos. Solo la base E2E adapta sus dos
  // términos al calendario vigente, preservando IDs y relaciones de las fixtures.
  await alignSeedCalendar(new Date());
  await db
    .insert(appConfig)
    .values({ key: "privacy.policyVersion", value: "prueba-v1" })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: "prueba-v1", updatedAt: new Date() },
    });
  let [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) {
    [current] = await db.insert(term).values(E2E_TERM).returning({ id: term.id });
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
  await db.delete(walletPass).where(eq(walletPass.personId, who.id));
  await db.delete(carnetToken).where(eq(carnetToken.personId, who.id));
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
  // Fase 6: las campañas de la suite referencian segmentos y plantillas e2e- (restrict): primero ellas.
  await db.delete(campaign).where(like(campaign.name, "e2e-%"));
  await db.delete(emailTemplate).where(like(emailTemplate.slug, "e2e-%"));
  await db.delete(segment).where(like(segment.name, "e2e-%"));
  await db.delete(importJob).where(like(importJob.filename, "roster-e2e%"));
  // La persona de e2e es ADMIN para probar el admin; BOARD lo prueba la suite y se limpia aquí.
  await db.delete(permission).where(eq(permission.personId, who.id));
  await db.insert(permission).values({ personId: who.id, code: "ADMIN" });
  // La identidad ADMIN también entra a Mi OE en algunas suites (ADR-048).
  await db
    .insert(consent)
    .values({
      personId: who.id,
      purpose: "MEMBERSHIP",
      source: "SELF",
      policyVersion: "prueba-v1",
    })
    .onConflictDoNothing();
  // Los límites de OTP por correo (5 cada 15 minutos) no deben depender de corridas anteriores.
  await db.delete(otpChallenge).where(eq(otpChallenge.email, E2E_EMAIL));
  await setE2ePassword(who.id, E2E_EMAIL);
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
  await db.delete(internalCall).where(like(internalCall.title, "e2e-%"));
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
  await db.delete(walletPass).where(eq(walletPass.personId, member.id));
  await db.delete(carnetToken).where(eq(carnetToken.personId, member.id));
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
      // El segmento de la suite de campañas lo encuentra por este programa.
      program: "e2e-campana",
      photoAssetId: null,
      deletionRequestedAt: null,
      anonymizedAt: null,
    })
    .where(eq(person.id, member.id));
  await db.delete(permission).where(eq(permission.personId, member.id));
  await db.delete(consent).where(eq(consent.personId, member.id));
  // ADR-048: sin autorización viva no se entra a Mi OE. La versión es la que fija el seed.
  await db
    .insert(consent)
    .values({
      personId: member.id,
      purpose: "MEMBERSHIP",
      source: "SELF",
      policyVersion: "prueba-v1",
    })
    .onConflictDoNothing();
  await db.delete(task).where(eq(task.personId, member.id));
  await db.delete(otpChallenge).where(eq(otpChallenge.email, E2E_MEMBER_EMAIL));
  await setE2ePassword(member.id, E2E_MEMBER_EMAIL);
  await db.delete(editionRegistration).where(eq(editionRegistration.personId, member.id));
  // Fase 6: dispositivos ficticios y preferencias que deja la suite de la PWA. El host es uno admitido
  // (ADR-113 regla 6) y el E2E corre sin VAPID: nunca se envía. El patrón viejo limpia bases de antes.
  await db
    .delete(pushSubscription)
    .where(
      or(
        like(pushSubscription.endpoint, "https://fcm.googleapis.com/fcm/send/e2e-%"),
        like(pushSubscription.endpoint, "https://push.example.invalid/%"),
      ),
    );
  await db.delete(notificationPreference).where(eq(notificationPreference.personId, member.id));
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
    // Miembro desechable: al aprobar GH la licencia, conserva consulta de Mi OE y suspende operaciones.
    const [leaver] = await db
      .insert(person)
      .values({
        email: E2E_LEAVE_EMAIL,
        firstName: "Licencia",
        lastName: "E2E",
        stage: "MEMBER",
        source: "E2E",
      })
      .returning({ id: person.id });
    if (leaver) {
      await db
        .insert(membership)
        .values({ personId: leaver.id, status: "ACTIVE", firstTermId: current.id });
      await db.insert(committeeMembership).values({
        personId: leaver.id,
        committeeId: home.id,
        termId: current.id,
        roleCode: "MIEMBRO",
        joinedAt: new Date(),
      });
      // ADR-048: ya autorizó en un ingreso anterior; su suite prueba licencias, no la autorización.
      await db.insert(consent).values({
        personId: leaver.id,
        purpose: "MEMBERSHIP",
        source: "SELF",
        policyVersion: "prueba-v1",
      });
    }
    await db.delete(otpChallenge).where(eq(otpChallenge.email, E2E_LEAVE_EMAIL));
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
