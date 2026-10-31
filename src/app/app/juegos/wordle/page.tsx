import type { Metadata } from "next";
import { requireActor } from "@/modules/identity";
import { getTodayWordle } from "@/modules/participation";
import { Wordle } from "@/modules/participation/components/Wordle";
import { t } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { startWordleAction, submitWordleAction } from "./actions";

// Wordle diario (ADR-041), mudado aquí desde el resumen de GH Points por ADR-075 regla 1. Ninguna
// regla del juego cambia: es el mismo tablero, el mismo día civil y los mismos premios.

export const metadata: Metadata = { title: t("T-1230") };

export default async function WordleJuegoPage() {
  const actor = await requireActor("/app/juegos/wordle");
  const wordle = await getTodayWordle(actor.personId);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/juegos" className="text-sm font-semibold">
        {t("T-2621")}
      </Link>
      <h1 className="text-display-lg">{t("T-2626")}</h1>
      <Wordle
        key={`${wordle.day}:${wordle.availability}:${wordle.game?.id ?? "new"}:${wordle.game?.attempts.length ?? 0}:${wordle.game?.status ?? "new"}`}
        initial={wordle}
        onStart={startWordleAction}
        onGuess={submitWordleAction}
      />
    </div>
  );
}
