import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { submitTrivia } from "@/modules/participation/domain/challenge-participation";
import {
  challengeInputSchema,
  findChallenge,
  getChallengeForMember,
  hasGrantedRewards,
  listChallengesForMember,
} from "@/modules/participation/domain/challenges";
import {
  cancelOccasionAs,
  checkInSelfAs,
  decideCheckInAs,
} from "@/modules/participation/domain/commands";
import {
  annulParticipationAs,
  cancelChallengeAs,
  createChallengeAs,
  duplicateChallengeAs,
  publishChallengeAs,
  reviewParticipationAs,
  submitEvidenceAs,
  submitTriviaAs,
  updateChallengeAs,
} from "@/modules/participation/domain/gamification-commands";
import { balanceFor } from "@/modules/participation/domain/ledger";
import {
  loadGamificationSettings,
  resolveMemberContext,
} from "@/modules/participation/domain/member-context";
import {
  challenge,
  challengeParticipation,
  challengeQuestion,
  pointEntry,
  reward,
} from "@/modules/participation/schema";
import { setConfigAs } from "@/modules/system";
import { outbox } from "@/modules/system/schema";
import { t, tList } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedChallenge,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
  seedVeteran,
} from "./factories";

// Retos (ADR-067 reglas 2, 3, 5, 12 y 17): ciclo de vida, entregas de trivia y evidencia,
// revisión, anulación y el gancho presencial sobre los check-ins.

const db = () => getDb();

async function enableGamification(personId: string): Promise<void> {
  await setConfigAs({ personId }, "gamification.enabled", true);
}

async function participationOf(challengeId: string, personId: string) {
  const [row] = await db()
    .select()
    .from(challengeParticipation)
    .where(
      and(
        eq(challengeParticipation.challengeId, challengeId),
        eq(challengeParticipation.personId, personId),
      ),
    );
  return row ?? null;
}

async function outboxTypes(): Promise<string[]> {
  const rows = await db().select({ type: outbox.eventType }).from(outbox);
  return rows.map((row) => row.type);
}

/** Trivia publicada con una pregunta de dos opciones; la correcta es la 0. */
async function seedTrivia(termId: string, overrides: Parameters<typeof seedChallenge>[1] = {}) {
  const challengeId = await seedChallenge(termId, overrides);
  await db()
    .insert(challengeQuestion)
    .values({
      challengeId,
      ordinal: 1,
      prompt: "¿Pregunta?",
      options: ["Sí", "No"],
      correctIndex: 0,
    });
  return challengeId;
}

