import Link from "next/link";
import {
  type CommitteeRoleRow,
  committeeRolesLabel,
  type EligibleMember,
  type RoleView,
  type RosterMember,
} from "@/modules/people";
import { ResourcePanel } from "@/shared/admin-kit";
import { Casilla } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { t, tList } from "@/shared/copy";
import { addMemberAction, requestRemovalAction, setRolesAction } from "../actions";

// Área Personas de la vista del comité (ADR-058, decisión 4): roster con cargos, agregar miembros
// activos con cupo, cambiar cargos (los de dirección solo con DIRECTION) y pedir a GH un retiro.
// Nunca correos ni celulares.

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

/** Una casilla por cargo del catálogo (sin Miembro) y, en los de dirección, otra para la codirección. */
function CargosCasillas({
  prefix,
  roles,
  current,
  canDirect,
}: {
  prefix: string;
  roles: CommitteeRoleRow[];
  current: RoleView[];
  canDirect: boolean;
}) {
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {roles
        .filter(
          (role) =>
            role.code !== "MIEMBRO" &&
            (!role.retired || current.some((item) => item.roleCode === role.code)),
        )
        .map((role) => {
          const mine = current.find((item) => item.roleCode === role.code);
          const locked = role.isLeadership && !canDirect;
          return (
            <li key={role.code} className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <Casilla
                id={`${prefix}-role-${role.code}`}
                name={`role-${role.code}`}
                label={role.label}
                defaultChecked={mine !== undefined}
                disabled={locked}
              />
              {role.isLeadership ? (
                <Casilla
                  id={`${prefix}-co-${role.code}`}
                  name={`co-${role.code}`}
                  label={t("T-2153")}
                  defaultChecked={mine?.coDirector ?? false}
                  disabled={locked}
                />
              ) : null}
            </li>
          );
        })}
    </ul>
  );
}

