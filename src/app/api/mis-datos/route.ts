import { getPreferences, listMessagesFor, listSubscriptionsFor } from "@/modules/comms";
import { listInteractions, listTasks } from "@/modules/crm";
import {
  getActor,
  getCarnetMetadata,
  listPermissionsFor,
  listSessionsFor,
} from "@/modules/identity";
import { listWordleGamesFor } from "@/modules/participation";
import { collectPersonalData } from "@/modules/people";
import { recordSelfExport } from "@/modules/system";
import { listPassesFor } from "@/modules/wallet";

// "Mis datos" (ADR-034 regla 12): todo lo que la OE guarda sobre la persona con sesión, en JSON,
// con las notas incluidas (ADR-014). Auditado y en la línea de tiempo; nunca con datos de terceros.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const actor = await getActor();
  if (!actor) {
    return Response.redirect(
      new URL(`/ingresar?next=${encodeURIComponent(url.pathname)}`, url),
      302,
    );
  }
  const data = await collectPersonalData(actor.personId);
  if (!data) {
    return new Response("No existe", { status: 404 });
  }
  const [
    timeline,
    tasks,
    messages,
    sessions,
    permissions,
    preferences,
    subscriptions,
    carnet,
    passes,
    wordleGames,
  ] = await Promise.all([
    listInteractions(actor.personId, "ALL", 1000),
    listTasks({ q: "", personId: actor.personId, page: 1, pageSize: 500 }),
    listMessagesFor(actor.personId),
    listSessionsFor(actor.personId),
    listPermissionsFor(actor.personId),
    getPreferences(actor.personId),
    listSubscriptionsFor(actor.personId),
    getCarnetMetadata(actor.personId),
    listPassesFor(actor.personId),
    listWordleGamesFor(actor.personId),
  ]);
  await recordSelfExport(actor.personId);
  const body = {
    exportedAt: new Date().toISOString(),
    ...data,
    timeline,
    tasks: tasks.rows,
    messages,
    sessions: sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      remembered: session.remembered,
      userAgent: session.userAgent,
      ip: session.ip,
    })),
    permissions,
    wordleGames,
    carnet: carnet
      ? {
          walletEpoch: carnet.walletEpoch,
          revision: carnet.revision,
          createdAt: carnet.createdAt,
          lastUsedAt: carnet.lastUsedAt,
        }
      : null,
    walletPasses: passes.map((pass) => ({
      id: pass.id,
      platform: pass.platform,
      externalId: pass.externalId,
      walletEpoch: pass.walletEpoch,
      tokenRevision: pass.tokenRevision,
      renderedTermId: pass.renderedTermId,
      issuedAt: pass.issuedAt,
      lastIssuedAt: pass.lastIssuedAt,
      lastRefreshedAt: pass.lastRefreshedAt,
      revokedAt: pass.revokedAt,
    })),
    // Comunicaciones (ADR-038 regla 11): preferencias y dispositivos, sin las claves del navegador.
    notificationPreferences: {
      emailCampaigns: preferences.emailCampaigns,
      pushAnnouncements: preferences.pushAnnouncements,
      pushPoints: preferences.pushPoints,
      pushReminders: preferences.pushReminders,
    },
    pushSubscriptions: subscriptions.map((item) => ({
      id: item.id,
      service: new URL(item.endpoint).host,
      userAgent: item.userAgent,
      createdAt: item.createdAt,
      lastSeenAt: item.lastSeenAt,
    })),
  };
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="mis-datos-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
