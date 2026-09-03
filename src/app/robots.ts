import type { MetadataRoute } from "next";
import { getEnv } from "@/env";

// robots.txt (ADR-033): cerrado salvo que PUBLIC_INDEXING sea true (solo producción). Es un route handler
// aparte del layout raíz: se fuerza dinámico para que next build no lo fije con el entorno del build.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const env = getEnv();
  if (!env.PUBLIC_INDEXING) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  const base = env.APP_URL.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/app", "/api", "/ingresar", "/a/", "/marca"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
