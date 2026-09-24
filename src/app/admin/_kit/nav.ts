import { t, tList } from "@/shared/copy";

// Navegación del área de administración (ADR-083): la única lista. Cada destino aparece una vez, dentro
// de su grupo y con su etiqueta. El layout la pinta para ADMIN y la usa para ubicar en su grupo los
// destinos propios de los demás roles; `tests/unit/admin-nav.test.ts` exige una página por destino.

export interface AdminNavItem {
  href: string;
  label: string;
}

export interface AdminNavGroup {
  label: string;
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
  const groupLabels = tList("T-1400");
  // Grupos en el orden de T-1400; Gamificación (T-2403) va justo después de Participación.
  return [
    {
      label: groupLabels[0],
      items: [
        { href: "/admin/personas", label: personas },
        { href: "/admin/comites", label: comites },
        { href: "/admin/macroeventos", label: t("T-2344") },
        { href: "/admin/the-games", label: t("T-2763") },
        { href: "/admin/cargos", label: cargos },
        { href: "/admin/horario-preferencial", label: tList("T-2323")[0] },
        { href: "/admin/terminos", label: terminos },
        { href: "/admin/etiquetas", label: etiquetas },
        { href: "/admin/segmentos", label: segmentos },
        { href: "/admin/personas/importar", label: importar },
        { href: "/admin/personas/activacion", label: t("T-2128") },
      ],
    },
    {
      label: groupLabels[1],
      items: [
        { href: "/admin/tareas", label: tareas },
        { href: "/admin/formularios", label: formularios },
        { href: "/admin/pipelines", label: pipelines },
        { href: "/admin/organizaciones", label: organizaciones },
        { href: "/admin/solicitudes", label: solicitudes },
        { href: "/admin/convocatorias", label: convocatorias },
      ],
    },
    {
      label: groupLabels[2],
      items: [
        { href: "/admin/paginas", label: paginas },
        { href: "/admin/cartelera", label: cartelera },
        { href: "/admin/eventos", label: eventos },
        { href: "/admin/medios", label: medios },
        { href: "/admin/documentos", label: documentos },
      ],
    },
    {
      label: groupLabels[3],
      items: [
        { href: "/admin/plantillas", label: plantillas },
        { href: "/admin/campanas", label: campanas },
        { href: "/admin/mensajes", label: mensajes },
      ],
    },
    {
      label: groupLabels[4],
      items: [
        { href: "/admin/ocasiones", label: ocasiones },
        { href: "/admin/ledger", label: ledger },
        { href: "/admin/rankings", label: rankings },
        { href: "/admin/asambleas", label: asambleas },
        { href: "/admin/cierre", label: cierre },
      ],
    },
    {
      label: t("T-2403"),
      items: [
        { href: "/admin/gamificacion", label: tList("T-2404")[0] },
        { href: "/admin/gamificacion/retos", label: tList("T-2404")[1] },
        { href: "/admin/gamificacion/revision", label: tList("T-2404")[2] },
        { href: "/admin/gamificacion/campanas", label: tList("T-2404")[3] },
        { href: "/admin/gamificacion/insignias", label: tList("T-2404")[4] },
        { href: "/admin/gamificacion/limites", label: tList("T-2404")[5] },
      ],
    },
    {
      label: groupLabels[5],
      items: [
        { href: "/admin/permanencia/reglas", label: reglas },
        { href: "/admin/permanencia/grupos", label: grupos },
        { href: "/admin/permanencia/evaluaciones", label: evaluaciones },
        { href: "/admin/permanencia/cumplimiento", label: cumplimiento },
        { href: "/admin/permanencia/cierre", label: cierrePermanencia },
        { href: "/admin/presupuestos", label: tList("T-2200")[0] },
        { href: "/admin/junta", label: junta },
      ],
    },
    {
      label: groupLabels[6],
      items: [
        { href: "/admin/sistema/politica", label: t("T-1180") },
        { href: "/admin/permisos", label: permisos },
        { href: "/admin/sistema/importaciones", label: importaciones },
        { href: "/admin/sistema/jobs", label: t("T-241") },
        { href: "/admin/sistema/alias", label: alias },
      ],
    },
  ];
}
