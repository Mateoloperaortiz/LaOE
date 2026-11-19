import { and, count, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { createCampaignAs } from "@/modules/comms";
import { campaign, emailTemplate } from "@/modules/comms/schema";
import { applyToCallAs, createRequestAs, decideRequestAs } from "@/modules/crm";
import { internalCall, request } from "@/modules/crm/schema";
import { permission } from "@/modules/identity/schema";
import {
  checkInSelfAs,
  createOccasionAs,
  occasionInputSchema,
  peopleBoards,
  reviewParticipationAs,
  rotatingCodeAt,
  setGamificationEnabledAs,
} from "@/modules/participation";
import { challenge, challengeParticipation, occasion } from "@/modules/participation/schema";
import { committeeMembership, membership, person, segment } from "@/modules/people/schema";
import { getPersonPermanence, groupJoinBlocker } from "@/modules/permanence";
import { todayKey } from "@/shared/lib/dates";
import {
  prepareMeasurement,
  productionTargetError,
  retireMeasurement,
} from "../../scripts/lib/medicion-de-base";
import { seedCommittee, seedMember, seedPermission, seedTerm } from "../factories";
import { truncateAll } from "./db";

// Medición de base (docs/23-medicion-de-base.md): cada tarea encuentra sus datos y una segunda pasada
// no duplica nada.

const db = () => getDb();

async function openTerm() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 80);
  return seedTerm(undefined, { endsOn: date.toISOString().slice(0, 10) });
}

async function world(): Promise<void> {
  await openTerm();
  await seedCommittee("gemis");
  await seedCommittee("a3");
  await setGamificationEnabledAs(SYSTEM_ACTOR, true);
}

async function demoPeople(): Promise<number> {
  const [row] = await db()
    .select({ total: count() })
    .from(person)
    .where(like(person.email, "oe.medicion.%"));
  return row?.total ?? 0;
}

