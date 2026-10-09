import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  checkinApproved,
  checkinCancelled,
  checkinExcused,
  checkinPending,
  scoreRecompute,
} from "@/domain-events/participation";
import { createRequestAs, decideRequestAs } from "@/modules/crm";
import {
  balanceFor,
  cancelOccasionAs,
  checkInSelfAs,
  decideCheckInAs,
  findCheckIn,
  grantBoosterAs,
  hostCheckInAs,
  listParticipationsForPerson,
  setBoosterTargetAs,
} from "@/modules/participation";
import { pointEntry, reward } from "@/modules/participation/schema";
import { setConfigAs } from "@/modules/system";
import { auditLog, outbox } from "@/modules/system/schema";
import { t, tList } from "@/shared/copy";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedChallenge, seedMember, seedOccasion, seedTerm } from "./factories";

// Matriz de caracterización de DT-008 (ADR-109 regla 3): qué deja cada camino de una asistencia
// (registro propio, organizador, decidir, cancelar la ocasión y excusa) en cada cambio de estado.
// Cada celda mira lo mismo: la fila, el libro de puntos, la auditoría de la asistencia, sus eventos
// con nombre, clave y payload, el premio reservado y el reto presencial. Toda ocasión de la matriz
// lleva un booster de la persona apuntado y un reto presencial, para que los dos ganchos del premio
// (ADR-067 reglas 8 y 12) tengan algo que decidir en cada transición.
//
// Lo que ya estaba cubierto y esta matriz no repite:
// - participation-checkin.test.ts: el orden de las validaciones del registro propio, los errores de
//   transición (T-676, T-609, T-601, T-673) y los 500 registros simultáneos con un solo recálculo.
// - participation-checkin-decision-concurrency.test.ts: dos decisiones a la vez (ADR-116) y el lote.
// - requests-excuse-rewards.test.ts: la excusa deja cerrar el semestre y no copia el motivo de la
//   persona a la auditoría del premio.
// - gamification-boosters.test.ts y gamification-challenges.test.ts: los montos del extra, el cupo,
//   la bandera apagada, la ventana del reto y revivir un premio liberado con el booster vuelto a
//   apuntar.
// - participation-occasions.test.ts: la auditoría y el recálculo de abrir, cerrar y cancelar la ocasión.

const TITLE = "Taller de prueba";
const POINTS = 10;
const BOOST = 5;
const CHALLENGE_POINTS = 5;
const HOST_NAME = "Persona Sintética";
const REJECT_REASON = "No asistió";
const CANCEL_REASON = "Registro duplicado";
const OCCASION_CANCEL_REASON = "Se canceló el evento";
const EXCUSE_REASON = "Turno que no se puede mover";

const CHECK_IN_EVENTS = [
  checkinApproved.type,
  checkinPending.type,
  checkinCancelled.type,
  checkinExcused.type,
  scoreRecompute.type,
] as readonly string[];

async function setup(approval: "AUTO" | "MANUAL", targeted = true) {
  const termId = await seedTerm();
  const adminId = await seedMember("gh.matriz@eafit.edu.co");
  const personId = await seedMember("miembro.matriz@eafit.edu.co");
  const admin = { personId: adminId };
  const member = { personId };
  await setConfigAs(admin, "gamification.enabled", true);
  const occasion = await seedOccasion(termId, { title: TITLE, points: POINTS, approval });
  await seedChallenge(termId, {
    kind: "PRESENTIAL",
    occasionId: occasion.id,
    passPercent: null,
    basePoints: CHALLENGE_POINTS,
  });
  const booster = await grantBoosterAs(admin, {
    personId,
    termId,
    kind: "PLUS_50",
    reason: "Premio de prueba",
  });
  if (targeted) {
    await setBoosterTargetAs(member, {
      boosterId: booster.id,
      target: { occasionId: occasion.id },
    });
  }
  return { termId, admin, member, personId, occasion, boosterId: booster.id };
}

