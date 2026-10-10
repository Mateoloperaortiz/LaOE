import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { recognitionGranted } from "@/domain-events/crm";
import { eventOf } from "@/domain-events/define";
import { createAnnouncement, publishAnnouncement } from "@/modules/content";
import {
  assertBenefitsAvailable,
  getPeopleByIds,
  hasLiveConsent,
  isInInternalRoster,
  listCommitteesByIds,
} from "@/modules/people";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { interaction, recognition } from "../schema";

// Reconocimientos (ADR-031, ADR-036 regla 7): el destacado del mes que nombra el líder desde su tabla.
// Con consentimiento de directorio se publica en la cartelera del comité en la misma transacción;
// sin consentimiento queda registrado sin publicarse. La interacción se escribe aquí mismo.

/** Categorías de Premios OE en el orden del Reglamento (art. 71; ADR-060 regla 13); etiquetas en T-2320. */
export const OE_AWARDS = [
  "BEST_GENERAL",
  "BEST_FINANCE",
  "BEST_GH",
  "BEST_LOGISTICS",
  "BEST_PUBLIC_RELATIONS",
  "BEST_MARKETING",
  "BEST_BOARD",
  "BEST_NEW_MEMBER",
  "BEST_ACADEMIC_EVENT",
  "BEST_CULTURAL_EVENT",
  "BEST_SOCIAL_EVENT",
  "BEST_SPORTS_EVENT",
  "BEST_RECREATIONAL_EVENT",
  "BEST_COMMITTEE",
  "BEST_CAREER_WEEK",
  "REVELATION_COMMITTEE",
] as const;

export function awardLabel(award: string | null): string {
  return award
    ? (tList("T-2320")[OE_AWARDS.indexOf(award as (typeof OE_AWARDS)[number])] ?? award)
    : "";
}

export const recognitionInputSchema = z
  .object({
    personId: z.string().min(1),
    kind: z.enum(["MEMBER_OF_MONTH", "OTHER", "OE_AWARD"]).default("MEMBER_OF_MONTH"),
    committeeId: z.string().min(1).optional(),
    termId: z.string().min(1),
    month: z.coerce.number().int().min(1).max(12).optional(),
    title: z.string().trim().max(140).default(""),
    award: z.enum(OE_AWARDS).optional(),
  })
  .refine((input) => (input.kind === "OE_AWARD") === (input.award !== undefined), {
    path: ["award"],
    message: t("T-260"),
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
  await assertBenefitsAvailable(ctx.tx, input.personId, input.termId);
  // ADR-122 regla 2: un reconocimiento que llega con comité es de alguien que está en el roster de
  // ese comité en ese término. Lo lee el comando; quien no está responde como uno que no existe.
  if (
    input.committeeId &&
    !(await isInInternalRoster(ctx.tx, input.personId, {
      committeeId: input.committeeId,
      termId: input.termId,
    }))
  ) {
    throw new DomainError(t("T-032"));
  }
  const mes = monthName(input.month ?? null);
  const title =
    input.title ||
    (input.kind === "MEMBER_OF_MONTH"
      ? t("T-783", { mes, nombre: context.personName })
      : input.kind === "OE_AWARD"
        ? awardLabel(input.award ?? null)
        : "");
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
        award: input.award ?? null,
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
    metadata: { event: recognitionGranted.type, recognitionId: row.id, announcementId },
  });
  // Publicado: comms manda T-192 a los miembros del comité (ADR-038 regla 7).
  if (announcementId && input.committeeId) {
    await ctx.emit(
      eventOf(
        recognitionGranted,
        {
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
        { dedupeKey: `recognition:${row.id}` },
      ),
    );
  }
  return { id: row.id, announcementId };
}

export async function grantRecognitionAs(
  actor: Actor,
  input: RecognitionInput,
): Promise<RecognitionResult & { published: boolean }> {
  const [people, committees, consent] = await Promise.all([
    getPeopleByIds([input.personId]),
    input.committeeId ? listCommitteesByIds([input.committeeId]) : Promise.resolve([]),
    hasLiveConsent(input.personId, "DIRECTORY_PHOTO"),
  ]);
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
  kind: "MEMBER_OF_MONTH" | "OTHER" | "OE_AWARD";
  committeeId: string | null;
  termId: string;
  month: number | null;
  title: string;
  award: string | null;
  announcementId: string | null;
  createdAt: Date;
}

/** Todos los reconocimientos de una persona, del más reciente al más viejo (Persona 360). */
export async function listRecognitionsFor(personId: string): Promise<RecognitionView[]> {
  return getDb()
    .select({
      id: recognition.id,
      personId: recognition.personId,
      kind: recognition.kind,
      committeeId: recognition.committeeId,
      termId: recognition.termId,
      month: recognition.month,
      title: recognition.title,
      award: recognition.award,
      announcementId: recognition.announcementId,
      createdAt: recognition.createdAt,
    })
    .from(recognition)
    .where(eq(recognition.personId, personId))
    .orderBy(desc(recognition.createdAt));
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
