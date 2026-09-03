import { getEnv } from "@/env";
import { excerpt } from "@/modules/content";
import { buildIcs, listPublicEditionsForIcs } from "@/modules/events";
import { t } from "@/shared/copy";

// Calendario público (06-mapa-del-sitio.md): las ediciones publicadas de los eventos públicos.

export const dynamic = "force-dynamic";

export async function GET() {
  const base = getEnv().APP_URL.replace(/\/$/, "");
  const host = new URL(base).host;
  const ediciones = await listPublicEditionsForIcs();
  const body = buildIcs({
    name: t("T-322"),
    prodId: "-//Organizacion Estudiantil EAFIT//Casa digital//ES",
    events: ediciones.map((edicion) => {
      const description = excerpt(edicion.description, 500);
      return {
        uid: `${edicion.id}@${host}`,
        summary: `${edicion.event.name} · ${edicion.name}`,
        ...(description ? { description } : {}),
        ...(edicion.location ? { location: edicion.location } : {}),
        url: `${base}/eventos/${edicion.event.slug}/${edicion.slug}`,
        start: edicion.startsAt,
        end: edicion.endsAt,
        stamp: edicion.updatedAt,
      };
    }),
  });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="oe.ics"',
      "cache-control": "public, max-age=3600",
    },
  });
}
