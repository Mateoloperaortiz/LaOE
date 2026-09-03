import type { Metadata } from "next";
import { t } from "@/shared/copy";

// Metadata de una página pública (ADR-033): canonical relativo (lo resuelve metadataBase) y Open Graph
// completo, porque Next reemplaza el objeto openGraph del layout en vez de fusionarlo.

export function paginaMetadata(input: {
  title: string;
  description?: string | undefined;
  path: string;
}): Metadata {
  const description = input.description?.trim() || undefined;
  return {
    title: input.title,
    ...(description ? { description } : {}),
    alternates: { canonical: input.path },
    openGraph: {
      title: input.title,
      ...(description ? { description } : {}),
      url: input.path,
      siteName: t("T-001"),
      locale: "es_CO",
      type: "website",
    },
  };
}
