import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import {
  annulParticipationAs,
  getReconciliationRun,
  grantReward,
  releaseReward,
  rereserveReward,
  reserveReward,
  resumeReconciliationAs,
  reverseReward,
  reviewParticipationAs,
  startReconciliationAs,
  submitEvidenceAs,
} from "@/modules/participation";
import {
  challengeParticipationStatus,
  reconciliationStatus,
  rewardStatus,
} from "@/modules/participation/schema";
import { setConfigAs } from "@/modules/system";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { seedChallenge, seedMember, seedParticipation, seedTerm } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// DT-315 (ADR-123 regla 8): el error de una decisión que ya no aplica nombra el estado con la
// palabra del catálogo, no con el valor del enum. Son siete sitios: revisar y anular una entrega,
// los cuatro pasos de un premio y reanudar una conciliación.

// El orden de cada enum, escrito acá: la primera prueba lo compara con el del esquema, así que un
// estado nuevo o movido deja en rojo esta lista y recuerda la del catálogo.
const DELIVERY = ["PENDING", "COMPLETED", "REJECTED", "ANNULLED"] as const;
const PRIZE = ["RESERVED", "GRANTED", "RELEASED", "REVERSED"] as const;
const RUN = ["RUNNING", "DONE", "FAILED"] as const;

type Delivery = (typeof DELIVERY)[number];
type Prize = (typeof PRIZE)[number];

const CAPS = { daily: 1_000, weekly: 1_000 };
const REASONS = { base: "Reto sintético", extra: "Impulso sintético" };

function word(code: "T-3266" | "T-3267" | "T-2559", order: readonly string[], status: string) {
  const label = tList(code)[order.indexOf(status)];
  if (!label) throw new Error(`El catálogo no nombra ${status} en ${code}`);
  return label.toLowerCase();
}

const deliveryIs = (status: Delivery) => t("T-676", { estado: word("T-3266", DELIVERY, status) });
const prizeIs = (status: Prize) => t("T-676", { estado: word("T-3267", PRIZE, status) });
const runIs = (status: (typeof RUN)[number]) =>
  t("T-3268", { estado: word("T-2559", RUN, status) });

/** El texto con el que el dominio se niega. */
async function refusal(run: Promise<unknown>): Promise<string> {
  const error = await run.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).message;
}

async function reviewers() {
  const termId = await seedTerm();
  const reviewer = { personId: await seedMember("estados.revisora@eafit.edu.co"), ip: null };
  const personId = await seedMember("estados.entrega@eafit.edu.co");
  await setConfigAs(reviewer, "gamification.enabled", true);
  return { termId, reviewer, personId };
}

type Fixture = Awaited<ReturnType<typeof reviewers>>;

let deliveries = 0;

/** Una entrega pendiente de un reto de evidencia nuevo: hay una sola por persona y reto. */
async function deliver(f: Fixture): Promise<string> {
  deliveries += 1;
  const challengeId = await seedChallenge(f.termId, {
    kind: "EVIDENCE",
    passPercent: null,
    basePoints: 5,
  });
  const result = await submitEvidenceAs(
    { personId: f.personId, ip: null },
    {
      challengeId,
      requestId: `req-estados-${deliveries}`,
      text: "Evidencia de prueba con suficiente texto.",
      keys: [],
    },
  );
  if (!result.ok) throw new Error("La entrega falló");
  return result.participation.id;
}

function review(f: Fixture, participationId: string, decision: "APPROVE" | "REJECT") {
  return reviewParticipationAs(f.reviewer, {
    participationId,
    decision,
    reason: decision === "REJECT" ? "No se ve la actividad" : null,
  });
}

function annul(f: Fixture, participationId: string) {
  return annulParticipationAs(f.reviewer, participationId, "Se cargó por error");
}

/** Un premio de reto llevado hasta `status` por los pasos del dominio. */
async function prizeIn(status: Prize, personId: string, termId: string) {
  const actor = { personId, ip: null };
  const challengeId = await seedChallenge(termId);
  const input = {
    personId,
    termId,
    source: "CHALLENGE" as const,
    participationId: await seedParticipation(challengeId, personId),
    base: 5,
    personalPercent: 0 as const,
    campaignPercent: 0 as const,
  };
  const held = await runCommand(actor, (ctx) => reserveReward(ctx, input, CAPS));
  const id = held.reward.id;
  if (status === "GRANTED" || status === "REVERSED") {
    await runCommand(actor, (ctx) => grantReward(ctx, id, REASONS));
  }
  if (status === "REVERSED") {
    await runCommand(actor, (ctx) => reverseReward(ctx, id, "Reversión sintética"));
  }
  if (status === "RELEASED") {
    await runCommand(actor, (ctx) => releaseReward(ctx, id, "Liberación sintética"));
  }
  return { id, input, actor };
}

