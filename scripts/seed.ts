import { readdirSync } from "node:fs";
import { and, count, eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { getEnv } from "@/env";
import { announcement } from "@/modules/content/schema";
import { recognition } from "@/modules/crm/schema";
import { editionCommittee, event, eventEdition } from "@/modules/events/schema";
import { permission } from "@/modules/identity/schema";
import { checkIn, occasion, pointEntry } from "@/modules/participation/schema";
import {
  appointment,
  committee,
  committeeMembership,
  consent,
  membership,
  membershipTerm,
  person,
} from "@/modules/people/schema";
import {
  referenceCommitteeRules,
  referenceGeneralRules,
  ruleInputSchema,
} from "@/modules/permanence";
import {
  permanenceRule,
  workGroup,
  workGroupEvaluator,
  workGroupMembership,
} from "@/modules/permanence/schema";
import { appConfig } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { logger } from "@/shared/log";
import { seedFase5 } from "./lib/seed-fase5";
import { seedFase6 } from "./lib/seed-fase6";

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
          policyVersion: "prueba-v1",
        })
        .onConflictDoNothing();
    }
  }
}

// Cargos de junta y de GH sintéticos en el término actual (ADR-034).
async function seedAppointments(terms: Map<string, string>): Promise<void> {
  const current = terms.get("2026-2");
  if (!current) throw new Error("falta término");
  const cargos: Array<{
    email: string;
    kind:
      | "PRESIDENT"
      | "VP_GH"
      | "VP_PUBLIC_RELATIONS"
      | "VP_ADMIN"
      | "VP_FINANCE"
      | "GH_HEAD"
      | "GH_DIRECTOR";
  }> = [
    { email: "oe.demo.01@eafit.edu.co", kind: "PRESIDENT" },
    { email: "oe.demo.02@eafit.edu.co", kind: "VP_GH" },
    { email: "oe.demo.03@eafit.edu.co", kind: "GH_HEAD" },
    { email: "oe.demo.05@eafit.edu.co", kind: "GH_DIRECTOR" },
    // Fase 4 (ADR-036): las vicepresidencias lideran los comités de trabajo.
    { email: "oe.demo.06@eafit.edu.co", kind: "VP_PUBLIC_RELATIONS" },
    { email: "oe.demo.10@eafit.edu.co", kind: "VP_ADMIN" },
    { email: "oe.demo.09@eafit.edu.co", kind: "VP_FINANCE" },
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
// Tablas de permanencia de referencia (ADR-036 regla 3): la general de 2026-2 y la de A3 en el
// primer comité, idempotentes por clave; GH las ajusta desde /admin/permanencia/reglas.
async function seedPermanenceRules(
  terms: Map<string, string>,
  committees: Array<{ id: string; slug: string }>,
): Promise<void> {
  const current = terms.get("2026-2");
  if (!current) throw new Error("falta término");
  const general = referenceGeneralRules(3).map((input) => ruleInputSchema.parse(input));
  for (const input of general) {
    await db
      .insert(permanenceRule)
      .values({ termId: current, scope: "GENERAL", committeeId: null, ...input })
      .onConflictDoNothing();
  }
  const a3 = committees.find((item) => item.slug === "a3") ?? committees[0];
  if (a3) {
    for (const input of referenceCommitteeRules().map((item) => ruleInputSchema.parse(item))) {
      await db
        .insert(permanenceRule)
        .values({ termId: current, scope: "COMMITTEE", committeeId: a3.id, ...input })
        .onConflictDoNothing();
    }
  }
}

// Condiciones de permanencia sintéticas (ADR-027): una persona en periodo de prueba y una transferencia
// interna, para ver los umbrales 80 y 70 en Mi OE y en cumplimiento; y el recompute del término.
async function seedPermanenceConditions(terms: Map<string, string>): Promise<void> {
  const current = terms.get("2026-2");
  if (!current) throw new Error("falta término");
  const [probation] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, "oe.demo.17@eafit.edu.co"))
    .limit(1);
  if (probation) {
    await db
      .insert(membershipTerm)
      .values({ personId: probation.id, termId: current, probation: true, reason: "Semilla" })
      .onConflictDoNothing();
  }
  const [transferred] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, "oe.demo.18@eafit.edu.co"))
    .limit(1);
  if (transferred) {
    const [row] = await db
      .select({ id: committeeMembership.id })
      .from(committeeMembership)
      .where(
        and(
          eq(committeeMembership.personId, transferred.id),
          eq(committeeMembership.termId, current),
        ),
      )
      .limit(1);
    if (row) {
      await db
        .update(committeeMembership)
        .set({ transferredIn: true })
        .where(eq(committeeMembership.id, row.id));
    }
  }
  await enqueueEvent(db, {
    type: "permanence.recompute",
    payload: { termId: current },
    dedupeKey: `permanence:${current}:*`,
  });
}

