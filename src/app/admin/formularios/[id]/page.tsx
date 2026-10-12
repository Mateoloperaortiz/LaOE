import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { single } from "@/app/_lib/search";
import { listPipelineOptions } from "@/modules/crm";
import { listEditionOptions } from "@/modules/events";
import { FIELD_TYPES, type FormField, getFormView } from "@/modules/forms";
import { requireAdminActor } from "@/modules/identity";
import { listAllTags } from "@/modules/people";
import { ResourcePanel } from "@/shared/admin-kit";
import { Bloque, Campo, Casilla, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminMultiSelect } from "@/shared/admin-kit/AdminMultiSelect";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { deleteFieldAction, moveFieldAction, saveActionsAction, saveFieldAction } from "./actions";

// Constructor de un formulario (ADR-037 regla 3): campos tipados con orden y panel por URL, acciones
// de cada respuesta y enlace público. Los datos generales se editan en el listado del kit.

const ID = /^[a-z0-9-]{10,40}$/;

type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: PageProps<"/admin/formularios/[id]">): Promise<Metadata> {
  const { id } = await params;
  const view = ID.test(id) ? await getFormView(id) : null;
  return { title: view ? view.title : tList("T-909")[1] };
}

export default async function Page({ params, searchParams }: PageProps<"/admin/formularios/[id]">) {
  const { id } = await params;
  await requireAdminActor(`/admin/formularios/${id}`);
  const view = ID.test(id) ? await getFormView(id) : null;
  if (!view) {
    notFound();
  }
  const search: Search = await searchParams;
  const campo = single(search.campo);
  const guardado = single(search.guardado);
  const error = single(search.error);
  const [publico, miembros] = tList("T-911");
  const [borrador, abierto, cerrado] = tList("T-912");
  const [enlacePublico, verComoLaGente] = tList("T-920");
  const [clave, etiqueta, tipo, obligatorio, ayuda, opciones] = tList("T-923");
  const tipos = tLabels("T-924", FIELD_TYPES);
  const [subir, bajar, borrar] = tList("T-929");
  const [crearPersona, entrarPipeline, inscribirEdicion, etiquetarCon] = tList("T-930");
  const [ninguno, ninguna] = tList("T-932");
  const [camposGuardados, accionesGuardadas] = tList("T-933");
  const [pipelines, editions, tags] = await Promise.all([
    listPipelineOptions(),
    listEditionOptions(),
    listAllTags(),
  ]);
  const editing: FormField | null =
    campo && campo !== "nuevo"
      ? (view.parsedFields.find((item) => item.key === campo) ?? null)
      : null;
  const closeHref = `/admin/formularios/${view.id}`;
  const estado = view.status === "OPEN" ? abierto : view.status === "CLOSED" ? cerrado : borrador;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display-lg">{view.title}</h1>
          <Insignia
            fondo={view.status === "OPEN" ? "amarillo" : view.status === "CLOSED" ? "paper" : "sky"}
          >
            {estado}
          </Insignia>
          <Insignia fondo="sky">{view.audience === "PUBLIC" ? publico : miembros}</Insignia>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>
            {enlacePublico}: <code>/f/{view.slug}</code>
          </span>
          <a
            href={`/f/${view.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {verComoLaGente}
          </a>
          <Link href={`/admin/formularios?editar=${view.id}`} className="underline">
            {t("T-252")}
          </Link>
          <Link href={`/admin/formularios/${view.id}/respuestas`} className="underline">
            {tList("T-910")[11]} ({view.submissionCount})
          </Link>
        </div>
      </header>
      {guardado ? (
        <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
          {guardado === "campos" ? camposGuardados : accionesGuardadas}
        </output>
      ) : null}
      {error && !campo ? (
        <p
          role="alert"
          className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
        >
          {error}
        </p>
      ) : null}

      <section aria-labelledby="campos" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="campos" className="text-display-md">
            {t("T-918")}
          </h2>
          <Link
            href={`${closeHref}?campo=nuevo`}
            className="boton-calido min-h-10 px-4 py-2 text-sm"
          >
            {t("T-922")}
          </Link>
        </div>
        {view.parsedFields.length === 0 ? (
          <p className="text-tinta-suave">{t("T-921")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-data-table w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-borde">
                  <th scope="col" className="py-2 pr-4">
                    {etiqueta}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {clave}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {tipo}
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    {obligatorio}
                  </th>
                  <th scope="col" className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {view.parsedFields.map((field, index) => (
                  <tr key={field.key} className="border-b border-borde">
                    <td data-label={etiqueta} className="py-2 pr-4 font-semibold">
                      <Link href={`${closeHref}?campo=${field.key}`} className="underline">
                        {field.label}
                      </Link>
                    </td>
                    <td data-label={clave} className="py-2 pr-4">
                      <code>{field.key}</code>
                    </td>
                    <td data-label={tipo} className="py-2 pr-4">
                      {tipos[field.type] ?? field.type}
                    </td>
                    <td data-label={obligatorio} className="py-2 pr-4">
                      {field.required ? tList("T-1058")[0] : tList("T-1058")[1]}
                    </td>
                    <td data-label={t("T-1500")} className="py-2 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {index > 0 ? (
                          <form action={moveFieldAction}>
                            <AdminFormBody>
                              <input type="hidden" name="formId" value={view.id} />
                              <input type="hidden" name="key" value={field.key} />
                              <input type="hidden" name="direction" value="up" />
                              <AdminSubmitButton
                                type="submit"
                                className="boton-secundario min-h-9 px-3 py-1 text-sm"
                              >
                                {subir}
                              </AdminSubmitButton>
                            </AdminFormBody>
                          </form>
                        ) : null}
                        {index < view.parsedFields.length - 1 ? (
                          <form action={moveFieldAction}>
                            <AdminFormBody>
                              <input type="hidden" name="formId" value={view.id} />
                              <input type="hidden" name="key" value={field.key} />
                              <input type="hidden" name="direction" value="down" />
                              <AdminSubmitButton
                                type="submit"
                                className="boton-secundario min-h-9 px-3 py-1 text-sm"
                              >
                                {bajar}
                              </AdminSubmitButton>
                            </AdminFormBody>
                          </form>
                        ) : null}
                        <form action={deleteFieldAction}>
                          <AdminFormBody>
                            <input type="hidden" name="formId" value={view.id} />
                            <input type="hidden" name="key" value={field.key} />
                            <AdminSubmitButton
                              type="submit"
                              className="boton-secundario min-h-9 px-3 py-1 text-sm"
                            >
                              {borrar}
                            </AdminSubmitButton>
                          </AdminFormBody>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-tinta-suave">{t("T-928")}</p>
      </section>

      <section aria-labelledby="acciones" className="flex flex-col gap-4">
        <h2 id="acciones" className="text-display-md">
          {t("T-919")}
        </h2>
        <Bloque titulo={t("T-919")}>
          <form action={saveActionsAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="formId" value={view.id} />
              <Casilla
                id="createPerson"
                name="createPerson"
                label={crearPersona ?? ""}
                defaultChecked={view.parsedActions.createPerson}
              />
              <Campo id="pipelineId" label={entrarPipeline ?? ""}>
                <select
                  id="pipelineId"
                  name="pipelineId"
                  defaultValue={view.parsedActions.pipelineId ?? ""}
                  className={inputClass}
                >
                  <option value="">{ninguno}</option>
                  {pipelines.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="editionId" label={inscribirEdicion ?? ""}>
                <select
                  id="editionId"
                  name="editionId"
                  defaultValue={view.parsedActions.editionId ?? ""}
                  className={inputClass}
                >
                  <option value="">{ninguna}</option>
                  {editions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <AdminMultiSelect
                name="tagIds"
                label={etiquetarCon ?? ""}
                options={tags.map((item) => ({ value: item.id, label: item.name }))}
                defaultValue={view.parsedActions.tagIds}
              />
              <p className="text-sm text-tinta-suave">{t("T-931")}</p>
              <AdminSubmitButton type="submit" className="boton-calido self-start">
                {t("T-253")}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
        </Bloque>
      </section>

      {campo ? (
        <ResourcePanel
          title={editing ? `${t("T-252")} · ${editing.label}` : t("T-922")}
          closeHref={closeHref}
          closeLabel={t("T-291")}
        >
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
            >
              {error}
            </p>
          ) : null}
          <form action={saveFieldAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="formId" value={view.id} />
              <input type="hidden" name="originalKey" value={editing?.key ?? ""} />
              <Campo id="campo-key" label={clave ?? ""} help={t("T-925")}>
                <input
                  id="campo-key"
                  name="key"
                  required
                  defaultValue={editing?.key ?? ""}
                  pattern="[a-z0-9_]{1,40}"
                  className={inputClass}
                />
              </Campo>
              <Campo id="campo-label" label={etiqueta ?? ""}>
                <input
                  id="campo-label"
                  name="label"
                  required
                  maxLength={120}
                  defaultValue={editing?.label ?? ""}
                  className={inputClass}
                />
              </Campo>
              <Campo id="campo-type" label={tipo ?? ""}>
                <select
                  id="campo-type"
                  name="type"
                  defaultValue={editing?.type ?? "TEXT"}
                  className={inputClass}
                >
                  {FIELD_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {tipos[value] ?? value}
                    </option>
                  ))}
                </select>
              </Campo>
              <Casilla
                id="campo-required"
                name="required"
                label={obligatorio ?? ""}
                defaultChecked={editing?.required ?? false}
              />
              <Campo id="campo-help" label={ayuda ?? ""}>
                <input
                  id="campo-help"
                  name="help"
                  maxLength={200}
                  defaultValue={editing?.help ?? ""}
                  className={inputClass}
                />
              </Campo>
              <Campo id="campo-options" label={opciones ?? ""} help={t("T-927")}>
                <textarea
                  id="campo-options"
                  name="options"
                  rows={5}
                  defaultValue={(editing?.options ?? []).join("\n")}
                  className={inputClass}
                />
              </Campo>
              <div className="flex gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {t("T-253")}
                </AdminSubmitButton>
                <Link href={closeHref} className="boton-secundario">
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