describe("retos: ciclo de vida", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("crea borrador, edita todo en borrador, publica y luego solo cambia título y descripción", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("retos.admin@eafit.edu.co");
    const base = {
      kind: "TRIVIA" as const,
      title: "Trivia sintética",
      description: "Descripción",
      audience: "ALL" as const,
      audienceCommitteeIds: [],
      opensAt: new Date(Date.now() - 3_600_000),
      closesAt: new Date(Date.now() + 86_400_000),
      basePoints: 5,
      passPercent: 80,
      occasionId: null,
      questions: [{ prompt: "¿Una?", options: ["A", "B"], correctIndex: 0 }],
    };
    const { id } = await createChallengeAs({ personId: adminId }, challengeInputSchema.parse(base));
    const created = await findChallenge(id);
    expect(created).toMatchObject({ status: "DRAFT", termId, basePoints: 5, passPercent: 80 });

    await updateChallengeAs(
      { personId: adminId },
      id,
      challengeInputSchema.parse({ ...base, title: "Trivia renombrada", basePoints: 10 }),
    );
    expect((await findChallenge(id))?.title).toBe("Trivia renombrada");
    expect((await findChallenge(id))?.basePoints).toBe(10);

    await publishChallengeAs({ personId: adminId }, id);
    expect((await findChallenge(id))?.status).toBe("PUBLISHED");

    // Publicada, solo título y descripción cambian; el premio queda congelado.
    await updateChallengeAs(
      { personId: adminId },
      id,
      challengeInputSchema.parse({ ...base, title: "Título final", basePoints: 20 }),
    );
    const after = await findChallenge(id);
    expect(after?.title).toBe("Título final");
    expect(after?.basePoints).toBe(10);
    expect(await outboxTypes()).toContain("challenge.published");
  });

  it("solo la trivia valida y guarda preguntas, con el mensaje del editor", async () => {
    await seedTerm();
    const adminId = await seedMember("retos.formato@eafit.edu.co");
    // Así llega del editor: abre en trivia y conserva su pregunta vacía al cambiar de formato.
    const base = {
      title: "Reto relámpago",
      description: "Foto con la estatua",
      audience: "ALL",
      audienceCommitteeIds: [],
      opensAt: new Date(Date.now() - 3_600_000),
      closesAt: new Date(Date.now() + 3_600_000),
      basePoints: "20",
      passPercent: "",
      occasionId: "",
      questions: [{ prompt: "", options: ["", ""], correctIndex: 0 }],
    };
    const evidence = challengeInputSchema.safeParse({ ...base, kind: "EVIDENCE" });
    if (!evidence.success) throw evidence.error;
    expect(evidence.data.questions).toEqual([]);
    const { id } = await createChallengeAs({ personId: adminId }, evidence.data);
    expect(
      await db().select().from(challengeQuestion).where(eq(challengeQuestion.challengeId, id)),
    ).toEqual([]);

    const trivia = challengeInputSchema.safeParse({
      ...base,
      kind: "TRIVIA",
      questions: [{ prompt: "  ", options: ["A", "B"], correctIndex: 0 }],
    });
    expect(trivia.error?.issues.map((issue) => issue.message)).toEqual([tList("T-2520")[8]]);
  });

  it("publicar exige ventana futura y trivia con preguntas", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("retos.publicar@eafit.edu.co");
    const { id: expired } = await createChallengeAs(
      { personId: adminId },
      challengeInputSchema.parse({
        kind: "TRIVIA",
        title: "Vencida",
        audience: "ALL",
        audienceCommitteeIds: [],
        opensAt: new Date(Date.now() - 172_800_000),
        closesAt: new Date(Date.now() - 86_400_000),
        basePoints: 5,
        passPercent: 80,
        occasionId: null,
        questions: [{ prompt: "¿Una?", options: ["A", "B"], correctIndex: 0 }],
      }),
    );
    await expect(publishChallengeAs({ personId: adminId }, expired)).rejects.toThrow(
      tList("T-2520")[0] ?? "",
    );

    const { id: noQuestions } = await createChallengeAs(
      { personId: adminId },
      challengeInputSchema.parse({
        kind: "EVIDENCE",
        title: "Sin preguntas",
        audience: "ALL",
        audienceCommitteeIds: [],
        opensAt: new Date(Date.now() - 3_600_000),
        closesAt: new Date(Date.now() + 86_400_000),
        basePoints: 5,
        passPercent: null,
        occasionId: null,
        questions: [],
      }),
    );
    await db()
      .update(challenge)
      .set({ kind: "TRIVIA", passPercent: 80 })
      .where(eq(challenge.id, noQuestions));
    await expect(publishChallengeAs({ personId: adminId }, noQuestions)).rejects.toThrow(
      tList("T-2520")[2] ?? "",
    );
    void termId;
  });

  it("cancelar libera reservas, rechaza pendientes con T-2581 y emite challenge.rejected", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("retos.cancelar@eafit.edu.co");
    const personId = await seedMember("retos.cancelada@eafit.edu.co");
    const challengeId = await seedChallenge(termId, { kind: "EVIDENCE", passPercent: null });
    await enableGamification(adminId);
    const submitted = await submitEvidenceAs(
      { personId },
      {
        challengeId,
        requestId: "req-cancel-1",
        text: "Evidencia de prueba con suficiente texto.",
        keys: [],
      },
    );
    expect(submitted.ok).toBe(true);

    const result = await cancelChallengeAs({ personId: adminId }, challengeId, "Motivo de prueba");
    expect(result).toMatchObject({ released: 1, granted: 0 });
    const row = await findChallenge(challengeId);
    expect(row?.status).toBe("CANCELLED");
    const participation = await participationOf(challengeId, personId);
    expect(participation?.status).toBe("REJECTED");
    expect(participation?.reason).toBe(t("T-2581", { motivo: "Motivo de prueba" }));
    const [rewardRow] = await db()
      .select()
      .from(reward)
      .where(eq(reward.id, participation?.rewardId ?? ""));
    expect(rewardRow?.status).toBe("RELEASED");
    expect(await outboxTypes()).toContain("challenge.rejected");
  });

  it("duplicar crea un borrador con las preguntas copiadas", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("retos.dup@eafit.edu.co");
    const challengeId = await seedTrivia(termId);
    const { id } = await duplicateChallengeAs({ personId: adminId }, challengeId);
    const copy = await findChallenge(id);
    expect(copy).toMatchObject({
      status: "DRAFT",
      termId,
      kind: "TRIVIA",
      duplicatedFromId: challengeId,
    });
    const questions = await db()
      .select()
      .from(challengeQuestion)
      .where(eq(challengeQuestion.challengeId, id));
    expect(questions).toHaveLength(1);
    expect(questions[0]?.prompt).toBe("¿Pregunta?");
  });
});

