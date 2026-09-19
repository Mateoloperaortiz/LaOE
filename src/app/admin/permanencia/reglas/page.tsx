import type { Metadata } from "next";
import Link from "next/link";
import { single } from "@/app/_lib/search";
import { requireAdminActor } from "@/modules/identity";
import { listCommitteesForSelection } from "@/modules/people";
import {
  deviatesFromNominal,
  listTableViews,
  previewImpact,
  type TableView,
} from "@/modules/permanence";
import { ReglaForm } from "@/modules/permanence/components/ReglaForm";
import { TablaReglas } from "@/modules/permanence/components/TablaReglas";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { reglaFormLabels, reglaFormValues } from "../_ui/reglas";
import {
  applyTemplateAction,
  commentTableAction,
  copyPreviousAction,
  deleteRuleAction,
  lockAllAction,
  lockTableAction,
  saveRuleAction,
} from "./actions";

// Tablas de permanencia (ADR-036 regla 3): la general de GH y las 27 de comité en una vista, con
// sumas frente al nominal, copia, referencia, comentario, bloqueo y vista previa del impacto.

export const metadata: Metadata = { title: t("T-710") };

type Search = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

function emptyView(termId: string, committeeId: string | null): TableView {
  return {
    termId,
    scope: committeeId ? "COMMITTEE" : "GENERAL",
    committeeId,
    rules: [],
    sums: { veterans: 0, newcomers: 0 },
    lockedAt: null,
    lockedById: null,
    comment: null,
    commentedAt: null,
  };
}

