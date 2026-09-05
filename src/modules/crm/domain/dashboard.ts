import { type CallListRow, listOpenCalls } from "./calls";
import { listBoardSummaries } from "./cards";
import { countPendingRequests } from "./requests";
import { listTasks, type TaskRow } from "./tasks";

// Tablero del inicio del admin (ADR-037 regla 11): lo que crm sabe de los pendientes. Las respuestas
// recientes, las ocasiones abiertas y las alertas de sistema las compone src/app con sus módulos.

export interface BoardSummary {
  pipelineId: string;
  name: string;
  kind: string;
  stages: Array<{ name: string; open: number }>;
}

export interface AdminDashboard {
  /** Tareas abiertas asignadas al actor. */
  myTasks: { rows: TaskRow[]; total: number };
  /** Tareas abiertas y vencidas de todo el equipo. */
  overdueTasks: { rows: TaskRow[]; total: number };
  pendingRequests: number;
  /** Pipelines sin archivar con sus tarjetas abiertas por etapa. */
  boards: BoardSummary[];
  /** Convocatorias del término abiertas ahora mismo. */
  openCalls: CallListRow[];
}

export const DASHBOARD_ROWS = 6;

export async function dashboardForAdmin(
  actorId: string,
  termId: string | null,
  now = new Date(),
): Promise<AdminDashboard> {
  const [myTasks, overdueTasks, pendingRequests, boards, openCalls] = await Promise.all([
    listTasks({
      q: "",
      status: "OPEN",
      assignee: "mine",
      actorId,
      page: 1,
      pageSize: DASHBOARD_ROWS,
    }),
    listTasks({ q: "", overdue: true, page: 1, pageSize: DASHBOARD_ROWS }),
    countPendingRequests(),
    listBoardSummaries(),
    termId ? listOpenCalls(termId, now) : Promise.resolve([]),
  ]);
  return { myTasks, overdueTasks, pendingRequests, boards, openCalls };
}