describe("retos: lecturas del miembro", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("lista solo retos del público de cada miembro", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("gh");
    const nuevo = await seedMember("retos.nuevo@eafit.edu.co");
    const veterano = await seedVeteran("retos.veterano@eafit.edu.co");
    const deComite = await seedVeteran("retos.comite@eafit.edu.co");
    await seedCommitteeMembership(deComite, committeeId, termId);

    await seedChallenge(termId, { title: "Para todos", audience: "ALL" });
    await seedChallenge(termId, { title: "Para nuevos", audience: "NEW" });
    await seedChallenge(termId, { title: "Para veteranos", audience: "VETERAN" });
    await seedChallenge(termId, {
      title: "Para comité",
      audience: "COMMITTEES",
      audienceCommitteeIds: [committeeId],
    });
    await seedChallenge(termId, { title: "Borrador", status: "DRAFT" });

    const memberNuevo = await resolveMemberContext(nuevo, termId);
    const memberVeterano = await resolveMemberContext(veterano, termId);
    const memberComite = await resolveMemberContext(deComite, termId);

    const titles = async (
      personId: string,
      member: Awaited<ReturnType<typeof resolveMemberContext>>,
    ) => (await listChallengesForMember(personId, termId, member)).map((row) => row.title).sort();

    expect(await titles(nuevo, memberNuevo)).toEqual(["Para nuevos", "Para todos"]);
    expect(await titles(veterano, memberVeterano)).toEqual(["Para todos", "Para veteranos"]);
    expect(await titles(deComite, memberComite)).toEqual([
      "Para comité",
      "Para todos",
      "Para veteranos",
    ]);
  });

  it("oculta correctIndex hasta que el reto cierra", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("retos.oculta@eafit.edu.co");
    const challengeId = await seedTrivia(termId);
    const member = await resolveMemberContext(personId, termId);

    const open = await getChallengeForMember(challengeId, personId, member);
    expect(open?.questions[0]?.correctIndex).toBeNull();

    await db()
      .update(challenge)
      .set({ closesAt: new Date(Date.now() - 60_000) })
      .where(eq(challenge.id, challengeId));
    const closed = await getChallengeForMember(challengeId, personId, member);
    expect(closed?.state).toBe("CLOSED");
    expect(closed?.questions[0]?.correctIndex).toBe(0);
  });
});

