export type PresenceWeekStatus = "COMPLETED" | "PENDING" | "PAUSED" | "MISSED";

export const PRESENCE_PAUSE_REASONS = [
  "LATE_PUBLICATION",
  "SHORT_NOTICE",
  "ON_LEAVE",
  "EXCUSED",
  "NO_RECORDED_ACTIVITIES",
  "INSUFFICIENT_HISTORY",
] as const;
export type PresencePauseReason = (typeof PRESENCE_PAUSE_REASONS)[number];

export interface PresenceWeek {
  weekKey: string;
  status: PresenceWeekStatus;
  streak: number;
  /** Bono devengado por una actividad ocurrida desde el lanzamiento. */
  bonus: number;
  /** Puede faltar en una foto anterior: no se reconstruye su motivo desde hechos actuales. */
  pauseReasons?: PresencePauseReason[];
}

export interface PresenceStreak {
  /** Un cierre anterior al sistema puede no haber guardado una foto de este reconocimiento. */
  recognitionAvailable: boolean;
  launched: boolean;
  currentStreak: number;
  longestStreak: number;
  weekStatus: PresenceWeekStatus;
  weekKey: string;
  bonus: number;
  nextBonus: number;
  weeks: PresenceWeek[];
  /** Explica la pausa sin confundir oferta disponible con una falta exigible. */
  weekPauseReasons?: PresencePauseReason[];
}

export interface PresenceRecognitionSnapshot {
  personId: string;
  recognition: PresenceStreak;
}
