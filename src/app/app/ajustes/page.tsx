import type { Metadata } from "next";
import { describeUserAgent, listSessionsFor, requireActor } from "@/modules/identity";
import { SessionsPanel } from "@/modules/identity/components/SessionsPanel";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

const secciones = tList("T-133");

export const metadata: Metadata = { title: secciones[2] ?? "Sesiones" };

export default async function AjustesPage() {
  const actor = await requireActor("/app/ajustes");
  const sessions = await listSessionsFor(actor.personId);
  const titulo = secciones[2] ?? "Sesiones";
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-display-lg">{titulo}</h1>
      <div className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde">
        <table className="w-full text-left text-sm">
          <thead className="eyebrow bg-fondo-suave text-xs">
            <tr>
              <th scope="col" className="px-4 py-3">
                {t("T-234")}
              </th>
              <th scope="col" className="px-4 py-3">
                {t("T-233")}
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">{t("T-232")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((item) => {
              const device = describeUserAgent(item.userAgent);
              const nombre = [device.browser, device.os].filter(Boolean).join(" en ") || t("T-234");
              return (
                <tr key={item.id} className="border-t border-borde">
                  <td className="px-4 py-3 font-semibold">{nombre}</td>
                  <td className="px-4 py-3">{formatDateTime(item.lastSeenAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {item.id === actor.sessionId ? (
                      <Insignia fondo="amarillo">{t("T-232")}</Insignia>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SessionsPanel
        buttonLabel={t("T-137")}
        doneMessage={t("T-235")}
        disabled={sessions.length < 2}
      />
    </div>
  );
}
