import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BarraTitulo,
  Cartel,
  type CartelVariante,
  Elemento,
  type ElementoTipo,
  FEED_VARIANTS,
  feedVariant,
  Insignia,
  IsotipoDecorativo,
  LogoComite,
  LogoOE,
  Numeral,
  SelloOE,
} from "@/shared/brand";
import { copyStatus, t } from "@/shared/copy";
import { textos } from "@/shared/copy/textos.generated";

export const metadata: Metadata = { title: "Muestrario de marca", robots: { index: false } };

const VARIANTES: CartelVariante[] = ["paper", "azul", "amarillo", "naranja", "navy"];
const ELEMENTOS: ElementoTipo[] = [
  "estrella",
  "destello",
  "asterisco",
  "barras",
  "escalera",
  "franjas",
  "bucle",
  "bucle-doble",
  "espiral",
];
const COLORES = [
  ["oe-navy", "bg-oe-navy"],
  ["oe-blue", "bg-oe-blue"],
  ["oe-sky", "bg-oe-sky"],
  ["oe-yellow", "bg-oe-yellow"],
  ["oe-orange", "bg-oe-orange"],
  ["oe-paper", "bg-oe-paper"],
  ["oe-yellow-soft", "bg-oe-yellow-soft"],
  ["oe-orange-soft", "bg-oe-orange-soft"],
  ["oe-blue-soft", "bg-oe-blue-soft"],
  ["oe-cream", "bg-oe-cream"],
  ["oe-ink", "bg-oe-ink"],
] as const;
const COMITES = ["a3", "pixel", "cigma", "gemis", "eco", "vision"];

// Muestrario de la línea gráfica para revisar cada pieza contra docs/07-marca.md. Solo en desarrollo.
export default function MarcaPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const pendientes = (Object.keys(textos) as (keyof typeof textos)[]).filter((code) =>
    copyStatus(code).startsWith("Pendiente"),
  );
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">Solo en desarrollo</p>
        <h1 className="text-display-lg">Muestrario de marca</h1>
        <p className="max-w-prose text-lg">
          Cada pieza de la línea gráfica traducida a la web, para revisarla contra el manual en
          claro y oscuro y en tres anchos.
        </p>
      </header>

      <section className="flex flex-col gap-6">
        <BarraTitulo color="azul" className="self-start">
          Color
        </BarraTitulo>
        <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4 lg:grid-cols-6">
          {COLORES.map(([nombre, clase]) => (
            <li key={nombre} className="flex flex-col gap-2">
              <span className={`block h-16 rounded-lg border border-borde ${clase}`} />
              <code className="text-xs">{nombre}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-6">
        <BarraTitulo color="amarillo" className="self-start">
          Tipografía
        </BarraTitulo>
        <p className="font-display text-display-xl uppercase">Títulos condensados</p>
        <p className="text-titulo-lg font-semibold">Subtítulos en la familia de contenido</p>
        <p className="max-w-prose">
          Cuerpo con interlineado amplio y párrafos cortos. El manual no usa cursivas; la web
          tampoco.
        </p>
        <p className="eyebrow">Etiqueta pequeña con espaciado amplio</p>
        <div className="flex items-end gap-6">
          <Numeral valor={1} className="text-display-xl" />
          <Numeral valor={2} className="text-display-xl" />
          <Numeral valor={3} className="text-display-xl" />
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <BarraTitulo color="naranja" className="self-start">
          Carteles
        </BarraTitulo>
        <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {VARIANTES.map((variante) => (
            <li key={variante}>
              <Cartel
                variante={variante}
                nivel="h3"
                titulo={variante}
                subtitulo="Con textura e isotipo"
              />
            </li>
          ))}
          <li>
            <Cartel
              variante="azul"
              nivel="h3"
              titulo="Con logo"
              comite={{ slug: "a3", name: "A3" }}
              isotipo={false}
            />
          </li>
        </ul>
        <p className="text-sm text-tinta-suave">
          Rotación del feed: {FEED_VARIANTS.map((_, index) => feedVariant(index)).join(" → ")}
        </p>
      </section>

      <section className="flex flex-col gap-6">
        <BarraTitulo color="sky" className="self-start">
          Elementos gráficos
        </BarraTitulo>
        <ul className="grid list-none grid-cols-3 gap-6 p-0 sm:grid-cols-5 lg:grid-cols-9">
          {ELEMENTOS.map((tipo, index) => (
            <li key={tipo} className="flex flex-col items-center gap-2">
              <Elemento
                tipo={tipo}
                className={`size-20 ${index % 3 === 0 ? "text-oe-orange" : index % 3 === 1 ? "text-oe-blue" : "text-oe-yellow"}`}
              />
              <code className="text-xs">{tipo}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-6">
        <BarraTitulo color="blue-soft" className="self-start">
          Logos
        </BarraTitulo>
        <div className="flex flex-wrap items-end gap-8 text-titulo">
          <LogoOE height={140} />
          <span className="rounded-xl bg-oe-navy p-4 text-oe-paper">
            <LogoOE height={140} />
          </span>
          <IsotipoDecorativo size={120} className="opacity-30" />
          {COMITES.map((slug) => (
            <LogoComite key={slug} slug={slug} name={slug.toUpperCase()} size={72} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <BarraTitulo color="yellow-soft" className="self-start">
          Insignias y sello
        </BarraTitulo>
        <div className="flex flex-wrap gap-2">
          <Insignia fondo="amarillo">Activo</Insignia>
          <Insignia fondo="azul">General de A3</Insignia>
          <Insignia fondo="naranja">Nuevo</Insignia>
          <Insignia fondo="navy">Honorario</Insignia>
          <Insignia fondo="sky">En licencia</Insignia>
          <Insignia fondo="paper">Retirado</Insignia>
        </div>
        <SelloOE tamano="lg" />
      </section>

      <section className="flex flex-col gap-4">
        <BarraTitulo color="azul" className="self-start">
          Textos pendientes
        </BarraTitulo>
        <p className="max-w-prose">
          {pendientes.length} textos del inventario siguen marcados como pendientes; el código
          muestra su propuesta o nada, nunca inventa.
        </p>
        <ul className="grid list-none gap-1 p-0 text-sm sm:grid-cols-2">
          {pendientes.map((code) => (
            <li key={code}>
              <code>{code}</code> · {textos[code].where}
            </li>
          ))}
        </ul>
        <p className="text-sm text-tinta-suave">{t("T-009")}</p>
      </section>
    </div>
  );
}