export function Personas({
  slug,
  base,
  committeeName,
  members,
  hasTerm,
  isAdmin,
  canDirect,
  actorPersonId,
  roles,
  max,
  q,
  candidates,
  accion,
  persona,
  error,
}: {
  slug: string;
  base: string;
  committeeName: string;
  members: RosterMember[];
  hasTerm: boolean;
  isAdmin: boolean;
  canDirect: boolean;
  actorPersonId: string;
  roles: CommitteeRoleRow[];
  max: number;
  q: string;
  candidates: EligibleMember[];
  accion: string;
  persona: string;
  error: string;
}) {
  const [, rosterTitulo] = tList("T-651");
  const columnas = tList("T-2152");
  const closeHref = `${base}?area=personas`;
  const chosen = members.find((member) => member.personId === persona) ?? null;
  const hidden = <input type="hidden" name="slug" value={slug} />;
  const alerta = error ? (
    <p role="alert" className="font-semibold text-oe-orange">
      {error}
    </p>
  ) : null;

  return (
    <section aria-label={t("T-2145")} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-display-md">{t("T-2145")}</h2>
          <p className="max-w-prose text-sm text-tinta-suave">{t("T-2146")}</p>
        </div>
        {hasTerm ? (
          <Link href={`${closeHref}&accion=agregar`} className="boton-primario">
            {t("T-2147")}
          </Link>
        ) : null}
      </div>
      {!hasTerm ? (
        <p className="text-tinta-suave">{t("T-2140")}</p>
      ) : members.length === 0 ? (
        <p className="text-tinta-suave">{t("T-384")}</p>
      ) : (
        <AdminTableRegion
          label={rosterTitulo ?? ""}
          className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde"
        >
          <table className="admin-data-table w-full text-left text-sm">
            <thead className="eyebrow bg-fondo-suave text-xs">
              <tr>
                {columnas.map((label) => (
                  <th scope="col" key={label} className="px-3 py-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.personId === actorPersonId;
                return (
                  <tr key={member.personId} className="border-t border-borde align-top">
                    <td data-label={columnas[0]} className="px-3 py-2 font-semibold">
                      {member.fullName}
                    </td>
                    <td data-label={columnas[1]} className="px-3 py-2">
                      {committeeRolesLabel(member.roles, member.roleLabel)}
                    </td>
                    <td data-label={columnas[2]} className="px-3 py-2">
                      {isSelf && !isAdmin ? (
                        <span className="text-tinta-suave">{t("T-2154")}</span>
                      ) : (
                        <span className="flex flex-wrap gap-2">
                          <Link
                            href={`${closeHref}&accion=cargos&persona=${member.personId}`}
                            className="boton-secundario"
                          >
                            {columnas[1]}
                          </Link>
                          {isAdmin ? (
                            <Link
                              href={`/admin/personas/${member.personId}?pestana=membresia`}
                              className="boton-secundario"
                            >
                              {t("T-2172")}
                            </Link>
                          ) : (
                            <Link
                              href={`${closeHref}&accion=retiro&persona=${member.personId}`}
                              className="boton-secundario"
                            >
                              {t("T-2155")}
                            </Link>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminTableRegion>
      )}

      {accion === "cargos" && chosen ? (
        <ResourcePanel
          title={t("T-2181", { nombre: chosen.fullName, comité: committeeName })}
          closeHref={closeHref}
          closeLabel={t("T-291")}
        >
          <form action={setRolesAction} className="flex flex-col gap-4">
            <AdminFormBody>
              {hidden}
              <input type="hidden" name="personId" value={chosen.personId} />
              {alerta}
              <CargosCasillas
                prefix={`cargos-${chosen.personId}`}
                roles={roles}
                current={chosen.roles}
                canDirect={canDirect}
              />
              {!canDirect ? <p className="text-sm text-tinta-suave">{t("T-2167")}</p> : null}
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-primario">
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

      {accion === "retiro" && chosen ? (
        <ResourcePanel
          title={t("T-2156", { nombre: chosen.fullName })}
          closeHref={closeHref}
          closeLabel={t("T-291")}
        >
          <form action={requestRemovalAction} className="flex flex-col gap-4">
            <AdminFormBody>
              {hidden}
              <input type="hidden" name="personId" value={chosen.personId} />
              {alerta}
              <p className="max-w-prose text-sm text-tinta-suave">{t("T-2157")}</p>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{t("T-2158")}</span>
                <textarea
                  name="reason"
                  rows={4}
                  required
                  minLength={2}
                  maxLength={500}
                  className={inputClass}
                />
              </label>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-primario">
                  {t("T-2159")}
                </AdminSubmitButton>
                <Link href={closeHref} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}

      {accion === "agregar" ? (
        <ResourcePanel title={t("T-2147")} closeHref={closeHref} closeLabel={t("T-291")}>
          <div className="flex flex-col gap-4">
            <form method="get" action={base} className="flex flex-col gap-3">
              <input type="hidden" name="area" value="personas" />
              <input type="hidden" name="accion" value="agregar" />
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{t("T-2148")}</span>
                <input name="q" defaultValue={q} minLength={2} required className={inputClass} />
              </label>
              <div>
                <button type="submit" className="boton-secundario">
                  {t("T-2149")}
                </button>
              </div>
            </form>
            {alerta}
            {q.length >= 2 ? (
              candidates.length === 0 ? (
                <p className="text-tinta-suave">{t("T-2150")}</p>
              ) : (
                <ul className="flex list-none flex-col gap-3 p-0">
                  {candidates.map((candidate) => (
                    <li
                      key={candidate.id}
                      className="flex flex-col gap-3 rounded-xl border border-borde p-3"
                    >
                      <span className="font-semibold">{candidate.fullName}</span>
                      {candidate.committeeCount >= max ? (
                        <span className="text-sm text-tinta-suave">{t("T-2151", { max })}</span>
                      ) : (
                        <form action={addMemberAction} className="flex flex-col gap-3">
                          {hidden}
                          <input type="hidden" name="personId" value={candidate.id} />
                          <input type="hidden" name="q" value={q} />
                          {canDirect ? (
                            <CargosCasillas
                              prefix={`agregar-${candidate.id}`}
                              roles={roles}
                              current={[]}
                              canDirect={canDirect}
                            />
                          ) : null}
                          <div>
                            <AdminSubmitButton type="submit" className="boton-primario">
                              {t("T-2147")}
                            </AdminSubmitButton>
                          </div>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        </ResourcePanel>
      ) : null}
    </section>
  );
}
