"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getMacroeventEdition, listMacroevents } from "@/modules/events";
import { assertAdmin, requireAdminActor } from "@/modules/identity";
import {
  addMacroeventDirectorAs,
  listActiveMemberRefs,
  listMacroeventBoard,
  MACROEVENT_ROLE_CODES,
  removeAppointmentAs,
} from "@/modules/people";
import {
  configureMacroeventGroupAs,
  evaluateAs,
  evaluationInputSchema,
  findMacroeventGroup,
  prepareMacroeventGroupAs,
  removeMemberAs,
  saveMacroeventMemberAs,
  teamMemberInputSchema,
} from "@/modules/permanence";
import { findTermContaining, getTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { dateKeyIn } from "@/shared/lib/dates";
import { clientIp } from "@/shared/lib/request";

const id = z.string().regex(/^[a-z0-9-]{10,40}$/);
const inputSchema = z.object({
  slug: z.enum(["inventiva", "enfemenino", "dias-eafit"]),
  termId: id,
  area: z.enum(["mesa", "equipo", "gap", "ediciones"]),
  operation: z.enum([
    "prepare",
    "add-member",
    "set-areas",
    "remove-member",
    "configure",
    "evaluate",
    "add-director",
    "remove-director",
  ]),
});
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Cada POST vuelve a comprobar ADMIN y deriva el grupo desde evento y término, nunca desde un id ajeno. */
export async function macroeventAction(form: FormData): Promise<void> {
  const identity = await requireAdminActor("/admin/macroeventos");
  assertAdmin(identity);
  const parsed = inputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/admin/macroeventos");
  const input = parsed.data;
  const event = (await listMacroevents()).find((item) => item.slug === input.slug);
  const term = await getTerm(input.termId);
  if (!event || !term) redirect("/admin/macroeventos");
  const editionId = text(form, "editionId");
  const query = new URLSearchParams({ termId: term.id, area: input.area });
  if (id.safeParse(editionId).success) query.set("editionId", editionId);
  const base = `/admin/macroeventos/${event.slug}`;
  const back = `${base}?${query}`;
  const actor = { personId: identity.personId, ip: await clientIp() };
  try {
    if (input.operation === "add-director" || input.operation === "remove-director") {
      const edition = await getMacroeventEdition(id.parse(editionId));
      if (!edition || edition.eventId !== event.id) throw new DomainError(t("T-2353"));
      if (input.operation === "add-director") {
        const roleCode = z.enum(MACROEVENT_ROLE_CODES).parse(text(form, "roleCode"));
        const editionTerm = await findTermContaining(dateKeyIn("America/Bogota", edition.startsAt));
        if (!editionTerm) throw new DomainError(t("T-650"));
        const reason = text(form, "overrideReason");
        await addMacroeventDirectorAs(
          actor,
          {
            editionId: edition.id,
            termId: editionTerm.id,
            personId: id.parse(text(form, "personId")),
            roleCode,
            coDirector: form.get("coDirector") === "on",
          },
          reason ? { reason } : undefined,
        );
      } else {
        const appointmentId = id.parse(text(form, "appointmentId"));
        const board = await listMacroeventBoard(edition.id);
        if (!board.some((row) => row.id === appointmentId)) throw new DomainError(t("T-2353"));
        await removeAppointmentAs(actor, appointmentId);
      }
      revalidatePath(`/admin/eventos/${event.id}/ediciones/${edition.id}/mesa`);
    } else {
      if (term.permanenceClosedAt) throw new DomainError(t("T-834"));
      if (input.operation === "prepare") {
        await prepareMacroeventGroupAs(
          actor,
          event.id,
          term.id,
          input.area === "gap" ? "GAP" : "GT_MACROEVENT",
        );
      } else {
        const group = await findMacroeventGroup(
          event.id,
          term.id,
          input.area === "gap" ? "GAP" : "GT_MACROEVENT",
        );
        if (!group) throw new DomainError(t("T-2353"));
        if (input.operation === "add-member" || input.operation === "set-areas") {
          if (!form.getAll("areas").length) throw new DomainError(t("T-2384"));
          await saveMacroeventMemberAs(
            actor,
            group.id,
            teamMemberInputSchema.parse({
              personId: id.parse(text(form, "personId")),
              areas: form.getAll("areas"),
              credit: input.operation === "add-member" && form.get("credit") === "on",
            }),
            { isAdmin: identity.isAdmin },
          );
        }
        if (input.operation === "remove-member")
          await removeMemberAs(actor, group.id, id.parse(text(form, "personId")));
        if (input.operation === "evaluate")
          await evaluateAs(
            actor,
            evaluationInputSchema.parse({
              groupId: group.id,
              personId: id.parse(text(form, "personId")),
              evaluation: text(form, "evaluation"),
              note: text(form, "note"),
            }),
            { isAdmin: identity.isAdmin },
          );
        if (input.operation === "configure") {
          const leaderPersonId = text(form, "leaderPersonId") || undefined;
          const evaluatorIds = z.array(id).parse(form.getAll("evaluatorIds"));
          const members = await listActiveMemberRefs();
          const selected = [...evaluatorIds, ...(leaderPersonId ? [leaderPersonId] : [])];
          if (
            selected.some(
              (personId) =>
                !members.some((member) => member.personId === personId && !member.anonymized),
            )
          ) {
            throw new DomainError(t("T-032"));
          }
          await configureMacroeventGroupAs(actor, group.id, {
            leaderPersonId,
            evaluatorIds,
            editionId: text(form, "groupEditionId") || undefined,
          });
        }
        revalidatePath(`/admin/permanencia/grupos/${group.id}`);
      }
      revalidatePath("/admin/permanencia/evaluaciones");
    }
  } catch (error) {
    if (error instanceof DomainError || error instanceof z.ZodError) {
      redirect(
        `${back}&error=${encodeURIComponent(error instanceof DomainError ? error.message : t("T-260"))}`,
      );
    }
    throw error;
  }
  revalidatePath("/admin/personas", "layout");
  revalidatePath("/app", "layout");
  revalidatePath(base);
  revalidatePath("/admin/macroeventos");
  redirect(`${back}&guardado=1`);
}
