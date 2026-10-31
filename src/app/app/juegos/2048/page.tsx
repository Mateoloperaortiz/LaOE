import type { Metadata } from "next";
import { requireActor } from "@/modules/identity";
import { getTodayGame2048 } from "@/modules/participation";
import { Game2048 } from "@/modules/participation/components/Game2048";
import { t } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { finishGame2048Action, startGame2048Action } from "./actions";

// 2048 de la biblioteca de juegos (ADR-075). El tablero corre en el navegador; el servidor reparte
// la semilla y rejuega la partida para acreditar, así que aquí no se calcula ningún puntaje.

export const metadata: Metadata = { title: t("T-2630") };

export default async function Game2048Page() {
  const actor = await requireActor("/app/juegos/2048");
  const hoy = await getTodayGame2048(actor.personId);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/juegos" className="text-sm font-semibold">
        {t("T-2621")}
      </Link>
      <h1 className="text-display-lg">{t("T-2628")}</h1>
      <Game2048
        key={`${hoy.day}:${hoy.availability}`}
        initial={hoy}
        onStart={startGame2048Action}
        onFinish={finishGame2048Action}
      />
    </div>
  );
}
