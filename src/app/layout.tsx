import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { getEnv } from "@/env";
import { fontContenido, fontTitulos } from "@/shared/brand";
import { t } from "@/shared/copy";
import "./globals.css";

// Metadata base del sitio (ADR-033): metadataBase desde APP_URL y noindex salvo PUBLIC_INDEXING.
export async function generateMetadata(): Promise<Metadata> {
  const env = getEnv();
  return {
    metadataBase: new URL(env.APP_URL),
    title: { default: t("T-001"), template: `%s · ${t("T-001")}` },
    description: t("T-003"),
    openGraph: { siteName: t("T-001"), locale: "es_CO", type: "website" },
    ...(env.PUBLIC_INDEXING ? {} : { robots: { index: false, follow: false } }),
  };
}

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
