import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { membershipChanged } from "@/domain-events/people";
import { registerHandler } from "@/jobs/registry";
import {
  saveSubscriptionAs,
  setMailTransportsForTests,
  setPushSenderForTests,
  updatePreferencesAs,
} from "@/modules/comms";
import { notificationPreference, pushSubscription } from "@/modules/comms/schema";
import { createTaskAs } from "@/modules/crm";
import { task } from "@/modules/crm/schema";
import { formSubmission } from "@/modules/forms/schema";
import {
  getOrCreateCalendarToken,
  grantPermissionAs,
  issueAccessGrantAs,
  listPermissionsFor,
} from "@/modules/identity";
import { hashPassword } from "@/modules/identity/domain/pure";
import { createSession } from "@/modules/identity/domain/session";
import {
  accessGrant,
  calendarToken,
  credential,
  permission,
  session,
} from "@/modules/identity/schema";
import { createSurveyInvites } from "@/modules/participation";
import { occasion, occasionSurveyInvite } from "@/modules/participation/schema";
import {
  changeMembershipStatusAs,
  endMembershipAs,
  reactivateMembershipAs,
} from "@/modules/people";
import { reactivateMembership } from "@/modules/people/domain/membership";
import { holdCommand, waitingOn } from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";
import {
  leaveUntilSoon,
  seedCheckIn,
  seedCommittee,
  seedForm,
  seedMember,
  seedOccasion,
  seedSubmission,
  seedTerm,
} from "./factories";

// Los borrados de la baja toleran el reintento (DT-216 a, ADR-118 regla 5). Identity, crm, forms, comms
// y participation borran lo que no es historia cuando llega `membership.changed` hacia INACTIVE. Decidían
// con el `to` del evento, que dice cómo estaba la persona cuando se emitió: un evento de baja que el
// poller reintenta después de que la persona volvió le borraba lo que acababa de recibir. El poller es
// el real: corre en serie los handlers de un evento y, si uno falla, lo reintenta completo.

const MINUTE = 60_000;
const db = () => getDb();
/** El instante en que el poller ya reintenta un primer fallo: un minuto después (ADR-012). */
const afterBackoff = () => new Date(Date.now() + 2 * MINUTE);
const SALIDA = { endReason: "RESIGNATION" as const, memorialConsent: false, contactConsent: false };
const EMAIL = "vuelve@eafit.edu.co";

/** Cuántas veces más falla el vecino, y cuántas ha corrido. */
let neighbourFailures = 0;
let neighbourRuns = 0;
let sequence = 0;

interface Scene {
  board: string;
  personId: string;
  termId: string;
  committeeId: string;
}

async function scene(): Promise<Scene> {
  const termId = await seedTerm();
  const committeeId = await seedCommittee("a3", "A3");
  const board = await seedMember("junta-baja@eafit.edu.co");
  await db().insert(permission).values({ personId: board, code: "ADMIN" });
  const personId = await seedMember(EMAIL, { firstName: "Nora" });
  return { board, personId, termId, committeeId };
}

/** Todo lo que una baja se lleva, recién creado: lo que la persona tiene mientras está adentro. */
async function equip({ board, personId, termId, committeeId }: Scene): Promise<void> {
  sequence += 1;
  await db()
    .insert(credential)
    .values({ personId, passwordHash: await hashPassword("trapecio verde 41") });
  await grantPermissionAs(
    { personId: board, ip: null },
    { email: EMAIL, code: "COMMITTEE_LEADER", committeeId },
  );
  // Después del permiso: concederlo borra los enlaces vivos de quien lo recibe (ADR-119 regla 17).
  await issueAccessGrantAs({ personId: board, ip: null }, { personId, kind: "ACTIVATION" });
  await getOrCreateCalendarToken(personId);
  await createTaskAs(
    { personId: board, ip: null },
    { title: "Llamar a Nora", kind: "GENERAL", personId },
  );
  const formId = await seedForm(`inscripcion-${sequence}`);
  await seedSubmission(formId, EMAIL, { personId });
  await saveSubscriptionAs(
    { personId, ip: null },
    {
      endpoint: `https://fcm.googleapis.com/fcm/send/nora-${sequence}`,
      keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) },
    },
    null,
  );
  await updatePreferencesAs(
    { personId, ip: null },
    {
      emailCampaigns: true,
      pushAnnouncements: true,
      pushPoints: false,
      pushReminders: true,
      pushWordle: true,
    },
  );
  const surveyId = await seedForm(`encuesta-${sequence}`, {
    audience: "MEMBERS",
    fields: [{ key: "calif", label: "¿Cómo estuvo?", type: "RATING", required: true }],
    actions: { createPerson: false },
  });
  const { id: occasionId } = await seedOccasion(termId, { status: "CLOSED" });
  await db().update(occasion).set({ surveyFormId: surveyId }).where(eq(occasion.id, occasionId));
  await seedCheckIn(occasionId, personId, "APPROVED");
  await createSurveyInvites(occasionId);
}

