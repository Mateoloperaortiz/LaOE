import { and, eq, gt, lte } from "drizzle-orm";
import type { CommandContext } from "@/db/tx";
import { notificationRequested } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import { tList } from "@/shared/copy";
import { formatDateTime, formatTime } from "@/shared/lib/dates";
import { inventoryReservation } from "../schema";

// Los avisos de devolución (ADR-191 regla 8). Corre cada hora: avisa una vez cuando faltan 24 horas
// para devolver y otra cuando el préstamo se vence. Cada pasada mira una ventana de dos horas, así una
// hora perdida no deja a nadie sin aviso, y la clave de entrega evita que llegue dos veces. Avisar no
// sanciona: la VP gestiona lo vencido desde su Mesa (ADR-150 regla 8).

const HOUR = 3_600_000;
export const REMINDER_WINDOW_MS = 2 * HOUR;
export const REMINDER_AHEAD_MS = 24 * HOUR;

export async function sendReturnReminders(
  ctx: CommandContext,
  now: Date,
): Promise<{ soon: number; overdue: number }> {
  const ahead = new Date(now.getTime() + REMINDER_AHEAD_MS);
  const window = (end: Date) =>
    and(
      eq(inventoryReservation.status, "OUT"),
      gt(inventoryReservation.endsAt, new Date(end.getTime() - REMINDER_WINDOW_MS)),
      lte(inventoryReservation.endsAt, end),
    );
  const [soon, overdue] = await Promise.all([
    ctx.tx.select().from(inventoryReservation).where(window(ahead)),
    ctx.tx.select().from(inventoryReservation).where(window(now)),
  ]);
  const [soonTitle, soonBody] = tList("T-5074");
  const [overdueTitle, overdueBody] = tList("T-5075");
  const send = async (
    row: typeof inventoryReservation.$inferSelect,
    kind: "devolver" | "vencido",
  ) => {
    const recipients = [...new Set([row.requesterId, row.collectorId])].map((personId) => ({
      personId,
      url: "/app/inventario",
    }));
    const body = (kind === "devolver" ? (soonBody ?? "") : (overdueBody ?? ""))
      .replace("{frente}", row.scopeLabel)
      .replace("{hora}", formatTime(row.endsAt))
      .replace("{fecha}", formatDateTime(row.endsAt));
    await ctx.emit(
      eventOf(notificationRequested, {
        kind: "REMINDER",
        recipients,
        title: (kind === "devolver" ? soonTitle : overdueTitle) ?? "",
        body,
        url: "/app/inventario",
        tag: `inventario-${row.id}`,
        dedupeKey: `inventario-${kind}:${row.id}`,
      }),
    );
  };
  for (const row of soon) await send(row, "devolver");
  for (const row of overdue) await send(row, "vencido");
  return { soon: soon.length, overdue: overdue.length };
}
