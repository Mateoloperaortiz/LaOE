"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorContext } from "@/app/_lib/actor";
import { formOptional, formText } from "@/app/_lib/form";
import {
  type AvailabilitySaveState,
  closeMeetingPollAs,
  createMeetingPollAs,
  type PollActionState,
  saveAvailabilityAs,
  saveMeetingAvailabilityAs,
  withdrawAvailabilityAs,
} from "@/modules/availability";
import { requireActor } from "@/modules/identity";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

/** Cada acción autentica: la sesión del layout nunca sustituye este guard. */
export async function saveAvailabilityAction(
  previous: AvailabilitySaveState,
  data: FormData,
): Promise<AvailabilitySaveState> {
  const actor = await requireActor("/app/disponibilidad");
  const context = await actorContext(actor);
  const termId = formText(data, "termId");
  const pollId = formOptional(data, "pollId");
  const rawRevision = formText(data, "revision");
  const revision = rawRevision === "0" ? 0 : rawRevision;
  try {
    if (formText(data, "intent") === "withdraw") {
      await withdrawAvailabilityAs(context, { termId, pollId, revision });
      revalidatePath("/app/disponibilidad", "layout");
      return { status: "done", revision: 0, slots: [], withdrawn: true, message: t("T-4643") };
    }
    const raw = formText(data, "slots");
    if (raw.length > 4000) throw new DomainError(t("T-4608"));
    let slots: unknown;
    try {
      slots = JSON.parse(raw);
    } catch {
      throw new DomainError(t("T-4608"));
    }
    const saved = pollId
      ? await saveMeetingAvailabilityAs(context, { pollId, slots, revision })
      : await saveAvailabilityAs(context, { termId, slots, revision });
    revalidatePath("/app/disponibilidad", "layout");
    return { status: "done", revision: saved.revision, slots: saved.slots, message: t("T-4607") };
  } catch (error) {
    if (error instanceof DomainError)
      return { ...previous, status: "error", message: error.message };
    throw error;
  }
}

export async function createMeetingPollAction(
  _previous: PollActionState,
  data: FormData,
): Promise<PollActionState> {
  const actor = await requireActor("/app/disponibilidad");
  let pollId: string;
  try {
    const poll = await createMeetingPollAs(await actorContext(actor), {
      termId: formText(data, "termId"),
      group: { type: formText(data, "groupType"), id: formText(data, "groupId") },
      title: formText(data, "title"),
      dates: data.getAll("dates"),
      startMinute: Number(formText(data, "startMinute")),
      endMinute: Number(formText(data, "endMinute")),
    });
    pollId = poll.id;
  } catch (error) {
    if (error instanceof DomainError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath("/app/disponibilidad", "layout");
  redirect(`/app/disponibilidad/reuniones/${pollId}`);
}

export async function closeMeetingPollAction(
  _previous: PollActionState,
  data: FormData,
): Promise<PollActionState> {
  const actor = await requireActor("/app/disponibilidad");
  const id = formText(data, "pollId");
  if (!id || id.length > 100) return { status: "error", message: t("T-4609") };
  try {
    await closeMeetingPollAs(await actorContext(actor), id);
  } catch (error) {
    if (error instanceof DomainError) return { status: "error", message: error.message };
    throw error;
  }
  revalidatePath("/app/disponibilidad", "layout");
  return { status: "done", message: t("T-4637") };
}