describe("retos: trivia", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("aprobar completa, acredita CHALLENGE y emite challenge.completed", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("retos.trivia@eafit.edu.co");
    await enableGamification(personId);
    const challengeId = await seedTrivia(termId);

    const result = await submitTriviaAs(
      { personId },
      { challengeId, requestId: "req-ok-1", answers: [0] },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.participation.status).toBe("COMPLETED");
    expect(result.reward?.status).toBe("GRANTED");
    expect(await balanceFor(personId, termId)).toBe(5);
    const entries = await db()
      .select()
      .from(pointEntry)
      .where(eq(pointEntry.rewardId, result.reward?.id ?? ""));
    expect(entries.map((entry) => entry.kind)).toEqual(["CHALLENGE"]);
    expect(await outboxTypes()).toContain("challenge.completed");
  });

  it("bajo el umbral rechaza con T-2423 y sin premio", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("retos.falla@eafit.edu.co");
    await enableGamification(personId);
    const challengeId = await seedTrivia(termId);

    const result = await submitTriviaAs(
      { personId },
      { challengeId, requestId: "req-fail-1", answers: [1] },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.participation.status).toBe("REJECTED");
    expect(result.reward).toBeNull();
    expect(result.participation.reason).toBe(
      t("T-2423", { porcentaje: 80, aciertos: 0, total: 1 }),
    );
    expect(await balanceFor(personId, termId)).toBe(0);
    expect(await outboxTypes()).toContain("challenge.rejected");
  });

  it("una segunda entrega es ALREADY y el mismo requestId repite el resultado", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("retos.doble@eafit.edu.co");
    await enableGamification(personId);
    const challengeId = await seedTrivia(termId);

    const first = await submitTriviaAs(
      { personId },
      { challengeId, requestId: "req-idem-1", answers: [0] },
    );
    const replay = await submitTriviaAs(
      { personId },
      { challengeId, requestId: "req-idem-1", answers: [0] },
    );
    expect(replay.ok).toBe(true);
    if (first.ok && replay.ok) {
      expect(replay.participation.id).toBe(first.participation.id);
    }
    const second = await submitTriviaAs(
      { personId },
      { challengeId, requestId: "req-idem-2", answers: [0] },
    );
    expect(second).toEqual({ ok: false, reason: "ALREADY" });
    expect(await balanceFor(personId, termId)).toBe(5);
  });

  it("dos personas entregan el mismo reto con el mismo requestId y cada una repite lo suyo (ADR-118 regla 18)", async () => {
    const termId = await seedTerm();
    const ana = await seedMember("retos.pestana.ana@eafit.edu.co");
    const bruno = await seedMember("retos.pestana.bruno@eafit.edu.co");
    await enableGamification(ana);
    const trivia = await seedTrivia(termId);
    const evidence = await seedChallenge(termId, { kind: "EVIDENCE", passPercent: null });
    // La misma pestaña: Bruno hereda el requestId que la entrega de Ana dejó en sessionStorage.
    const requestId = "5f0c1f0e-6f0a-4d53-9d5f-2f3c8f0f7a11";
    const answers = { challengeId: trivia, requestId, answers: [0] };

    const deAna = await submitTriviaAs({ personId: ana }, answers);
    const deBruno = await submitTriviaAs({ personId: bruno }, answers);
    expect(deAna.ok && deAna.participation.status).toBe("COMPLETED");
    expect(deBruno.ok && deBruno.participation.status).toBe("COMPLETED");
    expect(await balanceFor(bruno, termId)).toBe(5);

    const repetida = await submitTriviaAs({ personId: bruno }, answers);
    expect(repetida.ok && repetida.participation.id).toBe(deBruno.ok && deBruno.participation.id);
    expect(await balanceFor(bruno, termId)).toBe(5);
    expect(await submitTriviaAs({ personId: bruno }, { ...answers, requestId: "otra" })).toEqual({
      ok: false,
      reason: "ALREADY",
    });

    const proof = {
      challengeId: evidence,
      requestId,
      text: "Fuimos a la actividad del comité y dejamos el registro completo.",
      keys: [],
    };
    const pruebaDeAna = await submitEvidenceAs({ personId: ana }, proof);
    const pruebaDeBruno = await submitEvidenceAs({ personId: bruno }, proof);
    expect(pruebaDeAna.ok && pruebaDeAna.participation.status).toBe("PENDING");
    expect(pruebaDeBruno.ok && pruebaDeBruno.participation.status).toBe("PENDING");
    const pruebaRepetida = await submitEvidenceAs({ personId: bruno }, proof);
    expect(pruebaRepetida.ok && pruebaRepetida.participation.id).toBe(
      pruebaDeBruno.ok && pruebaDeBruno.participation.id,
    );
  });

  it("una entrega guardada antes de la regla 18 se sigue repitiendo con su requestId", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("retos.vieja@eafit.edu.co");
    await enableGamification(personId);
    const challengeId = await seedTrivia(termId);
    const requestId = "0c2b1d7e-0d0f-4c57-8a55-6b0f3a0e9d21";
    const input = { challengeId, requestId, answers: [0] };
    const first = await submitTriviaAs({ personId }, input);
    // Así quedó guardada una entrega anterior a la regla: el requestId tal como llegó.
    await db()
      .update(challengeParticipation)
      .set({ requestId })
      .where(eq(challengeParticipation.challengeId, challengeId));

    const replay = await submitTriviaAs({ personId }, input);

    expect(replay.ok && replay.participation.id).toBe(first.ok && first.participation.id);
    expect(await balanceFor(personId, termId)).toBe(5);
  });

  it("dos entregas simultáneas con requestIds distintos: solo una gana", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("retos.carrera@eafit.edu.co");
    await enableGamification(personId);
    const challengeId = await seedTrivia(termId);

    const member = await resolveMemberContext(personId, termId);
    const settings = await loadGamificationSettings();
    const results = await Promise.allSettled([
      runCommand({ personId }, (ctx) =>
        submitTrivia(
          ctx,
          { challengeId, personId, requestId: "req-c-1", answers: [0] },
          { member, settings, booster: null, campaign: null },
        ),
      ),
      runCommand({ personId }, (ctx) =>
        submitTrivia(
          ctx,
          { challengeId, personId, requestId: "req-c-2", answers: [0] },
          { member, settings, booster: null, campaign: null },
        ),
      ),
    ]);
    const participation = await participationOf(challengeId, personId);
    expect(participation?.status).toBe("COMPLETED");
    expect(await balanceFor(personId, termId)).toBe(5);
    expect(results.filter((result) => result.status === "fulfilled").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("bandera apagada, no elegible y reto programado se rechazan sin escribir", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("retos.apagado@eafit.edu.co");
    const challengeId = await seedTrivia(termId);

    // Sin enableGamification: la semilla trae gamification.enabled en falso.
    expect(
      await submitTriviaAs({ personId }, { challengeId, requestId: "r-1", answers: [0] }),
    ).toEqual({ ok: false, reason: "DISABLED" });

    await enableGamification(personId);
    // No elegible: veterano excluido de un reto para nuevos.
    const veterano = await seedVeteran("retos.excluido@eafit.edu.co");
    const soloNuevos = await seedTrivia(termId, { audience: "NEW" });
    expect(
      await submitTriviaAs(
        { personId: veterano },
        { challengeId: soloNuevos, requestId: "r-2", answers: [0] },
      ),
    ).toEqual({ ok: false, reason: "NOT_ELIGIBLE" });

    // Programado: se ve en la lista pero no admite entregas.
    const scheduled = await seedTrivia(termId, {
      opensAt: new Date(Date.now() + 3_600_000),
      closesAt: new Date(Date.now() + 86_400_000),
    });
    expect(
      await submitTriviaAs(
        { personId },
        { challengeId: scheduled, requestId: "r-3", answers: [0] },
      ),
    ).toEqual({ ok: false, reason: "NOT_OPEN" });
  });
});

