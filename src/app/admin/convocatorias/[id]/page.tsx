import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { single } from "@/app/_lib/search";
import {
  CALL_ENTRY_STATUSES,
  CALL_SELECTIONS,
  CALL_STATUSES,
  getCall,
  listCallEntries,
} from "@/modules/crm";
import { getFormView } from "@/modules/forms";
import { getGroup } from "@/modules/permanence";
import { Campo, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { Markdown } from "@/shared/ui/Markdown";
import { requireGroupOperator } from "../../permanencia/authz";
import { decideEntryAction, setStatusAction } from "./actions";

// Detalle de una convocatoria interna (06-mapa-del-sitio.md, ADR-037 regla 10): inscritos por estado
// con aceptar, rechazar y promover desde la lista de espera; abrir y cerrar. Lo opera el líder del
// grupo o ADMIN.

const ID = /^[a-z0-9-]{10,40}$/;

type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: PageProps<"/admin/convocatorias/[id]">): Promise<Metadata> {
  const { id } = await params;
  const call = ID.test(id) ? await getCall(id) : null;
  return { title: call?.title ?? tList("T-1016")[1] };
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/admin/convocatorias/[id]">) {
  const { id } = await params;
  const call = ID.test(id) ? await getCall(id) : null;
  if (!call) {
    notFound();
  }
  const base = `/admin/convocatorias/${id}`;
  const { isAdmin } = await requireGroupOperator(call.groupId, base);
  const search: Search = await searchParams;
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const decidida = single(search.decidida);
  const [group, entries, form] = await Promise.all([
    getGroup(call.groupId),
    listCallEntries(id),
    call.formId ? getFormView(call.formId) : Promise.resolve(null),
  ]);
  const [tInscritos, tAceptados, tEspera, tPendientes, tNoAceptados] = tList("T-1022");
  const [aceptar, rechazar, promover] = tList("T-1023");
  const entryLabels = tList("T-899");
  const [abrir, cerrar] = tList("T-1020");
  const selectionLabels = tList("T-1018");
  const statusLabels = tList("T-1019");
  const [porOrden, manual] = tList("T-905");
  const accepted = entries.filter((entry) => entry.status === "ACCEPTED");
  const sections: Array<{ title: string; status: (typeof CALL_ENTRY_STATUSES)[number] }> = [
    { title: tPendientes ?? "", status: "APPLIED" },
    { title: tEspera ?? "", status: "WAITLISTED" },
    { title: tAceptados ?? "", status: "ACCEPTED" },
    { title: tNoAceptados ?? "", status: "REJECTED" },
  ];
  const room = call.capacity === null || accepted.length < call.capacity;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display-lg">{call.title}</h1>
          <Insignia
            fondo={call.status === "OPEN" ? "amarillo" : call.status === "CLOSED" ? "paper" : "sky"}
          >
            {statusLabels[CALL_STATUSES.indexOf(call.status)] ?? call.status}
          </Insignia>
          <Insignia fondo="sky">
            {selectionLabels[CALL_SELECTIONS.indexOf(call.selection)] ?? call.selection}
          </Insignia>
        </div>
        <p className="text-tinta-suave">
          {group ? (
            <Link href={`/admin/permanencia/grupos/${group.id}`} className="underline">
              {group.name}
            </Link>
          ) : null}
          {" · "}
          {formatDateTime(call.opensAt)} → {formatDateTime(call.closesAt)}
          {call.capacity !== null
            ? ` · ${t("T-1027", { aceptados: accepted.length, cupo: call.capacity })}`
            : ""}
        </p>
        <p className="text-sm">{call.selection === "FIRST_COME" ? porOrden : manual}</p>
        {call.description.trim() ? <Markdown source={call.description} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <form action={setStatusAction}>
            <AdminFormBody>
              <input type="hidden" name="callId" value={id} />
              <input
                type="hidden"
                name="status"
                value={call.status === "OPEN" ? "CLOSED" : "OPEN"}
              />
              <AdminSubmitButton
                type="submit"
                className="boton-secundario min-h-10 px-4 py-2 text-sm"
              >
                {call.status === "OPEN" ? cerrar : abrir}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
          {isAdmin ? (
            <Link href={`/admin/convocatorias?editar=${id}`} className="text-sm underline">
              {t("T-252")}
            </Link>
          ) : null}
          {isAdmin ? (
            <Link href="/admin/convocatorias" className="text-sm underline">
              {tList("T-1016")[1]}
            </Link>
          ) : null}
        </div>
        {guardado || decidida ? (
          <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
            {decidida
              ? t("T-1025", {
                  estado: (
                    entryLabels[CALL_ENTRY_STATUSES.indexOf(decidida as "ACCEPTED")] ?? ""
                  ).toLowerCase(),
                })
              : t("T-259")}
          </output>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
          >
            {error}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="inscritos" className="flex flex-col gap-6">
        <h2 id="inscritos" className="text-display-md">
          {tInscritos} · {entries.length}
        </h2>
        <nav aria-label={tInscritos ?? ""} className="flex flex-wrap gap-2">
          {sections
            .filter((section) => entries.some((entry) => entry.status === section.status))
            .map((section) => (
              <a
                key={section.status}
                href={`#entries-${section.status}`}
                className="rounded-lg border border-borde px-3 py-2 text-sm font-medium"
              >
                {section.title} ·{" "}
                {entries.filter((entry) => entry.status === section.status).length}
              </a>
            ))}
        </nav>
        {entries.length === 0 ? <p className="text-tinta-suave">{t("T-1026")}</p> : null}
        {sections.map((section) => {
          const rows = entries.filter((entry) => entry.status === section.status);
          if (rows.length === 0) return null;
          return (
            <div
              key={section.status}
              id={`entries-${section.status}`}
              className="flex scroll-mt-24 flex-col gap-3"
            >
              <h3 className="eyebrow text-xs">
                {section.title} · {rows.length}
              </h3>
              <ul className="flex list-none flex-col gap-3 p-0">
                {rows.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-semibold">{entry.fullName}</span>
                        <span className="text-xs text-tinta-suave">
                          {isAdmin ? `${entry.email} · ` : ""}
                          {formatDateTime(entry.createdAt)}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </span>
                      </div>
                      <Insignia
                        fondo={
                          entry.status === "ACCEPTED"
                            ? "amarillo"
                            : entry.status === "REJECTED"
                              ? "naranja"
                              : entry.status === "WAITLISTED"
                                ? "paper"
                                : "sky"
                        }
                      >
                        {entryLabels[CALL_ENTRY_STATUSES.indexOf(entry.status)] ?? entry.status}
                      </Insignia>
                    </div>
                    {form && entry.answers ? (
                      <dl className="grid gap-1 text-sm">
                        {form.parsedFields.map((field) => {
                          const value = entry.answers?.[field.key];
                          return (
                            <div key={field.key} className="flex flex-wrap gap-2">
                              <dt className="text-tinta-suave">{field.label}:</dt>
                              <dd className="font-semibold">
                                {Array.isArray(value)
                                  ? value.join(", ")
                                  : typeof value === "boolean"
                                    ? (tList("T-1058")[value ? 0 : 1] ?? "")
                                    : typeof value === "string" || typeof value === "number"
                                      ? String(value)
                                      : "—"}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    ) : null}
                    <form action={decideEntryAction} className="flex flex-wrap items-end gap-2">
                      <AdminFormBody>
                        <input type="hidden" name="callId" value={id} />
                        <input type="hidden" name="entryId" value={entry.id} />
                        <Campo id={`nota-${entry.id}`} label={t("T-1031")}>
                          <input
                            id={`nota-${entry.id}`}
                            name="note"
                            defaultValue={entry.note ?? ""}
                            className={inputClass}
                          />
                        </Campo>
                        {entry.status !== "ACCEPTED" ? (
                          <AdminSubmitButton
                            type="submit"
                            name="status"
                            value="ACCEPTED"
                            className="boton-calido min-h-10 px-4 py-2 text-sm"
                            disabled={!room}
                          >
                            {entry.status === "WAITLISTED" ? promover : aceptar}
                          </AdminSubmitButton>
                        ) : null}
                        {entry.status !== "REJECTED" ? (
                          <AdminSubmitButton
                            type="submit"
                            name="status"
                            value="REJECTED"
                            className="boton-secundario min-h-10 px-4 py-2 text-sm"
                          >
                            {rechazar}
                          </AdminSubmitButton>
                        ) : null}
                      </AdminFormBody>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!room ? <p className="text-sm text-tinta-suave">{t("T-1024")}</p> : null}
      </section>
    </div>
  );
}