export default async function ReglasPage({ searchParams }: PageProps<"/admin/permanencia/reglas">) {
  await requireAdminActor("/admin/permanencia/reglas");
  const search = (await searchParams) as Search;
  const [terms, current, committees] = await Promise.all([
    listAllTerms(),
    getCurrentTerm(),
    listCommitteesForSelection(),
  ]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const [
    nuevoCriterio,
    copiar,
    referencia,
    vistaPrevia,
    bloquear,
    desbloquear,
    comentar,
    bloquearTodas,
  ] = tList("T-715");
  const [tablaGeneral, tablasComite] = tList("T-712");
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-710")}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const slug = single(search.comite);
  const committee = committees.find((item) => item.slug === slug) ?? null;
  const accion = single(search.accion);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const referenciaCargada = single(search.referencia);
  const bloqueadas = single(search.bloqueadas);
  const views = await listTableViews(term.id);
  const general = views.find((item) => item.committeeId === null) ?? emptyView(term.id, null);
  const selected = committee
    ? (views.find((item) => item.committeeId === committee.id) ?? emptyView(term.id, committee.id))
    : null;
  const base = `/admin/permanencia/reglas?termId=${term.id}${committee ? `&comite=${committee.slug}` : ""}`;
  const focus = selected ?? general;
  // El editor solo abre un criterio de la tabla que se muestra (ADR-072).
  const editing =
    accion === "editar"
      ? (focus.rules.find((rule) => rule.id === single(search.regla)) ?? null)
      : null;
  const preview = accion === "impacto" ? await previewImpact(term.id, focus.committeeId) : null;
  const labels = reglaFormLabels();
  const [impactoTitulo, personas, enCamino, enRiesgo, noAlcanza, promedio] = tList("T-737");
  const hidden = {
    termId: term.id,
    committeeId: focus.committeeId ?? "",
    comite: committee?.slug ?? "",
  };

  const acciones = (view: TableView) => (
    <>
      <Link
        href={`${view.committeeId ? `${base}` : base}&accion=nueva`}
        className="boton-calido min-h-9 px-3 py-1 text-sm"
      >
        {nuevoCriterio}
      </Link>
      {view.rules.length === 0 ? (
        <>
          <form action={copyPreviousAction}>
            <AdminFormBody>
              {Object.entries(hidden).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <AdminSubmitButton
                type="submit"
                className="boton-secundario min-h-9 px-3 py-1 text-sm"
              >
                {copiar}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
          <form action={applyTemplateAction}>
            <AdminFormBody>
              {Object.entries(hidden).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <AdminSubmitButton
                type="submit"
                className="boton-secundario min-h-9 px-3 py-1 text-sm"
              >
                {referencia}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
        </>
      ) : (
        <Link
          href={`${base}&accion=impacto`}
          className="boton-secundario min-h-9 px-3 py-1 text-sm"
        >
          {vistaPrevia}
        </Link>
      )}
      {view.committeeId ? (
        <>
          <form action={lockTableAction}>
            <AdminFormBody>
              {Object.entries(hidden).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <input type="hidden" name="locked" value={view.lockedAt ? "0" : "1"} />
              <AdminSubmitButton
                type="submit"
                className="boton-secundario min-h-9 px-3 py-1 text-sm"
              >
                {view.lockedAt ? desbloquear : bloquear}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
          <Link
            href={`${base}&accion=comentar`}
            className="boton-secundario min-h-9 px-3 py-1 text-sm"
          >
            {comentar}
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{t("T-710")}</h1>
          <p className="max-w-prose text-tinta-suave">{t("T-711")}</p>
          {guardado ? (
            <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
              {referenciaCargada
                ? t("T-735", { n: referenciaCargada })
                : bloqueadas
                  ? t("T-741", { n: bloqueadas })
                  : t("T-259")}
            </output>
          ) : null}
          {error ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {error}
            </p>
          ) : null}
        </div>
        <form
          action="/admin/permanencia/reglas"
          method="get"
          className="flex items-center gap-2 text-sm"
        >
          <label htmlFor="termId" className="eyebrow text-xs">
            {tList("T-570")[0]}
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

      {selected && committee ? (
        <TablaReglas
          titulo={t("T-121", { comité: committee.name })}
          nominal={term.permanenceCommitteeNominal}
          sums={selected.sums}
          deviates={deviatesFromNominal(selected.sums.veterans, term.permanenceCommitteeNominal)}
          rules={selected.rules}
          lockedAt={selected.lockedAt}
          comment={selected.comment}
          editHref={(id) => `${base}&accion=editar&regla=${id}`}
          deleteAction={deleteRuleAction}
          deleteHidden={hidden}
          acciones={acciones(selected)}
        />
      ) : (
        <TablaReglas
          titulo={tablaGeneral ?? ""}
          nominal={term.permanenceGeneralNominal}
          sums={general.sums}
          deviates={
            deviatesFromNominal(general.sums.veterans, term.permanenceGeneralNominal) ||
            deviatesFromNominal(general.sums.newcomers, term.permanenceGeneralNominal)
          }
          rules={general.rules}
          lockedAt={general.lockedAt}
          comment={general.comment}
          editHref={(id) => `${base}&accion=editar&regla=${id}`}
          deleteAction={deleteRuleAction}
          deleteHidden={hidden}
          acciones={acciones(general)}
        />
      )}

      <section aria-labelledby="tablas-comite" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="tablas-comite" className="text-display-md">
            {tablasComite}
          </h2>
          <div className="flex items-center gap-2">
            {committee ? (
              <Link
                href={`/admin/permanencia/reglas?termId=${term.id}`}
                className="boton-secundario min-h-9 px-3 py-1 text-sm"
              >
                {tablaGeneral}
              </Link>
            ) : null}
            <form action={lockAllAction}>
              <AdminFormBody>
                <input type="hidden" name="termId" value={term.id} />
                <AdminSubmitButton
                  type="submit"
                  className="boton-secundario min-h-9 px-3 py-1 text-sm"
                >
                  {bloquearTodas}
                </AdminSubmitButton>
              </AdminFormBody>
            </form>
          </div>
        </div>
        <ul className="grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {committees.map((item) => {
            const view =
              views.find((v) => v.committeeId === item.id) ?? emptyView(term.id, item.id);
            const [sinCriterios, abierta] = tList("T-738");
            const active = committee?.id === item.id;
            return (
              <li key={item.id}>
                <Link
                  href={`/admin/permanencia/reglas?termId=${term.id}&comite=${item.slug}`}
                  aria-current={active ? "true" : undefined}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 no-underline ${active ? "border-titulo bg-fondo-suave" : "border-borde bg-fondo"}`}
                >
                  <span className="font-semibold">{item.name}</span>
                  <span className="flex items-center gap-2 text-sm">
                    <span className="tabular-nums">
                      {view.sums.veterans} / {term.permanenceCommitteeNominal}
                    </span>
                    <Insignia
                      fondo={view.lockedAt ? "naranja" : view.rules.length === 0 ? "paper" : "sky"}
                    >
                      {view.lockedAt
                        ? (bloquear ?? "")
                        : view.rules.length === 0
                          ? (sinCriterios ?? "")
                          : (abierta ?? "")}
                    </Insignia>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {accion === "nueva" || (accion === "editar" && editing) ? (
        <ResourcePanel
          title={editing ? editing.label : (nuevoCriterio ?? "")}
          closeHref={base}
          closeLabel={t("T-291")}
        >
          <ReglaForm
            action={saveRuleAction}
            values={reglaFormValues(editing)}
            hidden={{ ...hidden, id: editing?.id ?? "" }}
            committeeScoped={focus.committeeId !== null}
            labels={labels}
            cancelHref={base}
            error={error || null}
          />
        </ResourcePanel>
      ) : null}

      {accion === "comentar" && committee ? (
        <ResourcePanel title={comentar ?? ""} closeHref={base} closeLabel={t("T-291")}>
          <form action={commentTableAction} className="flex flex-col gap-4">
            <AdminFormBody>
              {Object.entries(hidden).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <label htmlFor="comment" className="eyebrow text-xs">
                {t("T-736")}
              </label>
              <textarea
                id="comment"
                name="comment"
                defaultValue={selected?.comment ?? ""}
                rows={4}
                className={inputClass}
              />
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {t("T-253")}
                </AdminSubmitButton>
                <Link href={base} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}

      {accion === "impacto" && preview ? (
        <ResourcePanel title={impactoTitulo ?? ""} closeHref={base} closeLabel={t("T-291")}>
          <dl className="grid grid-cols-2 gap-4">
            {(
              [
                [personas, preview.people],
                [enCamino, preview.enCamino],
                [enRiesgo, preview.enRiesgo],
                [noAlcanza, preview.noAlcanza],
                [promedio, `${preview.average} %`],
              ] as Array<[string | undefined, number | string]>
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex flex-col gap-1 rounded-xl border border-borde bg-fondo p-3"
              >
                <dt className="eyebrow text-xs">{label}</dt>
                <dd className="font-display text-display-md leading-none">{value}</dd>
              </div>
            ))}
          </dl>
        </ResourcePanel>
      ) : null}
    </div>
  );
}
