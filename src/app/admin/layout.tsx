import Link from "next/link";
import { requireAdminActor } from "@/modules/identity";
import { signOutAction } from "@/modules/identity/actions";
import { CommandPalette } from "@/shared/admin-kit";
import { LogoOE, ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

// Administración: solo permiso ADMIN (las vistas parciales de líderes llegan en fases siguientes).
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminActor("/admin");
  const [temaOscuro, temaClaro] = tList("T-034") as [string, string];
  const [comites] = tList("T-261");
  const [terminos] = tList("T-262");
  const [permisos] = tList("T-263");
  const [paginas] = tList("T-330");
  const [cartelera] = tList("T-331");
  const [medios] = tList("T-334");
  const [eventos] = tList("T-332");
  const [persona, comite] = tList("T-290") as [string, string];
  const [personas, , cargos, etiquetas, tareas, segmentos] = tList("T-509");
  const enlaces = [
    { href: "/admin/personas", label: personas ?? "" },
    { href: "/admin/tareas", label: tareas ?? "" },
    { href: "/admin/segmentos", label: segmentos ?? "" },
    { href: "/admin/etiquetas", label: etiquetas ?? "" },
    { href: "/admin/paginas", label: paginas ?? "" },
    { href: "/admin/cartelera", label: cartelera ?? "" },
    { href: "/admin/eventos", label: eventos ?? "" },
    { href: "/admin/medios", label: medios ?? "" },
    { href: "/admin/comites", label: comites ?? "" },
    { href: "/admin/cargos", label: cargos ?? "" },
    { href: "/admin/terminos", label: terminos ?? "" },
    { href: "/admin/permisos", label: permisos ?? "" },
    { href: "/admin/sistema/jobs", label: t("T-241") },
  ];
  return (
    <>
      <header className="border-b border-borde bg-fondo-alterno textura-granito">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/admin"
            className="flex items-center gap-3 text-titulo"
            aria-label={t("T-236")}
          >
            <LogoOE height={56} />
            <span className="eyebrow">{t("T-236")}</span>
          </Link>
          <nav aria-label={t("T-236")} className="flex flex-wrap items-center gap-1">
            {enlaces.map((enlace) => (
              <Link
                key={enlace.href}
                href={enlace.href}
                className="rounded-full px-3 py-2 text-sm font-semibold text-titulo hover:bg-fondo-suave"
              >
                {enlace.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <CommandPalette
              endpoint="/api/admin/buscar"
              labels={{
                open: t("T-299"),
                placeholder: t("T-264"),
                empty: t("T-256"),
                close: t("T-291"),
                types: { person: persona, committee: comite },
              }}
            />
            <Link href="/app" className="boton-secundario min-h-10 px-4 py-2 text-sm">
              {t("T-004")}
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="boton-secundario min-h-10 px-4 py-2 text-sm">
                {t("T-231")}
              </button>
            </form>
            <ThemeToggle etiquetas={[temaOscuro, temaClaro]} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
