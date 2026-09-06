import { z } from "zod";
import { markAnnouncementPushSent } from "@/modules/content";
import { balanceFor } from "@/modules/participation";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { committeeAudience, membersAudience } from "./audiences";
import { type DeliveryStats, deliverNotification } from "./notify";
import { type NotificationKind, splitPush } from "./pure";

// Push por evento (ADR-038 reglas 6 y 7): cada evento de dominio se traduce a una notificación del bus
// con su texto del inventario (14-copy §6), su URL, su tipo y su clave de deduplicación.

async function notify(
  kind: NotificationKind,
  personIds: string[],
  text: string,
  url: string,
  dedupeKey: string,
  tag?: string,
): Promise<DeliveryStats> {
  if (personIds.length === 0) {
    return {
      sent: 0,
      failed: 0,
      alreadySent: 0,
      skippedByPreference: 0,
      withoutDevice: 0,
      removedDevices: 0,
    };
  }
  const { title, body } = splitPush(text);
  return deliverNotification({
    kind,
    recipients: personIds.map((personId) => ({ personId })),
    title,
    body,
    url,
    dedupeKey,
    ...(tag ? { tag } : {}),
  });
}

export const announcementPushSchema = z.object({
  announcementId: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().default(""),
  audience: z.enum(["PUBLIC", "MEMBERS"]),
  committeeId: z.string().nullable().optional(),
  url: z.string().min(1),
});

/** Anuncio con push (regla 6): a los miembros del comité si lo tiene, si no a activos y honorarios. */
export async function pushAnnouncement(raw: unknown): Promise<DeliveryStats> {
  const payload = announcementPushSchema.parse(raw);
  const audience = payload.committeeId
    ? await committeeAudience(payload.committeeId)
    : await membersAudience();
  const stats = await notify(
    "ANNOUNCEMENT",
    audience,
    t("T-180", { "título del anuncio": payload.title, "primera línea": payload.excerpt }),
    payload.url,
    `announcement:${payload.announcementId}`,
    `announcement-${payload.announcementId}`,
  );
  await markAnnouncementPushSent(payload.announcementId, stats.sent);
  return stats;
}

export const checkInApprovedSchema = z.object({
  occasionId: z.string().min(1),
  occasionTitle: z.string().default(""),
  personId: z.string().min(1),
  termId: z.string().min(1),
  points: z.number().int().default(0),
});

/** Puntos acreditados (T-181), solo cuando la ocasión da puntos. */
export async function pushPointsCredited(raw: unknown): Promise<DeliveryStats | null> {
  const payload = checkInApprovedSchema.parse(raw);
  if (payload.points <= 0) {
    return null;
  }
  const total = await balanceFor(payload.personId, payload.termId);
  return notify(
    "POINTS",
    [payload.personId],
    t("T-181", { n: payload.points, actividad: payload.occasionTitle, total }),
    "/app/gh-points",
    `points:${payload.occasionId}:${payload.personId}`,
  );
}

export const requestDecidedPushSchema = z.object({
  personId: z.string().min(1),
  requestId: z.string().min(1),
  kindLabel: z.string(),
  status: z.enum(["APPROVED", "REJECTED"]),
});

/** Solicitud respondida (T-189): además del correo T-205, siempre (transaccional). */
export async function pushRequestDecided(raw: unknown): Promise<DeliveryStats> {
  const payload = requestDecidedPushSchema.parse(raw);
  const [aprobada, rechazada] = tList("T-195") as [string, string];
  return notify(
    "TRANSACTIONAL",
    [payload.personId],
    t("T-189", {
      tipo: payload.kindLabel,
      "aprobada/rechazada": payload.status === "APPROVED" ? aprobada : rechazada,
    }),
    "/app/solicitudes",
    `request:${payload.requestId}`,
  );
}

export const callOpenedSchema = z.object({
  callId: z.string().min(1),
  title: z.string().min(1),
  closesAt: z.string().min(1),
  capacity: z.number().int().nullable().optional(),
});

/** Convocatoria abierta (T-190, o T-194 sin cupo) a activos y honorarios. */
export async function pushCallOpened(raw: unknown): Promise<DeliveryStats> {
  const payload = callOpenedSchema.parse(raw);
  const fecha = formatDate(new Date(payload.closesAt));
  const text =
    payload.capacity && payload.capacity > 0
      ? t("T-190", { convocatoria: payload.title, cupo: payload.capacity, fecha })
      : t("T-194", { convocatoria: payload.title, fecha });
  return notify(
    "ANNOUNCEMENT",
    await membersAudience(),
    text,
    `/app/convocatorias/${payload.callId}`,
    `call:${payload.callId}`,
  );
}

export const recognitionGrantedSchema = z.object({
  recognitionId: z.string().min(1),
  personName: z.string().default(""),
  committeeId: z.string().min(1),
  committeeName: z.string().default(""),
  committeeSlug: z.string().default(""),
});

/** Reconocimiento publicado (T-192) a los miembros del comité. */
export async function pushRecognition(raw: unknown): Promise<DeliveryStats> {
  const payload = recognitionGrantedSchema.parse(raw);
  return notify(
    "ANNOUNCEMENT",
    await committeeAudience(payload.committeeId),
    t("T-192", { nombre: payload.personName, comité: payload.committeeName }),
    payload.committeeSlug ? `/app/comites/${payload.committeeSlug}` : "/app/comites",
    `recognition:${payload.recognitionId}`,
  );
}
