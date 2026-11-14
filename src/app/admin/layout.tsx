import { Suspense } from "react";
import { SignOutForm } from "@/modules/identity/components/SignOutForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import "./admin.css";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { CommandPalette } from "@/shared/admin-kit";
import { ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { AdminShell } from "./_components/AdminShell";
import { DeskCounter, DeskLink } from "./_components/DeskCounter";
import { hasPanorama } from "./_components/Panorama";
import { createItemsFor } from "./_kit/create-items";
import { adminNavGroups } from "./_kit/nav";

// Administración: ADMIN completo; un líder de comité, la dirección de un comité por sus cargos
// (ADR-058), un líder o evaluador de grupo y la junta entran con la navegación recortada a lo suyo
// (ADR-035 regla 15, ADR-036 regla 10) y cada página que no es de su rol vuelve a exigir ADMIN.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const roles = await requireAdminAreaRoles("/admin");
  const actor = roles.actor;
  const [temaOscuro, temaClaro] = tList("T-034");
  const [persona, comite, ocasion, organizacion] = tList("T-290");
  const junta = tList("T-708")[5];
  const [permanenciaDe, misGrupos, misEvaluaciones] = tList("T-709");
  // Destinos propios de quien no es ADMIN: sus comités, sus grupos, sus evaluaciones y la junta.
  const ownLinks = !actor.isAdmin
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
        // Los avales que decide por su cargo en la junta (ADR-195 regla 3).
        ...(roles.boardSeats.length > 0
          ? [
              { href: "/admin/avales", label: tList("T-5092")[0] ?? "" },
              // El calendario de la junta (ADR-197 regla 6).
              { href: "/admin/calendario/junta", label: tList("T-5115")[0] ?? "" },
            ]
          : []),
        // Las sanciones de Gestión Humana (ADR-196 regla 5): quien decide por la VP de GH.
        ...(roles.boardSeats.some((item) => item.seat === "VP_GH")
          ? [{ href: "/admin/faltas", label: tList("T-5099")[0] ?? "" }]
          : []),
        // El directorio institucional lo edita la Presidencia (ADR-197 regla 3).
        ...(roles.boardSeats.some((item) => item.seat === "PRESIDENT" && item.as === "HOLDER")
          ? [{ href: "/admin/directorio-institucional", label: tList("T-5142")[0] ?? "" }]
          : []),
        // Los pronósticos del Athletic (ADR-197 regla 7): quien lidera el Athletic y quien fija el tope.
        ...(roles.leadsAthletic || roles.boardSeats.some((item) => item.seat === "VP_GH")
          ? [{ href: "/admin/pronosticos", label: tList("T-5146")[0] ?? "" }]
          : []),
        // La bitácora del CAP (ADR-197 regla 4): la Presidencia y el CAP.
        ...(roles.readsCapLog ? [{ href: "/admin/cap", label: tList("T-5130")[0] ?? "" }] : []),
        // El inventario (ADR-150 regla 2): solo la VP administrativa vigente.
        ...(roles.managesInventory ? [{ href: "/admin/inventario", label: t("T-4300") }] : []),
        ...(roles.operatesInventory
          ? [{ href: "/admin/inventario/entregas", label: t("T-4301") }]
          : []),
        // The Games (ADR-089): el operador entra a su panel y el juez, a su base.
        ...roles.competitions.map((item) => ({
          href: item.operator
            ? `/admin/the-games/${item.competitionId}`
            : `/admin/the-games/${item.competitionId}/juez`,
          label: item.name,
        })),
      ]
    : [];
  const navGroups = adminNavGroups();
  // Solo viajan al cliente los destinos que el actor puede ver.
  const groups = navGroups
    .map((group, index) => ({
      id: `group-${index}`,
      label: group.label,
      icon: group.icon,
      items: actor.isAdmin
        ? group.items.filter(
            // ADMIN no administra el inventario: es de la VP (ADR-150 regla 2).
            (item) => item.href !== "/admin/inventario" || roles.managesInventory,
          )
        : ownLinks.filter((link) =>
            group.items.some(
              (item) => link.href === item.href || link.href.startsWith(`${item.href}/`),
            ),
          ),
    }))
    .filter((group) => group.items.length > 0);
  // La paleta busca los destinos del actor en el navegador, la Mesa incluida (ADR-190 regla 2).
  const destinations = [
    ...(hasPanorama(roles) ? [{ href: "/admin", label: t("T-4929"), space: null }] : []),
    { href: "/admin/mesa", label: t("T-5044"), space: null },
    { href: "/admin/calendario", label: tList("T-4918")[0] ?? "", space: null },
    ...groups.flatMap((group) =>
      group.items.map((item) => ({ href: item.href, label: item.label, space: group.label })),
    ),
  ].map((item) => ({
    type: "destination",
    id: item.href,
    title: item.label,
    subtitle: item.space,
    href: item.href,
  }));
  // Lo que puede crear: el menú «Crear» y, en la paleta, las mismas entradas como acciones (ADR-167).
  const createItems = createItemsFor(roles);
  const actions = createItems.map((item) => ({
    type: "action",
    id: `crear:${item.href}`,
    title: item.href.startsWith("/admin/personas/activacion")
      ? item.label
      : t("T-4899", { cosa: item.label }),
    subtitle: null,
    href: item.href,
  }));
  return (
    <AdminShell
      groups={groups}
      showHome={hasPanorama(roles)}
      createItems={createItems}
      desk={
        <Suspense fallback={<DeskLink total={null} />}>
          <DeskCounter />
        </Suspense>
      }
      search={
        <CommandPalette
          endpoint="/api/admin/buscar"
          destinations={[...destinations, ...actions]}
          labels={{
            open: t("T-299"),
            placeholder: t("T-264"),
            empty: t("T-256"),
            close: t("T-291"),
            types: {
              destination: t("T-5063"),
              action: t("T-4901"),
              person: persona,
              committee: comite,
              occasion: ocasion,
              organization: organizacion,
            },
          }}
        />
      }
      theme={<ThemeToggle etiquetas={[temaOscuro, temaClaro]} />}
      account={
        <>
          <Link href="/app">{t("T-004")}</Link>
          <SignOutForm>
            <button type="submit">{t("T-231")}</button>
          </SignOutForm>
        </>
      }
    >
      {children}
    </AdminShell>
  );
}
