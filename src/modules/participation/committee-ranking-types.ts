/** Índice y componentes en escala 0–1; GH conserva sus importes netos originales (ADR-136). */
export type CommitteeScore = {
  committeeId: string;
  /** Sólo disponible cuando el nombre viene congelado en una foto de cierre. */
  name?: string;
  score: number;
  rawScore: number;
  attendanceScore: number;
  occasions: number;
} & (
  | {
      rankingMetric: "COMBINED";
      ghTotal: number;
      activeMembers: number;
      ghAverage: number;
      ghNormalized: number;
      attendanceNormalized: number;
      policy: {
        version: "GH_ATTENDANCE_50_50_V1";
        effectiveAt: string;
        ghWeight: 0.5;
        attendanceWeight: 0.5;
        ghAverageMax: number;
        attendanceMax: number;
      };
    }
  | {
      rankingMetric: "ATTENDANCE";
      ghTotal: null;
      activeMembers: null;
      ghAverage: null;
      ghNormalized: null;
      attendanceNormalized: null;
      policy: null;
    }
);

export type CommitteeStanding = CommitteeScore & { rank: number; name: string };
