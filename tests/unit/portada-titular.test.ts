import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PublicEdition } from "@/modules/events";
import { t, tList } from "@/shared/copy";

// ADR-189 regla 3: el titular de la portada se dibuja distinto en cada momento. Aquí se dibuja cada
// uno con datos sintéticos y se lee lo que ve el visitante: el título, la acción y el sello.

// Se conservan las piezas reales; se evita cargar next/font desde el barrel de marca.
vi.mock("@/shared/brand", async () => {
  const { Elemento } = await import("@/shared/brand/Elemento");
  const { TituloAcentuado } = await import("@/shared/brand/TituloAcentuado");
  return { Elemento, TituloAcentuado };
});
// Las fechas se escriben en la zona de la app.
vi.mock("@/env", () => ({ getEnv: () => ({ APP_TIMEZONE: "America/Bogota" }) }));
vi.mock("@/modules/content", () => ({
  Imagen: ({ alt }: { alt: string }) => createElement("img", { alt }),
}));

const { PortadaTitular } = await import("@/app/(public)/_ui/PortadaTitular");

const proximo = {
  id: "edicion-sintetica",
  slug: "sintetica",
  name: "Edición sintética",
  startsAt: new Date("2026-03-12T23:00:00Z"),
  endsAt: null,
  location: "Lugar sintético",
  event: { slug: "evento-sintetico", name: "Evento sintético" },
} as unknown as PublicEdition;

function dibujar(props: Parameters<typeof PortadaTitular>[0]): string {
  return renderToStaticMarkup(createElement(PortadaTitular, props));
}

/** El texto de la primera etiqueta que abre con `apertura` (por ejemplo `h1` o `p class="x"`). */
function texto(html: string, apertura: string): string {
  const etiqueta = apertura.split(" ")[0];
  const match = html.match(new RegExp(`<${apertura}[^>]*>(.*?)</${etiqueta}>`, "s"));
  return (match?.[1] ?? "")
    .replace(/<br\/?>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("PortadaTitular", () => {
  it("con la convocatoria abierta invita a postularse y dice hasta cuándo", () => {
    const html = dibujar({
      momento: { tipo: "convocatoria" },
      admision: { slug: "admision-sintetica", closesAt: new Date("2026-03-20T23:00:00Z") },
      proximo,
      portadaProximo: null,
    });
    expect(texto(html, "h1")).toBe(t("T-025"));
    expect(html).toContain('href="/f/admision-sintetica"');
    expect(html).toContain(t("T-027"));
    const [abierta] = tList("T-5034").map((parte) => parte.split(" {")[0]);
    expect(html).toContain(abierta);
    expect(html).toContain("20 de marzo de 2026");
  });

  it("sin fecha de cierre no promete una", () => {
    const html = dibujar({
      momento: { tipo: "convocatoria" },
      admision: { slug: "admision-sintetica", closesAt: null },
      proximo: null,
      portadaProximo: null,
    });
    const [, cierra] = tList("T-5034");
    expect(html).not.toContain((cierra ?? "").split(" {")[0]);
  });

  it("en semana de evento el titular es la edición, con su enlace y cuánto falta", () => {
    const [faltan, dias, falta, dia, es, hoy] = tList("T-5036");
    const html = dibujar({
      momento: { tipo: "evento", dias: 3 },
      admision: null,
      proximo,
      portadaProximo: null,
    });
    expect(texto(html, "h1")).toBe("Edición sintética");
    expect(html).toContain('href="/eventos/evento-sintetico/sintetica"');
    expect(html).toContain(tList("T-5035")[0]);
    expect(texto(html, 'p class="portal-afiche-fecha"')).toBe("12 de marzo");
    expect(texto(html, 'p class="portal-sello-redondo"')).toBe(`${faltan} 3 ${dias}`);

    const manana = dibujar({
      momento: { tipo: "evento", dias: 1 },
      admision: null,
      proximo,
      portadaProximo: null,
    });
    expect(texto(manana, 'p class="portal-sello-redondo"')).toBe(`${falta} 1 ${dia}`);
    const ahora = dibujar({
      momento: { tipo: "evento", dias: 0 },
      admision: null,
      proximo,
      portadaProximo: null,
    });
    expect(texto(ahora, 'p class="portal-sello-redondo"')).toBe(`${es} ${hoy}`);
  });

  it("el resto del semestre muestra el lema y lleva a cómo unirse", () => {
    const html = dibujar({
      momento: { tipo: "semestre" },
      admision: null,
      proximo,
      portadaProximo: null,
    });
    expect(texto(html, "h1")).toBe(t("T-002"));
    expect(html).toContain('href="/unirse"');
    expect(html).toContain(t("T-1543"));
    expect(html).not.toContain(t("T-027"));
  });
});
