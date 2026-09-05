import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getOrganization,
  listContacts,
  listOrganizationInteractions,
  listOrganizationTagIds,
  listTasks,
  ORGANIZATION_KINDS,
} from "@/modules/crm";
import { assigneeOptions } from "@/modules/crm/admin";
import { requireAdminActor } from "@/modules/identity";
import { listAllTags, searchPeople } from "@/modules/people";
import { ResourcePanel } from "@/shared/admin-kit";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { Markdown } from "@/shared/ui/Markdown";
import { Campo, Casilla, inputClass } from "../../personas/[id]/_ui/campos";
import {
  addNoteAction,
  createContactAction,
  createTaskAction,
  linkContactAction,
  removeContactAction,
  setPrimaryAction,
  setTagsAction,
} from "./actions";

// Detalle de una organización (ADR-037 regla 6): contactos externos (alta o vínculo, rol, principal),
// línea de tiempo con notas, tareas, etiquetas y tarjetas de patrocinio (las tarjetas llegan en el
// tramo 4). Paneles por URL (?accion=contacto|vincular|nota|tarea|etiquetas).

const ID = /^[a-z0-9-]{10,40}$/;

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export async function generateMetadata({
  params,
}: PageProps<"/admin/organizaciones/[id]">): Promise<Metadata> {
  const { id } = await params;
  const organization = ID.test(id) ? await getOrganization(id) : null;
  return { title: organization?.name ?? tList("T-947")[1] };
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/admin/organizaciones/[id]">) {
  const { id } = await params;
  await requireAdminActor(`/admin/organizaciones/${id}`);
  const organization = ID.test(id) ? await getOrganization(id) : null;
  if (!organization) {
    notFound();
  }
  const search: Search = await searchParams;
  const accion = single(search.accion);
  const guardado = single(search.guardado) === "1";
  const error = single(search.error);
  const q = single(search.q).trim();
  const [contacts, interactions, tasks, tagIds, tags, assignees, candidates] = await Promise.all([
    listContacts(id),
    listOrganizationInteractions(id),
    listTasks({ q: "", organizationId: id, page: 1, pageSize: 50 }),
    listOrganizationTagIds(id),
    listAllTags(),
    accion === "tarea" ? assigneeOptions() : Promise.resolve([]),
    accion === "vincular" && q ? searchPeople(q) : Promise.resolve([]),
  ]);
  const kindLabels = tList("T-949");
  const [bContactos, bLinea, bTareas, bTarjetas, bEtiquetas] = tList("T-951");
  const [cPersona, cRol, cPrincipal] = tList("T-952");
  const [aNombre, aApellido, aCorreo, aCelular, aRol, aPrincipal] = tList("T-953");
  const [agregarContacto, vincularPersona, quitar] = tList("T-954");
  const [tTitulo, tResponsable, tVence] = tList("T-459");
  const base = `/admin/organizaciones/${id}`;
  const closeHref = base;
  const panelTitle =
    accion === "contacto"
      ? agregarContacto
      : accion === "vincular"
        ? vincularPersona
        : accion === "nota"
          ? tList("T-456")[0]
          : accion === "tarea"
            ? t("T-251")
            : accion === "etiquetas"
              ? (bEtiquetas ?? "")
              : "";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display-lg">{organization.name}</h1>
          <Insignia fondo="sky">
            {kindLabels[ORGANIZATION_KINDS.indexOf(organization.kind)] ?? organization.kind}
          </Insignia>
          {organization.tagNames.map((tag) => (
            <Insignia key={tag} fondo="paper">
              {tag}
            </Insignia>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {organization.website ? (
            <a
              href={organization.website}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {organization.website}
            </a>
          ) : null}
          <Link href={`/admin/organizaciones?editar=${organization.id}`} className="underline">
            {t("T-252")}
          </Link>
          <Link href={`${base}?accion=etiquetas`} className="underline">
            {bEtiquetas}
          </Link>
          <Link href="/admin/organizaciones" className="underline">
            {tList("T-947")[1]}
          </Link>
        </div>
        {guardado ? (
          <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
            {t("T-259")}
          </output>
        ) : null}
        {error && !accion ? (
          <p
            role="alert"
            className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
          >
            {error}
          </p>
        ) : null}
        {organization.notes.trim() ? <Markdown source={organization.notes} /> : null}
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="contactos" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="contactos" className="text-display-md">
              {bContactos} · {contacts.length}
            </h2>
            <div className="flex gap-2">
              <Link
                href={`${base}?accion=contacto`}
                className="boton-calido min-h-10 px-4 py-2 text-sm"
              >
                {agregarContacto}
              </Link>
              <Link
                href={`${base}?accion=vincular`}
                className="boton-secundario min-h-10 px-4 py-2 text-sm"
              >
                {vincularPersona}
              </Link>
            </div>
          </div>
          {contacts.length === 0 ? (
            <p className="text-tinta-suave">{t("T-955")}</p>
          ) : (
            <ul className="flex list-none flex-col gap-3 p-0">
              {contacts.map((contact) => (
                <li
                  key={contact.id}
                  className="flex flex-col gap-2 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/personas/${contact.personId}`}
                        className="font-semibold underline"
                      >
                        {contact.fullName}
                      </Link>
                      {contact.isPrimary ? (
                        <Insignia fondo="amarillo">{t("T-958")}</Insignia>
                      ) : null}
                    </div>
                    <p className="text-sm text-tinta-suave">
                      {contact.email}
                      {contact.role ? ` · ${contact.role}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {contact.isPrimary ? null : (
                      <form action={setPrimaryAction}>
                        <input type="hidden" name="organizationId" value={id} />
                        <input type="hidden" name="personId" value={contact.personId} />
                        <button
                          type="submit"
                          className="boton-secundario min-h-9 px-3 py-1 text-sm"
                        >
                          {t("T-958")}
                        </button>
                      </form>
                    )}
                    <form action={removeContactAction}>
                      <input type="hidden" name="organizationId" value={id} />
                      <input type="hidden" name="personId" value={contact.personId} />
                      <button type="submit" className="boton-secundario min-h-9 px-3 py-1 text-sm">
                        {quitar}
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="linea" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="linea" className="text-display-md">
              {bLinea}
            </h2>
            <Link
              href={`${base}?accion=nota`}
              className="boton-secundario min-h-10 px-4 py-2 text-sm"
            >
              {tList("T-456")[0]}
            </Link>
          </div>
          {interactions.length === 0 ? (
            <p className="text-tinta-suave">{t("T-960")}</p>
          ) : (
            <ol className="flex list-none flex-col gap-3 p-0">
              {interactions.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-1 border-borde border-t pt-3 first:border-t-0 first:pt-0"
                >
                  <p className="font-semibold">{item.summary}</p>
                  {item.body ? <p className="whitespace-pre-line text-sm">{item.body}</p> : null}
                  <p className="text-xs text-tinta-suave">
                    {formatDateTime(item.occurredAt)}
                    {item.actorName ? ` · ${item.actorName}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="tareas" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="tareas" className="text-display-md">
              {bTareas}
            </h2>
            <Link
              href={`${base}?accion=tarea`}
              className="boton-secundario min-h-10 px-4 py-2 text-sm"
            >
              {t("T-251")}
            </Link>
          </div>
          {tasks.rows.length === 0 ? (
            <p className="text-tinta-suave">{t("T-1059")}</p>
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {tasks.rows.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span
                    className={
                      task.status === "DONE" ? "text-tinta-suave line-through" : "font-semibold"
                    }
                  >
                    {task.title}
                  </span>
                  <span className="text-tinta-suave">
                    {task.assigneeName ?? tList("T-463")[1]}
                    {task.dueAt ? ` · ${formatDateTime(task.dueAt)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="tarjetas" className="flex flex-col gap-4">
          <h2 id="tarjetas" className="text-display-md">
            {bTarjetas}
          </h2>
          <p className="text-tinta-suave">{t("T-959")}</p>
        </section>
      </div>

      {accion ? (
        <ResourcePanel title={panelTitle ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
            >
              {error}
            </p>
          ) : null}
          {accion === "contacto" ? (
            <form action={createContactAction} className="flex flex-col gap-4">
              <input type="hidden" name="organizationId" value={id} />
              <Campo id="c-firstName" label={aNombre ?? ""}>
                <input id="c-firstName" name="firstName" required className={inputClass} />
              </Campo>
              <Campo id="c-lastName" label={aApellido ?? ""}>
                <input id="c-lastName" name="lastName" required className={inputClass} />
              </Campo>
              <Campo id="c-email" label={aCorreo ?? ""}>
                <input id="c-email" name="email" type="email" required className={inputClass} />
              </Campo>
              <Campo id="c-phone" label={aCelular ?? ""}>
                <input id="c-phone" name="phone" type="tel" className={inputClass} />
              </Campo>
              <Campo id="c-role" label={aRol ?? ""}>
                <input id="c-role" name="role" className={inputClass} />
              </Campo>
              <Casilla id="c-primary" name="isPrimary" label={aPrincipal ?? ""} />
              <button type="submit" className="boton-calido self-start">
                {t("T-253")}
              </button>
            </form>
          ) : null}
          {accion === "vincular" ? (
            <div className="flex flex-col gap-4">
              <form action={base} method="get" className="flex flex-col gap-2">
                <input type="hidden" name="accion" value="vincular" />
                <Campo id="v-q" label={cPersona ?? ""}>
                  <input id="v-q" name="q" type="search" defaultValue={q} className={inputClass} />
                </Campo>
                <button type="submit" className="boton-secundario self-start">
                  {t("T-250")}
                </button>
              </form>
              {q && candidates.length === 0 ? (
                <p className="text-tinta-suave">{t("T-256")}</p>
              ) : null}
              <ul className="flex list-none flex-col gap-3 p-0">
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <form
                      action={linkContactAction}
                      className="flex flex-col gap-2 rounded-xl border border-borde p-3"
                    >
                      <input type="hidden" name="organizationId" value={id} />
                      <input type="hidden" name="personId" value={candidate.id} />
                      <p className="font-semibold">{candidate.fullName}</p>
                      <p className="text-xs text-tinta-suave">{candidate.email}</p>
                      <Campo id={`v-role-${candidate.id}`} label={cRol ?? ""}>
                        <input id={`v-role-${candidate.id}`} name="role" className={inputClass} />
                      </Campo>
                      <Casilla
                        id={`v-primary-${candidate.id}`}
                        name="isPrimary"
                        label={cPrincipal ?? ""}
                      />
                      <button type="submit" className="boton-calido self-start">
                        {vincularPersona}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {accion === "nota" ? (
            <form action={addNoteAction} className="flex flex-col gap-4">
              <input type="hidden" name="organizationId" value={id} />
              <Campo id="n-body" label={tList("T-456")[0] ?? ""} help={t("T-455")}>
                <textarea id="n-body" name="body" rows={6} required className={inputClass} />
              </Campo>
              <button type="submit" className="boton-calido self-start">
                {tList("T-456")[0]}
              </button>
            </form>
          ) : null}
          {accion === "tarea" ? (
            <form action={createTaskAction} className="flex flex-col gap-4">
              <input type="hidden" name="organizationId" value={id} />
              <Campo id="t-title" label={tTitulo ?? ""}>
                <input id="t-title" name="title" required className={inputClass} />
              </Campo>
              <Campo id="t-assignee" label={tResponsable ?? ""}>
                <select id="t-assignee" name="assigneeId" className={inputClass} defaultValue="">
                  <option value="">—</option>
                  {assignees.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="t-due" label={tVence ?? ""}>
                <input id="t-due" name="dueAt" type="datetime-local" className={inputClass} />
              </Campo>
              <button type="submit" className="boton-calido self-start">
                {t("T-253")}
              </button>
            </form>
          ) : null}
          {accion === "etiquetas" ? (
            <form action={setTagsAction} className="flex flex-col gap-4">
              <input type="hidden" name="organizationId" value={id} />
              <Campo id="e-tags" label={bEtiquetas ?? ""}>
                <select
                  id="e-tags"
                  name="tagIds"
                  multiple
                  defaultValue={tagIds}
                  size={Math.min(8, Math.max(2, tags.length))}
                  className={inputClass}
                >
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </Campo>
              <button type="submit" className="boton-calido self-start">
                {t("T-253")}
              </button>
            </form>
          ) : null}
        </ResourcePanel>
      ) : null}
    </div>
  );
}
