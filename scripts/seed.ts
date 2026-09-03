import { readdirSync } from "node:fs";
import { count, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { getEnv } from "@/env";
import { announcement } from "@/modules/content/schema";
import { editionCommittee, event, eventEdition } from "@/modules/events/schema";
import { permission } from "@/modules/identity/schema";
import { term } from "@/modules/participation/schema";
import {
  appointment,
  committee,
  committeeMembership,
  consent,
  membership,
  person,
} from "@/modules/people/schema";
import { logger } from "@/shared/log";

// Datos sintéticos para desarrollo y staging: nombres inventados, correos oe.demo.NN@eafit.edu.co,
// los 27 comités por su sigla, publicados para ver el portal (el nombre oficial y la presentación
// los aporta la OE y en producción se publican desde el admin). Idempotente. Nunca corre en producción.

const env = getEnv();
if (env.NODE_ENV === "production") {
  throw new Error("El seed no corre en producción");
}

const db = getDb();

const FIRST_NAMES = [
  "Ana",
  "Bruno",
  "Camila",
  "Daniel",
  "Elena",
  "Felipe",
  "Gabriela",
  "Hugo",
  "Isabela",
  "Julián",
  "Karen",
  "Luis",
  "Mariana",
  "Nicolás",
  "Olga",
  "Pablo",
  "Quena",
  "Rafael",
  "Sofía",
  "Tomás",
];
const LAST_NAMES = [
  "Arango",
  "Betancur",
  "Cadavid",
  "Duque",
  "Echeverri",
  "Franco",
  "Giraldo",
  "Henao",
  "Isaza",
  "Jaramillo",
  "Londoño",
  "Mesa",
  "Naranjo",
  "Ospina",
  "Palacio",
  "Quintero",
  "Restrepo",
  "Sierra",
  "Toro",
  "Uribe",
];
const PROGRAMS = [
  "Ingeniería de Sistemas",
  "Derecho",
  "Economía",
  "Administración",
  "Diseño",
  "Comunicación Social",
  "Ingeniería de Producción",
  "Psicología",
];

const TERMS = [
  { code: "2026-1", semester: 1, startsOn: "2026-01-19", endsOn: "2026-06-06" },
  { code: "2026-2", semester: 2, startsOn: "2026-07-13", endsOn: "2026-12-05" },
];

async function seedTerms(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const item of TERMS) {
    const [row] = await db
      .insert(term)
      .values(item)
      .onConflictDoUpdate({
        target: term.code,
        set: { startsOn: item.startsOn, endsOn: item.endsOn },
      })
      .returning({ id: term.id, code: term.code });
    if (row) ids.set(row.code, row.id);
  }
  return ids;
}

async function seedCommittees(): Promise<Array<{ id: string; slug: string }>> {
  const slugs = readdirSync("public/logos/committees")
    .filter((file) => file.endsWith(".svg"))
    .map((file) => file.replace(/\.svg$/, ""))
    .sort();
  const rows: Array<{ id: string; slug: string }> = [];
  for (const slug of slugs) {
    const [row] = await db
      .insert(committee)
      .values({
        slug,
        name: slug.toUpperCase(),
        logoKey: slug,
        status: "ACTIVE",
        publicationStatus: "PUBLISHED",
      })
      .onConflictDoUpdate({ target: committee.slug, set: { logoKey: slug } })
      .returning({ id: committee.id, slug: committee.slug });
    if (row) rows.push(row);
  }
  return rows;
}

type Status = "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";

function statusFor(index: number): Status {
  if (index % 13 === 0) return "HONORARY";
  if (index % 7 === 0) return "ON_LEAVE";
  if (index % 11 === 0) return "INACTIVE";
  return "ACTIVE";
}

