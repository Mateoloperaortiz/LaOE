import Link from "next/link";
import { requireAdminActor } from "@/modules/identity";
import { signOutAction } from "@/modules/identity/actions";
import { LogoOE, ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

// Administración: solo permiso ADMIN (las vistas parciales de líderes llegan en fases siguientes).
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminActor("/admin");
  const [temaOscuro, temaClaro] = tList("T-034") as [string, string];
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
          <div className="flex items-center gap-3">
            <Link href="/app" className="boton-secundario text-sm">
              {t("T-004")}
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="boton-secundario text-sm">
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