type Fixture = Awaited<ReturnType<typeof setup>>;

// Los pasos con los que se llega a cada celda y con los que se sale de ella.

async function registerSelf(f: Fixture, member = f.member): Promise<void> {
  const result = await checkInSelfAs(member, { publicId: f.occasion.publicId });
  if (!result.ok) throw new Error(`el registro propio no entró: ${result.reason}`);
}

async function registerByHost(f: Fixture, personId = f.personId): Promise<void> {
  await hostCheckInAs(f.admin, {
    occasionId: f.occasion.id,
    personId,
    personName: HOST_NAME,
    source: "HOST",
  });
}

async function decide(
  f: Fixture,
  decision: "APPROVE" | "REJECT" | "CANCEL",
  reason?: string,
): Promise<void> {
  const row = await findCheckIn(f.occasion.id, f.personId);
  if (!row) throw new Error("no hay asistencia que decidir");
  await decideCheckInAs(f.admin, { checkInId: row.id, decision, reason });
}

async function excuse(f: Fixture): Promise<void> {
  const created = await createRequestAs(f.member, "EXCUSE", {
    occasionId: f.occasion.id,
    cause: "WORK",
    reason: EXCUSE_REASON,
  });
  await decideRequestAs(f.admin, created.id, { decision: "APPROVED" });
}

// Lo que se mira en cada celda.

interface PersonState {
  row: { status: string; source: string; decidedBy: string; reason: string | null } | null;
  /** Entradas del libro que dejó el paso, y el saldo con el que quedó la persona. */
  ledger: [string, number][];
  balance: number;
  rewards: { source: string; status: string; reason: string | null }[];
  challenge: { status: string; reason: string | null }[];
}

interface Effects {
  audit: { action: string; entityId: string; before: unknown; after: unknown }[];
  events: { type: string; dedupeKey: string | null; payload: unknown }[];
}

const byText = (a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b));
/** Los eventos se ordenan por tipo y persona: el payload vuelve de la base con otro orden de claves. */
const byEvent = (a: Effects["events"][number], b: Effects["events"][number]) => {
  const key = (item: Effects["events"][number]) =>
    `${item.type}|${(item.payload as { personId?: string }).personId ?? ""}`;
  return key(a).localeCompare(key(b));
};

/** Lo que ya había antes del paso: la matriz compara solo lo que el paso agrega. */
async function mark() {
  const [audits, events, entries] = await Promise.all([
    getDb().select({ id: auditLog.id }).from(auditLog),
    getDb().select({ id: outbox.id }).from(outbox),
    getDb().select({ id: pointEntry.id }).from(pointEntry),
  ]);
  return new Set([...audits, ...events, ...entries].map((item) => item.id));
}

async function personState(f: Fixture, personId: string, seen: Set<string>): Promise<PersonState> {
  const row = await findCheckIn(f.occasion.id, personId);
  const entries = await getDb()
    .select({ id: pointEntry.id, kind: pointEntry.kind, points: pointEntry.points })
    .from(pointEntry)
    .where(eq(pointEntry.personId, personId));
  const rewards = await getDb()
    .select({ source: reward.source, status: reward.status, reason: reward.reason })
    .from(reward)
    .where(eq(reward.personId, personId));
  const participations = await listParticipationsForPerson(personId);
  return {
    row: row && {
      status: row.status,
      source: row.source,
      decidedBy:
        row.decidedById === null ? "nadie" : row.decidedById === f.admin.personId ? "gh" : "otro",
      reason: row.reason,
    },
    ledger: entries
      .filter((item) => !seen.has(item.id))
      .map((item): [string, number] => [item.kind, item.points])
      .sort(byText),
    balance: await balanceFor(personId, f.termId),
    rewards: rewards.sort(byText),
    challenge: participations.map((item) => ({ status: item.status, reason: item.reason })),
  };
}

