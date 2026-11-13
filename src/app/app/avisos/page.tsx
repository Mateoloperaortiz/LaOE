import type { Metadata } from "next";
import { single } from "@/app/_lib/search";
import { INBOX_FILTER_KEYS, type InboxFilter, kindFilter, listInbox } from "@/modules/comms";
import { requireActor } from "@/modules/identity";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { BellIcon } from "@/shared/ui/icons/BellIcon";
import { EmptyState } from "@/shared/ui/States";
import { markAllReadAction, openInboxItemAction } from "./actions";

// El centro de avisos (ADR-166): lo que le llegó a la persona en los últimos 90 días, del más nuevo al
// más viejo, con filtros por tipo. Abrir un aviso lo marca leído y lleva a su enlace, si lo tiene.

export const metadata: Metadata = { title: tList("T-4884")[0] };

export default async function InboxPage({ searchParams }: PageProps<"/app/avisos">) {
  const actor = await requireActor("/app/avisos");
  const search = await searchParams;
  const requested = single(search.tipo);
  const filter = (INBOX_FILTER_KEYS as readonly string[]).includes(requested)
    ? (requested as InboxFilter)
    : null;
  const items = await listInbox(actor.personId, filter);
  const [title, description] = tList("T-4884");
  const filters = tLabels("T-4886", INBOX_FILTER_KEYS);
  const [allLabel, markAll, unreadLabel] = tList("T-4887");
  const [emptyTitle, emptyText] = tList("T-4888");
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="titulo-pantalla">{title}</h1>
          <p className="text-secundario text-tinta-secundaria">{description}</p>
        </div>
        {items.some((item) => !item.readAt) ? (
          <ActionForm action={markAllReadAction}>
            <button type="submit" className="boton-secundario">
              {markAll}
            </button>
          </ActionForm>
        ) : null}
      </header>
      <nav aria-label={t("T-4885")} className="flex flex-wrap gap-2">
        {[null, ...INBOX_FILTER_KEYS].map((key) => {
          const current = key === filter;
          return (
            <Link
              key={key ?? "todos"}
              href={key ? `/app/avisos?tipo=${key}` : "/app/avisos"}
              aria-current={current ? "page" : undefined}
              className={`rounded-full px-3 py-1.5 text-secundario font-semibold no-underline ${current ? "bg-accion text-accion-tinta" : "bg-relleno text-titulo"}`}
            >
              {key ? filters[key] : allLabel}
            </Link>
          );
        })}
      </nav>
      {items.length === 0 ? (
        <EmptyState
          icon={<BellIcon size={20} />}
          title={emptyTitle}
          titleAs="h2"
          description={emptyText}
        />
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0">
          {items.map((item) => (
            <li key={item.id} id={`aviso-${item.id}`}>
              <ActionForm action={openInboxItemAction}>
                <input type="hidden" name="id" value={item.id} />
                <button
                  type="submit"
                  className="flex w-full flex-col items-start gap-1 rounded-tarjeta border border-superficie-borde bg-superficie p-4 text-left sombra-flota hover:bg-relleno"
                >
                  <span className="flex w-full items-start justify-between gap-3">
                    <span className={item.readAt ? "text-titulo" : "font-semibold text-titulo"}>
                      {item.readAt ? null : <span className="sr-only">{unreadLabel}: </span>}
                      {item.title}
                    </span>
                    {item.readAt ? null : (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-accion"
                      />
                    )}
                  </span>
                  {item.body ? (
                    <span className="line-clamp-3 text-secundario text-tinta-secundaria">
                      {item.body}
                    </span>
                  ) : null}
                  <span className="text-[0.75rem] text-tinta-secundaria">
                    {filters[kindFilter(item.kind)]} · {formatDateTime(item.createdAt)}
                  </span>
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
