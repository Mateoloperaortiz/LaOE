"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t, tLabels } from "@/shared/copy/client";

// Pestañas de GH Points (T-2402): Resumen, Retos, Boosters, Colección. Las dos últimas llegan en
// G-T4/G-T5: el enlace queda y responde 404 hasta entonces. Con la bandera apagada no hay
// pestañas que mostrar.

const HREFS = [
  "/app/gh-points",
  "/app/gh-points/retos",
  "/app/gh-points/boosters",
  "/app/gh-points/coleccion",
] as const;

export function PointsNav({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const labels = tLabels("T-2402", HREFS);
  const items = enabled ? HREFS : HREFS.slice(0, 1);
  if (items.length <= 1) {
    return null;
  }
  return (
    <nav aria-label={t("T-080")} className="mb-6 flex flex-wrap gap-2">
      {items.map((href) => {
        const current = href === "/app/gh-points" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              current ? "bg-oe-navy text-oe-paper" : "border border-borde text-titulo"
            }`}
          >
            {labels[href] ?? href}
          </Link>
        );
      })}
    </nav>
  );
}
