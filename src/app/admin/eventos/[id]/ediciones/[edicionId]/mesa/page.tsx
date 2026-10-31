import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { single } from "@/app/_lib/search";
import { getEdition } from "@/modules/events";
import { requireAdminActor } from "@/modules/identity";
import { listActiveMemberRefs, listMacroeventBoard, listMacroeventRoles } from "@/modules/people";
import { Campo, Casilla, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { addDirectorAction, removeDirectorAction } from "./actions";

// Mesa directiva de una edición de macroevento (ADR-060 regla 9): la elige la Asamblea; ADMIN registra
// aquí el resultado con un titular y una codirección por cargo del catálogo.

const ID = /^[a-z0-9-]{10,40}$/;

type Search = Record<string, string | string[] | undefined>;

/** Los errores llegan como el código T-260 (validación) o como el texto del dominio. */
function errorText(value: string): string {
  return value === "T-260" ? t("T-260") : value;
}

export async function generateMetadata({
  params,
}: PageProps<"/admin/eventos/[id]/ediciones/[edicionId]/mesa">): Promise<Metadata> {
  const { edicionId } = await params;
  const edicion = ID.test(edicionId) ? await getEdition(edicionId) : null;
  return { title: edicion ? `${t("T-2266")} · ${edicion.name}` : t("T-2266") };
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/admin/eventos/[id]/ediciones/[edicionId]/mesa">) {
  const { id, edicionId } = await params;
  const edicion = ID.test(edicionId) ? await getEdition(edicionId) : null;
  if (!edicion || edicion.eventId !== id) {
    notFound();
  }
  const base = `/admin/eventos/${id}/ediciones/${edicion.id}/mesa`;
  await requireAdminActor(base);
  const search: Search = await searchParams;
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const [board, roles, members] = await Promise.all([
    listMacroeventBoard(edicion.id),
    listMacroeventRoles(edicion.eventSlug),
    listActiveMemberRefs(),
  ]);
  const activos = members
    .filter((member) => !member.anonymized)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
  const [cargo, persona, agregar, quitar] = tList("T-2270");
  const [excepcion, excepcionAyuda] = tList("T-2283");
  const titulo = t("T-2266");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href={`/admin/eventos/${id}/ediciones`} className="text-sm underline">
          {t("T-318", { evento: edicion.eventName })}
        </Link>
        <h1 className="text-display-lg">
          {titulo} · {edicion.eventName} · {edicion.name}
        </h1>
        <p className="text-sm text-tinta-suave">{formatDateTime(edicion.startsAt)}</p>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2267")}</p>
      </header>
      {error ? (
        <p role="alert" className="rounded-xl border-2 border-oe-orange px-4 py-2 text-sm">
          {errorText(error)}
        </p>
      ) : null}
      {guardado ? (
        <output className="block rounded-xl border-2 border-borde px-4 py-2 text-sm">
          {t("T-2273")}
        </output>
      ) : null}
      {board.length === 0 ? (
        <p className="text-tinta-suave">{t("T-2272")}</p>
      ) : (
        <AdminTableRegion
          label={titulo}
          className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde"
        >
          <table className="admin-data-table w-full text-left text-sm">
            <thead className="eyebrow bg-fondo-suave text-xs">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {cargo}
                </th>
                <th scope="col" className="px-3 py-2">
                  {persona}
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">{quitar}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {board.map((row) => (
                <tr key={row.id} className="border-t border-borde">
                  <td className="px-3 py-2">
                    {row.roleLabel}{" "}
                    {row.coDirector ? <Insignia fondo="paper">{t("T-2153")}</Insignia> : null}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/personas/${row.personId}`} className="underline">
                      {row.fullName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <ActionForm action={removeDirectorAction}>
                      <AdminFormBody>
                        <input type="hidden" name="eventId" value={id} />
                        <input type="hidden" name="editionId" value={edicion.id} />
                        <input type="hidden" name="appointmentId" value={row.id} />
                        <AdminSubmitButton
                          type="submit"
                          className="boton-secundario min-h-8 px-3 py-1 text-xs"
                        >
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
      <ActionForm action={addDirectorAction} className="flex max-w-xl flex-col gap-4">
        <AdminFormBody>
          <input type="hidden" name="eventId" value={id} />
          <input type="hidden" name="editionId" value={edicion.id} />
          <Campo id="mesa-roleCode" label={cargo ?? ""}>
            <select
              id="mesa-roleCode"
              name="roleCode"
              required
              className={inputClass}
              defaultValue=""
            >
              <option value="">—</option>
              {roles.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.label}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="mesa-personId" label={persona ?? ""}>
            <select
              id="mesa-personId"
              name="personId"
              required
              className={inputClass}
              defaultValue=""
            >
              <option value="">—</option>
              {activos.map((member) => (
                <option key={member.personId} value={member.personId}>
                  {member.fullName}
                </option>
              ))}
            </select>
          </Campo>
          <Casilla id="mesa-coDirector" name="coDirector" label={t("T-2153")} />
          <Campo id="mesa-overrideReason" label={excepcion ?? ""} help={excepcionAyuda ?? ""}>
            <input id="mesa-overrideReason" name="overrideReason" className={inputClass} />
          </Campo>
          <AdminSubmitButton type="submit" className="boton-primario self-start">
            {agregar}
          </AdminSubmitButton>
        </AdminFormBody>
      </ActionForm>
    </div>
  );
}
