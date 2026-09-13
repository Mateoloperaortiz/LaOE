import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { createAnnouncement, publishAnnouncement } from "@/modules/content";
import {
  getPeopleByIds,
  hasLiveConsent,
  listCommitteesByIds,
  sanctionStateFor,
} from "@/modules/people";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { interaction, recognition } from "../schema";

// Reconocimientos (ADR-031, ADR-036 regla 7): el destacado del mes que nombra el líder desde su tabla.
// Con consentimiento de directorio se publica en la cartelera del comité en la misma transacción;
// sin consentimiento queda registrado sin publicarse. La interacción se escribe aquí mismo.

export const recognitionInputSchema = z.object({
  personId: z.string().min(1),
  kind: z.enum(["MEMBER_OF_MONTH", "OTHER"]).default("MEMBER_OF_MONTH"),
  committeeId: z.string().min(1).optional(),
  termId: z.string().min(1),
  month: z.coerce.number().int().min(1).max(12).optional(),
  title: z.string().trim().max(140).default(""),
});
export type RecognitionInput = z.infer<typeof recognitionInputSchema>;

export const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function monthName(month: number | null): string {
  return month ? (MONTHS[month - 1] ?? String(month)) : "";
}

export interface RecognitionContext {
  personName: string;
  committeeName: string;
  committeeSlug: string;
  /** Consentimiento de directorio vivo: sin él no se publica (T-782). */
  publish: boolean;
}

export interface RecognitionResult {
  id: string;
  announcementId: string | null;
}

export async function grantRecognition(
  ctx: CommandContext,
  input: RecognitionInput,
  context: RecognitionContext,
): Promise<RecognitionResult> {
  const mes = monthName(input.month ?? null);
  const title =
    input.title ||
    (input.kind === "MEMBER_OF_MONTH" ? t("T-783", { mes, nombre: context.personName }) : "");
  if (!title) {
    throw new DomainError(t("T-260"), "title");
  }
  let announcementId: string | null = null;
  if (context.publish && input.committeeId) {
    const created = await createAnnouncement(ctx, {
      title,
      body:
        input.kind === "MEMBER_OF_MONTH"
          ? t("T-784", { comité: context.committeeName, nombre: context.personName, mes })
          : title,
      audience: "MEMBERS",
      pinned: false,
      committeeId: input.committeeId,
    });
    await publishAnnouncement(ctx, created.id);
    announcementId = created.id;
  }
  let row: { id: string } | undefined;
  try {
    [row] = await ctx.tx
      .insert(recognition)
      .values({
        personId: input.personId,
        kind: input.kind,
        committeeId: input.committeeId ?? null,
        termId: input.termId,
        month: input.month ?? null,
        title,
        announcementId,
        grantedById: ctx.actor.personId,
      })
      .returning({ id: recognition.id });
  } catch (error) {
    if (isUniqueViolation(error, "recognition_month_unique")) {
      throw new DomainError(t("T-780", { comité: context.committeeName, mes }), "month");
    }
    throw error;
  }
  if (!row) {
    throw new Error("sin reconocimiento");
  }
  await ctx.audit({
    action: "recognition.granted",
    entityType: "recognition",
    entityId: row.id,
    after: {
      personId: input.personId,
      kind: input.kind,
      month: input.month ?? null,
      announcementId,
    },
  });
  await ctx.tx.insert(interaction).values({
    personId: input.personId,
    kind: "PERMANENCE",
    actorId: ctx.actor.personId,
    refType: "recognition",
    refId: row.id,
    summary:
      input.kind === "MEMBER_OF_MONTH" ? t("T-833", { mes, comité: context.committeeName }) : title,
    metadata: { event: "recognition.granted", recognitionId: row.id, announcementId },
  });
  // Publicado: comms manda T-192 a los miembros del comité (ADR-038 regla 7).
  if (announcementId && input.committeeId) {
    await ctx.emit({
      type: "recognition.granted",
      payload: {
        recognitionId: row.id,
        personId: input.personId,
        personName: context.personName,
        committeeId: input.committeeId,
        committeeName: context.committeeName,
        committeeSlug: context.committeeSlug,
        termId: input.termId,
        announcementId,
        actorId: ctx.actor.personId,
      },
      dedupeKey: `recognition:${row.id}`,
    });
  }
  return { id: row.id, announcementId };
}

export async function grantRecognitionAs(
  actor: Actor,
  input: RecognitionInput,
): Promise<RecognitionResult & { published: boolean }> {
  const [people, committees, consent, sanctions] = await Promise.all([
    getPeopleByIds([input.personId]),
    input.committeeId ? listCommitteesByIds([input.committeeId]) : Promise.resolve([]),
    hasLiveConsent(input.personId, "DIRECTORY_PHOTO"),
    sanctionStateFor(input.personId),
  ]);
  // Con derechos y beneficios suspendidos no hay reconocimientos (Regl. art. 69 y 73; ADR-060 regla 6).
  if (sanctions.suspendedUntil) {
    throw new DomainError(
      t("T-2233", {
        nombre: people.get(input.personId)?.fullName ?? "",
        fecha: formatDate(new Date(`${sanctions.suspendedUntil}T12:00:00Z`)),
      }),
      "personId",
    );
  }
  const context: RecognitionContext = {
    personName: people.get(input.personId)?.fullName ?? "",
    committeeName: committees[0]?.name ?? "",
    committeeSlug: committees[0]?.slug ?? "",
    publish: consent,
  };
  const result = await runCommand(actor, (ctx) => grantRecognition(ctx, input, context));
  return { ...result, published: result.announcementId !== null };
}

export interface RecognitionView {
  id: string;
  personId: string;
  kind: "MEMBER_OF_MONTH" | "OTHER";
  committeeId: string | null;
  termId: string;
  month: number | null;
  title: string;
  announcementId: string | null;
  createdAt: Date;
}

/** Reconocimientos de varias personas en un término (insignias del directorio y del comité). */
export async function listRecognitionsByPeople(
  personIds: string[],
  termId: string,
): Promise<Map<string, RecognitionView[]>> {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await getDb()
    .select()
    .from(recognition)
    .where(and(eq(recognition.termId, termId), inArray(recognition.personId, ids)))
    .orderBy(desc(recognition.createdAt));
  const map = new Map<string, RecognitionView[]>();
  for (const row of rows) {
    map.set(row.personId, [...(map.get(row.personId) ?? []), row]);
  }
  return map;
}

export async function listCommitteeRecognitions(
  committeeId: string,
  termId: string,
): Promise<RecognitionView[]> {
  return getDb()
    .select()
    .from(recognition)
    .where(and(eq(recognition.committeeId, committeeId), eq(recognition.termId, termId)))
    .orderBy(desc(recognition.month), desc(recognition.createdAt));
}