async function effects(seen: Set<string>): Promise<Effects> {
  const audits = await getDb().select().from(auditLog).where(eq(auditLog.entityType, "check_in"));
  const events = await getDb().select().from(outbox);
  return {
    audit: audits
      .filter((item) => !seen.has(item.id))
      .map((item) => ({
        action: item.action,
        entityId: item.entityId,
        before: item.before,
        after: item.after,
      }))
      .sort(byText),
    events: events
      .filter((item) => !seen.has(item.id) && CHECK_IN_EVENTS.includes(item.eventType))
      .map((item) => ({ type: item.eventType, dedupeKey: item.dedupeKey, payload: item.payload }))
      .sort(byEvent),
  };
}

// Lo que se espera, dicho con las palabras de la tabla.

/** Lo que el paso deja: la celda conoce la asistencia y el motivo con que quedó escrita. */
interface Cell {
  f: Fixture;
  checkInId: string;
  reason: string | null;
}

function facts(f: Fixture, personId: string, source: string) {
  return {
    occasionId: f.occasion.id,
    occasionTitle: TITLE,
    personId,
    termId: f.termId,
    category: "OTHER",
    kind: "ACTIVITY",
    points: POINTS,
    source,
  };
}

const approved = (c: Cell, source: string) => [
  { type: checkinApproved.type, dedupeKey: null, payload: facts(c.f, c.f.personId, source) },
  {
    type: scoreRecompute.type,
    dedupeKey: `score:${c.f.occasion.id}`,
    payload: { occasionId: c.f.occasion.id },
  },
];

const created = (c: Cell, status: string, source: string) => ({
  action: "checkin.created",
  entityId: c.checkInId,
  before: null,
  after: { occasionId: c.f.occasion.id, personId: c.f.personId, status, source },
});

const decided = (
  c: Cell,
  action: string,
  from: string,
  to: string,
  reason: string | null,
  reversed: number,
) => ({
  action,
  entityId: c.checkInId,
  before: { status: from },
  after: { status: to, reason, reversed },
});

const prize = (source: "CHALLENGE" | "CHECKIN", status: string, reason: string | null = null) => ({
  source,
  status,
  reason,
});

/** Motivos automáticos con que el reto presencial cierra su entrega (ADR-067 regla 12, ADR-111). */
const notApproved = t("T-2579", { actividad: TITLE });
const annulled = (motivo: string) => t("T-2580", { actividad: TITLE, motivo });
const excusedDelivery = t("T-3205", { actividad: TITLE });
/** El premio de la asistencia excusada se libera con el estado, no con el texto de la persona. */
const excusedLabel = tList("T-597")[4] ?? "";

const WON: PersonState["ledger"] = [
  ["BOOST", BOOST],
  ["CHALLENGE", CHALLENGE_POINTS],
  ["CHECKIN", POINTS],
];
const WON_BALANCE = POINTS + BOOST + CHALLENGE_POINTS;

interface Case {
  name: string;
  approval: "AUTO" | "MANUAL";
  /** Falso cuando el booster se elige en el mismo registro y no antes. */
  targeted?: boolean;
  arrange?: (f: Fixture) => Promise<void>;
  act: (f: Fixture) => Promise<void>;
  expected: (c: Cell) => { person: PersonState } & Effects;
}

