import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  annulParticipationAs,
  balanceFor,
  reviewParticipationAs,
  submitEvidenceAs,
} from "@/modules/participation";
import { challenge, challengeParticipation, reward } from "@/modules/participation/schema";
import { setConfigAs } from "@/modules/system";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { firstThenSecond, holdTransaction, outcome } from "../helpers/locks";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";
import { seedChallenge, seedMember, seedTerm } from "./factories";

// DT-148: revisar y anular una entrega toman su fila con candado y recién después miran su estado.
// Estas pruebas los llaman a la vez: sin esa espera, dos revisiones de la misma entrega valdrían
// las dos y una anulación leería «pendiente» de una entrega que ya se estaba aprobando.

const POINTS = 5;
const db = () => getDb();

/** El estado como lo nombra hoy el error (T-676 con el valor del enum). */
function notApplicable(status: "COMPLETED" | "ANNULLED"): string {
  return t("T-676", { estado: status });
}

async function pendingDelivery() {
  const termId = await seedTerm();
  const reviewer = { personId: await seedMember("retos.revisora@eafit.edu.co"), ip: null };
  const second = { personId: await seedMember("retos.revisor.dos@eafit.edu.co"), ip: null };
  const personId = await seedMember("retos.entrega@eafit.edu.co");
  await setConfigAs(reviewer, "gamification.enabled", true);
  const challengeId = await seedChallenge(termId, {
    kind: "EVIDENCE",
    passPercent: null,
    basePoints: POINTS,
  });
  const result = await submitEvidenceAs(
    { personId, ip: null },
    {
      challengeId,
      requestId: "req-concurrencia",
      text: "Evidencia de prueba con suficiente texto.",
      keys: [],
    },
  );
  if (!result.ok) throw new Error("La entrega falló");
  return {
    termId,
    reviewer,
    second,
    personId,
    challengeId,
    participationId: result.participation.id,
  };
}

type Fixture = Awaited<ReturnType<typeof pendingDelivery>>;

async function stateOf(participationId: string) {
  const [row] = await db()
    .select()
    .from(challengeParticipation)
    .where(eq(challengeParticipation.id, participationId));
  const [prize] = await db()
    .select()
    .from(reward)
    .where(eq(reward.id, row?.rewardId ?? ""));
  return { status: row?.status, reward: prize?.status };
}

function audits(action: string, entityId: string) {
  return db()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, action), eq(auditLog.entityId, entityId)));
}

/** Quien revisa se detiene al leer el reto de la entrega, ya con la fila de la entrega tomada. */
function holdChallenge(challengeId: string) {
  return holdTransaction((tx) =>
    tx
      .select({ id: challenge.id })
      .from(challenge)
      .where(eq(challenge.id, challengeId))
      .for("update"),
  );
}

function approve(f: Fixture, actor = f.reviewer) {
  return reviewParticipationAs(actor, { participationId: f.participationId, decision: "APPROVE" });
}

function annul(f: Fixture, actor = f.reviewer) {
  return annulParticipationAs(actor, f.participationId, "Anulación de prueba");
}

/** Exactamente una pierde, y con un error de dominio: devuelve su mensaje. */
function loserOf(outcomes: PromiseSettledResult<unknown>[]): string {
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(
    outcomes.length - 1,
  );
  const rejections = outcomes.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  expect(rejections).toHaveLength(1);
  expect(rejections[0]?.reason).toBeInstanceOf(DomainError);
  return (rejections[0]?.reason as DomainError).message;
}

describe("revisar y anular la misma entrega de un reto a la vez", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("dos aprobaciones a la vez de la misma entrega: vale una, la otra recibe que ya no está pendiente y el premio se entrega una vez", async () => {
    const f = await pendingDelivery();

    await warmPool();
    const outcomes = await Promise.allSettled([approve(f), approve(f, f.second)]);

    expect(loserOf(outcomes)).toBe(notApplicable("COMPLETED"));
    expect(await stateOf(f.participationId)).toEqual({ status: "COMPLETED", reward: "GRANTED" });
    expect(await balanceFor(f.personId, f.termId)).toBe(POINTS);
    expect(await audits("challenge.reviewed", f.participationId)).toHaveLength(1);
  });

  it("un rechazo que llega mientras otra persona aprueba la entrega: espera, recibe que ya no está pendiente y el premio queda entregado", async () => {
    const f = await pendingDelivery();
    const held = await holdChallenge(f.challengeId);

    const [approved, rejected] = await firstThenSecond(
      held,
      () => approve(f),
      () =>
        reviewParticipationAs(f.second, {
          participationId: f.participationId,
          decision: "REJECT",
          reason: "No se ve la actividad",
        }),
    );

    expect(outcome(approved)).toBe("ok");
    expect(outcome(rejected)).toBe(notApplicable("COMPLETED"));
    expect(await stateOf(f.participationId)).toEqual({ status: "COMPLETED", reward: "GRANTED" });
    expect(await balanceFor(f.personId, f.termId)).toBe(POINTS);
    expect(await audits("challenge.reviewed", f.participationId)).toHaveLength(1);
  });

  it("una anulación que llega mientras se aprueba la entrega: espera a la aprobación y anula el premio recién entregado", async () => {
    const f = await pendingDelivery();
    const held = await holdChallenge(f.challengeId);

    const [approved, annulled] = await firstThenSecond(
      held,
      () => approve(f),
      () => annul(f, f.second),
    );

    expect(outcome(approved)).toBe("ok");
    expect(outcome(annulled)).toBe("ok");
    expect(await stateOf(f.participationId)).toEqual({ status: "ANNULLED", reward: "REVERSED" });
    expect(await balanceFor(f.personId, f.termId)).toBe(0);
  });

  it("dos anulaciones a la vez de la misma entrega: vale una, la otra recibe que ya está anulada y el premio se revierte una vez", async () => {
    const f = await pendingDelivery();
    await approve(f);
    expect(await balanceFor(f.personId, f.termId)).toBe(POINTS);

    await warmPool();
    const outcomes = await Promise.allSettled([annul(f), annul(f, f.second)]);

    expect(loserOf(outcomes)).toBe(notApplicable("ANNULLED"));
    expect(await stateOf(f.participationId)).toEqual({ status: "ANNULLED", reward: "REVERSED" });
    expect(await balanceFor(f.personId, f.termId)).toBe(0);
    expect(await audits("challenge.annulled", f.participationId)).toHaveLength(1);
  });
});
