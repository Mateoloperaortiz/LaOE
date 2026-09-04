import Link from "next/link";
import { requireActor } from "@/modules/identity";
import { signOutAction } from "@/modules/identity/actions";
import { LogoOE, ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

// Mi OE: solo con sesión válida (activos y honorarios). Las pestañas de T-061 se habilitan por fase.
const RUTAS: Record<string, string> = {
  Inicio: "/app",
  Comités: "/app/comites",
  Personas: "/app/personas",
  Egresados: "/app/egresados",
  "GH Points": "/app/gh-points",
  Normativa: "/app/normativa",
  Carnet: "/app/carnet",
  Ajustes: "/app/ajustes",
};

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  await requireActor("/app");
  const [temaOscuro, temaClaro] = tList("T-034") as [string, string];
  const pestañas = tList("T-061").filter((nombre) => nombre in RUTAS);
  return (
    <>
      <header className="border-b border-borde">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/app" className="text-titulo" aria-label={t("T-017") ? "Mi OE" : "Mi OE"}>
            <LogoOE height={56} />
          </Link>
          <nav aria-label="Mi OE" className="flex flex-wrap items-center gap-1">
            {pestañas.map((nombre) => (
              <Link
                key={nombre}
                href={RUTAS[nombre] ?? "/app"}
                className="rounded-full px-3 py-2 font-semibold text-titulo hover:bg-fondo-suave"
              >
                {nombre}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
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
