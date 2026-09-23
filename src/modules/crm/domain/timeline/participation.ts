import {
  badgeUnlocked,
  boosterGranted,
  challengeCompleted,
  challengeRejected,
  checkinApproved,
  checkinCancelled,
  checkinExcused,
  checkinPending,
  game2048Completed,
  panalCheckpointReached,
  panalCompleted,
  pointsAdjusted,
  pointsReversed,
  sudokuCompleted,
  wordleCompleted,
} from "@/domain-events/participation";
import { fill, rule, type TimelineRule } from "./kit";

// Participación: check-ins, retos, insignias, boosters, juegos y movimientos del libro de puntos.

const BOOSTER_KINDS = ["PLUS_50", "PLUS_100"];

export const PARTICIPATION_RULES: readonly TimelineRule[] = [
  rule(checkinApproved, ({ occasionId, occasionTitle, points, category }, { labels }) => ({
    kind: "PARTICIPATION",
    summary:
      points > 0
        ? fill(labels.participationTexts[1] ?? "", { n: String(points), ocasion: occasionTitle })
        : fill(labels.participationTexts[0] ?? "", { ocasion: occasionTitle }),
    metadata: { occasionId, points, category },
  })),
  rule(checkinPending, ({ occasionId, occasionTitle }, { labels }) => ({
    kind: "PARTICIPATION",
    summary: fill(labels.participationTexts[2] ?? "", { ocasion: occasionTitle }),
    metadata: { occasionId },
  })),
  rule(checkinCancelled, ({ occasionId, occasionTitle, reason }, { labels }) => ({
    kind: "PARTICIPATION",
    summary: fill(labels.participationTexts[3] ?? "", {
      ocasion: occasionTitle,
      motivo: reason || "—",
    }),
    metadata: { occasionId },
  })),
  rule(checkinExcused, ({ occasionId, occasionTitle }, { labels }) => ({
    kind: "PARTICIPATION",
    summary: fill(labels.participationTexts[7] ?? "", { ocasion: occasionTitle }),
    metadata: { occasionId, excused: true },
  })),

  rule(
    challengeCompleted,
    ({ participationId, challengeId, challengeTitle, termId, points }, { labels }) => ({
      kind: "PARTICIPATION",
      summary: fill(labels.participationTexts[8] ?? "", {
        reto: challengeTitle,
        n: String(points),
      }),
      metadata: { participationId, challengeId, termId, points },
    }),
  ),
  rule(
    challengeRejected,
    ({ participationId, challengeId, challengeTitle, termId, reason }, { labels }) => ({
      kind: "PARTICIPATION",
      summary: fill(labels.participationTexts[11] ?? "", { reto: challengeTitle, motivo: reason }),
      metadata: { participationId, challengeId, termId },
    }),
  ),

  rule(badgeUnlocked, ({ achievementId, code, name, level, historical }, { labels }) => {
    // Los logros de la conciliación histórica no ensucian la línea de tiempo.
    if (historical) {
      return null;
    }
    return {
      kind: "PARTICIPATION",
      summary: fill(labels.participationTexts[9] ?? "", { insignia: name, nivel: String(level) }),
      metadata: { achievementId, code, level },
    };
  }),
  rule(boosterGranted, ({ boosterId, kind, source }, { labels }) => {
    // El booster por insignia ya lo cuenta badge.unlocked; solo el manual de GH entra acá.
    if (source !== "MANUAL") {
      return null;
    }
    const booster =
      labels.boosterNames?.[BOOSTER_KINDS.indexOf(kind)] ?? labels.boosterNames?.[0] ?? kind;
    return {
      kind: "PARTICIPATION",
      summary: fill(labels.participationTexts[10] ?? "", { booster }),
      metadata: { boosterId, kind },
    };
  }),

  rule(wordleCompleted, ({ gameId, termId, day, attempts, points }, { labels }) => ({
    kind: "PARTICIPATION",
    summary: fill(labels.participationTexts[6] ?? "", {
      fecha: day,
      intentos: String(attempts),
      n: String(points),
    }),
    metadata: { gameId, termId, day, attempts, points },
  })),
  rule(game2048Completed, ({ runId, termId, day, score, points }, { labels }) => ({
    kind: "PARTICIPATION",
    summary: fill(labels.participationTexts[12] ?? "", {
      fecha: day,
      puntaje: String(score),
      n: String(points),
    }),
    metadata: { runId, termId, day, score, points },
  })),
  rule(sudokuCompleted, ({ runId, termId, day, difficulty, assisted, points }, { labels }) => ({
    kind: "PARTICIPATION",
    summary: fill(labels.participationTexts[13] ?? "", { fecha: day, n: String(points) }),
    metadata: { runId, termId, day, difficulty, assisted, points },
  })),

  rule(
    panalCheckpointReached,
    ({ gameId, termId, day, checkpoint, words, points }, { labels }) => ({
      kind: "PARTICIPATION",
      summary: fill(labels.participationTexts[15] ?? "", {
        fecha: day,
        palabras: String(checkpoint === 1 ? 5 : 10),
        n: String(points),
      }),
      metadata: { gameId, termId, day, checkpoint, words, points },
    }),
  ),

  rule(panalCompleted, ({ gameId, termId, day, score, points }, { labels }) => ({
    kind: "PARTICIPATION",
    summary: fill(labels.participationTexts[14] ?? "", { fecha: day, n: String(points) }),
    metadata: { gameId, termId, day, score, points },
  })),

  rule(pointsAdjusted, ({ termId, points, reason }, { labels }) => ({
    kind: "PARTICIPATION",
    summary: fill(labels.participationTexts[4] ?? "", { n: String(points), motivo: reason || "—" }),
    metadata: { termId, points },
  })),
  rule(pointsReversed, ({ termId, points, reason }, { labels }) => ({
    kind: "PARTICIPATION",
    summary: fill(labels.participationTexts[5] ?? "", { n: String(points), motivo: reason || "—" }),
    metadata: { termId, points },
  })),
];
