"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminContext } from "@/app/_lib/actor";
import { formText } from "@/app/_lib/form";
import { listMacroevents } from "@/modules/events";
import {
  decideMacroeventReactivationAs,
  electionRecordSchema,
  proposeMacroeventReactivationAs,
  recordMacroeventElectionAs,
  reviewMacroeventAs,
} from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

export async function governanceAction(form: FormData) {
  const actor = await requireAdminContext("/admin/macroeventos");
  const slug = formText(form, "slug");
  const event = (await listMacroevents()).find((row) => row.slug === slug);
  if (!event) redirect("/admin/macroeventos");
  const base = `/admin/macroeventos/${event.slug}/normativa`;
  const year = Number(formText(form, "year"));
  const back = `${base}?year=${Number.isInteger(year) ? year : 2026}`;
  const checked = (name: string) => form.get(name) === "on";
  try {
    switch (formText(form, "operation")) {
      case "election":
        await recordMacroeventElectionAs(
          actor,
          event.id,
          formText(form, "appointmentId"),
          electionRecordSchema.parse({
            origin: formText(form, "origin"),
            minutes: formText(form, "minutes"),
            requirementsChecked: checked("requirementsChecked"),
            lateCandidacy: checked("lateCandidacy"),
            qualifiedPermission: formText(form, "qualifiedPermission"),
            experience: formText(form, "experience"),
            generalFacultyChecked: checked("generalFacultyChecked"),
            compositionChecked: checked("compositionChecked"),
            extraordinary: checked("extraordinary"),
            workPlan: formText(form, "workPlan"),
          }),
        );
        break;
      case "review":
        await reviewMacroeventAs(actor, {
          eventId: event.id,
          year,
          assemblyOn: formText(form, "assemblyOn"),
          minutes: formText(form, "minutes"),
          afterElections: checked("afterElections"),
        });
        break;
      case "proposal":
        await proposeMacroeventReactivationAs(actor, {
          eventId: event.id,
          year: Number(formText(form, "targetYear")),
          submittedOn: formText(form, "submittedOn"),
          electionSession: formText(form, "electionSession"),
          mission: formText(form, "mission"),
          workPlan: formText(form, "workPlan"),
          roster: [...form.keys()]
            .filter((key) => key.startsWith("role:"))
            .map((key) => ({ roleCode: key.slice(5), personId: formText(form, key) })),
        });
        break;
      case "decision":
        await decideMacroeventReactivationAs(actor, {
          eventId: event.id,
          proposalId: formText(form, "proposalId"),
          approved:
            z.enum(["APPROVED", "REJECTED"]).parse(formText(form, "decision")) === "APPROVED",
          decisionMinutes: formText(form, "decisionMinutes"),
          assemblyNotice: formText(form, "assemblyNotice"),
        });
        break;
      default:
        throw new DomainError(t("T-260"));
    }
  } catch (error) {
    if (error instanceof DomainError || error instanceof z.ZodError)
      redirect(
        `${back}&error=${encodeURIComponent(error instanceof DomainError ? error.message : t("T-260"))}`,
      );
    throw error;
  }
  revalidatePath(base);
  revalidatePath(`/admin/macroeventos/${event.slug}`);
  redirect(`${back}&guardado=1`);
}
