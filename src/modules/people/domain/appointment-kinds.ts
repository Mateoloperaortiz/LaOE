import type { appointment } from "../schema";

// Los tipos de cargo en el orden de T-444 (ADR-034 regla 13; ADR-057). Viven aparte, sin dependencias,
// para que los lean `appointments` y `sanctions` sin cerrar un ciclo entre ellos (ADR-110).

export type AppointmentKind = (typeof appointment.$inferSelect)["kind"];

export const APPOINTMENT_KINDS = [
  "PRESIDENT",
  "VP_GH",
  "VP_PUBLIC_RELATIONS",
  "VP_ADMIN",
  "VP_FINANCE",
  "VP_COMMUNICATIONS",
  "GH_HEAD",
  "GH_DIRECTOR",
  "MACROEVENT_DIRECTOR",
  "OTHER",
] as const satisfies readonly AppointmentKind[];