// Grupos de trabajo sintéticos (ADR-036 regla 6): los siete comités de trabajo con el líder de su
// cargo, un GT, un GAP, un GAP OE, la barra brava y la tarea de nuevos, con miembros y evaluaciones.
async function seedWorkGroups(terms: Map<string, string>): Promise<void> {
  const current = terms.get("2026-2");
  if (!current) throw new Error("falta término");
  const byEmail = async (email: string) => {
    const [who] = await db
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, email))
      .limit(1);
    return who?.id ?? null;
  };
  const leaderOf = async (kind: string) => {
    const [row] = await db
      .select({ personId: appointment.personId })
      .from(appointment)
      .where(sql`${appointment.termId} = ${current} and ${appointment.kind} = ${kind}`)
      .limit(1);
    return row?.personId ?? null;
  };
  const director = await byEmail("oe.demo.05@eafit.edu.co");
  const head = await byEmail("oe.demo.03@eafit.edu.co");
  const groups: Array<{
    code: string | null;
    name: string;
    kind: "WORK_COMMITTEE" | "GT_MACROEVENT" | "GAP" | "GAP_OE" | "BARRA_BRAVA" | "NEW_MEMBER_TASK";
    leaderKind: string | null;
    evaluators: Array<string | null>;
    members: Array<[string, "PENDING" | "GOOD" | "INSUFFICIENT"]>;
  }> = [
    {
      code: "CAP",
      name: "Comité de Acompañamiento Presidencial",
      kind: "WORK_COMMITTEE",
      leaderKind: "PRESIDENT",
      evaluators: [director],
      members: [["oe.demo.13@eafit.edu.co", "PENDING"]],
    },
    {
      code: "CGH",
      name: "Comité de Gestión Humana",
      kind: "WORK_COMMITTEE",
      leaderKind: "VP_GH",
      evaluators: [director],
      members: [
        ["oe.demo.02@eafit.edu.co", "GOOD"],
        ["oe.demo.15@eafit.edu.co", "PENDING"],
      ],
    },
    {
      code: "CCM",
      name: "Comité de Creatividad y Mercadeo",
      kind: "WORK_COMMITTEE",
      leaderKind: "VP_PUBLIC_RELATIONS",
      evaluators: [director],
      members: [],
    },
    {
      code: "CAE",
      name: "Comité de Alianzas Estratégicas",
      kind: "WORK_COMMITTEE",
      leaderKind: "VP_PUBLIC_RELATIONS",
      evaluators: [director],
      members: [],
    },
    {
      code: "CML",
      name: "Comité de Mejoramiento Logístico",
      kind: "WORK_COMMITTEE",
      leaderKind: "VP_ADMIN",
      evaluators: [director],
      members: [["oe.demo.18@eafit.edu.co", "GOOD"]],
    },
    {
      code: "CAF",
      name: "Comité de Acompañamiento Financiero",
      kind: "WORK_COMMITTEE",
      leaderKind: "VP_FINANCE",
      evaluators: [director],
      members: [],
    },
    {
      code: "ATHLETIC",
      name: "Equipo deportivo Athletic OE",
      kind: "WORK_COMMITTEE",
      leaderKind: null,
      evaluators: [],
      members: [["oe.demo.10@eafit.edu.co", "PENDING"]],
    },
    {
      code: null,
      name: "GT Inventiva 2026-2",
      kind: "GT_MACROEVENT",
      leaderKind: "VP_PUBLIC_RELATIONS",
      evaluators: [director],
      members: [
        ["oe.demo.01@eafit.edu.co", "GOOD"],
        ["oe.demo.02@eafit.edu.co", "GOOD"],
        ["oe.demo.17@eafit.edu.co", "PENDING"],
      ],
    },
    {
      code: null,
      name: "GAP Días EAFIT",
      kind: "GAP",
      leaderKind: "VP_ADMIN",
      evaluators: [director],
      members: [
        ["oe.demo.04@eafit.edu.co", "PENDING"],
        ["oe.demo.06@eafit.edu.co", "GOOD"],
        ["oe.demo.17@eafit.edu.co", "GOOD"],
      ],
    },
    {
      code: null,
      name: "GAP OE VTG",
      kind: "GAP_OE",
      leaderKind: "PRESIDENT",
      evaluators: [director],
      members: [["oe.demo.09@eafit.edu.co", "GOOD"]],
    },
    {
      code: null,
      name: "Barra brava 2026-2",
      kind: "BARRA_BRAVA",
      leaderKind: null,
      evaluators: [director],
      members: [
        ["oe.demo.10@eafit.edu.co", "GOOD"],
        ["oe.demo.12@eafit.edu.co", "INSUFFICIENT"],
      ],
    },
    {
      code: null,
      name: "Decoración de oficina 2026-2",
      kind: "NEW_MEMBER_TASK",
      leaderKind: "GH_HEAD",
      evaluators: [head],
      members: [
        ["oe.demo.04@eafit.edu.co", "GOOD"],
        ["oe.demo.08@eafit.edu.co", "PENDING"],
      ],
    },
  ];
  for (const item of groups) {
    const [existing] = await db
      .select({ id: workGroup.id })
      .from(workGroup)
      .where(sql`${workGroup.termId} = ${current} and ${workGroup.name} = ${item.name}`)
      .limit(1);
    let groupId = existing?.id;
    if (!groupId) {
      const [row] = await db
        .insert(workGroup)
        .values({
          termId: current,
          kind: item.kind,
          name: item.name,
          code: item.code,
          leaderPersonId: item.leaderKind ? await leaderOf(item.leaderKind) : null,
        })
        .returning({ id: workGroup.id });
      groupId = row?.id;
    }
    if (!groupId) continue;
    for (const evaluator of item.evaluators) {
      if (!evaluator) continue;
      await db
        .insert(workGroupEvaluator)
        .values({ groupId, personId: evaluator })
        .onConflictDoNothing();
    }
    for (const [email, evaluation] of item.members) {
      const personId = await byEmail(email);
      if (!personId) continue;
      await db
        .insert(workGroupMembership)
        .values({
          groupId,
          personId,
          evaluation,
          evaluatedById: evaluation === "PENDING" ? null : (item.evaluators[0] ?? null),
          evaluatedAt: evaluation === "PENDING" ? null : new Date(),
          note: evaluation === "INSUFFICIENT" ? "No fue a los partidos" : null,
        })
        .onConflictDoNothing();
    }
  }
}

