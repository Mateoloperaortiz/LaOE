import type { CommandContext } from "@/db/tx";
import { getEventRef, getMacroeventEdition } from "@/modules/events";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";

/** Resuelve la identidad del macroevento incluso si el formulario solo recibió su edición. */
export async function resolveGroupEvent(
  ctx: CommandContext,
  input: { kind: string; eventId?: string | undefined; editionId?: string | undefined },
): Promise<string | undefined> {
  if (input.kind !== "GT_MACROEVENT") return input.eventId;
  const edition = input.editionId ? await getMacroeventEdition(input.editionId, ctx.tx) : null;
  if (input.editionId && !edition) throw new DomainError(t("T-2353"));
  if (edition && input.eventId && input.eventId !== edition.eventId)
    throw new DomainError(t("T-2353"));
  const eventId = edition?.eventId ?? input.eventId;
  if (eventId && !(await getEventRef(eventId, ctx.tx))) throw new DomainError(t("T-2353"));
  return eventId;
}