async function seedPeople(
  terms: Map<string, string>,
  committees: Array<{ id: string; slug: string }>,
): Promise<void> {
  const current = terms.get("2026-2");
  const previous = terms.get("2026-1");
  if (!current || !previous) throw new Error("faltan términos");
  const generalsAssigned = new Set<string>();

  for (let index = 1; index <= 40; index += 1) {
    const firstName = FIRST_NAMES[index % FIRST_NAMES.length] ?? "Persona";
    const lastName = LAST_NAMES[(index * 7) % LAST_NAMES.length] ?? "Sintética";
    const email = `oe.demo.${String(index).padStart(2, "0")}@eafit.edu.co`;
    const status = statusFor(index);
    const isNew = index % 4 === 0;
    const [who] = await db
      .insert(person)
      .values({
        email,
        firstName,
        lastName,
        stage: status === "INACTIVE" ? "ALUMNI" : "MEMBER",
        program: PROGRAMS[index % PROGRAMS.length] ?? null,
        phone: `30012345${String(index).padStart(2, "0")}`,
        source: "SEED",
      })
      .onConflictDoUpdate({ target: person.email, set: { firstName, lastName } })
      .returning({ id: person.id });
    if (!who) continue;
    await db
      .insert(membership)
      .values({
        personId: who.id,
        status,
        firstTermId: isNew ? current : previous,
        ...(status === "INACTIVE"
          ? {
              endedAt: new Date(`${2023 + (index % 4)}-06-10T05:00:00Z`),
              endReason: "RESIGNATION" as const,
              lastTermId: previous,
            }
          : {}),
      })
      .onConflictDoUpdate({ target: membership.personId, set: { status } });

    // Entre 1 y 3 comités en el término actual; un General por comité.
    const howMany = 1 + (index % 3);
    for (let n = 0; n < howMany; n += 1) {
      const target = committees[(index * 5 + n * 9) % committees.length];
      if (!target) continue;
      const roleCode =
        !generalsAssigned.has(target.id) && status === "ACTIVE" ? "GENERAL" : "MIEMBRO";
      if (roleCode === "GENERAL") generalsAssigned.add(target.id);
      await db
        .insert(committeeMembership)
        .values({
          personId: who.id,
          committeeId: target.id,
          termId: current,
          roleCode,
          joinedAt: new Date("2026-07-13T05:00:00Z"),
        })
        .onConflictDoNothing();
    }
  }
}

// Egresados sintéticos de varios años, con comités en el término anterior, para la galería (ADR-030).
async function seedAlumni(
  terms: Map<string, string>,
  committees: Array<{ id: string; slug: string }>,
): Promise<void> {
  const previous = terms.get("2026-1");
  if (!previous) throw new Error("falta término");
  for (let index = 41; index <= 48; index += 1) {
    const firstName = FIRST_NAMES[(index * 3) % FIRST_NAMES.length] ?? "Persona";
    const lastName = LAST_NAMES[(index * 5) % LAST_NAMES.length] ?? "Sintética";
    const email = `oe.demo.${index}@eafit.edu.co`;
    const [who] = await db
      .insert(person)
      .values({
        email,
        firstName,
        lastName,
        stage: "ALUMNI",
        program: PROGRAMS[index % PROGRAMS.length] ?? null,
        source: "SEED",
      })
      .onConflictDoUpdate({ target: person.email, set: { stage: "ALUMNI" } })
      .returning({ id: person.id });
    if (!who) continue;
    await db
      .insert(membership)
      .values({
        personId: who.id,
        status: "INACTIVE",
        firstTermId: previous,
        lastTermId: previous,
        endedAt: new Date(`${2022 + (index % 4)}-06-15T05:00:00Z`),
        endReason: index % 2 === 0 ? "GRADUATION" : "RESIGNATION",
      })
      .onConflictDoNothing();
    for (let n = 0; n < 1 + (index % 2); n += 1) {
      const target = committees[(index * 7 + n * 11) % committees.length];
      if (!target) continue;
      await db
        .insert(committeeMembership)
        .values({
          personId: who.id,
          committeeId: target.id,
          termId: previous,
          roleCode: n === 0 && index % 4 === 0 ? "GENERAL" : "MIEMBRO",
          joinedAt: new Date("2026-01-19T05:00:00Z"),
          leftAt: new Date("2026-06-06T05:00:00Z"),
        })
        .onConflictDoNothing();
    }
  }
}

