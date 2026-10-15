export type PresenceWeekStatus = "COMPLETED" | "PENDING" | "PAUSED" | "MISSED";

export interface PresenceWeek {
  weekKey: string;
  status: PresenceWeekStatus;
  streak: number;
  /** Bono devengado por una actividad ocurrida desde el lanzamiento. */
  bonus: number;
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
}

export interface PresenceRecognitionSnapshot {
  personId: string;
  recognition: PresenceStreak;
}
