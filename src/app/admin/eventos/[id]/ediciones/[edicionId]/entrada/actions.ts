"use server";

import "server-only";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { checkInTicketAs } from "@/modules/forms";
import { requireAdminActor } from "@/modules/identity";

// La puerta de una edición (ADR-187): quien opera lee la entrada propia de un inscrito con su sesión.

const idSchema = z.string().regex(/^[a-z0-9-]{10,40}$/);

export async function scanTicketAction(
  eventId: string,
  editionId: string,
  scanned: string,
): Promise<{ ok: boolean; message: string }> {
  const event = idSchema.parse(eventId);
  const edition = idSchema.parse(editionId);
  const actor = await requireAdminActor(`/admin/eventos/${event}/ediciones/${edition}/entrada`);
  return checkInTicketAs(await actorContext(actor), edition, scanned);
}
