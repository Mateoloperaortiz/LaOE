import { and, isNotNull, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { outbox } from "../schema";
import { getConfig, setConfig } from "./config";

// Depuración del outbox procesado y verificación de la copia externa (ADR-023).

const OUTBOX_RETENTION_MS = 30 * 24 * 60 * 60_000;
const BACKUP_MAX_AGE_MS = 35 * 24 * 60 * 60_000;

export async function pruneOutbox(now = new Date()): Promise<number> {
  const deleted = await getDb()
    .delete(outbox)
    .where(
      and(
        isNotNull(outbox.processedAt),
        lt(outbox.processedAt, new Date(now.getTime() - OUTBOX_RETENTION_MS)),
      ),
    )
    .returning({ id: outbox.id });
  return deleted.length;
}

export interface BackupStatus {
  ok: boolean;
  checkedAt: string;
  lastRunAt: string | null;
  message: string;
}

/** El servicio backup escribe backup.lastRunAt al terminar; aquí se avisa si la última copia es vieja. */
export async function checkBackup(now = new Date()): Promise<BackupStatus> {
  const lastRunAt = await getConfig("backup.lastRunAt");
  const age = lastRunAt ? now.getTime() - new Date(lastRunAt).getTime() : Number.POSITIVE_INFINITY;
  const ok = age <= BACKUP_MAX_AGE_MS;
  const status: BackupStatus = {
    ok,
    checkedAt: now.toISOString(),
    lastRunAt: lastRunAt ?? null,
    message: lastRunAt
      ? ok
        ? "La última copia externa tiene menos de 35 días"
        : "La última copia externa tiene más de 35 días"
      : "Todavía no hay ninguna copia externa registrada",
  };
  await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "backup.status", status));
  return status;
}