describe("medición de base", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("deja lo que pide cada tarea, una vez por cuenta", async () => {
    await world();

    const plan = await prepareMeasurement({ members: 2, operations: 2, days: 14 });

    // Cuentas: dos miembros en GEMIS y dos de la Operación con ADMIN, más el moderador.
    expect(plan.members.map((item) => item.email)).toEqual([
      "oe.medicion.m01@eafit.edu.co",
      "oe.medicion.m02@eafit.edu.co",
    ]);
    const admins = await db()
      .select({ email: person.email })
      .from(permission)
      .innerJoin(person, eq(person.id, permission.personId))
      .where(eq(permission.code, "ADMIN"));
    expect(admins.map((row) => row.email).sort()).toEqual([
      "oe.medicion.moderacion@eafit.edu.co",
      "oe.medicion.o01@eafit.edu.co",
      "oe.medicion.o02@eafit.edu.co",
    ]);
    const enGemis = await db()
      .select({ email: person.email })
      .from(committeeMembership)
      .innerJoin(person, eq(person.id, committeeMembership.personId))
      .where(like(person.email, "oe.medicion.m%"));
    expect(enGemis).toHaveLength(2);

    // M1: la ocasión de GEMIS pide código y está abierta ahora.
    const [abierta] = await db()
      .select()
      .from(occasion)
      .where(eq(occasion.publicId, plan.occasion.publicId));
    const now = Date.now();
    expect(abierta?.status).toBe("OPEN");
    expect(abierta?.requireRotatingCode).toBe(true);
    expect(abierta?.rotatingSecret).toBeTruthy();
    expect(abierta?.checkInOpensAt.getTime()).toBeLessThan(now);
    expect(abierta?.checkInClosesAt.getTime()).toBeGreaterThan(now + 13 * 24 * 3_600_000);

    // M4: la convocatoria está abierta.
    const [call] = await db()
      .select({ status: internalCall.status, closesAt: internalCall.closesAt })
      .from(internalCall)
      .where(eq(internalCall.title, plan.call.title));
    expect(call?.status).toBe("OPEN");
    expect(call?.closesAt.getTime()).toBeGreaterThan(now);

    // O1, O2 y O3: cada cuenta de la Operación tiene su persona, su solicitud y su reto con diez evidencias.
    expect(new Set(plan.operations.map((item) => item.searchPerson)).size).toBe(2);
    const pendientes = await db()
      .select({ total: count() })
      .from(request)
      .where(and(eq(request.kind, "LEAVE"), eq(request.status, "PENDING")));
    expect(pendientes[0]?.total).toBe(2);
    for (const item of plan.operations) {
      const [challengeTitle] = await db()
        .select({ id: challenge.id })
        .from(challenge)
        .where(eq(challenge.title, item.challengeTitle));
      expect(challengeTitle).toBeDefined();
      const entregas = await db()
        .select({ status: challengeParticipation.status })
        .from(challengeParticipation)
        .where(eq(challengeParticipation.challengeId, challengeTitle?.id ?? ""));
      expect(entregas).toHaveLength(10);
      expect(new Set(entregas.map((row) => row.status))).toEqual(new Set(["PENDING"]));
    }

    // Una segunda pasada no duplica personas, solicitudes ni entregas.
    const personas = await demoPeople();
    await prepareMeasurement({ members: 2, operations: 2, days: 14 });
    expect(await demoPeople()).toBe(personas);
    const otraVez = await db()
      .select({ total: count() })
      .from(request)
      .where(and(eq(request.kind, "LEAVE"), eq(request.status, "PENDING")));
    expect(otraVez[0]?.total).toBe(2);
    const retos = await db()
      .select({ id: challenge.id })
      .from(challenge)
      .where(like(challenge.title, "Misión de la feria de comités %"));
    const [entregasTotales] = await db()
      .select({ total: count() })
      .from(challengeParticipation)
      .where(
        inArray(
          challengeParticipation.challengeId,
          retos.map((row) => row.id),
        ),
      );
    expect(entregasTotales?.total).toBe(20);
  });

  it("retira ADMIN solo a las cuentas de demostración", async () => {
    await world();
    const junta = await seedMember("oe.medicion.o39@eafit.edu.co");
    await seedPermission(junta, "ADMIN");
    await prepareMeasurement({ members: 1, operations: 2, days: 7 });

    expect(await retireMeasurement()).toBe(3);
    expect(await retireMeasurement()).toBe(0);

    const quedan = await db()
      .select({ personId: permission.personId })
      .from(permission)
      .where(eq(permission.code, "ADMIN"));
    expect(quedan).toEqual([{ personId: junta }]);
  });

  it("permite registrar la asistencia, consultar el avance y el puesto, inscribirse, pedir la licencia y guardar el borrador dirigido al comité", async () => {
    await world();
    const plan = await prepareMeasurement({ members: 2, operations: 1, days: 7 });
    const members = await db()
      .select({ id: person.id, firstTerm: membership.firstTermId })
      .from(person)
      .innerJoin(membership, eq(person.id, membership.personId))
      .where(
        inArray(
          person.email,
          plan.members.map(({ email }) => email),
        ),
      )
      .orderBy(person.email);
    const [member] = members;
    const [open] = await db()
      .select()
      .from(occasion)
      .where(eq(occasion.publicId, plan.occasion.publicId));
    const [call] = await db()
      .select()
      .from(internalCall)
      .where(eq(internalCall.title, plan.call.title));
    const [template] = await db()
      .select()
      .from(emailTemplate)
      .where(eq(emailTemplate.name, plan.campaign.template));
    const [audience] = await db()
      .select()
      .from(segment)
      .where(eq(segment.name, plan.campaign.segment));
    if (!member || !open?.rotatingSecret || !open.committeeId || !call || !template || !audience)
      throw new Error("Faltan datos de la medición");
    const actor = { personId: member.id, ip: null };
    const score = await getPersonPermanence(member.id, open.termId);
    const criterion = score?.result.results
      .find((row) => row.committeeId === open.committeeId)
      ?.criteria.find((row) => row.computation === "CHECKIN_RATE");
    expect(criterion?.achieved).toBeGreaterThan(0);
    expect(criterion?.achieved).toBeLessThan(criterion?.weight ?? 0);
    const board = peopleBoards(open.termId);
    const positions = await Promise.all(
      members.map((who) => board.position(who.id, who.firstTerm)),
    );
    expect(positions.map(({ total }) => total)).toEqual([10, 20]);
    for (const position of positions) expect(position.rank).toBeGreaterThan(0);
    const code = rotatingCodeAt(open.rotatingSecret, open.id, new Date());
    expect(await checkInSelfAs(actor, { publicId: open.publicId, code })).toMatchObject({
      ok: true,
    });
    expect(
      await applyToCallAs(actor, call.id, {}, { inGroup: false, joinBlocker: groupJoinBlocker }),
    ).toMatchObject({ status: "ACCEPTED" });
    const returnDate = new Date(`${todayKey()}T12:00:00Z`);
    returnDate.setUTCMonth(returnDate.getUTCMonth() + 1, 1);
    expect(
      await createRequestAs(actor, "LEAVE", {
        reason: "Solicitud sintética de la medición.",
        until: todayKey(returnDate),
      }),
    ).toHaveProperty("id");
    expect(audience.filter).toEqual({ statuses: ["ACTIVE"], committeeIds: [open.committeeId] });
    const [operator] = await db()
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, "oe.medicion.o01@eafit.edu.co"));
    if (!operator) throw new Error("Falta la cuenta de Operación");
    const draft = await createCampaignAs(
      { personId: operator.id, ip: null },
      { name: "Campaña de prueba", templateId: template.id, segmentId: audience.id },
    );
    expect(
      await db()
        .select({ status: campaign.status })
        .from(campaign)
        .where(eq(campaign.id, draft.id)),
    ).toEqual([{ status: "DRAFT" }]);
  });

  it("conserva la identidad y los permisos de una cuenta preexistente que coincide por correo", async () => {
    await world();
    const external = await seedMember("oe.medicion.o01@eafit.edu.co", { firstName: "Existente" });
    await expect(prepareMeasurement({ members: 1, operations: 1, days: 7 })).rejects.toThrow(
      /ya existe/,
    );
    expect(
      await db().select({ name: person.firstName }).from(person).where(eq(person.id, external)),
    ).toEqual([{ name: "Existente" }]);
    expect(await demoPeople()).toBe(1);
    expect(await db().select({ id: occasion.id }).from(occasion)).toHaveLength(0);
    expect(await db().select().from(permission).where(eq(permission.code, "ADMIN"))).toHaveLength(
      0,
    );
  });

  it("la Operación decide la licencia y la evidencia y crea la ocasión sin perder lo decidido al repetir", async () => {
    await world();
    const options = { members: 1, operations: 1, days: 7 };
    const plan = await prepareMeasurement(options);
    const [operator] = await db()
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, "oe.medicion.o01@eafit.edu.co"));
    const [leave] = await db().select().from(request).where(eq(request.kind, "LEAVE"));
    const [evidence] = await db().select().from(challengeParticipation).limit(1);
    const [meeting] = await db()
      .select()
      .from(occasion)
      .where(eq(occasion.publicId, plan.occasion.publicId));
    if (!operator || !leave || !evidence || !meeting?.committeeId)
      throw new Error("Faltan los datos de la Operación");
    const actor = { personId: operator.id, ip: null };
    await decideRequestAs(actor, leave.id, { decision: "APPROVED" });
    await reviewParticipationAs(actor, { participationId: evidence.id, decision: "APPROVE" });
    const nextThursday = new Date(`${todayKey()}T12:00:00Z`);
    nextThursday.setUTCDate(
      nextThursday.getUTCDate() + ((4 - nextThursday.getUTCDay() + 7) % 7 || 7),
    );
    const created = await createOccasionAs(
      actor,
      occasionInputSchema.parse({
        title: "Reunión del jueves de GEMIS",
        startsAt: `${todayKey(nextThursday)}T18:00`,
        category: "COMMITTEE_MEETING",
        committeeId: meeting.committeeId,
        requireRotatingCode: true,
      }),
    );
    await prepareMeasurement(options);
    expect(await db().select({ status: request.status }).from(request)).toEqual([
      { status: "APPROVED" },
    ]);
    const reviews = await db()
      .select({ status: challengeParticipation.status })
      .from(challengeParticipation);
    expect(reviews.filter(({ status }) => status === "COMPLETED")).toHaveLength(1);
    expect(reviews.filter(({ status }) => status === "PENDING")).toHaveLength(9);
    expect(
      await db()
        .select({ code: occasion.requireRotatingCode })
        .from(occasion)
        .where(eq(occasion.id, created.id)),
    ).toEqual([{ code: true }]);
  });

  it("no corre sin GEMIS ni con la gamificación apagada", async () => {
    await openTerm();
    await expect(prepareMeasurement({ members: 1, operations: 1, days: 7 })).rejects.toThrow(
      /GEMIS/,
    );
    await seedCommittee("gemis");
    await seedCommittee("a3");
    await expect(prepareMeasurement({ members: 1, operations: 1, days: 7 })).rejects.toThrow(
      /gamificación/,
    );
  });

  it("se niega a apuntar a producción", () => {
    const staging = "https://web-staging.up.railway.app";
    expect(productionTargetError({ NODE_ENV: "development", APP_URL: staging })).toBeNull();
    expect(productionTargetError({ NODE_ENV: "production", APP_URL: staging })).toMatch(/NODE_ENV/);
    expect(
      productionTargetError({ NODE_ENV: "development", APP_URL: staging }, "production"),
    ).toBeTruthy();
    expect(
      productionTargetError({ NODE_ENV: "development", APP_URL: "https://oeeafit.com" }),
    ).toMatch(/producción/);
    expect(
      productionTargetError({ NODE_ENV: "development", APP_URL: "https://www.oeeafit.com/app" }),
    ).toMatch(/producción/);
  });
});
