"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { requireActor } from "@/modules/identity";
import { addSpaceAs, decideSpaceAs, requestSpaceAs, setSpaceActiveAs } from "@/modules/inventory";
import { reportConflictAs, resolveConflictAs } from "@/modules/participation";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { inventoryRange } from "../inventario/range";

const path = "/app/coordinacion";
async function submit(
  form: FormData,
  command: (actor: Awaited<ReturnType<typeof actorContext>>) => Promise<unknown>,
) {
  const actor = await actorContext(await requireActor(path));
  const query = new URLSearchParams();
  const week = z.iso.date().safeParse(formText(form, "fecha"));
  if (week.success) query.set("fecha", week.data);
  let anchor = "";
  try {
    const result = await command(actor);
    if (typeof result === "string") anchor = result;
    query.set("guardado", "1");
  } catch (error) {
    if (!(error instanceof DomainError || error instanceof ZodError)) throw error;
    query.set("error", error instanceof DomainError ? error.message : t("T-260"));
  }
  revalidatePath(path);
  revalidatePath("/admin/mesa");
  revalidatePath("/admin/calendario");
  redirect(path + "?" + query.toString() + (anchor ? "#" + encodeURIComponent(anchor) : ""));
}
export async function addSpaceAction(form: FormData) {
  return submit(form, (actor) => addSpaceAs(actor, formText(form, "name")));
}
export async function setSpaceAction(form: FormData) {
  return submit(form, (actor) =>
    setSpaceActiveAs(
      actor,
      formText(form, "id"),
      z.enum(["0", "1"]).parse(formText(form, "active")) === "1",
    ),
  );
}
export async function requestSpaceAction(form: FormData) {
  return submit(form, (actor) => {
    const [kind, id] = formText(form, "source").split(":");
    const range = inventoryRange(formText(form, "startsAt"), formText(form, "endsAt"));
    if (!range) throw new DomainError(t("T-4201"));
    return requestSpaceAs(actor, {
      id: formText(form, "id"),
      spaceId: formText(form, "space"),
      sourceKind: z.enum(["COMMITTEE_ASSIGNMENT", "MACROEVENT_APPOINTMENT"]).parse(kind),
      sourceId: id ?? "",
      startsAt: range.start,
      endsAt: range.end,
      purpose: formText(form, "purpose"),
    });
  });
}
export async function decideSpaceAction(form: FormData) {
  return submit(form, (actor) =>
    decideSpaceAs(actor, formText(form, "id"), {
      decision: z.enum(["APPROVED", "REJECTED"]).parse(formText(form, "decision")),
      note: formText(form, "note"),
    }),
  );
}
export async function reportConflictAction(form: FormData) {
  return submit(form, (actor) =>
    reportConflictAs(actor, {
      day: formText(form, "fecha"),
      pairKey: formText(form, "pairKey"),
      attempts: formText(form, "attempts"),
    }),
  );
}
export async function resolveConflictAction(form: FormData) {
  return submit(form, (actor) =>
    resolveConflictAs(actor, formText(form, "id"), formText(form, "resolution")),
  );
}
