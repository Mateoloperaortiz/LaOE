import Link from "next/link";
import { LogoOE, ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

// Cabecera y pie del portal público. La navegación completa (T-038) llega con la fase 1;
// por ahora solo existen el inicio y la entrada a Mi OE.
export default function PublicLayout({ children }: LayoutProps<"/">) {
  const [temaOscuro, temaClaro] = tList("T-034") as [string, string];
  const contacto = tList("T-013").filter((item) => item !== "redes"); // redes: por confirmar (T-013)
  const [inicio] = tList("T-038");
  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-oe-yellow focus:px-4 focus:py-2 focus:text-oe-navy"
      >
        {t("T-035")}
      </a>
      <header className="border-b border-borde">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="text-titulo" aria-label={inicio}>
            <LogoOE height={64} />
          </Link>
          <nav aria-label={t("T-038").split("·")[0]?.trim()} className="flex items-center gap-3">
            <Link href="/ingresar" className="boton-primario text-sm">
              {t("T-004")}
            </Link>
            <ThemeToggle etiquetas={[temaOscuro, temaClaro]} />
          </nav>
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
          <div className="text-sm text-tinta-suave">
            <p className="eyebrow text-titulo">{t("T-031")}</p>
            <p className="mt-2">
              {contacto.map((item, index) => (
                <span key={item}>
                  {index > 0 ? " · " : null}
                  {item.includes("@") ? <a href={`mailto:${item}`}>{item}</a> : item}
                </span>
              ))}
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
