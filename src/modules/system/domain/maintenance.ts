import { and, eq, isNotNull, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { appConfig, outbox } from "../schema";
import { CONFIG, writeConfig } from "./config";

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

/** Lee la marca del servicio backup sin esperar la caché ni el control diario persistido. */
export async function getBackupStatus(now = new Date()): Promise<BackupStatus> {
  const [row] = await getDb()
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, "backup.lastRunAt"));
  const lastRunAt = CONFIG["backup.lastRunAt"].parse(row?.value ?? null);
  const age = lastRunAt ? now.getTime() - new Date(lastRunAt).getTime() : Number.POSITIVE_INFINITY;
  const ok = age <= BACKUP_MAX_AGE_MS;
  return {
    ok,
    checkedAt: now.toISOString(),
    lastRunAt: lastRunAt ?? null,
    message: lastRunAt
      ? ok
        ? "La última copia externa tiene menos de 35 días"
        : "La última copia externa tiene más de 35 días"
      : "Todavía no hay ninguna copia externa registrada",
  };
}

/** Control diario auditado: conserva su snapshot sin condicionar la lectura del tablero. */
export async function checkBackup(now = new Date()): Promise<BackupStatus> {
  const status = await getBackupStatus(now);
  await writeConfig(SYSTEM_ACTOR, "backup.status", status);
  return status;
}
