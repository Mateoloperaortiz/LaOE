import Link from "next/link";
import { listPublicAnnouncements } from "@/modules/content";
import {
  BarraTitulo,
  Cartel,
  Elemento,
  feedVariant,
  SelloOE,
  TituloAcentuado,
} from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { AnuncioCartel } from "./_ui/AnuncioCartel";

// Inicio: hero, macroeventos y cartelera. Los macroeventos salen de la base desde F1-T4.
export default async function HomePage() {
  const macroeventos = tList("T-039");
  const anuncios = await listPublicAnnouncements(3);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-8 sm:px-6 sm:py-12">
      <Cartel
        variante="paper"
        nivel="h1"
        tamano="hero"
        eyebrow={t("T-036")}
        titulo={<TituloAcentuado texto={t("T-002")} acento={2} />}
        subtitulo={t("T-003")}
        elemento={
          <Elemento
            tipo="bucle"
            className="absolute top-6 left-[38%] w-[46%] text-oe-blue opacity-70"
          />
        }
      >
        <div className="mt-2 flex flex-wrap gap-3">
          <Link href="/ingresar" className="boton-calido">
            {t("T-004")}
          </Link>
          <Link href="/comites" className="boton-secundario">
            {t("T-005")}
          </Link>
        </div>
      </Cartel>

      <section aria-labelledby="macroeventos" className="flex flex-col gap-8">
        <BarraTitulo color="azul" className="self-start">
          <span id="macroeventos">{t("T-006")}</span>
        </BarraTitulo>
        <p className="max-w-prose text-lg">{t("T-014")}</p>
        <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {macroeventos.map((nombre, index) => (
            <li key={nombre}>
              <Cartel
                variante={feedVariant(index)}
                nivel="h3"
                titulo={nombre}
                subtitulo={t("T-021")}
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cartelera" className="flex flex-col gap-8">
        <BarraTitulo color="amarillo" className="self-start">
          <span id="cartelera">{t("T-007")}</span>
        </BarraTitulo>
        {anuncios.length === 0 ? (
          <div className="flex flex-col items-start gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-8 textura-granito sm:flex-row sm:items-center sm:gap-10">
            <Elemento tipo="asterisco" className="size-24 shrink-0 text-oe-navy" />
            <div className="flex flex-col gap-4">
              <p className="text-lg">{t("T-009")}</p>
              <SelloOE tamano="sm" />
            </div>
          </div>
        ) : (
          <>
            <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {anuncios.map((anuncio, index) => (
                <li key={anuncio.id}>
                  <AnuncioCartel anuncio={anuncio} variante={feedVariant(index + 1)} />
                </li>
              ))}
            </ul>
            <Link href="/cartelera" className="boton-secundario self-start">
              {t("T-316")}
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
