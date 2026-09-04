import { listMessagesFor } from "@/modules/comms";
import { listInteractions, listTasks } from "@/modules/crm";
import { getActor, listPermissionsFor, listSessionsFor } from "@/modules/identity";
import { collectPersonalData } from "@/modules/people";
import { recordSelfExport } from "@/modules/system";

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
  const [timeline, tasks, messages, sessions, permissions] = await Promise.all([
    listInteractions(actor.personId, "ALL", 1000),
    listTasks({ q: "", personId: actor.personId, page: 1, pageSize: 500 }),
    listMessagesFor(actor.personId),
    listSessionsFor(actor.personId),
    listPermissionsFor(actor.personId),
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
