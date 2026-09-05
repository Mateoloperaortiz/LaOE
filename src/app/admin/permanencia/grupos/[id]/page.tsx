import type { Metadata } from "next";
import Link from "next/link";
import { searchMembersByName } from "@/modules/people";
import { getGroupDetail } from "@/modules/permanence";
import { ImportadorGrupo } from "@/modules/permanence/components/ImportadorGrupo";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { requireGroupOperator } from "../../authz";
import { addMemberAction, importAction, removeMemberAction, setEvaluatorsAction } from "./actions";

// Detalle de un grupo de trabajo (ADR-036 regla 6): miembros por nombre o por CSV, evaluadores
// (solo ADMIN) y el estado de cada evaluación. El líder del grupo lo opera sin ver correos.

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";
const GROUP_KINDS = [
  "WORK_COMMITTEE",
  "GT_MACROEVENT",
  "GAP",
  "GAP_OE",
  "BARRA_BRAVA",
  "NEW_MEMBER_TASK",
];

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
    return null;
  }
  const search = (await searchParams) as Search;
  const q = single(search.q).trim();
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const candidates = q ? await searchMembersByName(q) : [];
  const [miembros, evaluadores, importar] = tList("T-747");
  const [agregar, quitar, guardarEvaluadores, cargar, confirmar] = tList("T-748");
  const columns = tList("T-749");
  const evaluationLabels = tList("T-750");
  const kindLabels = tList("T-725");
  const live = detail.members.filter((member) => member.leftAt === null);
  const currentIds = new Set(live.map((member) => member.personId));
  const outcomeLabels = tList("T-846");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Insignia fondo="sky">
            {kindLabels[GROUP_KINDS.indexOf(detail.group.kind)] ?? ""}
          </Insignia>
          {detail.group.code ? <Insignia fondo="paper">{detail.group.code}</Insignia> : null}
        </div>
        <h1 className="text-display-lg">{detail.group.name}</h1>
        <p className="text-tinta-suave">
          {tList("T-744")[3]}: {detail.leaderName || t("T-757")}
        </p>
        {guardado ? (
          <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
            {t("T-259")}
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  {columns.map((column) => (
                    <th key={column} className="eyebrow py-2 pr-3 text-xs">
                      {column}
                    </th>
                  ))}
                  <th className="py-2" />
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
                        {evaluationLabels[
                          ["PENDING", "GOOD", "INSUFFICIENT"].indexOf(member.evaluation)
                        ] ?? ""}
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
                      <form action={removeMemberAction}>
                        <input type="hidden" name="groupId" value={id} />
                        <input type="hidden" name="personId" value={member.personId} />
                        <button type="submit" className="underline">
                          {quitar}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={base} method="get" className="flex flex-wrap items-end gap-2">
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
          <button type="submit" className="boton-secundario min-h-10 px-4 py-2 text-sm">
            {t("T-250")}
          </button>
        </form>
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
                    <form action={addMemberAction}>
                      <input type="hidden" name="groupId" value={id} />
                      <input type="hidden" name="personId" value={candidate.id} />
                      <button type="submit" className="boton-calido min-h-9 px-3 py-1 text-sm">
                        {agregar}
                      </button>
                    </form>
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
          <form action={setEvaluatorsAction} className="flex flex-col gap-2">
            <input type="hidden" name="groupId" value={id} />
            <label htmlFor="emails" className="eyebrow text-xs">
              {t("T-847")}
            </label>
            <textarea id="emails" name="emails" rows={3} className={inputClass} />
            <button type="submit" className="boton-secundario self-start">
              {guardarEvaluadores}
            </button>
          </form>
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
