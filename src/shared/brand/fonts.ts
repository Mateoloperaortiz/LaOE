import localFont from "next/font/local";

// Sustitutos libres (OFL) de TT Bluescreens y NouvelR, servidos desde el mismo origen (07-marca.md).
// El subconjunto latin cubre el español completo (tildes, ñ, ¿ ¡).

export const fontTitulos = localFont({
  src: "./fonts/sofia-sans-extra-condensed-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-titulos",
  fallback: ["Arial Narrow", "Impact", "sans-serif"],
});

export const fontContenido = localFont({
  src: "./fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  variable: "--font-contenido",
  fallback: ["system-ui", "Segoe UI", "Helvetica Neue", "sans-serif"],
});