// Consentimientos sintéticos: membresía para todos (como haría el roster), foto y galería para algunos.
async function seedConsents(): Promise<void> {
  const people = await db
    .select({ id: person.id, email: person.email, stage: person.stage })
    .from(person)
    .where(eq(person.source, "SEED"));
  for (const who of people) {
    const index = Number.parseInt(who.email.replace(/\D/g, ""), 10) || 0;
    const purposes: Array<{
      purpose: "MEMBERSHIP" | "COMMUNICATIONS" | "DIRECTORY_PHOTO" | "MEMORIAL";
      source: "IMPORT" | "SELF" | "ADMIN";
    }> = [{ purpose: "MEMBERSHIP", source: "IMPORT" }];
    if (index % 2 === 0) purposes.push({ purpose: "DIRECTORY_PHOTO", source: "SELF" });
    if (index % 3 === 0) purposes.push({ purpose: "COMMUNICATIONS", source: "SELF" });
    if (who.stage === "ALUMNI" && index % 2 === 0) {
      purposes.push({ purpose: "MEMORIAL", source: "ADMIN" });
    }
    for (const item of purposes) {
      await db
        .insert(consent)
        .values({
          personId: who.id,
          purpose: item.purpose,
          source: item.source,
          policyVersion: "pendiente",
        })
        .onConflictDoNothing();
    }
  }
}

// Cargos de junta y de GH sintéticos en el término actual (ADR-034).
async function seedAppointments(terms: Map<string, string>): Promise<void> {
  const current = terms.get("2026-2");
  if (!current) throw new Error("falta término");
  const cargos: Array<{ email: string; kind: "PRESIDENT" | "VP_GH" | "GH_HEAD" | "GH_DIRECTOR" }> =
    [
      { email: "oe.demo.01@eafit.edu.co", kind: "PRESIDENT" },
      { email: "oe.demo.02@eafit.edu.co", kind: "VP_GH" },
      { email: "oe.demo.03@eafit.edu.co", kind: "GH_HEAD" },
      { email: "oe.demo.05@eafit.edu.co", kind: "GH_DIRECTOR" },
    ];
  for (const cargo of cargos) {
    const [who] = await db
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, cargo.email))
      .limit(1);
    if (!who) continue;
    const [existing] = await db
      .select({ id: appointment.id })
      .from(appointment)
      .where(
        sql`${appointment.personId} = ${who.id} and ${appointment.kind} = ${cargo.kind} and ${appointment.termId} = ${current}`,
      )
      .limit(1);
    if (existing) continue;
    await db.insert(appointment).values({ personId: who.id, kind: cargo.kind, termId: current });
  }
}

async function seedAdmin(
  terms: Map<string, string>,
  committees: Array<{ id: string; slug: string }>,
): Promise<void> {
  const current = terms.get("2026-1");
  if (!current) throw new Error("falta término");
  const [admin] = await db
    .insert(person)
    .values({
      email: "oe.demo.admin@eafit.edu.co",
      firstName: "Admin",
      lastName: "Demo",
      stage: "MEMBER",
      source: "SEED",
    })
    .onConflictDoUpdate({ target: person.email, set: { firstName: "Admin" } })
    .returning({ id: person.id });
  if (!admin) return;
  await db
    .insert(membership)
    .values({ personId: admin.id, status: "ACTIVE", firstTermId: current })
    .onConflictDoNothing();
  await db.insert(permission).values({ personId: admin.id, code: "ADMIN" }).onConflictDoNothing();
  // Dos líderes: los Generales de los dos primeros comités.
  for (const target of committees.slice(0, 2)) {
    const [general] = await db
      .select({ personId: committeeMembership.personId })
      .from(committeeMembership)
      .where(
        sql`${committeeMembership.committeeId} = ${target.id} and ${committeeMembership.roleCode} = 'GENERAL' and ${committeeMembership.leftAt} is null`,
      )
      .limit(1);
    if (general) {
      await db
        .insert(permission)
        .values({
          personId: general.personId,
          code: "COMMITTEE_LEADER",
          committeeId: target.id,
          grantedById: admin.id,
        })
        .onConflictDoNothing();
    }
  }
}

