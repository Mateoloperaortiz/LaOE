import type { Metadata } from "next";
import { loadDesk } from "@/app/admin/_kit/desk";
import {
  DESK_DATE_KINDS,
  DESK_SECTIONS,
  type DeskItem,
  type DeskSection,
} from "@/app/admin/_kit/desk-items";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { ChevronRightIcon } from "@/shared/ui/icons/ChevronRightIcon";
import { CircleCheckIcon } from "@/shared/ui/icons/CircleCheckIcon";
import { EmptyState } from "@/shared/ui/States";

// La Mesa (ADR-159 regla 3, tramo O2): lo que le toca al actor, agrupado y con lo más urgente arriba
// en cada grupo. Solo lee; cada fila lleva al registro en su pantalla de origen, que lo resuelve.

export const metadata: Metadata = { title: t("T-4864") };

type DateLabels = Record<(typeof DESK_DATE_KINDS)[number], string>;

function ItemDate({
  date,
  dates,
  className,
}: {
  date: NonNullable<DeskItem["date"]>;
  dates: DateLabels;
  className: string;
}) {
  return (
    <span
      className={`text-secundario ${date.kind === "overdue" ? "font-semibold text-error" : "text-tinta-secundaria"} ${className}`}
    >
      {dates[date.kind].replace("{fecha}", formatDate(date.at))}
    </span>
  );
}

// En el celular la fecha va debajo del título, para no cortarlo; desde 640 px, a la derecha.
function ItemRow({ item, dates }: { item: DeskItem; dates: DateLabels }) {
  return (
    <li>
      <Link
        href={item.href}
        className="flex min-h-12 items-center gap-3 rounded-control px-3 py-2 text-titulo no-underline hover:bg-relleno"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{item.title}</span>
          {item.detail ? (
            <span className="truncate text-secundario text-tinta-secundaria">{item.detail}</span>
          ) : null}
          {item.date ? <ItemDate date={item.date} dates={dates} className="sm:hidden" /> : null}
        </span>
        {item.date ? (
          <ItemDate date={item.date} dates={dates} className="hidden shrink-0 sm:block" />
        ) : null}
        <ChevronRightIcon size={16} className="shrink-0 text-tinta-secundaria" />
      </Link>
    </li>
  );
}

function Section({
  section,
  label,
  dates,
}: {
  section: DeskSection;
  label: string;
  dates: DateLabels;
}) {
  const id = `mesa-${section.key}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={id} className="titulo-seccion flex items-center gap-2">
          {label}
          <span className="etiqueta-corta rounded-full bg-relleno px-2 py-0.5 text-tinta-secundaria tabular-nums">
            {section.total}
          </span>
        </h2>
        {section.href && section.total > section.items.length ? (
          <Link
            href={section.href}
            className="text-secundario text-enlace underline underline-offset-4"
          >
            {t("T-4869", { n: section.total })}
          </Link>
        ) : null}
      </div>
      <ul className="flex list-none flex-col p-0">
        {section.items.map((item) => (
          <ItemRow key={item.id} item={item} dates={dates} />
        ))}
      </ul>
    </section>
  );
}

export default async function DeskPage() {
  const desk = await loadDesk();
  const labels = tLabels("T-4866", DESK_SECTIONS);
  const dates = tLabels("T-4871", DESK_DATE_KINDS);
  const [emptyTitle, emptyDescription] = tList("T-4868");
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="admin-page-header">
        <div>
          <h1>{t("T-4864")}</h1>
          <p className="text-secundario text-tinta-secundaria">{t("T-4865")}</p>
        </div>
      </header>
      {desk.sections.length === 0 ? (
        <EmptyState
          tone="exito"
          icon={<CircleCheckIcon size={20} />}
          title={emptyTitle}
          titleAs="h2"
          description={emptyDescription}
        />
      ) : (
        desk.sections.map((section) => (
          <Section key={section.key} section={section} label={labels[section.key]} dates={dates} />
        ))
      )}
    </div>
  );
}
