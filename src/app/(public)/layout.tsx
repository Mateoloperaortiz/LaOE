import { LogoOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { PublicHeader } from "./_ui/PublicHeader";
import "./portal.css";

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
  const contacto = tList("T-013").filter((item) => item !== "redes"); // redes: por confirmar (T-013)
  const enlaces = tList("T-038").filter((nombre) => nombre in RUTAS);
  return (
    <div className="portal-shell">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-oe-yellow focus:px-4 focus:py-2 focus:text-oe-navy"
      >
        {t("T-035")}
      </a>
      <PublicHeader destinations={enlaces.map((name) => ({ name, href: RUTAS[name] ?? "/" }))} />
      <main id="contenido" tabIndex={-1} className="flex-1">
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
    </div>
  );
}