// Contenido sintético para ver el portal en local y staging: anuncios "de prueba" y una edición "de
// prueba" por macroevento con fechas relativas a hoy. No son fechas ni textos de la OE (11-contenido-pendiente.md).
async function seedContent(committees: Array<{ id: string; slug: string }>): Promise<void> {
  const day = 24 * 60 * 60_000;
  const anuncios = [
    {
      title: "Anuncio de prueba: así se ve la cartelera",
      body: "Este anuncio es **sintético**: existe para revisar la cartelera en local. Los anuncios reales los publica comunicaciones desde el admin.\n\n- Se puede fijar arriba\n- Se puede despublicar",
      pinned: true,
      daysAgo: 1,
    },
    {
      title: "Anuncio de prueba: segundo anuncio",
      body: "Otro anuncio sintético, sin fijar, para ver la rotación de colores del feed.",
      pinned: false,
      daysAgo: 3,
    },
  ];
  for (const item of anuncios) {
    const [existing] = await db
      .select({ id: announcement.id })
      .from(announcement)
      .where(eq(announcement.title, item.title))
      .limit(1);
    if (existing) continue;
    await db.insert(announcement).values({
      title: item.title,
      body: item.body,
      audience: "PUBLIC",
      pinned: item.pinned,
      publishedAt: new Date(Date.now() - item.daysAgo * day),
    });
  }

  const events = await db.select({ id: event.id, slug: event.slug }).from(event);
  const offsets: Record<string, number> = {
    "dias-eafit": 10,
    inventiva: 24,
    enfemenino: 40,
    "subsidios-oe": -20,
  };
  for (const item of events) {
    const offset = offsets[item.slug];
    if (offset === undefined) continue;
    const startsAt = new Date(Date.now() + offset * day);
    startsAt.setUTCHours(23, 0, 0, 0); // 18:00 en Bogotá
    const [edition] = await db
      .insert(eventEdition)
      .values({
        eventId: item.id,
        slug: "prueba",
        name: "Edición de prueba",
        description:
          "Edición **sintética** para revisar el portal en local: la fecha, el lugar y los organizadores no son datos reales de la OE.",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3 * 60 * 60_000),
        location: "Lugar de prueba (dato sintético)",
        publicationStatus: "PUBLISHED",
      })
      .onConflictDoNothing()
      .returning({ id: eventEdition.id });
    if (!edition) continue;
    const organizers = committees.slice(0, 2);
    if (organizers.length > 0) {
      await db
        .insert(editionCommittee)
        .values(organizers.map((target) => ({ editionId: edition.id, committeeId: target.id })))
        .onConflictDoNothing();
    }
  }
}

try {
  const terms = await seedTerms();
  const committees = await seedCommittees();
  await seedPeople(terms, committees);
  await seedAlumni(terms, committees);
  await seedAdmin(terms, committees);
  await seedConsents();
  await seedAppointments(terms);
  await seedContent(committees);
  const [people] = await db.select({ n: count() }).from(person).where(eq(person.source, "SEED"));
  const [admins] = await db
    .select({ n: count() })
    .from(permission)
    .where(eq(permission.code, "ADMIN"));
  logger.info(
    { committees: committees.length, people: people?.n, admins: admins?.n },
    "seed sintético aplicado",
  );
} finally {
  await closeDb();
}
