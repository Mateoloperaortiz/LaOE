import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { listPeopleWithPassword } from "@/modules/identity";
import {
  listCommitteesForSelection,
  listInternalRoster,
  listSignInMemberIds,
  listTermRoster,
} from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { Insignia, Progreso } from "@/shared/brand";
import { t } from "@/shared/copy";
import { IssueGrantPanel } from "../IssueGrantPanel";
import { calcularAvance } from "./progreso";

export const metadata: Metadata = { title: t("T-2128") };

// Jornada de activación (ADR-051, regla 6): un QR vivo a la vez. Se elige comité, se elige persona
// y solo esa persona muestra su panel; no hay hoja con varios enlaces, que serían una pila de
// secretos con una hora de vida cada uno.
export default async function ActivacionPage({
  searchParams,
}: PageProps<"/admin/personas/activacion">) {
  const roles = await requireAdminAreaRoles("/admin/personas/activacion");
  // Emiten ADMIN y BOARD; el resto de los roles del admin no.
  if (!roles.isAdmin && !roles.isBoard) {
    redirect("/admin");
  }
  const params = await searchParams;
  const comite = typeof params.comite === "string" ? params.comite : "";
  const persona = typeof params.persona === "string" ? params.persona : "";
  const [committees, current, roster] = await Promise.all([
    listCommitteesForSelection(),
    getCurrentTerm(),
    comite ? listInternalRoster(comite) : Promise.resolve(null),
  ]);
  // El total se gobierna con quién puede entrar hoy; cada comité muestra el suyo sobre el término.
  const [elegibles, filas] = await Promise.all([
    listSignInMemberIds(),
    current ? listTermRoster(current.id) : Promise.resolve([]),
  ]);
  const conClave = await listPeopleWithPassword([
    ...new Set([...elegibles, ...filas.map((fila) => fila.personId)]),
  ]);
  const avance = calcularAvance(elegibles, filas, conClave);
  const elegida = roster?.members.find((item) => item.personId === persona) ?? null;
  const base = `/admin/personas/activacion?comite=${encodeURIComponent(comite)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display-lg">{t("T-2128")}</h1>
        <p className="max-w-prose">{t("T-2129")}</p>
      </div>

      {current === null ? (
        <p className="text-tinta-suave">{t("T-2140")}</p>
      ) : (
        <section aria-label={t("T-2128")} className="flex max-w-md flex-col gap-2">
          <p className="text-titulo-lg">
            {t("T-2138", {
              activadas: String(avance.activadas),
              personas: String(avance.personas),
            })}
          </p>
          <Progreso
            valor={avance.activadas}
            maximo={avance.personas}
            nombre={t("T-2128")}
            etiqueta={t("T-2138", {
              activadas: String(avance.activadas),
              personas: String(avance.personas),
            })}
          />
        </section>
      )}

      <nav aria-label={t("T-2135")} className="flex flex-wrap gap-2">
        {committees.map((item) => {
          const suyo = avance.porComite.get(item.id);
          return (
            <Link
              key={item.id}
              href={`/admin/personas/activacion?comite=${encodeURIComponent(item.slug)}`}
              aria-current={item.slug === comite ? "page" : undefined}
              aria-describedby={suyo ? `avance-${item.id}` : undefined}
              className={
                item.slug === comite
                  ? "rounded-full bg-oe-navy px-3 py-1 text-sm text-oe-paper no-underline"
                  : "rounded-full border border-borde px-3 py-1 text-sm no-underline"
              }
            >
              {item.name}
              {suyo ? (
                <>
                  {" "}
                  <span id={`avance-${item.id}`} className="tabular-nums opacity-70">
                    {suyo.activadas}/{suyo.total}
                  </span>
                  <span className="sr-only">
                    {" "}
                    {t("T-2139", {
                      activadas: String(suyo.activadas),
                      total: String(suyo.total),
                      comité: item.name,
                    })}
                  </span>
                </>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {roster === null ? (
        <p className="text-tinta-suave">{t("T-2136")}</p>
      ) : (
        <div className="flex flex-col gap-6 md:flex-row">
          <ul className="flex list-none flex-col gap-1 p-0 md:w-72">
            {roster.members.map((item) => (
              <li key={item.personId}>
                <Link
                  href={`${base}&persona=${item.personId}`}
                  aria-current={item.personId === persona ? "true" : undefined}
                  className={
                    item.personId === persona
                      ? "flex items-center justify-between gap-2 rounded-lg bg-fondo-suave px-3 py-2 no-underline"
                      : "flex items-center justify-between gap-2 rounded-lg px-3 py-2 no-underline"
                  }
                >
                  <span>{item.preferredName ?? item.fullName}</span>
                  {conClave.has(item.personId) ? null : (
                    <Insignia fondo="amarillo">{t("T-2137")}</Insignia>
                  )}
                </Link>
              </li>
            ))}
          </ul>

          {elegida === null ? null : (
            <section aria-label={elegida.fullName} className="flex flex-1 flex-col gap-4">
              <h2 className="text-titulo-lg">{elegida.fullName}</h2>
              {conClave.has(elegida.personId) ? (
                <p className="rounded-xl bg-oe-yellow-soft px-4 py-3 text-oe-navy">{t("T-2131")}</p>
              ) : null}
              <IssueGrantPanel
                key={elegida.personId}
                personId={elegida.personId}
                returnTo={`${base}&persona=${elegida.personId}`}
                labels={{
                  submit: t("T-2119"),
                  activation: t("T-2120"),
                  recovery: t("T-2121"),
                  once: t("T-2122"),
                  handover: t("T-2123"),
                  copy: t("T-2124"),
                  copied: t("T-2125"),
                }}
              />
              <Link href={base} className="text-enlace text-sm underline underline-offset-4">
                {t("T-2130")}
              </Link>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
