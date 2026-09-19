import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import {
  gamificationOverview,
  getReconciliationRun,
  listReconciliationRuns,
  loadGamificationSettings,
  reconciliationReport,
} from "@/modules/participation";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { CheckIcon } from "@/shared/ui/icons/CheckIcon";
import { XIcon } from "@/shared/ui/icons/XIcon";
import { resumeReconciliationAction, startReconciliationAction } from "./actions";

// Panel de la gamificación (ADR-067 reglas 13 y 16): indicadores del término y enlaces rápidos.
// El alta y el retiro manual de boosters viven en Insignias desde G-T5.

export const metadata: Metadata = { title: tList("T-2405")[0] ?? "" };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function GamificacionPage({ searchParams }: PageProps<"/admin/gamificacion">) {
  const actor = await requireAdminActor("/admin/gamificacion");
  const search = (await searchParams) as Search;
  const accion = single(search.accion);
  const errorParam = single(search.error);
  if (accion === "aplicar" && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent("/admin/gamificacion?accion=aplicar")}`);
  }
  const [terms, current, settings, runs] = await Promise.all([
    listAllTerms(),
    getCurrentTerm(),
    loadGamificationSettings(),
    listReconciliationRuns(10),
  ]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const indicators = tList("T-2555");
  const links = tList("T-2583");
  const nav = tList("T-2404");
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{tList("T-2405")[0] ?? ""}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const overview = await gamificationOverview(term.id);
  const corridaId = single(search.corrida);
  const selectedRun = corridaId ? await getReconciliationRun(corridaId) : null;
  const running = runs.find((item) => item.status === "RUNNING") ?? null;
  const latest = runs[0] ?? null;
  const statusLabels = tList("T-2559");
  const modeLabels = tList("T-2590");
  const actionLabels = tList("T-2558");
  const [si, no] = tList("T-2670");
  const runColumns = tList("T-2589");
  const exportColumns = tList("T-2571");
  const statusLabel = (status: string) =>
    status === "RUNNING" ? statusLabels[0] : status === "DONE" ? statusLabels[1] : statusLabels[2];
  const runCounts = (run: { processed: number; unlocked: number; revoked: number }) =>
    t("T-2560", {
      procesadas: run.processed,
      desbloqueadas: run.unlocked,
      revocadas: run.revoked,
    });
  const errorText = errorParam === "T-260" ? t("T-260") : errorParam;
  const cards: Array<[string, string]> = [
    [indicators[0] ?? "", String(overview.uniqueParticipants)],
    [indicators[1] ?? "", String(overview.pendingSubmissions)],
    [indicators[2] ?? "", `${overview.reservedRewards.count} · ${overview.reservedRewards.points}`],
    [indicators[3] ?? "", `${overview.grantedRewards.count} · ${overview.grantedRewards.points}`],
    [indicators[4] ?? "", String(overview.boostersUsed)],
    [indicators[5] ?? "", String(overview.processingErrors)],
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{tList("T-2405")[0] ?? ""}</h1>
          <p className="text-sm text-tinta-suave">
            {t("T-2552")}: {settings.enabled ? <CheckIcon label={si} /> : <XIcon label={no} />} ·{" "}
            {term.code}
          </p>
        </div>
        <form action="/admin/gamificacion" method="get" className="flex items-center gap-2 text-sm">
          <label htmlFor="termId" className="eyebrow text-xs">
            {tList("T-2565")[0]}
          </label>
          <select
            id="termId"
            name="termId"
            defaultValue={term.id}
            className="rounded-xl border-2 border-borde bg-fondo px-3 py-1"
          >
            {terms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code}
              </option>
            ))}
          </select>
          <AdminSubmitButton type="submit" className="boton-secundario min-h-8 px-3 py-1 text-sm">
            {t("T-250")}
          </AdminSubmitButton>
        </form>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
          >
            <dt className="eyebrow text-xs">{label}</dt>
            <dd className="font-display text-display-lg leading-none tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label={t("T-2403")} className="flex flex-wrap gap-3">
        <Link href={`/admin/gamificacion/retos?termId=${term.id}`} className="boton-secundario">
          {nav[1]}
        </Link>
        <Link href="/admin/gamificacion/revision" className="boton-secundario">
          {nav[2]}
        </Link>
        <Link href={`/admin/gamificacion/campanas?termId=${term.id}`} className="boton-secundario">
          {nav[3]}
        </Link>
        <Link href={`/admin/gamificacion/insignias?termId=${term.id}`} className="boton-secundario">
          {nav[4]}
        </Link>
        <Link href="/admin/gamificacion/limites" className="boton-secundario">
          {nav[5]}
        </Link>
        <Link href="/admin/sistema/jobs" className="underline">
          {links[0]}
        </Link>
        <Link href="/admin/ledger" className="underline">
          {links[1]}
        </Link>
        <Link href="/admin/cierre" className="underline">
          {links[2]}
        </Link>
      </nav>

      <section aria-labelledby="conciliacion" className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 id="conciliacion" className="text-display-md">
            {t("T-2556")}
          </h2>
          <p className="max-w-prose text-sm text-tinta-suave">{t("T-2557")}</p>
          {errorText ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {errorText}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form action={startReconciliationAction}>
            <input type="hidden" name="mode" value="DRY_RUN" />
            <AdminSubmitButton
              type="submit"
              disabled={running !== null}
              className="boton-secundario"
            >
              {actionLabels[0]}
            </AdminSubmitButton>
          </form>
          {running ? (
            <span className="boton-calido pointer-events-none opacity-50" aria-disabled="true">
              {actionLabels[1]}
            </span>
          ) : (
            <Link href="/admin/gamificacion?accion=aplicar" className="boton-calido">
              {actionLabels[1]}
            </Link>
          )}
          {running ? <p className="text-sm text-tinta-suave">{t("T-2561")}</p> : null}
        </div>

        {accion === "aplicar" && !running ? (
          <ResourcePanel
            title={actionLabels[1] ?? ""}
            closeHref="/admin/gamificacion"
            closeLabel={t("T-291")}
          >
            <form action={startReconciliationAction} className="flex flex-col gap-4">
              <AdminFormBody>
                <input type="hidden" name="mode" value="APPLY" />
                <p>{t("T-2591")}</p>
                <div className="flex items-center gap-3">
                  <AdminSubmitButton type="submit" className="boton-calido">
                    {actionLabels[1]}
                  </AdminSubmitButton>
                  <Link href="/admin/gamificacion" className="boton-secundario">
                    {t("T-254")}
                  </Link>
                </div>
              </AdminFormBody>
            </form>
          </ResourcePanel>
        ) : null}

        {latest ? (
          <p className="text-sm">
            <span className="font-semibold">{statusLabel(latest.status)}</span>
            {" · "}
            {runCounts(latest)}
          </p>
        ) : null}

        {runs.length === 0 ? (
          <p className="text-tinta-suave">{t("T-2592")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <h3 className="eyebrow text-xs">{t("T-2588")}</h3>
            <div className="overflow-x-auto">
              <table className="admin-data-table w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {runColumns.map((column) => (
                      <th key={column} scope="col" className="eyebrow py-2 pr-4 text-xs">
                        {column}
                      </th>
                    ))}
                    <th scope="col" className="eyebrow py-2 pr-4 text-xs">
                      <span className="sr-only">{actionLabels[0]}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-borde border-t">
                      <td data-label={runColumns[0]} className="py-2 pr-4">
                        <Link href={`/admin/gamificacion?corrida=${run.id}`} className="underline">
                          {run.mode === "DRY_RUN" ? modeLabels[0] : modeLabels[1]}
                        </Link>
                      </td>
                      <td data-label={runColumns[1]} className="py-2 pr-4">
                        {statusLabel(run.status)}
                      </td>
                      <td data-label={runColumns[2]} className="py-2 pr-4 tabular-nums">
                        {run.processed}
                      </td>
                      <td data-label={runColumns[3]} className="py-2 pr-4 tabular-nums">
                        {run.unlocked}
                      </td>
                      <td data-label={runColumns[4]} className="py-2 pr-4 tabular-nums">
                        {run.revoked}
                      </td>
                      <td data-label={runColumns[5]} className="py-2 pr-4">
                        {formatDateTime(run.startedAt)}
                      </td>
                      <td data-label={runColumns[6]} className="py-2 pr-4">
                        {run.finishedAt ? formatDateTime(run.finishedAt) : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {run.status === "FAILED" ? (
                          <form action={resumeReconciliationAction}>
                            <input type="hidden" name="runId" value={run.id} />
                            <AdminSubmitButton
                              type="submit"
                              className="boton-secundario min-h-8 px-3 py-1 text-sm"
                            >
                              {t("T-2587")}
                            </AdminSubmitButton>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedRun ? (
          <div className="flex flex-col gap-2 rounded-xl border border-borde bg-fondo p-4 text-sm">
            <p className="font-semibold">
              {selectedRun.mode === "DRY_RUN" ? modeLabels[0] : modeLabels[1]}
              {" · "}
              {statusLabel(selectedRun.status)}
              {" · "}
              {runCounts(selectedRun)}
            </p>
            {selectedRun.error ? (
              <p role="alert" className="text-oe-orange">
                {t("T-2593", { mensaje: selectedRun.error })}
              </p>
            ) : null}
            {reconciliationReport(selectedRun).sample.length > 0 ? (
              <ul className="flex list-none flex-col gap-1 p-0">
                {reconciliationReport(selectedRun).sample.map((item, index) => (
                  <li key={`${item.personId}-${item.code}-${item.level}-${index}`}>
                    {item.code} · {item.level} ·{" "}
                    {item.action === "UNLOCK" ? exportColumns[4] : exportColumns[6]}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
