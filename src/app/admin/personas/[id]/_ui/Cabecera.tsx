import Link from "next/link";
import type { ActorPermission } from "@/modules/identity";
import type { MyMembershipView, Person360, TagRow } from "@/modules/people";
import { stageCell, statusCell } from "@/modules/people/admin";
import { AdminActionsMenu } from "@/shared/admin-kit/AdminActionsMenu";
import { Dato } from "@/shared/admin-kit/AdminFields";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { appointmentLabel } from "./etiquetas";

type Props = {
  data: Person360;
  my: MyMembershipView;
  permissions: ActorPermission[];
  committeeNames: Map<string, string>;
  tags: TagRow[];
};

// Cabecera de la Persona 360 (02-crm.md): quién es, en qué está y qué se puede hacer con ella.
export function Cabecera({ data, my, permissions, committeeNames, tags }: Props) {
  const { person, membership, appointments } = data;
  const acciones = tList("T-433");
  const [correo, celular, programa, ingreso] = tList("T-511") as [string, string, string, string];
  const [admin, lider, junta] = tList("T-289") as [string, string, string];
  const anonymized = person.anonymizedAt !== null;
  const active = membership !== null && membership.status !== "INACTIVE";
  // Estudiante sin membresía: "dar de alta" es su siguiente paso (ADR-037 regla 8, ADR-056).
  const admissible = !anonymized && membership === null && person.kind === "STUDENT";
  const base = `/admin/personas/${person.id}`;
  const enlaces: Array<{ key: string; label: string; href: string; calido?: boolean }> = [];
  if (admissible) {
    enlaces.push({
      key: "alta",
      label: t("T-983"),
      href: `${base}?pestana=membresia&accion=alta`,
      calido: true,
    });
  }
  if (!anonymized) {
    enlaces.push({
      key: "editar",
      label: acciones[0] ?? "",
      href: `${base}?pestana=datos&accion=editar`,
    });
  }
  if (active) {
    enlaces.push({
      key: "estado",
      label: acciones[1] ?? "",
      href: `${base}?pestana=membresia&accion=estado`,
    });
    enlaces.push({
      key: "baja",
      label: acciones[2] ?? "",
      href: `${base}?pestana=membresia&accion=baja`,
    });
  }
  if (membership?.status === "INACTIVE" && !anonymized) {
    enlaces.push({
      key: "reactivar",
      label: acciones[3] ?? "",
      href: `${base}?pestana=membresia&accion=reactivar`,
    });
  }
  if (person.deletionRequestedAt && !anonymized) {
    enlaces.push({
      key: "anonimizar",
      label: acciones[4] ?? "",
      href: `${base}?pestana=datos&accion=anonimizar`,
      calido: true,
    });
  }
  if (!anonymized) {
    enlaces.push({
      key: "nota",
      label: acciones[5] ?? "",
      href: `${base}?pestana=linea&accion=nota`,
    });
    enlaces.push({
      key: "tarea",
      label: acciones[6] ?? "",
      href: `${base}?pestana=tareas&accion=tarea`,
    });
    enlaces.push({
      key: "etiquetas",
      label: acciones[7] ?? "",
      href: `${base}?pestana=resumen&accion=etiquetas`,
    });
  }
  enlaces.push({
    key: "permisos",
    label: acciones[8] ?? "",
    href: `/admin/permisos?q=${encodeURIComponent(person.email)}`,
  });
  const permisoLabel = (item: ActorPermission) =>
    item.code === "ADMIN"
      ? admin
      : item.code === "BOARD"
        ? junta
        : `${lider}${item.committeeId ? ` · ${committeeNames.get(item.committeeId) ?? ""}` : ""}`;
  const primaryActions = enlaces.filter((item) =>
    ["alta", "editar", "nota", "tarea"].includes(item.key),
  );
  const secondaryActions = enlaces.filter((item) => !primaryActions.includes(item));
  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{person.fullName?.trim() || person.firstName}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Insignia fondo={stageCell(person.stage).badge}>
              {stageCell(person.stage).text}
            </Insignia>
            {membership ? (
              <Insignia fondo={statusCell(membership.status).badge}>
                {statusCell(membership.status).text}
              </Insignia>
            ) : null}
            {permissions.map((item) => (
              <Insignia key={`${item.code}-${item.committeeId ?? ""}`} fondo="navy">
                {permisoLabel(item)}
              </Insignia>
            ))}
            {tags.length === 0 ? (
              <span className="text-xs text-tinta-suave">{t("T-467")}</span>
            ) : (
              tags.map((tag) => (
                <Insignia key={tag.id} fondo="cream">
                  {tag.name}
                </Insignia>
              ))
            )}
          </div>
        </div>
        <nav aria-label={t("T-1500")} className="flex flex-wrap items-start gap-2">
          {primaryActions.map((enlace) => (
            <Link
              key={enlace.key}
              href={enlace.href}
              className={`${enlace.calido ? "boton-calido" : "boton-secundario"} min-h-10 px-4 py-2 text-sm`}
            >
              {enlace.label}
            </Link>
          ))}
          {secondaryActions.length > 0 ? (
            <AdminActionsMenu label={t("T-1500")}>
              {secondaryActions.map((enlace) => (
                <Link
                  key={enlace.key}
                  href={enlace.href}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-fondo-suave focus-visible:bg-fondo-suave"
                >
                  {enlace.label}
                </Link>
              ))}
            </AdminActionsMenu>
          ) : null}
        </nav>
      </div>
      <dl className="grid gap-4 rounded-xl border border-borde bg-fondo p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato etiqueta={correo} valor={person.email} />
        <Dato etiqueta={celular} valor={person.phone} />
        <Dato etiqueta={programa} valor={person.program} />
        <Dato
          etiqueta={ingreso.replace("{término}", "").trim()}
          valor={membership?.firstTermCode ?? null}
        />
      </dl>
      <div className="flex flex-col gap-2">
        <p className="eyebrow text-xs text-tinta-suave">{t("T-431")}</p>
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {my.committees.length === 0 ? (
            <li className="text-sm text-tinta-suave">{t(admissible ? "T-1053" : "T-402")}</li>
          ) : (
            my.committees.map((item) => (
              <li key={item.id}>
                <Insignia fondo={item.isLeadership ? "naranja" : "sky"}>
                  {item.committeeName} · {item.roleLabel}
                </Insignia>
              </li>
            ))
          )}
        </ul>
      </div>
      {appointments.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-xs text-tinta-suave">{t("T-374")}</p>
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {appointments.map((item) => (
              <li key={item.id}>
                <Insignia fondo="amarillo">
                  {appointmentLabel(item.kind, item.title)} · {item.termCode}
                </Insignia>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </header>
  );
}
