import type { ReactNode } from "react";
import { requireActor } from "@/modules/identity";
import { loadGamificationSettings } from "@/modules/participation";
import { PointsNav } from "./_ui/PointsNav";

// Sección GH Points de Mi OE: la subnavegación solo aparece cuando la gamificación está activa
// (ADR-067 regla 15); con la bandera apagada queda el resumen de siempre.
export default async function GhPointsLayout({ children }: { children: ReactNode }) {
  await requireActor("/app/gh-points");
  const settings = await loadGamificationSettings();
  return (
    <>
      <PointsNav enabled={settings.enabled} />
      {children}
    </>
  );
}
