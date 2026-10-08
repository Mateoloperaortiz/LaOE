import { getDb } from "@/db/client";
import type { announcementPushRequested } from "@/domain-events/content";
import type { callOpened, recognitionGranted, requestDecided } from "@/domain-events/crm";
import type { EventPayload } from "@/domain-events/define";
import type { accessGrantIssued } from "@/domain-events/identity";
import type {
  badgeUnlocked,
  challengeCompleted,
  challengePublished,
  challengeRejected,
  checkinApproved,
} from "@/domain-events/participation";
import type { permanenceDecided } from "@/domain-events/permanence";
import { getEnv } from "@/env";
import { markAnnouncementPushSent } from "@/modules/content";
import { balanceFor } from "@/modules/participation";
import {
  listActiveMemberRefs,
  listMailingRefs,
  listTermCommitteeMembers,
  lockPersonAnonymization,
} from "@/modules/people";
import { getTerm } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { renderHtml, renderPlain } from "@/shared/copy/render";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { committeeAudience, membersAudience } from "./audiences";
import { type DeliveryStats, deliverNotification } from "./notify";
import { type NotificationKind, splitPush } from "./pure";
import { type SendReceipt, sendTransactionalEmail } from "./send";

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

/** Anuncio con push (regla 6): a los miembros del comité si lo tiene, si no a activos y honorarios. */
export async function pushAnnouncement(
  payload: EventPayload<typeof announcementPushRequested>,
): Promise<DeliveryStats> {
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

/** Puntos acreditados (T-181), solo cuando la ocasión da puntos. */
export async function pushPointsCredited(
  payload: EventPayload<typeof checkinApproved>,
): Promise<DeliveryStats | null> {
  if (payload.points <= 0 || payload.source === "IMPORT") {
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

/** Solicitud respondida (T-189): además del correo T-205, siempre (transaccional). */
export async function pushRequestDecided(
  payload: EventPayload<typeof requestDecided>,
): Promise<DeliveryStats> {
  const [aprobada, rechazada] = tList("T-195");
  return notify(
    "TRANSACTIONAL",
    [payload.personId],
    t("T-189", {
      tipo: payload.kindLabel,
      decisión: payload.status === "APPROVED" ? aprobada : rechazada,
    }),
    "/app/solicitudes",
    `request:${payload.requestId}`,
  );
}

/**
 * Se emitió un enlace de acceso para esta persona (T-2132, ADR-051). Transaccional: llega aunque
 * la persona haya apagado las notificaciones, porque es la única forma de que se entere si el
 * enlace lo pidió alguien más. La clave incluye el instante: cada emisión avisa.
 */
export async function pushAccessGrantIssued(
  payload: EventPayload<typeof accessGrantIssued>,
): Promise<DeliveryStats> {
  return notify(
    "TRANSACTIONAL",
    [payload.personId],
    t("T-2132"),
    "/app/ajustes",
    `access-grant:${payload.personId}:${Date.now()}`,
  );
}

/** Convocatoria abierta (T-190, o T-194 sin cupo) a activos y honorarios. */
export async function pushCallOpened(
  payload: EventPayload<typeof callOpened>,
): Promise<DeliveryStats> {
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

/** Reconocimiento publicado (T-192) a los miembros del comité. */
export async function pushRecognition(
  payload: EventPayload<typeof recognitionGranted>,
): Promise<DeliveryStats> {
  return notify(
    "ANNOUNCEMENT",
    await committeeAudience(payload.committeeId),
    t("T-192", { nombre: payload.personName, comité: payload.committeeName }),
    payload.committeeSlug ? `/app/comites/${payload.committeeSlug}` : "/app/comites",
    `recognition:${payload.recognitionId}`,
  );
}

/**
 * Lo que un evento le avisa a una persona sale solo si todavía no fue anonimizada (ADR-116 regla 9). El
 * evento trae el correo que la persona tenía cuando ocurrió, y el poller lo puede procesar o reintentar
 * después de anonimizarla, cuando el registro que evitaba el reenvío ya se borró. Aquí se la vuelve a
 * leer y se la retiene con candado compartido mientras sale el aviso: una anonimización que llegue en
 * ese momento espera, y su limpieza encuentra el registro ya escrito y se lo lleva. Si la persona ya
 * fue anonimizada, o no existe, no corre `deliver` y responde `null`.
 */
export async function unlessAnonymized<Delivered>(
  personId: string,
  deliver: () => Promise<Delivered>,
): Promise<Delivered | null> {
  return getDb().transaction(async (tx) => {
    const who = await lockPersonAnonymization(tx, personId);
    if (!who || who.anonymized) {
      return null;
    }
    return deliver();
  });
}

/**
 * Resultado de permanencia por correo (ADR-038 regla 10): solo la fila por persona y solo cuando
 * cumple (T-202). Prueba (T-203) y salida (T-204) esperan el texto de GH. Idempotente por clave.
 */
export async function emailPermanenceOutcome(
  payload: EventPayload<typeof permanenceDecided>,
): Promise<SendReceipt | null> {
  if (payload.committeeId || payload.decision !== "CONTINUES") {
    return null;
  }
  const [ref, term] = await Promise.all([
    listMailingRefs([payload.personId]).then((refs) => refs.get(payload.personId)),
    getTerm(payload.termId),
  ]);
  if (!ref || !term || ref.anonymized) {
    return null;
  }
  const { title, body } = splitPush(t("T-202", { término: term.code }));
  const link = `${getEnv().APP_URL}/app/permanencia`;
  const pie = t("T-208").replace("{enlace de baja si aplica}", "").trim();
  return sendTransactionalEmail(
    {
      personId: payload.personId,
      to: ref.email,
      subject: title,
      text: `${renderPlain(body)}\n\n${t("T-699")}: ${link}\n\n${pie}`,
      html: `<p>${renderHtml(body)}</p><p><a href="${link}">${t("T-699")}</a></p><p style="color:#666;font-size:12px">${renderHtml(pie)}</p>`,
    },
    new Date(),
    { dedupeKey: `permanence-outcome:${payload.termId}` },
  );
}

/** Recorta un valor interpolado para que el push quepa en sus límites (título 40, cuerpo 120). */
function clip(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Reto publicado (T-2566): a la audiencia del reto — todos, nuevos, veteranos o sus comités. Una
 * audiencia que este código no conozca no le llega a nadie: es preferible a avisarle a toda la OE.
 */
export async function pushChallengePublished(
  payload: EventPayload<typeof challengePublished>,
): Promise<DeliveryStats> {
  const members = (await listActiveMemberRefs(true)).filter((ref) => !ref.anonymized);
  let ids: string[];
  if (payload.audience === "COMMITTEES") {
    const wanted = new Set(payload.audienceCommitteeIds);
    const roster = await listTermCommitteeMembers(payload.termId);
    const inCommittee = new Set(
      roster.filter((row) => wanted.has(row.committeeId)).map((row) => row.personId),
    );
    ids = members.filter((ref) => inCommittee.has(ref.personId)).map((ref) => ref.personId);
  } else if (payload.audience === "NEW") {
    ids = members.filter((ref) => ref.firstTermId === payload.termId).map((ref) => ref.personId);
  } else if (payload.audience === "VETERAN") {
    ids = members.filter((ref) => ref.firstTermId !== payload.termId).map((ref) => ref.personId);
  } else if (payload.audience === "ALL") {
    ids = members.map((ref) => ref.personId);
  } else {
    ids = [];
  }
  return notify(
    "POINTS",
    ids,
    t("T-2566", {
      reto: clip(payload.title),
      fecha: formatDateTime(new Date(payload.closesAt)),
    }),
    `/app/gh-points/retos/${payload.challengeId}`,
    `challenge:${payload.challengeId}`,
  );
}

/** Entrega aprobada (T-2567): puntos del premio y saldo actualizado. */
export async function pushChallengeCompleted(
  payload: EventPayload<typeof challengeCompleted>,
): Promise<DeliveryStats> {
  const total = await balanceFor(payload.personId, payload.termId);
  return notify(
    "POINTS",
    [payload.personId],
    t("T-2567", {
      n: payload.points,
      reto: clip(payload.challengeTitle),
      total,
    }),
    `/app/gh-points/retos/${payload.challengeId}`,
    `challenge:${payload.participationId}`,
  );
}

/** Entrega rechazada (T-2568): la misma clave del reto con sufijo para no tapar una aprobación. */
export async function pushChallengeRejected(
  payload: EventPayload<typeof challengeRejected>,
): Promise<DeliveryStats> {
  return notify(
    "POINTS",
    [payload.personId],
    t("T-2568", {
      reto: clip(payload.challengeTitle),
      motivo: clip(payload.reason, 80),
    }),
    `/app/gh-points/retos/${payload.challengeId}`,
    `challenge:${payload.participationId}:rejected`,
  );
}

/** Insignia desbloqueada (T-2569); los logros históricos de la conciliación no notifican. */
export async function pushBadgeUnlocked(
  payload: EventPayload<typeof badgeUnlocked>,
): Promise<DeliveryStats | null> {
  if (payload.historical) {
    return null;
  }
  return notify(
    "POINTS",
    [payload.personId],
    t("T-2569", { insignia: clip(payload.name), nivel: payload.level }),
    "/app/gh-points/coleccion",
    `badge:${payload.achievementId}`,
  );
}
