import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { single } from "@/app/_lib/search";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import { listPendingReviews } from "@/modules/participation";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { annulAction, reviewAction } from "./actions";

// Bandeja de revisión de evidencias (ADR-067 regla 5): pendientes del término con texto, imágenes
// y premio reservado; aprobar entrega, rechazar con motivo y anular con step-up.

export const metadata: Metadata = { title: tList("T-2405")[2] ?? "" };

type Search = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export default async function RevisionPage({
  searchParams,
}: PageProps<"/admin/gamificacion/revision">) {
  const actor = await requireAdminActor("/admin/gamificacion/revision");
  const search = (await searchParams) as Search;
  const termId = single(search.termId);
  const all = single(search.todas) === "1";
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const accion = single(search.accion);
  const participationId = single(search.participationId);
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === termId) ?? current ?? terms[0];
  const rows = term ? await listPendingReviews(term.id, { all }) : [];
  const actions = tList("T-2525");
  const filters = tList("T-2531");
  const imageStates = tList("T-2527");
  const states = tList("T-2410");
  const stateIndex = (status: string) =>
    ["AVAILABLE", "SENT", "PENDING", "COMPLETED", "REJECTED", "EXPIRED"].indexOf(status);
  const base = `/admin/gamificacion/revision?termId=${term?.id ?? ""}${all ? "&todas=1" : ""}`;

  // Anular un premio entregado exige step-up: la página vuelve a pedirlo antes de abrir el
  // formulario, como /admin/cierre (T-2586).
  if (accion === "anular" && participationId && !hasRecentStepUp(actor)) {
    redirect(
      `/ingresar/paso?next=${encodeURIComponent(`${base}&accion=anular&participationId=${participationId}`)}`,
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-lg">{t("T-2523")}</h1>
        {guardado ? (
          <output className="block font-semibold text-oe-blue">{t("T-259")}</output>
        ) : null}
        {error ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {error}
          </p>
        ) : null}
      </header>

      <form
        action="/admin/gamificacion/revision"
        method="get"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-xs">{tList("T-2565")[0]}</span>
          <select
            name="termId"
            defaultValue={term?.id ?? ""}
            className="rounded-xl border-2 border-borde bg-fondo px-3 py-2"
          >
            {terms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="todas" value="1" defaultChecked={all} />
          {filters[1]}
        </label>
        <AdminSubmitButton type="submit" className="boton-secundario">
          {filters[0]}
        </AdminSubmitButton>
      </form>

      {rows.length === 0 ? (
        <p className="text-tinta-suave">{t("T-2524")}</p>
      ) : (
        <ul className="flex list-none flex-col gap-4 p-0">
          {rows.map((row) => (
            <li
              key={row.participation.id}
              className="flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{row.personName}</p>
                  <p className="text-sm text-tinta-suave">
                    <Link
                      href={`/admin/gamificacion/retos/${row.challenge.id}`}
                      className="underline"
                    >
                      {row.challenge.title}
                    </Link>{" "}
                    · {formatDateTime(row.participation.submittedAt)} ·{" "}
                    {states[stateIndex(row.participation.status)] ?? row.participation.status}
                  </p>
                </div>
                {row.reward ? (
                  <p className="text-sm">
                    {t("T-2528", {
                      base: row.reward.basePoints,
                      extra: row.reward.personalPercent + row.reward.campaignPercent,
                      fecha: formatDateTime(row.participation.submittedAt),
                    })}
                  </p>
                ) : null}
              </header>

              {row.participation.evidenceText ? (
                <section aria-label={t("T-2585")}>
                  <h3 className="eyebrow text-xs">{t("T-2585")}</h3>
                  <p className="whitespace-pre-line text-sm">{row.participation.evidenceText}</p>
                </section>
              ) : null}

              {row.files.length > 0 ? (
                <ul className="flex list-none flex-wrap gap-3 p-0 text-sm">
                  {row.files.map((file) => (
                    <li key={file.id}>
                      {file.status === "READY" ? (
                        <Link href={`/api/retos/evidencia/${file.id}`} className="underline">
                          {file.objectKey.split("/").pop()}
                        </Link>
                      ) : (
                        <span className="text-tinta-suave">
                          {file.status === "PENDING" ? imageStates[0] : imageStates[1]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}

              {row.participation.status === "PENDING" ? (
                <div className="flex flex-wrap items-start gap-4">
                  <form action={reviewAction}>
                    <input type="hidden" name="participationId" value={row.participation.id} />
                    <input type="hidden" name="decision" value="APPROVE" />
                    <input type="hidden" name="back" value={base} />
                    <AdminSubmitButton className="boton-primario min-h-9 px-4 py-1 text-sm">
                      {actions[0]}
                    </AdminSubmitButton>
                  </form>
                  <form action={reviewAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="participationId" value={row.participation.id} />
                    <input type="hidden" name="decision" value="REJECT" />
                    <input type="hidden" name="back" value={base} />
                    <label className="flex flex-col gap-1">
                      <span className="eyebrow text-xs">{t("T-2526")}</span>
                      <input name="reason" required className={inputClass} />
                    </label>
                    <AdminSubmitButton className="boton-secundario min-h-9 px-4 py-1 text-sm">
                      {actions[1]}
                    </AdminSubmitButton>
                  </form>
                </div>
              ) : null}

              {row.participation.status === "COMPLETED" ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`${base}&accion=anular&participationId=${row.participation.id}`}
                    className="boton-calido min-h-9 px-4 py-1 text-sm"
                  >
                    {actions[2]}
                  </Link>
                  {!hasRecentStepUp(actor) ? (
                    <p className="text-xs text-tinta-suave">{t("T-2586")}</p>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {accion === "anular" && participationId ? (
        <ResourcePanel title={tList("T-2530")[0] ?? ""} closeHref={base} closeLabel={t("T-291")}>
          <form action={annulAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="participationId" value={participationId} />
              <input type="hidden" name="back" value={base} />
              <p className="text-sm">{tList("T-2530")[1]}</p>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{t("T-2526")}</span>
                <textarea name="reason" required rows={3} className={inputClass} />
              </label>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {tList("T-2530")[0]}
                </AdminSubmitButton>
                <Link href={base} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}
    </div>
  );
}
