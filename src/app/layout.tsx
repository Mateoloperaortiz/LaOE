import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { fontContenido, fontTitulos } from "@/shared/brand";
import { t } from "@/shared/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: t("T-001"), template: `%s · ${t("T-001")}` },
  description: t("T-003"),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f6" },
    { media: "(prefers-color-scheme: dark)", color: "#001f3e" },
  ],
};

// Aplica el tema guardado antes del primer pintado para evitar el destello.
const temaGuardado = `(()=>{try{const t=localStorage.getItem("oe-tema");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch{}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="es-CO"
      data-scroll-behavior="smooth"
      className={`${fontTitulos.variable} ${fontContenido.variable} h-full`}
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script estático sin datos externos */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: temaGuardado }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
