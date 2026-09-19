import type { Metadata } from "next";
import Link from "next/link";
import { requireActor } from "@/modules/identity";
import { getTodaySudoku } from "@/modules/participation";
import { Sudoku } from "@/modules/participation/components/Sudoku";
import { t } from "@/shared/copy";
import { abandonSudokuAction, finishSudokuAction, startSudokuAction } from "./actions";

// Sudoku de la biblioteca de juegos (ADR-078). El servidor genera el tablero y guarda la solución;
// aquí solo llegan las dadas, y la solución únicamente si la partida abierta es con ayudas.

export const metadata: Metadata = { title: t("T-2677") };

export default async function SudokuPage() {
  const actor = await requireActor("/app/juegos/sudoku");
  const hoy = await getTodaySudoku(actor.personId);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/juegos" className="text-sm font-semibold">
        {t("T-2621")}
      </Link>
      <h1 className="text-display-lg">{t("T-2675")}</h1>
      <Sudoku
        key={`${hoy.day}:${hoy.availability}`}
        initial={hoy}
        onStart={startSudokuAction}
        onFinish={finishSudokuAction}
        onAbandon={abandonSudokuAction}
      />
    </div>
  );
}
