export type PresenceWeekStatus = "COMPLETED" | "PENDING" | "PAUSED" | "MISSED";

export interface PresenceWeek {
  weekKey: string;
  status: PresenceWeekStatus;
  streak: number;
  /** Bono devengado por una actividad ocurrida desde el lanzamiento. */
  bonus: number;
}

export interface PresenceStreak {
  launched: boolean;
  currentStreak: number;
  longestStreak: number;
  weekStatus: PresenceWeekStatus;
  weekKey: string;
  bonus: number;
  nextBonus: number;
  weeks: PresenceWeek[];
}