const CASES: Case[] = [
  {
    name: "registro propio con aprobación automática: nace aprobado, acredita y entrega los dos premios",
    approval: "AUTO",
    act: (f) => registerSelf(f),
    expected: (c) => ({
      person: {
        row: { status: "APPROVED", source: "SELF_QR", decidedBy: "nadie", reason: null },
        ledger: WON,
        balance: WON_BALANCE,
        rewards: [prize("CHALLENGE", "GRANTED"), prize("CHECKIN", "GRANTED")],
        challenge: [{ status: "COMPLETED", reason: null }],
      },
      audit: [created(c, "APPROVED", "SELF_QR")],
      events: approved(c, "SELF_QR"),
    }),
  },
  {
    name: "registro propio que elige el booster al registrarse: lo apunta y lo consume en el mismo paso",
    approval: "AUTO",
    targeted: false,
    act: async (f) => {
      const result = await checkInSelfAs(f.member, {
        publicId: f.occasion.publicId,
        boosterId: f.boosterId,
      });
      if (!result.ok) throw new Error(`el registro propio no entró: ${result.reason}`);
    },
    expected: (c) => ({
      person: {
        row: { status: "APPROVED", source: "SELF_QR", decidedBy: "nadie", reason: null },
        ledger: WON,
        balance: WON_BALANCE,
        rewards: [prize("CHALLENGE", "GRANTED"), prize("CHECKIN", "GRANTED")],
        challenge: [{ status: "COMPLETED", reason: null }],
      },
      audit: [created(c, "APPROVED", "SELF_QR")],
      events: approved(c, "SELF_QR"),
    }),
  },
  {
    name: "registro propio con aprobación manual: queda pendiente, sin puntos y con los dos premios reservados",
    approval: "MANUAL",
    act: (f) => registerSelf(f),
    expected: (c) => ({
      person: {
        row: { status: "PENDING", source: "SELF_QR", decidedBy: "nadie", reason: null },
        ledger: [],
        balance: 0,
        rewards: [prize("CHALLENGE", "RESERVED"), prize("CHECKIN", "RESERVED")],
        challenge: [{ status: "PENDING", reason: null }],
      },
      audit: [created(c, "PENDING", "SELF_QR")],
      events: [
        {
          type: checkinPending.type,
          dedupeKey: null,
          payload: facts(c.f, c.f.personId, "SELF_QR"),
        },
      ],
    }),
  },
  {
    name: "el organizador registra a quien no tenía asistencia: nace aprobada aunque la ocasión sea manual",
    approval: "MANUAL",
    act: (f) => registerByHost(f),
    expected: (c) => ({
      person: {
        row: { status: "APPROVED", source: "HOST", decidedBy: "gh", reason: null },
        ledger: WON,
        balance: WON_BALANCE,
        rewards: [prize("CHALLENGE", "GRANTED"), prize("CHECKIN", "GRANTED")],
        challenge: [{ status: "COMPLETED", reason: null }],
      },
      audit: [created(c, "APPROVED", "HOST")],
      events: approved(c, "HOST"),
    }),
  },
  {
    name: "el organizador registra a quien estaba rechazado: lo reaprueba como una decisión, con el origen que tenía",
    approval: "MANUAL",
    arrange: async (f) => {
      await registerSelf(f);
      await decide(f, "REJECT", REJECT_REASON);
    },
    act: (f) => registerByHost(f),
    expected: (c) => ({
      person: {
        row: { status: "APPROVED", source: "SELF_QR", decidedBy: "gh", reason: null },
        // El rechazo devolvió el booster sin objetivo: la reaprobación no tiene extra que revivir.
        ledger: [
          ["CHALLENGE", CHALLENGE_POINTS],
          ["CHECKIN", POINTS],
        ],
        balance: POINTS + CHALLENGE_POINTS,
        rewards: [prize("CHALLENGE", "GRANTED"), prize("CHECKIN", "RELEASED", REJECT_REASON)],
        challenge: [{ status: "COMPLETED", reason: null }],
      },
      audit: [decided(c, "checkin.approve", "REJECTED", "APPROVED", null, 0)],
      events: approved(c, "SELF_QR"),
    }),
  },
  {
    name: "el organizador registra a quien estaba pendiente: lo aprueba como una decisión",
    approval: "MANUAL",
    arrange: (f) => registerSelf(f),
    act: (f) => registerByHost(f),
    expected: (c) => ({
      person: {
        row: { status: "APPROVED", source: "SELF_QR", decidedBy: "gh", reason: null },
        ledger: WON,
        balance: WON_BALANCE,
        rewards: [prize("CHALLENGE", "GRANTED"), prize("CHECKIN", "GRANTED")],
        challenge: [{ status: "COMPLETED", reason: null }],
      },
      audit: [decided(c, "checkin.approve", "PENDING", "APPROVED", null, 0)],
      events: approved(c, "SELF_QR"),
    }),
  },
  {
    name: "aprobar una pendiente: acredita, confirma los dos premios y pide el recálculo",
    approval: "MANUAL",
    arrange: (f) => registerSelf(f),
    act: (f) => decide(f, "APPROVE"),
    expected: (c) => ({
      person: {
        row: { status: "APPROVED", source: "SELF_QR", decidedBy: "gh", reason: null },
        ledger: WON,
        balance: WON_BALANCE,
        rewards: [prize("CHALLENGE", "GRANTED"), prize("CHECKIN", "GRANTED")],
        challenge: [{ status: "COMPLETED", reason: null }],
      },
      audit: [decided(c, "checkin.approve", "PENDING", "APPROVED", null, 0)],
      events: approved(c, "SELF_QR"),
    }),
  },
  {
    name: "rechazar una pendiente: no toca el libro, no avisa y libera los dos premios",
    approval: "MANUAL",
    arrange: (f) => registerSelf(f),
    act: (f) => decide(f, "REJECT", REJECT_REASON),
    expected: (c) => ({
      person: {
        row: { status: "REJECTED", source: "SELF_QR", decidedBy: "gh", reason: REJECT_REASON },
        ledger: [],
        balance: 0,
        rewards: [
          prize("CHALLENGE", "RELEASED", notApproved),
          prize("CHECKIN", "RELEASED", REJECT_REASON),
        ],
        challenge: [{ status: "REJECTED", reason: notApproved }],
      },
      audit: [decided(c, "checkin.reject", "PENDING", "REJECTED", REJECT_REASON, 0)],
      events: [],
    }),
  },
  {
    name: "reaprobar una rechazada: acredita y revive el premio del reto",
    approval: "MANUAL",
    arrange: async (f) => {
      await registerSelf(f);
      await decide(f, "REJECT", REJECT_REASON);
    },
    act: (f) => decide(f, "APPROVE"),
    expected: (c) => ({
      person: {
        row: { status: "APPROVED", source: "SELF_QR", decidedBy: "gh", reason: null },
        ledger: [
          ["CHALLENGE", CHALLENGE_POINTS],
          ["CHECKIN", POINTS],
        ],
        balance: POINTS + CHALLENGE_POINTS,
        rewards: [prize("CHALLENGE", "GRANTED"), prize("CHECKIN", "RELEASED", REJECT_REASON)],
        challenge: [{ status: "COMPLETED", reason: null }],
      },
      audit: [decided(c, "checkin.approve", "REJECTED", "APPROVED", null, 0)],
      events: approved(c, "SELF_QR"),
    }),
  },
  {
    name: "anular una aprobada: revierte el crédito y los dos premios, avisa y pide el recálculo",
    approval: "AUTO",
    arrange: (f) => registerSelf(f),
    act: (f) => decide(f, "CANCEL", CANCEL_REASON),
    expected: (c) => ({
      person: {
        row: { status: "CANCELLED", source: "SELF_QR", decidedBy: "gh", reason: CANCEL_REASON },
        ledger: [
          ["REVERSAL", -POINTS],
          ["REVERSAL", -BOOST],
          ["REVERSAL", -CHALLENGE_POINTS],
        ],
        balance: 0,
        rewards: [
          prize("CHALLENGE", "REVERSED", annulled(CANCEL_REASON)),
          prize("CHECKIN", "REVERSED", CANCEL_REASON),
        ],
        challenge: [{ status: "ANNULLED", reason: annulled(CANCEL_REASON) }],
      },
      audit: [decided(c, "checkin.cancel", "APPROVED", "CANCELLED", CANCEL_REASON, POINTS)],
      events: [
        {
          type: checkinCancelled.type,
          dedupeKey: null,
          payload: { ...facts(c.f, c.f.personId, "SELF_QR"), reason: CANCEL_REASON },
        },
        {
          type: scoreRecompute.type,
          dedupeKey: `score:${c.f.occasion.id}`,
          payload: { occasionId: c.f.occasion.id },
        },
      ],
    }),
  },
  {
    name: "excusa de quien no tenía asistencia: la crea excusada con origen ADMIN y no toca premios",
    approval: "MANUAL",
    act: (f) => excuse(f),
    expected: (c) => ({
      person: {
        row: { status: "EXCUSED", source: "ADMIN", decidedBy: "gh", reason: c.reason },
        ledger: [],
        balance: 0,
        rewards: [],
        challenge: [],
      },
      audit: [
        {
          action: "checkin.excused",
          entityId: `${c.f.occasion.id}:${c.f.personId}`,
          before: null,
          after: { status: "EXCUSED", reason: c.reason },
        },
      ],
      events: [
        {
          type: checkinExcused.type,
          dedupeKey: null,
          payload: { ...facts(c.f, c.f.personId, "ADMIN"), reason: c.reason },
        },
      ],
    }),
  },
  {
    name: "excusa sobre una pendiente: libera los dos premios con su motivo propio y el evento dice ADMIN",
    approval: "MANUAL",
    arrange: (f) => registerSelf(f),
    act: (f) => excuse(f),
    expected: (c) => ({
      person: {
        row: { status: "EXCUSED", source: "SELF_QR", decidedBy: "gh", reason: c.reason },
        ledger: [],
        balance: 0,
        rewards: [
          prize("CHALLENGE", "RELEASED", excusedDelivery),
          prize("CHECKIN", "RELEASED", excusedLabel),
        ],
        challenge: [{ status: "REJECTED", reason: excusedDelivery }],
      },
      audit: [
        {
          action: "checkin.excused",
          entityId: `${c.f.occasion.id}:${c.f.personId}`,
          before: { status: "PENDING" },
          after: { status: "EXCUSED", reason: c.reason },
        },
      ],
      events: [
        {
          type: checkinExcused.type,
          dedupeKey: null,
          payload: { ...facts(c.f, c.f.personId, "ADMIN"), reason: c.reason },
        },
      ],
    }),
  },
  {
    name: "excusa sobre una rechazada: deja los premios como los dejó el rechazo",
    approval: "MANUAL",
    arrange: async (f) => {
      await registerSelf(f);
      await decide(f, "REJECT", REJECT_REASON);
    },
    act: (f) => excuse(f),
    expected: (c) => ({
      person: {
        row: { status: "EXCUSED", source: "SELF_QR", decidedBy: "gh", reason: c.reason },
        ledger: [],
        balance: 0,
        rewards: [
          prize("CHALLENGE", "RELEASED", notApproved),
          prize("CHECKIN", "RELEASED", REJECT_REASON),
        ],
        challenge: [{ status: "REJECTED", reason: notApproved }],
      },
      audit: [
        {
          action: "checkin.excused",
          entityId: `${c.f.occasion.id}:${c.f.personId}`,
          before: { status: "REJECTED" },
          after: { status: "EXCUSED", reason: c.reason },
        },
      ],
      events: [
        {
          type: checkinExcused.type,
          dedupeKey: null,
          payload: { ...facts(c.f, c.f.personId, "ADMIN"), reason: c.reason },
        },
      ],
    }),
  },
  {
    name: "excusa sobre una anulada: deja el libro y los premios como los dejó la anulación",
    approval: "AUTO",
    arrange: async (f) => {
      await registerSelf(f);
      await decide(f, "CANCEL", CANCEL_REASON);
    },
    act: (f) => excuse(f),
    expected: (c) => ({
      person: {
        row: { status: "EXCUSED", source: "SELF_QR", decidedBy: "gh", reason: c.reason },
        ledger: [],
        balance: 0,
        rewards: [
          prize("CHALLENGE", "REVERSED", annulled(CANCEL_REASON)),
          prize("CHECKIN", "REVERSED", CANCEL_REASON),
        ],
        challenge: [{ status: "ANNULLED", reason: annulled(CANCEL_REASON) }],
      },
      audit: [
        {
          action: "checkin.excused",
          entityId: `${c.f.occasion.id}:${c.f.personId}`,
          before: { status: "CANCELLED" },
          after: { status: "EXCUSED", reason: c.reason },
        },
      ],
      events: [
        {
          type: checkinExcused.type,
          dedupeKey: null,
          payload: { ...facts(c.f, c.f.personId, "ADMIN"), reason: c.reason },
        },
      ],
    }),
  },
];