describe("retos: evidencia y revisión", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("la entrega queda pendiente con premio reservado y encola el procesamiento", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("retos.evidencia@eafit.edu.co");
    await enableGamification(personId);
    const challengeId = await seedChallenge(termId, { kind: "EVIDENCE", passPercent: null });

    const result = await submitEvidenceAs(
      { personId },
      {
        challengeId,
        requestId: "req-ev-1",
        text: "Evidencia de prueba con suficiente texto.",
        keys: [],
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.participation.status).toBe("PENDING");
    expect(result.reward?.status).toBe("RESERVED");
    expect(await balanceFor(personId, termId)).toBe(0);
  });

  it("aprobar entrega el premio, rechazarlo lo libera y anularlo lo revierte", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("retos.revisor@eafit.edu.co");
    const personId = await seedMember("retos.revision@eafit.edu.co");
    await enableGamification(adminId);

    const submit = async (requestId: string) => {
      const challengeId = await seedChallenge(termId, {
        kind: "EVIDENCE",
        passPercent: null,
      });
      const result = await submitEvidenceAs(
        { personId },
        {
          challengeId,
          requestId,
          text: "Evidencia de prueba con suficiente texto.",
          keys: [],
        },
      );
      if (!result.ok) throw new Error("La entrega falló");
      return { challengeId, participationId: result.participation.id };
    };

    // APPROVE → GRANTED + COMPLETED.
    const approved = await submit("req-ap-1");
    await reviewParticipationAs(
      { personId: adminId },
      { participationId: approved.participationId, decision: "APPROVE" },
    );
    const approvedRow = await participationOf(approved.challengeId, personId);
    expect(approvedRow?.status).toBe("COMPLETED");
    const [approvedReward] = await db()
      .select()
      .from(reward)
      .where(eq(reward.id, approvedRow?.rewardId ?? ""));
    expect(approvedReward?.status).toBe("GRANTED");
    expect(await balanceFor(personId, termId)).toBe(5);

    // REJECT sin motivo → T-2564; con motivo → RELEASED + REJECTED.
    const rejected = await submit("req-re-1");
    await expect(
      reviewParticipationAs(
        { personId: adminId },
        { participationId: rejected.participationId, decision: "REJECT", reason: "  " },
      ),
    ).rejects.toThrow(t("T-2564"));
    await reviewParticipationAs(
      { personId: adminId },
      {
        participationId: rejected.participationId,
        decision: "REJECT",
        reason: "No se ve la actividad",
      },
    );
    const rejectedRow = await participationOf(rejected.challengeId, personId);
    expect(rejectedRow?.status).toBe("REJECTED");
    const [rejectedReward] = await db()
      .select()
      .from(reward)
      .where(eq(reward.id, rejectedRow?.rewardId ?? ""));
    expect(rejectedReward?.status).toBe("RELEASED");

    // Anular la aprobada → REVERSED + ANNULLED y saldo neto cero.
    await annulParticipationAs(
      { personId: adminId },
      approved.participationId,
      "Anulación de prueba",
    );
    const annulled = await participationOf(approved.challengeId, personId);
    expect(annulled?.status).toBe("ANNULLED");
    const [annulledReward] = await db()
      .select()
      .from(reward)
      .where(eq(reward.id, annulled?.rewardId ?? ""));
    expect(annulledReward?.status).toBe("REVERSED");
    expect(await balanceFor(personId, termId)).toBe(0);
  });
});