/** Lo que la persona conserva de todo eso, módulo por módulo. */
async function holdings(personId: string) {
  const [credentials, grants, calendars, tasks, submissions, subscriptions, preferences, invites] =
    await Promise.all([
      db().select().from(credential).where(eq(credential.personId, personId)),
      db().select().from(accessGrant).where(eq(accessGrant.personId, personId)),
      db().select().from(calendarToken).where(eq(calendarToken.personId, personId)),
      db().select().from(task).where(eq(task.personId, personId)),
      db().select().from(formSubmission).where(eq(formSubmission.personId, personId)),
      db().select().from(pushSubscription).where(eq(pushSubscription.personId, personId)),
      db()
        .select()
        .from(notificationPreference)
        .where(eq(notificationPreference.personId, personId)),
      db().select().from(occasionSurveyInvite).where(eq(occasionSurveyInvite.personId, personId)),
    ]);
  return {
    password: credentials.length,
    accessGrants: grants.length,
    permissions: (await listPermissionsFor(personId)).map((row) => row.code),
    calendarTokens: calendars.length,
    tasks: tasks.length,
    formSubmissions: submissions.length,
    pushSubscriptions: subscriptions.length,
    preferences: preferences.length,
    surveyInvites: invites.length,
  };
}

const EVERYTHING = {
  password: 1,
  accessGrants: 1,
  permissions: ["COMMITTEE_LEADER"],
  calendarTokens: 1,
  tasks: 1,
  formSubmissions: 1,
  pushSubscriptions: 1,
  preferences: 1,
  surveyInvites: 1,
};
const NOTHING = {
  password: 0,
  accessGrants: 0,
  permissions: [],
  calendarTokens: 0,
  tasks: 0,
  formSubmissions: 0,
  pushSubscriptions: 0,
  preferences: 0,
  surveyInvites: 0,
};

