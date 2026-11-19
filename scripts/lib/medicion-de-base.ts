import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { enqueueEvent, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { scoreRecompute } from "@/domain-events/participation";
import { permanenceRecompute } from "@/domain-events/permanence";
import { getEnv } from "@/env";
import { createTemplate } from "@/modules/comms";
import { emailTemplate } from "@/modules/comms/schema";
import { createRequestAs } from "@/modules/crm";
import { internalCall, request } from "@/modules/crm/schema";
import { grantPermission, revokePermission } from "@/modules/identity";
import { permission } from "@/modules/identity/schema";
import { loadGamificationSettings, submitEvidenceAs } from "@/modules/participation";
import { createChallenge, publishChallenge } from "@/modules/participation/domain/challenges";
import {
  challenge,
  challengeParticipation,
  checkIn,
  occasion,
  pointEntry,
} from "@/modules/participation/schema";
import {
  committee,
  committeeMembership,
  consent,
  membership,
  person,
  segment,
} from "@/modules/people/schema";
import { createRuleAs, getTableView } from "@/modules/permanence";
import { workGroup } from "@/modules/permanence/schema";
import { getPrivacyPolicyState } from "@/modules/system";
import { getCurrentTerm } from "@/modules/terms";
import { term } from "@/modules/terms/schema";

// Cuentas y datos sintéticos de la medición de base (docs/23-medicion-de-base.md). Corre en local o en
// staging, nunca en producción. Idempotente por correo, publicId y título: correrlo otra vez antes de una
// tanda de sesiones solo reabre la ocasión y la convocatoria. Nadie recibe contraseña: el moderador emite
// el enlace de cada cuenta desde la Persona 360 de staging, como hace la junta (ADR-051).

type Db = ReturnType<typeof getDb>;

const DAY = 24 * 60 * 60_000;
const HOUR = 60 * 60_000;
const DOMAIN = "eafit.edu.co";
const ACCOUNT_SOURCE = "MEDICION_DE_BASE";
const ACCOUNT_CONFLICT = "Una cuenta solicitada ya existe fuera de la medición.";
const MEMBER_COMMITTEE = "gemis";
const SECOND_COMMITTEES = ["a3", "cigma", "epic"];
const EVIDENCE_AUTHORS = 10;
const OPEN_OCCASION = "medabierta";
const MEETINGS = ["medreun001", "medreun002", "medreun003"];
const TALKS = ["medcharl01", "medcharl02"];
const GROUP_NAME = "GAP de prueba de la medición";
const CALL_TITLE = "Apoyo logístico para la feria de comités (prueba)";
const CAMPAIGN_SEGMENT = "GEMIS · medición de base";
const CAMPAIGN_TEMPLATE = "Aviso de GEMIS (prueba)";
const MAX_ACCOUNTS = 40;

const FIRST_NAMES = [
  "Valeria",
  "Santiago",
  "Juliana",
  "Mateo",
  "Daniela",
  "Sebastián",
  "Laura",
  "Alejandro",
  "Manuela",
  "Esteban",
  "Sara",
  "Emilio",
  "Antonia",
  "Simón",
  "Luciana",
  "Martín",
  "Isabel",
  "Jerónimo",
  "Paula",
  "Andrés",
];
const SURNAMES = [
  "Ochoa",
  "Restrepo",
  "Zapata",
  "Gaviria",
  "Mejía",
  "Uribe",
  "Henao",
  "Montoya",
  "Vélez",
  "Londoño",
  "Agudelo",
  "Correa",
  "Echavarría",
  "Bedoya",
  "Ospina",
  "Arbeláez",
  "Toro",
  "Salazar",
  "Jaramillo",
  "Posada",
];

export interface MeasurementOptions {
  members: number;
  operations: number;
  /** Días que la ocasión abierta y la convocatoria quedan vigentes desde ahora. */
  days: number;
  now?: Date;
}

export interface MemberAccount {
  email: string;
  name: string;
}

export interface OperationsAccount extends MemberAccount {
  /** O1: la persona que busca en la Persona 360. */
  searchPerson: string;
  /** O2: quién pidió la licencia que responde. */
  leaveRequester: string;
  /** O3: el reto con sus diez evidencias pendientes. */
  challengeTitle: string;
}

export interface MeasurementPlan {
  term: string;
  committee: string;
  occasion: { publicId: string; title: string; closesAt: Date };
  call: { title: string; closesAt: Date };
  campaign: { segment: string; template: string };
  moderator: MemberAccount;
  members: MemberAccount[];
  operations: OperationsAccount[];
}

export class MeasurementError extends Error {}

/** Nunca en producción: ni con su `NODE_ENV` ni apuntando a su dominio. */
export function productionTargetError(
  env: { NODE_ENV: string; APP_URL: string },
  railwayEnvironment?: string,
): string | null {
  if (railwayEnvironment?.toLowerCase() === "production") {
    return "La medición solo se prepara en el entorno local o en staging.";
  }
  if (env.NODE_ENV === "production") {
    return "La medición no se prepara con NODE_ENV=production";
  }
  const host = new URL(env.APP_URL).hostname;
  if (host === "oeeafit.com" || host.endsWith(".oeeafit.com")) {
    return "APP_URL apunta a producción: la medición solo se prepara en staging";
  }
  return null;
}

function assertNotProduction(): void {
  const error = productionTargetError(getEnv(), process.env.RAILWAY_ENVIRONMENT_NAME);
  if (error) throw new MeasurementError(error);
}

function demoEmail(code: string): string {
  return `oe.medicion.${code}@${DOMAIN}`;
}

function numberedEmail(prefix: string, index: number): string {
  return demoEmail(`${prefix}${String(index).padStart(2, "0")}`);
}

async function checkAccountOwnership(db: Db, options: MeasurementOptions) {
  const emailsFor = (prefix: string, length: number) =>
    Array.from({ length }, (_, index) => numberedEmail(prefix, index + 1));
  const emails = [
    demoEmail("moderacion"),
    ...emailsFor("m", options.members),
    ...emailsFor("e", EVIDENCE_AUTHORS),
    ...["o", "p", "s"].flatMap((prefix) => emailsFor(prefix, options.operations)),
  ];
  const [other] = await db
    .select({ id: person.id })
    .from(person)
    .where(
      and(inArray(person.email, emails), sql`${person.source} is distinct from ${ACCOUNT_SOURCE}`),
    )
    .limit(1);
  if (other) throw new MeasurementError(ACCOUNT_CONFLICT);
}

/** Nombres sintéticos únicos por índice: el par (nombre, primer apellido) no se repite hasta 400. */
function syntheticName(index: number): { firstName: string; lastName: string } {
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length] ?? "Persona";
  const first = SURNAMES[Math.floor(index / FIRST_NAMES.length) % SURNAMES.length] ?? "Prueba";
  const second = SURNAMES[(index * 7 + 3) % SURNAMES.length] ?? "Sintética";
  return { firstName, lastName: `${first} ${second}` };
}

