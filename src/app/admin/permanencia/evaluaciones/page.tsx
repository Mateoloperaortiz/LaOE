import type { Metadata } from "next";
import { requireEvaluator } from "@/app/_authz/group";
import { single } from "@/app/_lib/search";
import {
  evaluationWindow,
  listEvaluationTray,
  loadPermanenceConfig,
  WORK_GROUP_KINDS,
} from "@/modules/permanence";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { evaluateAction } from "./actions";

// Bandeja de evaluaciones (12-permanencia, "Lo que ve el director de GH"): los grupos que evalúa el
// actor (todos para ADMIN) con sus miembros; los botones de T-167 dentro de la ventana.

export const metadata: Metadata = { title: t("T-761") };

type Search = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";
const EVALUATIONS = ["PENDING", "GOOD", "INSUFFICIENT"] as const;

export default async function EvaluacionesPage({
  searchParams,
}: PageProps<"/admin/permanencia/evaluaciones">) {
  const search = (await searchParams) as Search;
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-761")}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const base = `/admin/permanencia/evaluaciones?termId=${term.id}`;
  const { isAdmin, groupIds } = await requireEvaluator(term.id, base);
  const [config, groups] = await Promise.all([
    loadPermanenceConfig(),
    listEvaluationTray(term.id, groupIds),
  ]);
  const window = evaluationWindow(term, config, new Date());
  const canEvaluate = isAdmin || window.open;
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const [bueno, insuficiente] = tList("T-167");
  const evaluationLabels: Readonly<Record<string, string>> = tLabels("T-750", EVALUATIONS);
  const kindLabels: Readonly<Record<string, string>> = tLabels("T-725", WORK_GROUP_KINDS);
  const pending = groups.reduce((acc, group) => acc + group.pending, 0);
  const opensOn = formatDate(new Date(`${window.opensOn}T12:00:00Z`));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{t("T-761")}</h1>
          <p className="max-w-prose text-tinta-suave">{t("T-762")}</p>
          <p className="font-semibold">
            {window.open
              ? t("T-764", { n: pending })
              : t("T-763", { término: term.code, fecha: opensOn })}
          </p>
          {guardado ? (
            <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
              {t("T-259")}
            </output>
          ) : null}
          {error ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {error === "T-260" ? t("T-260") : error}
            </p>
          ) : null}
        </div>
        {isAdmin ? (
          <ActionForm
            action="/admin/permanencia/evaluaciones"
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
          </ActionForm>
        ) : null}
      </header>

      {groups.length === 0 ? (
        <p className="text-tinta-suave">{t("T-765")}</p>
      ) : (
        groups.map((group) => (
          <section
            key={group.id}
            aria-label={group.name}
            className="flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-display-md">{group.name}</h2>
              <Insignia fondo="sky">{kindLabels[group.kind] ?? ""}</Insignia>
              {group.pending > 0 ? <Insignia fondo="naranja">{group.pending}</Insignia> : null}
            </div>
            {group.members.length === 0 ? (
              <p className="text-tinta-suave">{t("T-844")}</p>
            ) : (
              <ul className="flex list-none flex-col gap-3 p-0">
                {group.members.map((member) => (
                  <li
                    key={member.personId}
                    className="flex min-w-0 flex-col gap-3 border-b border-borde py-4 last:border-b-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{member.name}</span>
                      <Insignia
                        fondo={
                          member.evaluation === "GOOD"
                            ? "amarillo"
                            : member.evaluation === "INSUFFICIENT"
                              ? "naranja"
                              : "paper"
                        }
                      >
                        {evaluationLabels[member.evaluation] ?? ""}
                      </Insignia>
                    </div>
                    {member.evaluatedAt ? (
                      <p className="text-sm text-tinta-suave">
                        {t("T-770", {
                          evaluador: member.evaluatedByName,
                          fecha: formatDateTime(member.evaluatedAt),
                        })}
                        {member.note ? ` · ${member.note}` : ""}
                      </p>
                    ) : null}
                    {canEvaluate ? (
                      <ActionForm
                        action={evaluateAction}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <AdminFormBody>
                          <input type="hidden" name="groupId" value={group.id} />
                          <input type="hidden" name="termId" value={term.id} />
                          <input type="hidden" name="personId" value={member.personId} />
                          <div className="flex min-w-0 basis-full flex-col gap-1 sm:flex-1 sm:basis-auto">
                            <label
                              htmlFor={`nota-${group.id}-${member.personId}`}
                              className="eyebrow text-xs"
                            >
                              {t("T-769")}
                            </label>
                            <input
                              id={`nota-${group.id}-${member.personId}`}
                              name="note"
                              defaultValue={member.note ?? ""}
                              className={inputClass}
                            />
                          </div>
                          <AdminSubmitButton
                            type="submit"
                            name="evaluation"
                            value="GOOD"
                            className="boton-calido min-h-10 px-4 py-2 text-sm"
                          >
                            {bueno}
                          </AdminSubmitButton>
                          <AdminSubmitButton
                            type="submit"
                            name="evaluation"
                            value="INSUFFICIENT"
                            className="boton-secundario min-h-10 px-4 py-2 text-sm"
                          >
                            {insuficiente}
                          </AdminSubmitButton>
                        </AdminFormBody>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