// Un destacado del mes sintético en A3 (ADR-036 regla 7) con su anuncio en la cartelera del comité.
async function seedRecognition(
  terms: Map<string, string>,
  committees: Array<{ id: string; slug: string }>,
): Promise<void> {
  const current = terms.get("2026-2");
  const a3 = committees.find((item) => item.slug === "a3");
  if (!current || !a3) return;
  const [existing] = await db
    .select({ id: recognition.id })
    .from(recognition)
    .where(and(eq(recognition.termId, current), eq(recognition.committeeId, a3.id)))
    .limit(1);
  if (existing) return;
  // Cualquier miembro sintético de A3 este semestre (el seed reparte los comités por índice).
  const [who] = await db
    .select({ id: person.id, firstName: person.firstName, lastName: person.lastName })
    .from(person)
    .innerJoin(committeeMembership, eq(committeeMembership.personId, person.id))
    .where(
      and(
        eq(committeeMembership.committeeId, a3.id),
        eq(committeeMembership.termId, current),
        eq(person.source, "SEED"),
      ),
    )
    .orderBy(person.email)
    .limit(1);
  if (!who) return;
  const nombre = `${who.firstName} ${who.lastName}`;
  const [ann] = await db
    .insert(announcement)
    .values({
      title: `Destacado de agosto: ${nombre}`,
      body: `A3 reconoce a ${nombre} como destacado del mes de agosto. ¡OE OE OE!`,
      audience: "MEMBERS",
      committeeId: a3.id,
      publishedAt: new Date(),
    })
    .returning({ id: announcement.id });
  await db.insert(recognition).values({
    personId: who.id,
    kind: "MEMBER_OF_MONTH",
    committeeId: a3.id,
    termId: current,
    month: 8,
    title: `Destacado de agosto: ${nombre}`,
    announcementId: ann?.id ?? null,
  });
}

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

