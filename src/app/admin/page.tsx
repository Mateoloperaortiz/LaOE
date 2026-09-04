import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminOrLeaderActor } from "@/modules/identity";
import { listCommitteesByIds } from "@/modules/people";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

// Secciones del admin (T-160). Se enlazan las que ya existen; el resto llega por fases.
const RUTAS: Record<string, string> = {
  Personas: "/admin/personas",
  Comunidad: "/admin/comites",
  Contenido: "/admin/paginas",
  Participación: "/admin/ocasiones",
  Sistema: "/admin/sistema/jobs",
};

export default async function AdminHome() {
  const actor = await requireAdminOrLeaderActor("/admin");
  if (!actor.isAdmin) {
    // Un líder entra derecho a su comité (ADR-035 regla 15).
    const led = actor.permissions.filter(
      (item) => item.code === "COMMITTEE_LEADER" && item.committeeId,
    );
    const committees = await listCommitteesByIds(led.map((item) => item.committeeId as string));
    redirect(committees[0] ? `/admin/comites/${committees[0].slug}` : "/app");
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
