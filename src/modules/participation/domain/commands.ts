import { type Actor, runCommand } from "@/db/tx";
import { requireConfig } from "@/modules/system";
import { findTermContaining, getTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import {
  cancelOccasion,
  closeOccasion,
  createOccasion,
  getOccasion,
  type OccasionContext,
  type OccasionInput,
  openOccasion,
  rotateSecret,
  setRotatingCode,
  updateOccasion,
} from "./occasions";

// Los comandos abren su transacción aquí (ADR-012). Las lecturas cruzadas (término, config) se
// resuelven ANTES de runCommand: dentro de la transacción no se lee con getDb() para no agotar el
// pool bajo cientos de check-ins simultáneos (ADR-035 regla 1).

/** El término que contiene la fecha de inicio (en Bogotá) y la ventana por defecto. */
export async function resolveOccasionContext(startsAt: Date): Promise<OccasionContext> {
  const term = await findTermContaining(todayKey(startsAt));
  if (!term) {
    throw new DomainError(t("T-675"), "startsAt");
  }
  const window = await requireConfig("checkin.defaultWindow");
  return { termId: term.id, window };
}

export async function createOccasionAs(
  actor: Actor,
  input: OccasionInput,
): Promise<{ id: string; publicId: string }> {
  const context = await resolveOccasionContext(input.startsAt);
  return runCommand(actor, (ctx) => createOccasion(ctx, input, context));
}

export async function updateOccasionAs(
  actor: Actor,
  id: string,
  input: OccasionInput,
): Promise<void> {
  const context = await resolveOccasionContext(input.startsAt);
  return runCommand(actor, (ctx) => updateOccasion(ctx, id, input, context));
}

export async function openOccasionAs(actor: Actor, id: string): Promise<void> {
  const current = await getOccasion(id);
  if (!current) {
    throw new DomainError(t("T-032"));
  }
  const term = await getTerm(current.termId);
  const termPointsClosed = term?.pointsClosedAt !== null && term?.pointsClosedAt !== undefined;
  return runCommand(actor, (ctx) => openOccasion(ctx, id, { termPointsClosed }));
}

export function closeOccasionAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => closeOccasion(ctx, id));
}

export async function cancelOccasionAs(actor: Actor, id: string, reason: string): Promise<void> {
  await runCommand(actor, (ctx) => cancelOccasion(ctx, id, reason));
}

export function setRotatingCodeAs(actor: Actor, id: string, enabled: boolean): Promise<void> {
  return runCommand(actor, (ctx) => setRotatingCode(ctx, id, enabled));
}

export function rotateSecretAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => rotateSecret(ctx, id));
}