describe("retos: presencial con check-in", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("check-in aprobado en ocasión AUTO completa el reto y suma ambos premios", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("retos.auto@eafit.edu.co");
    await enableGamification(personId);
    const occasion = await seedOccasion(termId, { points: 10, approval: "AUTO" });
    const challengeId = await seedChallenge(termId, {
      kind: "PRESENTIAL",
      occasionId: occasion.id,
      passPercent: null,
      basePoints: 5,
    });

    const result = await checkInSelfAs({ personId }, { publicId: occasion.publicId });
    expect(result.ok).toBe(true);
    const participation = await participationOf(challengeId, personId);
    expect(participation?.status).toBe("COMPLETED");
    expect(participation?.checkInId).not.toBeNull();
    // 10 de asistencia + 5 del reto.
    expect(await balanceFor(personId, termId)).toBe(15);
    const entries = await db()
      .select({ kind: pointEntry.kind })
      .from(pointEntry)
      .where(eq(pointEntry.personId, personId));
    expect(entries.map((entry) => entry.kind).sort()).toEqual(["CHALLENGE", "CHECKIN"]);
  });

  it("ocasión MANUAL: reserva al registrar, aprueba o libera al decidir", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("retos.mesa@eafit.edu.co");
    const personId = await seedMember("retos.manual@eafit.edu.co");
    await enableGamification(adminId);
    const occasion = await seedOccasion(termId, { points: 10, approval: "MANUAL" });
    const challengeId = await seedChallenge(termId, {
      kind: "PRESENTIAL",
      occasionId: occasion.id,
      passPercent: null,
      basePoints: 5,
    });

    const checkInResult = await checkInSelfAs({ personId }, { publicId: occasion.publicId });
    expect(checkInResult.ok).toBe(true);
    if (!checkInResult.ok) return;
    const participation = await participationOf(challengeId, personId);
    expect(participation?.status).toBe("PENDING");
    const [reserved] = await db()
      .select()
      .from(reward)
      .where(eq(reward.id, participation?.rewardId ?? ""));
    expect(reserved?.status).toBe("RESERVED");
    expect(await balanceFor(personId, termId)).toBe(0);

    await decideCheckInAs(
      { personId: adminId },
      { checkInId: checkInResult.checkInId, decision: "APPROVE" },
    );
    const approved = await participationOf(challengeId, personId);
    expect(approved?.status).toBe("COMPLETED");
    expect(await balanceFor(personId, termId)).toBe(15);

    // Rechazo sobre una ocasión manual nueva: libera la reserva y rechaza la entrega.
    const person2 = await seedMember("retos.manual2@eafit.edu.co");
    const occasion2 = await seedOccasion(termId, {
      points: 10,
      approval: "MANUAL",
      title: "Actividad manual",
    });
    const challenge2 = await seedChallenge(termId, {
      kind: "PRESENTIAL",
      occasionId: occasion2.id,
      passPercent: null,
    });
    const checkIn2 = await checkInSelfAs({ personId: person2 }, { publicId: occasion2.publicId });
    if (!checkIn2.ok) throw new Error("check-in manual falló");
    await decideCheckInAs(
      { personId: adminId },
      { checkInId: checkIn2.checkInId, decision: "REJECT", reason: "No asistió" },
    );
    const rejected = await participationOf(challenge2, person2);
    expect(rejected?.status).toBe("REJECTED");
    expect(rejected?.reason).toBe(t("T-2579", { actividad: "Actividad manual" }));
    const [released] = await db()
      .select()
      .from(reward)
      .where(eq(reward.id, rejected?.rewardId ?? ""));
    expect(released?.status).toBe("RELEASED");
    expect(await balanceFor(person2, termId)).toBe(0);
  });

  it("anular un check-in aprobado revierte el premio del reto", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("retos.anula@eafit.edu.co");
    const personId = await seedMember("retos.anulado@eafit.edu.co");
    await enableGamification(adminId);
    const occasion = await seedOccasion(termId, { points: 10, approval: "MANUAL" });
    const challengeId = await seedChallenge(termId, {
      kind: "PRESENTIAL",
      occasionId: occasion.id,
      passPercent: null,
      basePoints: 5,
    });
    const checkInResult = await checkInSelfAs({ personId }, { publicId: occasion.publicId });
    if (!checkInResult.ok) throw new Error("check-in manual falló");
    await decideCheckInAs(
      { personId: adminId },
      { checkInId: checkInResult.checkInId, decision: "APPROVE" },
    );
    expect(await balanceFor(personId, termId)).toBe(15);

    await decideCheckInAs(
      { personId: adminId },
      { checkInId: checkInResult.checkInId, decision: "CANCEL", reason: "Error de registro" },
    );
    const participation = await participationOf(challengeId, personId);
    expect(participation?.status).toBe("ANNULLED");
    const [rewardRow] = await db()
      .select()
      .from(reward)
      .where(eq(reward.id, participation?.rewardId ?? ""));
    expect(rewardRow?.status).toBe("REVERSED");
    expect(await balanceFor(personId, termId)).toBe(0);
  });

  it("un check-in fuera de la ventana del reto no crea participación", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("retos.tarde@eafit.edu.co");
    await enableGamification(personId);
    const occasion = await seedOccasion(termId, { points: 10, approval: "AUTO" });
    // Reto ya cerrado cuando llega el check-in.
    const challengeId = await seedChallenge(termId, {
      kind: "PRESENTIAL",
      occasionId: occasion.id,
      passPercent: null,
      opensAt: new Date(Date.now() - 172_800_000),
      closesAt: new Date(Date.now() - 86_400_000),
    });
    const result = await checkInSelfAs({ personId }, { publicId: occasion.publicId });
    expect(result.ok).toBe(true);
    expect(await participationOf(challengeId, personId)).toBeNull();
    expect(await balanceFor(personId, termId)).toBe(10);
  });

  it("cancelar la ocasión anula la participación del reto vinculado", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("retos.ocasion@eafit.edu.co");
    const personId = await seedMember("retos.anulada@eafit.edu.co");
    await enableGamification(adminId);
    const occasion = await seedOccasion(termId, { points: 10, approval: "AUTO" });
    const challengeId = await seedChallenge(termId, {
      kind: "PRESENTIAL",
      occasionId: occasion.id,
      passPercent: null,
      basePoints: 5,
    });
    await checkInSelfAs({ personId }, { publicId: occasion.publicId });
    expect((await participationOf(challengeId, personId))?.status).toBe("COMPLETED");

    await cancelOccasionAs({ personId: adminId }, occasion.id, "Suspensión de prueba");
    const participation = await participationOf(challengeId, personId);
    expect(participation?.status).toBe("ANNULLED");
    expect(await balanceFor(personId, termId)).toBe(0);
    expect(await hasGrantedRewards(challengeId)).toBe(false);
  });
});
