import Link from "next/link";
import { redirect } from "next/navigation";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { requireAdminAreaRoles } from "./_kit/acceso";

// Secciones del admin (T-160). Se enlazan las que ya existen; el resto llega por fases.
const RUTAS: Record<string, string> = {
  Personas: "/admin/personas",
  Comunidad: "/admin/comites",
  Contenido: "/admin/paginas",
  Participación: "/admin/ocasiones",
  Permanencia: "/admin/permanencia/reglas",
  Junta: "/admin/junta",
  Sistema: "/admin/sistema/jobs",
};

export default async function AdminHome() {
  const roles = await requireAdminAreaRoles("/admin");
  if (!roles.isAdmin) {
    // Quien no es ADMIN entra derecho a lo suyo (ADR-035 regla 15, ADR-036 regla 10).
    const committee = roles.ledCommittees[0];
    const group = roles.ledGroups[0];
    redirect(
      committee
        ? `/admin/comites/${committee.slug}`
        : group
          ? `/admin/permanencia/grupos/${group.id}`
          : roles.evaluatedGroups.length > 0
            ? "/admin/permanencia/evaluaciones"
            : roles.isBoard
              ? "/admin/junta"
              : "/app",
    );
  }
  const secciones = tList("T-160");
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-display-lg">{t("T-236")}</h1>
      <ul className="flex list-none flex-wrap gap-2 p-0">
        {secciones.map((nombre) => {
          const ruta = RUTAS[nombre];
          return (
            <li key={nombre}>
              {ruta ? (
                <Link href={ruta} className="no-underline">
                  <Insignia fondo="azul">{nombre}</Insignia>
                </Link>
              ) : (
                <Insignia fondo="sky">{nombre}</Insignia>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-tinta-suave">{t("T-240")}</p>
    </div>
  );
}