function fullName(name: { firstName: string; lastName: string }): string {
  return `${name.firstName} ${name.lastName}`;
}

async function committeeId(db: Db, slug: string): Promise<string | null> {
  const [row] = await db
    .select({ id: committee.id, deactivatedOn: committee.deactivatedOn })
    .from(committee)
    .where(eq(committee.slug, slug))
    .limit(1);
  return row && !row.deactivatedOn ? row.id : null;
}

async function previousTermId(db: Db, current: { id: string; startsOn: string }) {
  const terms = await db.select({ id: term.id, endsOn: term.endsOn }).from(term);
  const before = terms
    .filter((row) => row.endsOn < current.startsOn)
    .sort((a, b) => b.endsOn.localeCompare(a.endsOn));
  return before[0]?.id ?? current.id;
}

interface Ctx {
  db: Db;
  termId: string;
  firstTermId: string;
  joinedAt: Date;
  policyVersion: string;
}

/** Persona activa del término, veterana, con su autorización de membresía y sus comités. */
async function ensurePerson(
  ctx: Ctx,
  email: string,
  index: number,
  committeeIds: string[],
): Promise<{ id: string; name: string }> {
  const name = syntheticName(index);
  const [row] = await ctx.db
    .insert(person)
    .values({ email, ...name, stage: "MEMBER", source: ACCOUNT_SOURCE })
    .onConflictDoUpdate({
      target: person.email,
      set: name,
      setWhere: eq(person.source, ACCOUNT_SOURCE),
    })
    .returning({ id: person.id });
  if (!row) throw new MeasurementError(ACCOUNT_CONFLICT);
  await ctx.db
    .insert(membership)
    .values({ personId: row.id, status: "ACTIVE", firstTermId: ctx.firstTermId })
    .onConflictDoNothing();
  await ctx.db
    .insert(consent)
    .values({
      personId: row.id,
      purpose: "MEMBERSHIP",
      source: "IMPORT",
      policyVersion: ctx.policyVersion,
    })
    .onConflictDoNothing();
  for (const id of committeeIds) {
    await ctx.db
      .insert(committeeMembership)
      .values({
        personId: row.id,
        committeeId: id,
        termId: ctx.termId,
        roleCode: "MIEMBRO",
        joinedAt: ctx.joinedAt,
      })
      .onConflictDoNothing();
  }
  return { id: row.id, name: fullName(name) };
}

