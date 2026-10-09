import Link from "next/link";
import { SignOutForm } from "@/modules/identity/components/SignOutForm";
import "./admin.css";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { CommandPalette } from "@/shared/admin-kit";
import { ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { AdminShell } from "./_components/AdminShell";
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
      items: actor.isAdmin
        ? group.items
        : ownLinks.filter((link) =>
            group.items.some(
              (item) => link.href === item.href || link.href.startsWith(`${item.href}/`),
            ),
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
