import type { AdminSpaceIcon } from "@/shared/admin-kit/navigation";
import { t, tList } from "@/shared/copy";

// Navegación de la Operación (ADR-083, con los espacios de ADR-159 regla 2): la única lista. Cada
// destino aparece una vez, dentro de su espacio y con su etiqueta. El layout la pinta para ADMIN y la usa
// para ubicar en su espacio los destinos propios de los demás roles; `tests/unit/admin-nav.test.ts` exige
// una página por destino. Los espacios reordenan por trabajo los grupos de antes; la Mesa, el Panorama
// y el Calendario llegan con sus tramos.

export interface AdminNavItem {
  href: string;
  label: string;
}

export interface AdminNavGroup {
  label: string;
  icon: AdminSpaceIcon;
  items: AdminNavItem[];
}

export function adminNavGroups(): AdminNavGroup[] {
  const [comites] = tList("T-261");
  const [terminos] = tList("T-262");
  const [permisos] = tList("T-263");
  const [paginas] = tList("T-330");
  const [cartelera] = tList("T-331");
  const [medios] = tList("T-334");
  const [eventos] = tList("T-332");
  const [personas, importar, cargos, etiquetas, tareas, segmentos, documentos, importaciones] =
    tList("T-509");
  const [ocasiones, ledger, rankings, asambleas, cierre, alias] = tList("T-561");
  const [reglas, grupos, evaluaciones, cumplimiento, cierrePermanencia, junta] = tList("T-708");
  const [formularios, pipelines, organizaciones, solicitudes, convocatorias] = tList("T-908");
  const [plantillas, campanas, mensajes] = tList("T-1172");
  const gamificacion = tList("T-2404");
  const [
    espacioPersonas,
    espacioComites,
    espacioAdmision,
    espacioComunicacion,
    espacioParticipacion,
    espacioPermanencia,
    espacioFinanzas,
    espacioMacroeventos,
    espacioJunta,
    espacioSistema,
  ] = tList("T-4860");
  return [
    {
      label: espacioPersonas,
      icon: "personas",
      items: [
        { href: "/admin/personas", label: personas },
        { href: "/admin/personas/activacion", label: t("T-2128") },
        { href: "/admin/personas/importar", label: importar },
        { href: "/admin/tareas", label: tareas },
        { href: "/admin/solicitudes", label: solicitudes },
        { href: "/admin/cargos", label: cargos },
        { href: "/admin/segmentos", label: segmentos },
        { href: "/admin/etiquetas", label: etiquetas },
      ],
    },
    {
      label: espacioComites,
      icon: "comites",
      items: [{ href: "/admin/comites", label: comites }],
    },
    {
      label: espacioAdmision,
      icon: "admision",
      items: [
        { href: "/admin/formularios", label: formularios },
        { href: "/admin/pipelines", label: pipelines },
        { href: "/admin/convocatorias", label: convocatorias },
        { href: "/admin/organizaciones", label: organizaciones },
      ],
    },
    {
      label: espacioComunicacion,
      icon: "comunicacion",
      items: [
        { href: "/admin/campanas", label: campanas },
        { href: "/admin/plantillas", label: plantillas },
        { href: "/admin/mensajes", label: mensajes },
        { href: "/admin/cartelera", label: cartelera },
        { href: "/admin/paginas", label: paginas },
        { href: "/admin/medios", label: medios },
        { href: "/admin/documentos", label: documentos },
      ],
    },
    {
      label: espacioParticipacion,
      icon: "participacion",
      items: [
        { href: "/admin/ocasiones", label: ocasiones },
        { href: "/admin/asambleas", label: asambleas },
        { href: "/admin/ledger", label: ledger },
        { href: "/admin/rankings", label: rankings },
        { href: "/admin/cierre", label: cierre },
        { href: "/admin/gamificacion", label: gamificacion[0] },
        { href: "/admin/gamificacion/retos", label: gamificacion[1] },
        { href: "/admin/gamificacion/revision", label: gamificacion[2] },
        { href: "/admin/gamificacion/campanas", label: gamificacion[3] },
        { href: "/admin/gamificacion/insignias", label: gamificacion[4] },
        { href: "/admin/gamificacion/limites", label: gamificacion[5] },
      ],
    },
    {
      label: espacioPermanencia,
      icon: "permanencia",
      items: [
        { href: "/admin/permanencia/reglas", label: reglas },
        { href: "/admin/permanencia/grupos", label: grupos },
        { href: "/admin/permanencia/evaluaciones", label: evaluaciones },
        { href: "/admin/permanencia/cumplimiento", label: cumplimiento },
        { href: "/admin/permanencia/cierre", label: cierrePermanencia },
      ],
    },
    {
      label: espacioFinanzas,
      icon: "finanzas",
      items: [{ href: "/admin/presupuestos", label: tList("T-2200")[0] }],
    },
    {
      label: espacioMacroeventos,
      icon: "macroeventos",
      items: [
        { href: "/admin/macroeventos", label: t("T-2344") },
        { href: "/admin/the-games", label: t("T-2763") },
        { href: "/admin/eventos", label: eventos },
      ],
    },
    {
      label: espacioJunta,
      icon: "junta",
      items: [
        { href: "/admin/junta", label: junta },
        { href: "/admin/terminos", label: terminos },
        { href: "/admin/permisos", label: permisos },
        { href: "/admin/horario-preferencial", label: tList("T-2323")[0] },
      ],
    },
    {
      label: espacioSistema,
      icon: "sistema",
      items: [
        { href: "/admin/sistema/politica", label: t("T-1180") },
        { href: "/admin/sistema/importaciones", label: importaciones },
        { href: "/admin/sistema/jobs", label: t("T-241") },
        { href: "/admin/sistema/alias", label: alias },
      ],
    },
  ];
}