/** Una ocasión con publicId fijo; la abierta corre su ventana a partir de ahora en cada pasada. */
async function ensureOccasion(
  ctx: Ctx,
  values: Omit<typeof occasion.$inferInsert, "termId">,
  reopen: boolean,
) {
  // El QR tiene diez caracteres y pertenece al semestre en el que se realiza la medición.
  const publicId = createHash("sha256")
    .update(`medicion:${ctx.termId}:${values.publicId}`)
    .digest("hex")
    .slice(0, 10);
  const fields = {
    id: occasion.id,
    publicId: occasion.publicId,
    points: occasion.points,
    title: occasion.title,
    startsAt: occasion.startsAt,
  };
  const [found] = await ctx.db
    .select(fields)
    .from(occasion)
    .where(
      and(
        eq(occasion.termId, ctx.termId),
        eq(occasion.title, values.title),
        eq(occasion.publicId, publicId),
      ),
    )
    .limit(1);
  if (found) {
    if (reopen) {
      await ctx.db
        .update(occasion)
        .set({
          status: "OPEN",
          startsAt: values.startsAt,
          checkInOpensAt: values.checkInOpensAt,
          checkInClosesAt: values.checkInClosesAt,
          closedAt: null,
        })
        .where(eq(occasion.id, found.id));
    }
    return found;
  }
  const [row] = await ctx.db
    .insert(occasion)
    .values({ ...values, publicId, termId: ctx.termId, approval: "AUTO" })
    .returning(fields);
  if (!row) throw new MeasurementError(`No se pudo crear la ocasión ${values.publicId}`);
  return row;
}

async function attend(
  ctx: Ctx,
  item: { id: string; points: number; title: string; startsAt: Date },
  personId: string,
): Promise<void> {
  const at = item.startsAt;
  await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(checkIn)
      .values({
        occasionId: item.id,
        personId,
        status: "APPROVED",
        source: "SELF_QR",
        at,
        createdAt: at,
      })
      .onConflictDoNothing({ target: [checkIn.occasionId, checkIn.personId] })
      .returning({ id: checkIn.id });
    if (!row || item.points === 0) return;
    await tx.insert(pointEntry).values({
      personId,
      termId: ctx.termId,
      checkInId: row.id,
      kind: "CHECKIN",
      points: item.points,
      reason: item.title,
      createdAt: at,
    });
  });
}

