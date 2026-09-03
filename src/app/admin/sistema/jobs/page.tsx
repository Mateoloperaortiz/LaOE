import type { Metadata } from "next";
import { requireAdminActor } from "@/modules/identity";
import { listOutbox, type OutboxRow } from "@/modules/system";
import { retryOutboxAction } from "@/modules/system/actions";
import { BarraTitulo, Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

export const metadata: Metadata = { title: t("T-241") };

function Tabla({ rows, retry }: { rows: OutboxRow[]; retry: boolean }) {
  const [evento, intentos, proximo, error, procesado, creado] = tList("T-246");
  if (rows.length === 0) {
    return <p className="text-tinta-suave">{t("T-247")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde">
      <table className="w-full text-left text-sm">
        <thead className="eyebrow bg-fondo-suave text-xs">
          <tr>
            <th scope="col" className="px-3 py-2">
              {evento}
            </th>
            <th scope="col" className="px-3 py-2">
              {intentos}
            </th>
            <th scope="col" className="px-3 py-2">
              {retry ? error : proximo}
            </th>
            <th scope="col" className="px-3 py-2">
              {retry ? creado : procesado}
            </th>
            {retry ? (
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">{t("T-245")}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-borde align-top">
              <td className="px-3 py-2">
                <code className="font-semibold">{row.eventType}</code>
                {row.dedupeKey ? (
                  <div className="text-xs text-tinta-suave">{row.dedupeKey}</div>
                ) : null}
              </td>
              <td className="px-3 py-2">{row.attempts}</td>
              <td className="max-w-xs px-3 py-2 text-xs">
                {retry ? (row.lastError ?? "") : formatDateTime(row.nextAttemptAt)}
              </td>
              <td className="px-3 py-2">
                {retry
                  ? formatDateTime(row.createdAt)
                  : row.processedAt
                    ? formatDateTime(row.processedAt)
                    : ""}
              </td>
              {retry ? (
                <td className="px-3 py-2 text-right">
                  <form action={retryOutboxAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <button type="submit" className="boton-secundario min-h-9 px-4 py-1 text-sm">
                      {t("T-245")}
                    </button>
                  </form>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function JobsPage() {
  await requireAdminActor("/admin/sistema/jobs");
  const [pending, dead, done] = await Promise.all([
    listOutbox("pending"),
    listOutbox("dead"),
    listOutbox("done", 30),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-display-lg">{t("T-241")}</h1>
      <section className="flex flex-col gap-4">
        <BarraTitulo color="azul" nivel="h2" className="self-start text-display-md">
          {t("T-242")} <Insignia fondo="azul">{pending.length}</Insignia>
        </BarraTitulo>
        <Tabla rows={pending} retry={false} />
      </section>
      <section className="flex flex-col gap-4">
        <BarraTitulo color="naranja" nivel="h2" className="self-start text-display-md">
          {t("T-244")} <Insignia fondo="naranja">{dead.length}</Insignia>
        </BarraTitulo>
        <Tabla rows={dead} retry={true} />
      </section>
      <section className="flex flex-col gap-4">
        <BarraTitulo color="sky" nivel="h2" className="self-start text-display-md">
          {t("T-243")}
        </BarraTitulo>
        <Tabla rows={done} retry={false} />
      </section>
    </div>
  );
}
