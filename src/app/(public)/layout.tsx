import Link from "next/link";
import { LogoOE, ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { NavLink } from "@/shared/ui/NavLink";

// Cabecera y pie del portal público. La navegación es T-038.
const RUTAS: Record<string, string> = {
  Inicio: "/",
  "La OE": "/la-oe",
  Cartelera: "/cartelera",
  Eventos: "/eventos",
  Comités: "/comites",
  Unirse: "/unirse",
};

export default function PublicLayout({ children }: LayoutProps<"/">) {
  const [temaOscuro, temaClaro] = tList("T-034") as [string, string];
  const contacto = tList("T-013").filter((item) => item !== "redes"); // redes: por confirmar (T-013)
  const [inicio] = tList("T-038");
  const enlaces = tList("T-038").filter((nombre) => nombre in RUTAS);
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-oe-yellow focus:px-4 focus:py-2 focus:text-oe-navy"
      >
        {t("T-035")}
      </a>
      <header className="border-b border-borde">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link href="/" className="text-titulo" aria-label={inicio}>
            <LogoOE height={64} />
          </Link>
          <nav
            aria-label={inicio}
            className="order-3 flex w-full flex-wrap gap-1 sm:order-none sm:w-auto"
          >
            {enlaces.map((nombre) => (
              <NavLink
                key={nombre}
                href={RUTAS[nombre] ?? "/"}
                className="rounded-full px-3 py-2 font-semibold text-titulo no-underline hover:bg-fondo-suave"
                activeClassName="shadow-[inset_0_-4px_0_0_var(--color-oe-blue)]"
              >
                {nombre}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/ingresar" className="boton-primario text-sm">
              {t("T-004")}
            </Link>
            <ThemeToggle etiquetas={[temaOscuro, temaClaro]} />
          </div>
        </div>
      </header>
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <footer className="mt-16 border-t border-borde bg-fondo-alterno textura-granito">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div className="text-titulo">
            <LogoOE height={96} />
          </div>
          <div className="flex flex-col gap-2 text-sm text-tinta-suave">
            <p className="eyebrow text-titulo">{t("T-031")}</p>
            <p>
              {contacto.map((item, index) => (
                <span key={item}>
                  {index > 0 ? " · " : null}
                  {item.includes("@") ? <a href={`mailto:${item}`}>{item}</a> : item}
                </span>
              ))}
            </p>
            <p>
              <Link href="/privacidad">{t("T-319")}</Link>
              {" · "}
              <a href="/api/ics/publico.ics">{t("T-320")}</a>
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