async function ensureCall(ctx: Ctx, now: Date, closes: Date): Promise<void> {
  const [group] = await ctx.db
    .select({ id: workGroup.id })
    .from(workGroup)
    .where(and(eq(workGroup.termId, ctx.termId), eq(workGroup.name, GROUP_NAME)))
    .limit(1);
  const groupId =
    group?.id ??
    (
      await ctx.db
        .insert(workGroup)
        .values({ termId: ctx.termId, kind: "GAP", name: GROUP_NAME })
        .returning({ id: workGroup.id })
    )[0]?.id;
  if (!groupId) throw new MeasurementError("No se pudo crear el grupo de la convocatoria");
  const window = {
    opensAt: new Date(now.getTime() - DAY),
    closesAt: closes,
    status: "OPEN" as const,
  };
  const [found] = await ctx.db
    .select({ id: internalCall.id })
    .from(internalCall)
    .where(and(eq(internalCall.termId, ctx.termId), eq(internalCall.title, CALL_TITLE)))
    .limit(1);
  if (found) {
    await ctx.db.update(internalCall).set(window).where(eq(internalCall.id, found.id));
    return;
  }
  await ctx.db.insert(internalCall).values({
    termId: ctx.termId,
    groupId,
    title: CALL_TITLE,
    description:
      "Convocatoria **sintética** de la medición de base: ni el cupo ni las fechas son datos de la OE.",
    capacity: null,
    selection: "FIRST_COME",
    ...window,
  });
}

async function ensurePendingLeave(ctx: Ctx, personId: string, now: Date): Promise<void> {
  const [existing] = await ctx.db
    .select({ id: request.id })
    .from(request)
    .where(
      and(
        eq(request.personId, personId),
        eq(request.kind, "LEAVE"),
        eq(request.termId, ctx.termId),
      ),
    )
    .limit(1);
  if (existing) return;
  const until = new Date(now.getTime() + 30 * DAY).toISOString().slice(0, 10);
  await createRequestAs({ personId, ip: null }, "LEAVE", {
    reason: "Viaje familiar fuera de Medellín (dato sintético de la medición)",
    until,
  });
}

/** Un reto con evidencia, solo para el comité de los autores, con diez entregas por revisar. */
async function ensureChallengeWithEvidence(
  ctx: Ctx,
  title: string,
  audienceCommitteeId: string,
  authors: string[],
  now: Date,
  closes: Date,
): Promise<void> {
  const [found] = await ctx.db
    .select({ id: challenge.id })
    .from(challenge)
    .where(and(eq(challenge.termId, ctx.termId), eq(challenge.title, title)))
    .limit(1);
  const challengeId =
    found?.id ??
    (await runCommand(SYSTEM_ACTOR, async (command) => {
      const { id } = await createChallenge(
        command,
        {
          kind: "EVIDENCE",
          title,
          description:
            "Cuenta en dos líneas cómo ayudaste en la feria de comités (dato sintético).",
          audience: "COMMITTEES",
          audienceCommitteeIds: [audienceCommitteeId],
          opensAt: new Date(now.getTime() - HOUR),
          closesAt: closes,
          basePoints: 10,
          passPercent: null,
          occasionId: null,
          questions: [],
        },
        { termId: ctx.termId, defaultPassPercent: 80 },
      );
      await publishChallenge(command, id);
      return id;
    }));
  const done = await ctx.db
    .select({ personId: challengeParticipation.personId })
    .from(challengeParticipation)
    .where(
      and(
        eq(challengeParticipation.challengeId, challengeId),
        inArray(challengeParticipation.personId, authors),
      ),
    );
  const submitted = new Set(done.map((row) => row.personId));
  for (const [index, personId] of authors.entries()) {
    if (submitted.has(personId)) continue;
    const result = await submitEvidenceAs(
      { personId, ip: null },
      {
        challengeId,
        requestId: randomUUID(),
        text: `Ayudé a montar el stand ${index + 1} y a recibir a los visitantes (dato sintético).`,
        keys: [],
      },
    );
    if (!result.ok) {
      throw new MeasurementError(`La evidencia sintética de «${title}» no entró: ${result.reason}`);
    }
  }
}