describe("los borrados de la baja toleran el reintento", () => {
  beforeAll(() => {
    // Un vecino de los cinco módulos en el evento de membresía. Importar el drenado ya registró sus
    // handlers, así que este queda al final de la cadena: falla después de que todos borraron, como
    // podría fallar permanence o wallet, que escuchan el mismo evento.
    registerHandler(membershipChanged.type, async () => {
      neighbourRuns += 1;
      if (neighbourFailures > 0) {
        neighbourFailures -= 1;
        throw new Error("vecino caído");
      }
    });
  });
  beforeEach(async () => {
    await truncateAll();
    neighbourFailures = 0;
    neighbourRuns = 0;
    setMailTransportsForTests({
      primary: { name: "resend", send: async () => ({ id: "re_baja" }) },
      overflow: null,
    });
    setPushSenderForTests(async () => ({ ok: true, statusCode: 201 }));
  });
  afterAll(async () => {
    setMailTransportsForTests(undefined);
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("una baja que se reintenta después del alta no se lleva lo que la persona recibió al volver", async () => {
    const who = await scene();
    await equip(who);
    await endMembershipAs({ personId: who.board, ip: null }, who.personId, SALIDA);
    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [membershipChanged] });
    // La baja corrió en los cinco módulos antes de que fallara el vecino: el evento queda en reintento.
    expect(await holdings(who.personId)).toEqual(NOTHING);

    // GH corrige la baja: la da de alta, le devuelve su acceso y su permiso, y la persona vuelve a
    // entrar, activa sus avisos y responde un formulario.
    await reactivateMembershipAs({ personId: who.board, ip: null }, who.personId, {
      reason: "Fue un error",
    });
    await equip(who);
    await drainOutbox({ expectFailures: [membershipChanged] });
    expect(await holdings(who.personId)).toEqual(EVERYTHING);
    const runsBeforeRetry = neighbourRuns;

    await drainOutbox({ now: afterBackoff() });

    // El evento de la baja volvió a correr entero, y encontró a la persona adentro.
    expect(neighbourRuns).toBe(runsBeforeRetry + 1);
    expect(await holdings(who.personId)).toEqual(EVERYTHING);
  });

  it.each([
    ["sale a licencia", { to: "ON_LEAVE" as const, leaveUntil: leaveUntilSoon() }],
    ["pasa a honoraria", { to: "HONORARY" as const }],
  ])("quien volvió y después %s sigue adentro: el reintento de su baja tampoco le borra nada", async (_caso, cambio) => {
    const who = await scene();
    await equip(who);
    await endMembershipAs({ personId: who.board, ip: null }, who.personId, SALIDA);
    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [membershipChanged] });
    expect(await holdings(who.personId)).toEqual(NOTHING);

    // Vuelve, recibe todo otra vez y cambia de estado antes de que el poller reintente la baja. La
    // regla protege a quien no está de baja, no solo a quien está activa (ADR-118 regla 5).
    await reactivateMembershipAs({ personId: who.board, ip: null }, who.personId, {
      reason: "Fue un error",
    });
    await equip(who);
    await changeMembershipStatusAs({ personId: who.board, ip: null }, who.personId, {
      ...cambio,
      reason: "Cambio posterior al alta",
    });
    await drainOutbox({ expectFailures: [membershipChanged] });
    const before = await holdings(who.personId);
    expect(before).toEqual(EVERYTHING);
    const runsBeforeRetry = neighbourRuns;

    await drainOutbox({ now: afterBackoff() });

    expect(neighbourRuns).toBe(runsBeforeRetry + 1);
    expect(await holdings(who.personId)).toEqual(before);
  });

  it("mientras la baja siga vigente su reintento sigue borrando, también lo que apareció entre los dos intentos", async () => {
    const who = await scene();
    await equip(who);
    await endMembershipAs({ personId: who.board, ip: null }, who.personId, SALIDA);
    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [membershipChanged] });
    expect(await holdings(who.personId)).toEqual(NOTHING);

    // Con la persona afuera, GH le anota una tarea y queda una respuesta suya de un formulario público.
    await createTaskAs(
      { personId: who.board, ip: null },
      { title: "Devolver el carné", kind: "GENERAL", personId: who.personId },
    );
    await seedSubmission(await seedForm("salida"), EMAIL, { personId: who.personId });

    await drainOutbox({ now: afterBackoff() });

    expect(await holdings(who.personId)).toEqual(NOTHING);
  });

  it("una baja nueva después del alta trae su propio evento: lo que el evento atrasado no borró se lo lleva ese", async () => {
    const who = await scene();
    await endMembershipAs({ personId: who.board, ip: null }, who.personId, SALIDA);
    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [membershipChanged] });
    await reactivateMembershipAs({ personId: who.board, ip: null }, who.personId, {
      reason: "Fue un error",
    });
    await equip(who);
    await drainOutbox({ expectFailures: [membershipChanged] });
    expect(await holdings(who.personId)).toEqual(EVERYTHING);

    // Sale otra vez antes de que el poller reintente la primera baja. Esta salida emite su evento: por
    // eso el evento viejo puede no borrar nada cuando encuentra a la persona adentro sin que se pierda
    // ningún borrado. Acá corren los dos, con la persona afuera.
    await endMembershipAs({ personId: who.board, ip: null }, who.personId, SALIDA);
    await drainOutbox({ now: afterBackoff() });

    expect(await holdings(who.personId)).toEqual(NOTHING);
  });

  // El cierre de sesiones del mismo handler (DT-243): también decide con el estado de ahora.
  const openSession = (personId: string) =>
    createSession(db(), { personId, remember: true, userAgent: null, ip: null });
  const sessionIdsOf = async (personId: string) =>
    (await db().select({ id: session.id }).from(session).where(eq(session.personId, personId))).map(
      (row) => row.id,
    );

  it("una baja que se reintenta después del alta no le cierra la sesión a quien ya volvió a entrar", async () => {
    const who = await scene();
    await openSession(who.personId);
    await endMembershipAs({ personId: who.board, ip: null }, who.personId, SALIDA);
    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [membershipChanged] });
    // Con la baja vigente, el primer intento cerró la sesión de antes.
    expect(await sessionIdsOf(who.personId)).toEqual([]);

    await reactivateMembershipAs({ personId: who.board, ip: null }, who.personId, {
      reason: "Fue un error",
    });
    await drainOutbox({ expectFailures: [membershipChanged] });
    const back = await openSession(who.personId);

    await drainOutbox({ now: afterBackoff() });

    expect(await sessionIdsOf(who.personId)).toEqual([back.sessionId]);
  });

  it("mientras la baja siga vigente su reintento sigue cerrando sesiones, también la que apareció entre los dos intentos", async () => {
    const who = await scene();
    await endMembershipAs({ personId: who.board, ip: null }, who.personId, SALIDA);
    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [membershipChanged] });
    await openSession(who.personId);

    await drainOutbox({ now: afterBackoff() });

    expect(await sessionIdsOf(who.personId)).toEqual([]);
  });

  it("el evento de la baja espera a un alta que se está confirmando y después no borra: quien vuelve antes de que su baja se procese conserva lo que tenía (decisión abierta 44)", async () => {
    const who = await scene();
    await equip(who);
    await endMembershipAs({ personId: who.board, ip: null }, who.personId, SALIDA);
    await warmPool();

    // El alta ya escribió y todavía no confirma: tiene el candado del ciclo de membresía.
    const held = await holdCommand({ personId: who.board, ip: null }, (ctx) =>
      reactivateMembership(ctx, who.personId, { reason: "Fue un error" }),
    );
    const draining = drainOutbox();
    try {
      // Quien decide el borrado hace cola detrás del alta: no lee la membresía de antes.
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBeGreaterThan(0), {
        timeout: 5_000,
      });
    } finally {
      held.release();
      await held.done;
    }
    await draining;

    // Sin época en estas tablas lo anterior a la baja no se distingue de lo posterior al alta: con la
    // persona adentro no se borra nada. Si eso está bien es la decisión abierta 44 (DT-242, DT-181).
    expect(await holdings(who.personId)).toEqual(EVERYTHING);
  });
});
