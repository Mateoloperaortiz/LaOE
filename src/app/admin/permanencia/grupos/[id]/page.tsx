import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGroupOperator } from "@/app/_authz/group";
import { single } from "@/app/_lib/search";
import { searchMembersByName } from "@/modules/people";
import { getGroupDetail, WORK_GROUP_KINDS } from "@/modules/permanence";
import { ImportadorGrupo } from "@/modules/permanence/components/ImportadorGrupo";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { addMemberAction, importAction, removeMemberAction, setEvaluatorsAction } from "./actions";
import { altaNotice } from "./alta";

// Detalle de un grupo de trabajo (ADR-036 regla 6): miembros por nombre o por CSV, evaluadores
// (solo ADMIN) y el estado de cada evaluación. El líder del grupo lo opera sin ver correos.

type Search = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";
const EVALUATIONS = ["PENDING", "GOOD", "INSUFFICIENT"] as const;

export async function generateMetadata({
  params,
}: PageProps<"/admin/permanencia/grupos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const detail = await getGroupDetail(id);
  return { title: detail?.group.name ?? tList("T-742")[1] };
}

export default async function GrupoPage({
  params,
  searchParams,
}: PageProps<"/admin/permanencia/grupos/[id]">) {
  const { id } = await params;
  const base = `/admin/permanencia/grupos/${id}`;
  const { isAdmin } = await requireGroupOperator(id, base);
  const detail = await getGroupDetail(id);
  if (!detail) {
    notFound();
  }
  const search = (await searchParams) as Search;
  const q = single(search.q).trim();
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  // Qué pasó con el alta a mano: entró, volvió después de haber salido o ya estaba.
  const alta = altaNotice(single(search.alta));
  const candidates = q ? await searchMembersByName(q) : [];
  const [miembros, evaluadores, importar] = tList("T-747");
  const [agregar, quitar, guardarEvaluadores, cargar, confirmar] = tList("T-748");
  const columns = tList("T-749");
  const evaluationLabels: Readonly<Record<string, string>> = tLabels("T-750", EVALUATIONS);
  const kindLabels: Readonly<Record<string, string>> = tLabels("T-725", WORK_GROUP_KINDS);
  const live = detail.members.filter((member) => member.leftAt === null);
  const currentIds = new Set(live.map((member) => member.personId));
  const outcomeLabels = tList("T-846");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Insignia fondo="sky">{kindLabels[detail.group.kind] ?? ""}</Insignia>
          {detail.group.code ? <Insignia fondo="paper">{detail.group.code}</Insignia> : null}
        </div>
        <h1 className="text-display-lg">{detail.group.name}</h1>
        <p className="text-tinta-suave">
          {tList("T-744")[3]}: {detail.leaderName || t("T-757")}
        </p>
        {guardado || alta ? (
          <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
            {alta || t("T-259")}
          </output>
        ) : null}
        {error ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-4">
          {isAdmin ? (
            <Link href="/admin/permanencia/grupos" className="underline">
              {tList("T-742")[0]}
            </Link>
          ) : null}
          <Link href={`/admin/convocatorias?groupId=${id}`} className="underline">
            {t("T-1030")}
          </Link>
        </div>
      </header>

      <section aria-labelledby="miembros" className="flex flex-col gap-4">
        <h2 id="miembros" className="text-display-md">
          {miembros} · {live.length}
        </h2>
        {live.length === 0 ? (
          <p className="text-tinta-suave">{t("T-844")}</p>
        ) : (
          <AdminTableRegion label={miembros ?? detail.group.name} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  {columns.map((column) => (
                    <th scope="col" key={column} className="eyebrow py-2 pr-3 text-xs">
                      {column}
                    </th>
                  ))}
                  <th scope="col" className="py-2" />
                </tr>
              </thead>
              <tbody>
                {live.map((member) => (
                  <tr key={member.personId} className="border-borde border-t">
                    <td className="py-2 pr-3 font-semibold">{member.name}</td>
                    <td className="py-2 pr-3">{member.committees.join(" · ")}</td>
                    <td className="py-2 pr-3">{formatDate(member.joinedAt)}</td>
                    <td className="py-2 pr-3">
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
                    </td>
                    <td className="py-2 pr-3">
                      {member.evaluatedAt
                        ? t("T-770", {
                            evaluador: member.evaluatedByName,
                            fecha: formatDateTime(member.evaluatedAt),
                          })
                        : ""}
                    </td>
                    <td className="py-2 pr-3 text-tinta-suave">{member.note ?? ""}</td>
                    <td className="py-2 text-right">
                      <ActionForm action={removeMemberAction}>
                        <AdminFormBody>
                          <input type="hidden" name="groupId" value={id} />
                          <input type="hidden" name="personId" value={member.personId} />
                          <AdminSubmitButton type="submit" className="underline">
                            {quitar}
                          </AdminSubmitButton>
                        </AdminFormBody>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableRegion>
        )}
        <ActionForm action={base} method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="q" className="eyebrow text-xs">
              {agregar}
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder={t("T-599")}
              className={inputClass}
            />
          </div>
          <AdminSubmitButton type="submit" className="boton-secundario min-h-10 px-4 py-2 text-sm">
            {t("T-250")}
          </AdminSubmitButton>
        </ActionForm>
        {q ? (
          candidates.length === 0 ? (
            <p className="text-tinta-suave">{t("T-600")}</p>
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-fondo px-3 py-2"
                >
                  <span className="font-semibold">{candidate.fullName}</span>
                  {currentIds.has(candidate.id) ? (
                    <span className="text-sm text-tinta-suave">
                      {t("T-751", { nombre: candidate.fullName })}
                    </span>
                  ) : (
                    <ActionForm action={addMemberAction}>
                      <AdminFormBody>
                        <input type="hidden" name="groupId" value={id} />
                        <input type="hidden" name="personId" value={candidate.id} />
                        <AdminSubmitButton
                          type="submit"
                          className="boton-calido min-h-9 px-3 py-1 text-sm"
                        >
                          {agregar}
                        </AdminSubmitButton>
                      </AdminFormBody>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>

      <section aria-labelledby="evaluadores" className="flex flex-col gap-3">
        <h2 id="evaluadores" className="text-display-md">
          {evaluadores}
        </h2>
        {detail.evaluators.length === 0 ? (
          <p className="font-semibold text-oe-navy">{t("T-759")}</p>
        ) : (
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {detail.evaluators.map((evaluator) => (
              <li key={evaluator.personId}>
                <Insignia fondo="amarillo">{evaluator.name}</Insignia>
              </li>
            ))}
          </ul>
        )}
        {isAdmin ? (
          <ActionForm action={setEvaluatorsAction} className="flex flex-col gap-2">
            <AdminFormBody>
              <input type="hidden" name="groupId" value={id} />
              <label htmlFor="emails" className="eyebrow text-xs">
                {t("T-847")}
              </label>
              <textarea id="emails" name="emails" rows={3} className={inputClass} />
              <AdminSubmitButton type="submit" className="boton-secundario self-start">
                {guardarEvaluadores}
              </AdminSubmitButton>
            </AdminFormBody>
          </ActionForm>
        ) : null}
      </section>

      <section aria-labelledby="importar" className="flex flex-col gap-3">
        <h2 id="importar" className="text-display-md">
          {importar}
        </h2>
        <ImportadorGrupo
          groupId={id}
          action={importAction}
          labels={{
            help: t("T-753"),
            load: cargar ?? "",
            confirm: confirmar ?? "",
            summary: t("T-754"),
            outcomes: {
              ADD: outcomeLabels[0] ?? "",
              ALREADY: outcomeLabels[1] ?? "",
              INACTIVE: outcomeLabels[2] ?? "",
              UNKNOWN: outcomeLabels[3] ?? "",
            },
            applied: t("T-845"),
          }}
        />
      </section>
    </div>
  );
}