/** Crea o completa las cuentas y los datos de la medición, y devuelve lo que necesita el guion. */
async function withMeasurementLock<T>(work: (db: Db) => Promise<T>): Promise<T> {
  assertNotProduction();
  const db = getDb();
  const connection = await db.$client.connect();
  try {
    const result = await connection.query<{ locked: boolean }>(
      "select pg_try_advisory_lock(hashtextextended('medicion-de-base', 0)) as locked",
    );
    if (!result.rows[0]?.locked)
      throw new MeasurementError("La medición ya se está preparando o retirando.");
    return await work(db);
  } finally {
    // El cierre de la conexión exclusiva suelta el candado incluso al fallar un comando.
    connection.release(true);
  }
}

export function prepareMeasurement(options: MeasurementOptions): Promise<MeasurementPlan> {
  return withMeasurementLock((db) => prepareAccounts(db, options));
}

async function prepareAccounts(db: Db, options: MeasurementOptions): Promise<MeasurementPlan> {
  if (
    !Number.isInteger(options.members) ||
    !Number.isInteger(options.operations) ||
    options.members < 1 ||
    options.operations < 1 ||
    options.members > MAX_ACCOUNTS ||
    options.operations > MAX_ACCOUNTS
  ) {
    throw new MeasurementError(`Entre 1 y ${MAX_ACCOUNTS} cuentas por grupo`);
  }
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 60) {
    throw new MeasurementError("La ventana va de 1 a 60 días");
  }
  const now = options.now ?? new Date();
  const closes = new Date(now.getTime() + options.days * DAY);
  const current = await getCurrentTerm(now);
  if (!current) throw new MeasurementError("No hay un término vigente en este entorno");
  if (new Date(`${current.endsOn}T23:59:59-05:00`) < closes) {
    throw new MeasurementError(
      `El término ${current.code} termina el ${current.endsOn}, antes de que cierre la ventana: baja --dias`,
    );
  }
  const gemis = await committeeId(db, MEMBER_COMMITTEE);
  if (!gemis) throw new MeasurementError("Falta el comité GEMIS activo en este entorno");
  let second: string | null = null;
  for (const slug of SECOND_COMMITTEES) {
    second = await committeeId(db, slug);
    if (second) break;
  }
  if (!second) throw new MeasurementError("Falta un segundo comité activo para la Operación");
  const settings = await loadGamificationSettings();
  if (!settings.enabled) {
    throw new MeasurementError(
      "La gamificación está apagada en este entorno; los retos de la tarea O3 la necesitan",
    );
  }
  const policy = await getPrivacyPolicyState();
  if (!policy.ready || !policy.version) {
    throw new MeasurementError(
      "La política de datos de prueba debe estar activa para que las cuentas entren a Mi OE.",
    );
  }
  if (current.permanenceClosedAt || current.pointsClosedAt) {
    throw new MeasurementError(
      "El término debe tener abiertos la permanencia y el saldo de GH Points.",
    );
  }
  await checkAccountOwnership(db, options);
  const ctx: Ctx = {
    db,
    termId: current.id,
    firstTermId: await previousTermId(db, current),
    joinedAt: new Date(`${current.startsOn}T05:00:00Z`),
    policyVersion: policy.version,
  };
  const memberTable = { termId: current.id, committeeId: gemis, scope: "COMMITTEE" as const };
  if ((await getTableView(memberTable)).rules.length === 0) {
    await createRuleAs(
      SYSTEM_ACTOR,
      memberTable,
      {
        key: "medicion-reuniones",
        label: "Asistencia a reuniones de la medición (prueba)",
        description: "Criterio sintético para las tareas de la medición de base.",
        weight: 10,
        appliesTo: "ALL",
        computation: "CHECKIN_RATE",
        params: { category: "COMMITTEE_MEETING", committee: "OWN" },
        sortOrder: 0,
      },
      { bypassLock: false },
    );
  }

  // Ocasiones: la abierta de la tarea M1 y cinco cerradas que dan la permanencia y el saldo a medias.
  const openOccasion = await ensureOccasion(
    ctx,
    {
      publicId: OPEN_OCCASION,
      title: "Reunión semanal de GEMIS (prueba)",
      category: "COMMITTEE_MEETING",
      committeeId: gemis,
      points: 0,
      status: "OPEN",
      requireRotatingCode: true,
      rotatingSecret: randomBytes(24).toString("hex"),
      location: "Oficina de la OE",
      startsAt: now,
      checkInOpensAt: new Date(now.getTime() - HOUR),
      checkInClosesAt: closes,
    },
    true,
  );
  const past = (publicId: string, title: string, daysAgo: number, extra: object) => {
    const at = Math.max(ctx.joinedAt.getTime(), now.getTime() - daysAgo * DAY);
    return ensureOccasion(
      ctx,
      {
        publicId,
        title,
        status: "CLOSED",
        startsAt: new Date(at),
        checkInOpensAt: new Date(at - HOUR),
        checkInClosesAt: new Date(Math.min(now.getTime(), at + 3 * HOUR)),
        closedAt: new Date(Math.min(now.getTime(), at + 4 * HOUR)),
        ...extra,
      },
      false,
    );
  };
  const meetings = await Promise.all(
    MEETINGS.map((publicId, index) =>
      past(publicId, `Reunión de GEMIS ${index + 1} (prueba)`, 21 - index * 7, {
        category: "COMMITTEE_MEETING",
        committeeId: gemis,
        points: 0,
      }),
    ),
  );
  const talks = await Promise.all(
    TALKS.map((publicId, index) =>
      past(publicId, `Charla de liderazgo ${index + 1} (prueba)`, 18 - index * 7, {
        category: "TALK",
        points: 10,
      }),
    ),
  );
  await ensureCall(ctx, now, closes);

  const moderatorEmail = demoEmail("moderacion");
  const moderator = await ensurePerson(ctx, moderatorEmail, 0, []);
  await runCommand({ personId: moderator.id, ip: null }, async (command) => {
    const [audience] = await command.tx
      .select({ id: segment.id })
      .from(segment)
      .where(and(eq(segment.name, CAMPAIGN_SEGMENT), eq(segment.createdById, moderator.id)))
      .limit(1);
    if (!audience)
      await command.tx.insert(segment).values({
        name: CAMPAIGN_SEGMENT,
        createdById: moderator.id,
        filter: { statuses: ["ACTIVE"], committeeIds: [gemis] },
      });
    const slug = "medicion-de-base-gemis";
    const [template] = await command.tx
      .select({ id: emailTemplate.id })
      .from(emailTemplate)
      .where(eq(emailTemplate.slug, slug))
      .limit(1);
    if (!template)
      await createTemplate(command, {
        slug,
        name: CAMPAIGN_TEMPLATE,
        subject: "Reunión de GEMIS (prueba)",
        body: "Este es un borrador sintético para la medición de base.",
      });
  });

  // El tablero de GH Points solo muestra el puesto de quienes tienen un saldo positivo.
  const members: MemberAccount[] = [];
  for (let n = 1; n <= options.members; n += 1) {
    const email = numberedEmail("m", n);
    const who = await ensurePerson(ctx, email, n, [gemis]);
    for (const [index, item] of meetings.entries()) {
      if ((n + index) % 3 !== 0) await attend(ctx, item, who.id);
    }
    const [talk1, talk2] = talks;
    if (talk1) await attend(ctx, talk1, who.id);
    if (talk2 && n % 2 === 0) await attend(ctx, talk2, who.id);
    members.push({ email, name: who.name });
  }

  // Autores de las evidencias, compartidos por todos los retos.
  const authors: string[] = [];
  for (let n = 1; n <= EVIDENCE_AUTHORS; n += 1) {
    const who = await ensurePerson(ctx, numberedEmail("e", n), 100 + n, [second]);
    authors.push(who.id);
  }

  const operations: OperationsAccount[] = [];
  for (let n = 1; n <= options.operations; n += 1) {
    const code = String(n).padStart(2, "0");
    const email = numberedEmail("o", n);
    const who = await ensurePerson(ctx, email, 40 + n, []);
    const target = await ensurePerson(ctx, numberedEmail("p", n), 160 + n, [gemis, second]);
    const [firstMeeting] = meetings;
    const [talk1] = talks;
    if (firstMeeting) await attend(ctx, firstMeeting, target.id);
    if (talk1) await attend(ctx, talk1, target.id);
    const requester = await ensurePerson(ctx, numberedEmail("s", n), 220 + n, [second]);
    await ensurePendingLeave(ctx, requester.id, now);
    const challengeTitle = `Misión de la feria de comités ${code} (prueba)`;
    await ensureChallengeWithEvidence(ctx, challengeTitle, second, authors, now, closes);
    operations.push({
      email,
      name: who.name,
      searchPerson: target.name,
      leaveRequester: requester.name,
      challengeTitle,
    });
  }

  for (const item of [...meetings, ...talks]) {
    await enqueueEvent(
      db,
      eventOf(scoreRecompute, { occasionId: item.id }, { dedupeKey: `score:${item.id}` }),
    );
  }
  await enqueueEvent(
    db,
    eventOf(
      permanenceRecompute,
      { termId: current.id },
      { dedupeKey: `permanence:${current.id}:*` },
    ),
  );
  const adminEmails = [moderatorEmail, ...operations.map(({ email }) => email)];
  await runCommand(SYSTEM_ACTOR, async (command) => {
    const existing = await command.tx
      .select({ email: person.email })
      .from(permission)
      .innerJoin(person, eq(person.id, permission.personId))
      .where(and(eq(permission.code, "ADMIN"), inArray(person.email, adminEmails)));
    const granted = new Set(existing.map(({ email }) => email));
    for (const email of adminEmails) {
      if (!granted.has(email)) await grantPermission(command, { email, code: "ADMIN" });
    }
  });

  return {
    term: current.code,
    committee: "GEMIS",
    occasion: { publicId: openOccasion.publicId, title: openOccasion.title, closesAt: closes },
    call: { title: CALL_TITLE, closesAt: closes },
    campaign: { segment: CAMPAIGN_SEGMENT, template: CAMPAIGN_TEMPLATE },
    moderator: { email: moderatorEmail, name: moderator.name },
    members,
    operations,
  };
}

/** Al cerrar la medición: las cuentas de la Operación y del moderador pierden ADMIN. */
export function retireMeasurement(): Promise<number> {
  return withMeasurementLock(() =>
    runCommand(SYSTEM_ACTOR, async (command) => {
      const adminEmails = [
        demoEmail("moderacion"),
        ...Array.from({ length: MAX_ACCOUNTS }, (_, index) => numberedEmail("o", index + 1)),
      ];
      const rows = await command.tx
        .select({ id: permission.id })
        .from(permission)
        .innerJoin(person, eq(person.id, permission.personId))
        .where(
          and(
            eq(permission.code, "ADMIN"),
            eq(person.source, ACCOUNT_SOURCE),
            inArray(person.email, adminEmails),
          ),
        )
        .orderBy(permission.id);
      for (const row of rows) await revokePermission(command, row.id);
      return rows.length;
    }),
  );
}
