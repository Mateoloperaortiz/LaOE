import { ImageResponse } from "next/og";
import type { CartelVariante } from "../Cartel";
import { FEED_VARIANTS } from "../feed";
import { isotipoSvg, ogFonts } from "./fonts";

// Cartel tipográfico para las imágenes para compartir (ADR-033): la misma pieza que el Cartel de la
// web, con estilos en línea porque Satori no entiende Tailwind ni SVG anidado ni texturas.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const PALETA: Record<CartelVariante, { fondo: string; tinta: string; acento: string }> = {
  paper: { fondo: "#f6f6f6", tinta: "#001f3e", acento: "#94b6f0" },
  azul: { fondo: "#94b6f0", tinta: "#001f3e", acento: "#001f3e" },
  amarillo: { fondo: "#ffd84b", tinta: "#001f3e", acento: "#ff881b" },
  naranja: { fondo: "#ff881b", tinta: "#001f3e", acento: "#ffd84b" },
  navy: { fondo: "#001f3e", tinta: "#f6f6f6", acento: "#ffd84b" },
};

/** Variante determinista para un identificador, siguiendo la rotación del feed. */
export function varianteDe(texto: string): CartelVariante {
  let hash = 0;
  for (const char of texto) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003;
  }
  return FEED_VARIANTS[hash % FEED_VARIANTS.length] ?? "azul";
}

/** El isotipo como silueta del color dado (la web lo usa como máscara, así que todo relleno es tinta). */
function isotipoDataUri(color: string): string {
  const svg = isotipoSvg.replace(/fill:\s*#[0-9a-fA-F]{3,6}/g, `fill: ${color}`);
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function tamanoTitulo(titulo: string): number {
  if (titulo.length > 48) return 68;
  if (titulo.length > 30) return 88;
  if (titulo.length > 18) return 112;
  return 136;
}

export interface CartelOGProps {
  variante: CartelVariante;
  eyebrow: string;
  titulo: string;
  subtitulo?: string;
  pie: string;
}

export function CartelOG({ variante, eyebrow, titulo, subtitulo, pie }: CartelOGProps) {
  const paleta = PALETA[variante];
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        backgroundColor: paleta.fondo,
        color: paleta.tinta,
        fontFamily: "Plus Jakarta Sans",
        position: "relative",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: Satori solo entiende img con data URI */}
      <img
        alt=""
        src={isotipoDataUri(paleta.tinta)}
        width={560}
        height={560}
        style={{ position: "absolute", right: -120, bottom: -150, opacity: 0.12 }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        <div style={{ width: 18, height: 18, backgroundColor: paleta.acento, display: "flex" }} />
        <span>{eyebrow}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
        <div
          style={{
            fontFamily: "Sofia Sans Extra Condensed",
            fontWeight: 900,
            fontSize: tamanoTitulo(titulo),
            lineHeight: 0.95,
            textTransform: "uppercase",
            display: "flex",
          }}
        >
          {titulo}
        </div>
        {subtitulo ? (
          <div style={{ fontSize: 30, lineHeight: 1.3, display: "flex", maxWidth: 900 }}>
            {subtitulo}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          opacity: 0.85,
        }}
      >
        {pie}
      </div>
    </div>
  );
}

export function ogResponse(props: CartelOGProps): ImageResponse {
  return new ImageResponse(<CartelOG {...props} />, {
    ...OG_SIZE,
    fonts: [
      { name: "Sofia Sans Extra Condensed", data: ogFonts.titulos, weight: 900, style: "normal" },
      { name: "Plus Jakarta Sans", data: ogFonts.contenido, weight: 600, style: "normal" },
    ],
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
}
