export const GAMER_GAMES = ["WORDLE", "GAME2048", "SUDOKU", "PANAL"] as const;
export type GamerGame = (typeof GAMER_GAMES)[number];

export interface GamerParticipation {
  personId: string;
  day: string;
  game: GamerGame;
}

export interface GamerStanding {
  personId: string;
  name: string;
  anonymized: boolean;
  participations: number;
  activeDays: number;
  rank: number;
}

export interface GamerMilestone {
  days: 3 | 7 | 30;
  reachedOn: string | null;
}

export interface GamerProfile {
  launched: boolean;
  participations: number;
  activeDays: number;
  rank: number | null;
  totalPlayers: number;
  currentStreak: number;
  longestStreak: number;
  todayGames: GamerGame[];
  weekWildcardUsed: boolean;
  milestones: GamerMilestone[];
  nextMilestone: number | null;
}