describe("«esa decisión no aplica» nombra el estado en español", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("el catálogo trae una palabra por cada estado de una entrega, de un premio y de una conciliación, en el orden de su enum", () => {
    expect([...challengeParticipationStatus.enumValues]).toEqual([...DELIVERY]);
    expect([...rewardStatus.enumValues]).toEqual([...PRIZE]);
    expect([...reconciliationStatus.enumValues]).toEqual([...RUN]);
    expect(tList("T-3266")).toHaveLength(DELIVERY.length);
    expect(tList("T-3267")).toHaveLength(PRIZE.length);
    expect(tList("T-2559")).toHaveLength(RUN.length);
  });

  it("revisar una entrega completada, rechazada o anulada responde con la palabra de su estado", async () => {
    const f = await reviewers();
    const completed = await deliver(f);
    await review(f, completed, "APPROVE");
    const rejected = await deliver(f);
    await review(f, rejected, "REJECT");

    expect(await refusal(review(f, completed, "REJECT"))).toBe(deliveryIs("COMPLETED"));
    expect(await refusal(review(f, rejected, "APPROVE"))).toBe(deliveryIs("REJECTED"));
    await annul(f, completed);
    expect(await refusal(review(f, completed, "APPROVE"))).toBe(deliveryIs("ANNULLED"));
  });

  it("anular una entrega pendiente, rechazada o ya anulada responde con la palabra de su estado", async () => {
    const f = await reviewers();
    const pending = await deliver(f);
    const rejected = await deliver(f);
    await review(f, rejected, "REJECT");
    const annulled = await deliver(f);
    await review(f, annulled, "APPROVE");
    await annul(f, annulled);

    expect(await refusal(annul(f, pending))).toBe(deliveryIs("PENDING"));
    expect(await refusal(annul(f, rejected))).toBe(deliveryIs("REJECTED"));
    expect(await refusal(annul(f, annulled))).toBe(deliveryIs("ANNULLED"));
  });

  it("entregar un premio liberado o anulado responde con la palabra de su estado", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("estados.premio@eafit.edu.co");
    for (const status of ["RELEASED", "REVERSED"] as const) {
      const prize = await prizeIn(status, personId, termId);
      expect(
        await refusal(runCommand(prize.actor, (ctx) => grantReward(ctx, prize.id, REASONS))),
      ).toBe(prizeIs(status));
    }
  });

  it("liberar un premio entregado o anulado responde con la palabra de su estado", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("estados.premio@eafit.edu.co");
    for (const status of ["GRANTED", "REVERSED"] as const) {
      const prize = await prizeIn(status, personId, termId);
      expect(
        await refusal(runCommand(prize.actor, (ctx) => releaseReward(ctx, prize.id, "Liberación"))),
      ).toBe(prizeIs(status));
    }
  });

  it("anular un premio reservado o liberado responde con la palabra de su estado", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("estados.premio@eafit.edu.co");
    for (const status of ["RESERVED", "RELEASED"] as const) {
      const prize = await prizeIn(status, personId, termId);
      expect(
        await refusal(runCommand(prize.actor, (ctx) => reverseReward(ctx, prize.id, "Reversión"))),
      ).toBe(prizeIs(status));
    }
  });

  it("volver a reservar un premio reservado, entregado o anulado responde con la palabra de su estado", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("estados.premio@eafit.edu.co");
    for (const status of ["RESERVED", "GRANTED", "REVERSED"] as const) {
      const prize = await prizeIn(status, personId, termId);
      expect(
        await refusal(
          runCommand(prize.actor, (ctx) => rereserveReward(ctx, prize.id, prize.input, CAPS)),
        ),
      ).toBe(prizeIs(status));
    }
  });

  // Ese mismo error salta cuando el premio sí está liberado y lo que no coincide es la persona o el
  // semestre: ahí el estado no es la causa. Se conserva como estaba: ningún llamador llega con un
  // premio ajeno, porque los dos leen el premio de la misma entrega o asistencia que reservan.
  it("volver a reservar un premio liberado a nombre de otra persona, o en otro semestre, responde igual, con su estado", async () => {
    const termId = await seedTerm();
    const otherTermId = await seedTerm("2019-1");
    const personId = await seedMember("estados.premio@eafit.edu.co");
    const otherId = await seedMember("estados.ajena@eafit.edu.co");
    const prize = await prizeIn("RELEASED", personId, termId);

    expect(
      await refusal(
        runCommand(prize.actor, (ctx) =>
          rereserveReward(ctx, prize.id, { ...prize.input, personId: otherId }, CAPS),
        ),
      ),
    ).toBe(prizeIs("RELEASED"));
    expect(
      await refusal(
        runCommand(prize.actor, (ctx) =>
          rereserveReward(ctx, prize.id, { ...prize.input, termId: otherTermId }, CAPS),
        ),
      ),
    ).toBe(prizeIs("RELEASED"));
  });

  it("reanudar una conciliación en curso o terminada dice en qué estado está", async () => {
    await seedTerm();
    const admin = { personId: await seedMember("estados.gh@eafit.edu.co"), ip: null };
    const { id } = await startReconciliationAs(admin, "DRY_RUN");

    expect(await refusal(resumeReconciliationAs(admin, id))).toBe(runIs("RUNNING"));
    await drainOutbox();
    expect((await getReconciliationRun(id))?.status).toBe("DONE");
    expect(await refusal(resumeReconciliationAs(admin, id))).toBe(runIs("DONE"));
  });
});
