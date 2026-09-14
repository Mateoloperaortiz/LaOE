import Link from "next/link";
import "./admin.css";
import { signOutAction } from "@/modules/identity/actions";
import { CommandPalette } from "@/shared/admin-kit";
import { ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { AdminShell } from "./_components/AdminShell";
import { requireAdminAreaRoles } from "./_kit/acceso";

// Administración: ADMIN completo; un líder de comité, la dirección de un comité por sus cargos
// (ADR-058), un líder o evaluador de grupo y la junta entran con la navegación recortada a lo suyo
// (ADR-035 regla 15, ADR-036 regla 10) y cada página que no es de su rol vuelve a exigir ADMIN.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const roles = await requireAdminAreaRoles("/admin");
  const actor = roles.actor;
  const [temaOscuro, temaClaro] = tList("T-034") as [string, string];
  const [comites] = tList("T-261");
  const [terminos] = tList("T-262");
  const [permisos] = tList("T-263");
  const [paginas] = tList("T-330");
  const [cartelera] = tList("T-331");
  const [medios] = tList("T-334");
  const [eventos] = tList("T-332");
  const [persona, comite, ocasion, organizacion] = tList("T-290") as [
    string,
    string,
    string,
    string,
  ];
  const [personas, importar, cargos, etiquetas, tareas, segmentos, documentos, importaciones] =
    tList("T-509");
  const [ocasiones, ledger, rankings, asambleas, cierre, alias] = tList("T-561");
  const [reglas, grupos, evaluaciones, cumplimiento, cierrePermanencia, junta] = tList("T-708");
  const [permanenciaDe, misGrupos, misEvaluaciones] = tList("T-709");
  const [formularios, pipelines, organizaciones, solicitudes, convocatorias] = tList("T-908");
  const [plantillas, campanas, mensajes] = tList("T-1172");
  const enlaces = !actor.isAdmin
    ? [
        ...roles.committees.flatMap((item) => [
          { href: `/admin/comites/${item.committee.slug}`, label: item.committee.name },
          ...(item.capabilities.includes("PERMANENCE")
            ? [
                {
                  href: `/admin/comites/${item.committee.slug}/permanencia`,
                  label:
                    t("T-709", { comité: item.committee.name }).split(" · ")[0] ??
                    permanenciaDe ??
                    "",
                },
              ]
            : []),
        ]),
        ...roles.ledGroups.map((item) => ({
          href: `/admin/permanencia/grupos/${item.id}`,
          label: `${misGrupos ?? ""}: ${item.name}`,
        })),
        ...(roles.evaluatedGroups.length > 0
          ? [{ href: "/admin/permanencia/evaluaciones", label: misEvaluaciones ?? "" }]
          : []),
        ...(roles.isBoard
          ? [
              { href: "/admin/junta", label: junta ?? "" },
              { href: "/admin/personas/activacion", label: t("T-2128") },
            ]
          : []),
      ]
    : [
        { href: "/admin/personas", label: personas ?? "" },
        { href: "/admin/personas/importar", label: importar ?? "" },
        { href: "/admin/personas/activacion", label: t("T-2128") },
        { href: "/admin/tareas", label: tareas ?? "" },
        { href: "/admin/formularios", label: formularios ?? "" },
        { href: "/admin/pipelines", label: pipelines ?? "" },
        { href: "/admin/organizaciones", label: organizaciones ?? "" },
        { href: "/admin/solicitudes", label: solicitudes ?? "" },
        { href: "/admin/convocatorias", label: convocatorias ?? "" },
        { href: "/admin/segmentos", label: segmentos ?? "" },
        { href: "/admin/etiquetas", label: etiquetas ?? "" },
        { href: "/admin/paginas", label: paginas ?? "" },
        { href: "/admin/sistema/politica", label: t("T-1180") },
        { href: "/admin/cartelera", label: cartelera ?? "" },
        { href: "/admin/eventos", label: eventos ?? "" },
        { href: "/admin/medios", label: medios ?? "" },
        { href: "/admin/documentos", label: documentos ?? "" },
        { href: "/admin/plantillas", label: plantillas ?? "" },
        { href: "/admin/campanas", label: campanas ?? "" },
        { href: "/admin/mensajes", label: mensajes ?? "" },
        { href: "/admin/comites", label: comites ?? "" },
        { href: "/admin/cargos", label: cargos ?? "" },
        { href: "/admin/horario-preferencial", label: tList("T-2323")[0] ?? "" },
        { href: "/admin/terminos", label: terminos ?? "" },
        { href: "/admin/ocasiones", label: ocasiones ?? "" },
        { href: "/admin/ledger", label: ledger ?? "" },
        { href: "/admin/rankings", label: rankings ?? "" },
        { href: "/admin/asambleas", label: asambleas ?? "" },
        { href: "/admin/cierre", label: cierre ?? "" },
        { href: "/admin/permanencia/reglas", label: reglas ?? "" },
        { href: "/admin/permanencia/grupos", label: grupos ?? "" },
        { href: "/admin/permanencia/evaluaciones", label: evaluaciones ?? "" },
        { href: "/admin/permanencia/cumplimiento", label: cumplimiento ?? "" },
        { href: "/admin/permanencia/cierre", label: cierrePermanencia ?? "" },
        { href: "/admin/junta", label: junta ?? "" },
        { href: "/admin/presupuestos", label: tList("T-2200")[0] ?? "" },
        { href: "/admin/permisos", label: permisos ?? "" },
        { href: "/admin/sistema/importaciones", label: importaciones ?? "" },
        { href: "/admin/sistema/jobs", label: t("T-241") },
        { href: "/admin/sistema/alias", label: alias ?? "" },
      ];
  const groupLabels = tList("T-1400");
  const groupRoutes = [
    [
      "/admin/personas",
      "/admin/comites",
      "/admin/cargos",
      "/admin/horario-preferencial",
      "/admin/terminos",
      "/admin/etiquetas",
      "/admin/segmentos",
      "/admin/personas/importar",
      "/admin/personas/activacion",
    ],
    [
      "/admin/tareas",
      "/admin/formularios",
      "/admin/pipelines",
      "/admin/organizaciones",
      "/admin/solicitudes",
      "/admin/convocatorias",
    ],
    ["/admin/paginas", "/admin/cartelera", "/admin/eventos", "/admin/medios", "/admin/documentos"],
    ["/admin/plantillas", "/admin/campanas", "/admin/mensajes"],
    ["/admin/ocasiones", "/admin/ledger", "/admin/rankings", "/admin/asambleas", "/admin/cierre"],
    [
      "/admin/permanencia/reglas",
      "/admin/permanencia/grupos",
      "/admin/permanencia/evaluaciones",
      "/admin/permanencia/cumplimiento",
      "/admin/permanencia/cierre",
      "/admin/presupuestos",
      "/admin/junta",
    ],
    [
      "/admin/sistema/politica",
      "/admin/permisos",
      "/admin/sistema/importaciones",
      "/admin/sistema/jobs",
      "/admin/sistema/alias",
    ],
  ];
  // Solo viajan al cliente los destinos que el actor puede ver.
  const groups = groupRoutes
    .map((routes, index) => ({
      id: `group-${index}`,
      label: groupLabels[index] ?? "",
      items: actor.isAdmin
        ? routes.flatMap((href) => enlaces.filter((link) => link.href === href))
        : enlaces.filter((link) =>
            routes.some((href) => link.href === href || link.href.startsWith(`${href}/`)),
          ),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <AdminShell
      groups={groups}
      showHome={actor.isAdmin}
      search={
        actor.isAdmin ? (
          <CommandPalette
            endpoint="/api/admin/buscar"
            labels={{
              open: t("T-299"),
              placeholder: t("T-264"),
              empty: t("T-256"),
              close: t("T-291"),
              types: {
                person: persona,
                committee: comite,
                occasion: ocasion,
                organization: organizacion,
              },
            }}
          />
        ) : null
      }
      theme={<ThemeToggle etiquetas={[temaOscuro, temaClaro]} />}
      account={
        <>
          <Link href="/app">{t("T-004")}</Link>
          <form action={signOutAction}>
            <button type="submit">{t("T-231")}</button>
          </form>
        </>
      }
    >
      {children}
    </AdminShell>
  );
}