describe("una asistencia cambia de estado: qué deja cada camino", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it.each(CASES)("$name", async (cell) => {
    const f = await setup(cell.approval, cell.targeted ?? true);
    await cell.arrange?.(f);
    // El recálculo del puntaje admite un solo pendiente por ocasión: con el outbox en reposo, el
    // que pida el paso se ve.
    await drainOutbox();
    const seen = await mark();

    await cell.act(f);

    const row = await findCheckIn(f.occasion.id, f.personId);
    if (!row) throw new Error("el paso no dejó asistencia");
    if (row.status === "EXCUSED") {
      // El motivo de la excusa es la causal y el texto de la persona, el mismo en la fila, la
      // auditoría y el evento.
      expect(row.reason).toContain(EXCUSE_REASON);
    }
    const expected = cell.expected({ f, checkInId: row.id, reason: row.reason });
    expect({ person: await personState(f, f.personId, seen), ...(await effects(seen)) }).toEqual(
      expected,
    );
  });

  it("cancelar la ocasión con una pendiente y una aprobada: anula las dos, revierte el crédito vivo, avisa a cada una y pide un solo recálculo", async () => {
    const f = await setup("MANUAL");
    const otherId = await seedMember("otra.matriz@eafit.edu.co");
    await registerSelf(f);
    await registerByHost(f, otherId);
    await drainOutbox();
    const seen = await mark();

    expect(await cancelOccasionAs(f.admin, f.occasion.id, OCCASION_CANCEL_REASON)).toEqual({
      cancelledCheckIns: 2,
    });

    const reason = annulled(OCCASION_CANCEL_REASON);
    expect(await personState(f, f.personId, seen)).toEqual({
      row: {
        status: "CANCELLED",
        source: "SELF_QR",
        decidedBy: "gh",
        reason: OCCASION_CANCEL_REASON,
      },
      ledger: [],
      balance: 0,
      rewards: [
        prize("CHALLENGE", "RELEASED", reason),
        prize("CHECKIN", "RELEASED", OCCASION_CANCEL_REASON),
      ],
      challenge: [{ status: "REJECTED", reason }],
    });
    expect(await personState(f, otherId, seen)).toEqual({
      row: { status: "CANCELLED", source: "HOST", decidedBy: "gh", reason: OCCASION_CANCEL_REASON },
      ledger: [
        ["REVERSAL", -POINTS],
        ["REVERSAL", -CHALLENGE_POINTS],
      ],
      balance: 0,
      rewards: [prize("CHALLENGE", "REVERSED", reason)],
      challenge: [{ status: "ANNULLED", reason }],
    });
    const cancelled = (personId: string, source: string) => ({
      type: checkinCancelled.type,
      dedupeKey: null,
      payload: { ...facts(f, personId, source), reason: OCCASION_CANCEL_REASON },
    });
    expect(await effects(seen)).toEqual({
      // Diferencia de hoy: cancelar la ocasión no audita cada asistencia que anula.
      audit: [],
      events: [
        cancelled(f.personId, "SELF_QR"),
        cancelled(otherId, "HOST"),
        {
          type: scoreRecompute.type,
          dedupeKey: `score:${f.occasion.id}`,
          payload: { occasionId: f.occasion.id },
        },
      ].sort(byEvent),
    });
  });
});