// Ocasiones "de prueba" del término actual en los cuatro estados (ADR-035): con publicId fijo para
// que db:reset las deje siempre igual. Las fechas van relativas a hoy para que una quede abierta.
async function seedOccasions(
  terms: Map<string, string>,
  committees: Array<{ id: string; slug: string }>,
): Promise<void> {
  const current = terms.get("2026-2");
  if (!current) throw new Error("faltan términos");
  const now = Date.now();
  const hours = (n: number) => new Date(now + n * 3_600_000);
  const rows = [
    {
      publicId: "demo000001",
      title: "Integración de prueba",
      category: "INTEGRATION" as const,
      points: 20,
      status: "OPEN" as const,
      startsAt: hours(1),
      checkInOpensAt: hours(-1),
      checkInClosesAt: hours(4),
      location: "Bloque 38",
    },
    {
      publicId: "demo000002",
      title: "Asamblea ordinaria de prueba",
      kind: "ASSEMBLY" as const,
      assemblyKind: "ORDINARY" as const,
      points: 0,
      status: "OPEN" as const,
      startsAt: hours(2),
      checkInOpensAt: hours(-1),
      checkInClosesAt: hours(5),
      location: "Auditorio",
    },
    {
      publicId: "demo000003",
      title: "Charla de prueba (cerrada)",
      category: "TALK" as const,
      points: 10,
      status: "CLOSED" as const,
      startsAt: hours(-24 * 7),
      checkInOpensAt: hours(-24 * 7 - 1),
      checkInClosesAt: hours(-24 * 7 + 3),
      closedAt: hours(-24 * 6),
      location: "Bloque 29",
    },
    {
      publicId: "demo000004",
      title: "Reunión de prueba con código",
      category: "COMMITTEE_MEETING" as const,
      points: 0,
      status: "OPEN" as const,
      requireRotatingCode: true,
      rotatingSecret: "secreto-de-prueba-solo-para-desarrollo",
      committeeId: committees[0]?.id ?? null,
      startsAt: hours(0),
      checkInOpensAt: hours(-1),
      checkInClosesAt: hours(2),
      location: "Oficina de la OE",
    },
    {
      publicId: "demo000005",
      title: "Taller de prueba (borrador)",
      category: "WORKSHOP" as const,
      points: 15,
      status: "DRAFT" as const,
      startsAt: hours(24 * 7),
      checkInOpensAt: hours(24 * 7 - 1),
      checkInClosesAt: hours(24 * 7 + 3),
      location: "Por definir",
    },
  ];
  for (const row of rows) {
    const values = { termId: current, approval: "AUTO" as const, ...row };
    await db
      .insert(occasion)
      .values(values)
      .onConflictDoUpdate({ target: occasion.publicId, set: values });
  }

  // La cerrada tiene asistentes con crédito, para que consola, ledger y rankings muestren datos.
  const [closed] = await db
    .select({ id: occasion.id, title: occasion.title, points: occasion.points })
    .from(occasion)
    .where(eq(occasion.publicId, "demo000003"));
  if (!closed) return;
  const attendees = await db
    .select({ personId: membership.personId })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .where(and(eq(person.source, "SEED"), eq(membership.status, "ACTIVE")))
    .orderBy(person.email)
    .limit(12);
  for (const [index, who] of attendees.entries()) {
    const at = hours(-24 * 7 + index / 12);
    const [row] = await db
      .insert(checkIn)
      .values({
        occasionId: closed.id,
        personId: who.personId,
        status: "APPROVED",
        source: index % 3 === 0 ? "HOST" : "SELF_QR",
        at,
        createdAt: at,
      })
      .onConflictDoNothing({ target: [checkIn.occasionId, checkIn.personId] })
      .returning({ id: checkIn.id });
    if (!row) continue;
    await db.insert(pointEntry).values({
      personId: who.personId,
      termId: current,
      checkInId: row.id,
      kind: "CHECKIN",
      points: closed.points,
      reason: closed.title,
      createdAt: at,
    });
  }
  await enqueueEvent(db, {
    type: "score.recompute",
    payload: { occasionId: closed.id },
    dedupeKey: `score:${closed.id}`,
  });
}

try {
  // Solo datos sintéticos: la migración de producción conserva el marcador "pendiente".
  await db
    .insert(appConfig)
    .values({ key: "privacy.policyVersion", value: "prueba-v1" })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: "prueba-v1", updatedAt: new Date() },
    });
  const terms = await seedTerms();
  const committees = await seedCommittees();
  await seedPeople(terms, committees);
  await seedAlumni(terms, committees);
  await seedAdmin(terms, committees);
  await seedConsents();
  await seedAppointments(terms);
  await seedPermanenceRules(terms, committees);
  await seedWorkGroups(terms);
  await seedRecognition(terms, committees);
  await seedPermanenceConditions(terms);
  await seedContent(committees);
  await seedOccasions(terms, committees);
  const current = terms.get("2026-2");
  if (!current) throw new Error("falta término");
  await seedFase5(db, current);
  await seedFase6(db, current);
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
