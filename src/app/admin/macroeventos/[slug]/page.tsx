import Link from "next/link";
import { notFound } from "next/navigation";
import { listEditions, listMacroevents } from "@/modules/events";
import { requireAdminActor } from "@/modules/identity";
import { listActiveMemberRefs, listMacroeventBoard, listMacroeventRoles } from "@/modules/people";
import { findMacroeventGroup, getGroupDetail } from "@/modules/permanence";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminSectionSelect } from "@/shared/admin-kit/AdminSectionSelect";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { Board } from "./_ui/Board";
import { Team } from "./_ui/Team";

// Las áreas de la vista, en el orden de T-2375.
const MACROEVENT_TABS = ["mesa", "equipo", "gap", "ediciones"] as const;

const single = (value: string | string[] | undefined) =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

export async function generateMetadata({ params }: PageProps<"/admin/macroeventos/[slug]">) {
  const { slug } = await params;
  const event = (await listMacroevents()).find((row) => row.slug === slug);
  return { title: event ? `${event.name} · ${t("T-2344")}` : t("T-2344") };
}

export default async function MacroeventPage({
  params,
  searchParams,
}: PageProps<"/admin/macroeventos/[slug]">) {
  await requireAdminActor("/admin/macroeventos");
  const { slug } = await params;
  const search = await searchParams;
  const event = (await listMacroevents()).find((row) => row.slug === slug);
  if (!event) notFound();
  const [terms, current, editionsResult, roles, active] = await Promise.all([
    listAllTerms(),
    getCurrentTerm(),
    listEditions({ q: "", eventId: event.id, page: 1, pageSize: 1000 }),
    listMacroeventRoles(event.slug),
    listActiveMemberRefs(),
  ]);
  const term = terms.find((row) => row.id === single(search.termId)) ?? current ?? terms[0];
  if (!term) return <p>{t("T-650")}</p>;
  const editions = editionsResult.rows.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  const edition = editions.find((row) => row.id === single(search.editionId)) ?? editions[0];
  const area = ["mesa", "equipo", "gap", "ediciones"].includes(single(search.area))
    ? single(search.area)
    : "mesa";
  const context = { slug, termId: term.id, area, editionId: edition?.id ?? "" };
  const base = `/admin/macroeventos/${slug}`;
  const href = (target: string, editionId = edition?.id ?? "") =>
    `${base}?${new URLSearchParams({ termId: term.id, area: target, ...(editionId ? { editionId } : {}) })}`;
  const labels = tList("T-2375");
  const tabLabels = tLabels("T-2375", MACROEVENT_TABS);
  const options = MACROEVENT_TABS.map((value) => ({
    value,
    label: tabLabels[value] ?? "",
    href: href(value),
  }));
  const [board, group] = await Promise.all([
    edition ? listMacroeventBoard(edition.id) : [],
    findMacroeventGroup(event.id, term.id, area === "gap" ? "GAP" : "GT_MACROEVENT"),
  ]);
  const detail = group ? await getGroupDetail(group.id) : null;
  const members = active
    .filter((row) => !row.anonymized)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
  const editionsHref = `/admin/eventos/${event.id}/ediciones`;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link href="/admin/macroeventos" className="self-start text-sm underline">
          {t("T-2344")}
        </Link>
        <h1 className="text-display-lg">{event.name}</h1>
        <p className="max-w-prose text-tinta-suave">{t("T-2345")}</p>
      </header>
      <form action={base} className="flex flex-wrap items-end gap-3" method="get">
        <input type="hidden" name="area" value={area} />
        <div className="flex flex-col gap-1">
          <label htmlFor="termId" className="text-sm font-semibold">
            {tList("T-570")[0]}
          </label>
          <select id="termId" name="termId" className={inputClass} defaultValue={term.id}>
            {terms.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code}
              </option>
            ))}
          </select>
        </div>
        {editions.length ? (
          <div className="flex min-w-0 max-w-full flex-col gap-1">
            <label htmlFor="editionId" className="text-sm font-semibold">
              {t("T-2355")}
            </label>
            <select
              id="editionId"
              name="editionId"
              className={inputClass}
              defaultValue={edition?.id}
            >
              {editions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button className="boton-secundario" type="submit">
          {t("T-250")}
        </button>
      </form>
      {single(search.guardado) === "1" ? (
        <output className="rounded-xl border border-borde px-4 py-3">{t("T-259")}</output>
      ) : null}
      {single(search.error) ? (
        <p role="alert" className="text-sm font-semibold text-oe-orange">
          {single(search.error)}
        </p>
      ) : null}
      <nav aria-label={t("T-2344")}>
        <AdminSectionSelect label={t("T-2344")} value={area} options={options} />
        <ul className="m-0 hidden list-none flex-wrap gap-1 border-b border-borde p-0 md:flex">
          {options.map((option) => (
            <li key={option.value}>
              <Link
                href={option.href}
                aria-current={area === option.value ? "page" : undefined}
                className={`inline-block rounded-t-xl border-b-2 px-4 py-3 text-sm font-semibold ${area === option.value ? "border-oe-orange bg-fondo-suave text-titulo" : "border-transparent text-titulo hover:bg-fondo-suave"}`}
              >
                {option.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {area === "mesa" ? (
        <Board
          context={context}
          roles={roles}
          board={board}
          members={members}
          hasEdition={!!edition}
          editionsHref={editionsHref}
        />
      ) : null}
      {area === "equipo" || area === "gap" ? (
        <>
          {term.permanenceClosedAt ? <p className="font-semibold">{t("T-2371")}</p> : null}
          <Team
            context={context}
            detail={detail}
            members={members}
            editions={editions}
            closed={!!term.permanenceClosedAt}
          />
        </>
      ) : null}
      {area === "ediciones" ? (
        <section className="flex flex-col items-start gap-4">
          <h2 className="text-display-md">{labels[3]}</h2>
          <p className="max-w-prose text-tinta-suave">{t("T-2372")}</p>
          <Link href={editionsHref} className="boton-secundario">
            {t("T-2356")}
          </Link>
          {editions.length ? (
            <ul className="m-0 w-full list-none divide-y divide-borde p-0">
              {editions.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <h3 className="font-semibold">{row.name}</h3>
                    <p className="text-sm text-tinta-suave">{formatDateTime(row.startsAt)}</p>
                  </div>
                  <Link className="text-sm underline" href={href("mesa", row.id)}>
                    {labels[0]}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("T-2354")}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
