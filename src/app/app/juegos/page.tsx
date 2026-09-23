import type { Metadata } from "next";
import Link from "next/link";
import { requireActor } from "@/modules/identity";
import {
  getTodayGame2048,
  getTodayPanal,
  getTodaySudoku,
  getTodayWordle,
} from "@/modules/participation";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

// Biblioteca de juegos de Mi OE (ADR-075 regla 1, ADR-078): una tarjeta por juego con su estado del día.
// El tablero de cada juego vive en su propia ruta; aquí no se juega ni se reparte ninguna semilla.

export const metadata: Metadata = { title: t("T-2621") };

type Estado = 0 | 1 | 2; // T-2623: disponible hoy · ya sumaste hoy · no disponible ahora

export default async function JuegosPage() {
  const actor = await requireActor("/app/juegos");
  const [wordle, game2048, sudoku, panal] = await Promise.all([
    getTodayWordle(actor.personId),
    getTodayGame2048(actor.personId),
    getTodaySudoku(actor.personId),
    getTodayPanal(actor.personId),
  ]);
  const estados = tList("T-2623");
  const juegos: { href: string; nombre: string; resumen: string; estado: Estado }[] = [
    {
      href: "/app/juegos/wordle",
      nombre: t("T-2626"),
      resumen: t("T-2627"),
      estado: wordle.availability !== "AVAILABLE" ? 2 : wordle.game?.status === "WON" ? 1 : 0,
    },
    {
      href: "/app/juegos/2048",
      nombre: t("T-2628"),
      resumen: t("T-2629"),
      estado: game2048.availability !== "AVAILABLE" ? 2 : game2048.credited ? 1 : 0,
    },
    {
      href: "/app/juegos/sudoku",
      nombre: t("T-2675"),
      resumen: t("T-2676"),
      estado: sudoku.availability !== "AVAILABLE" ? 2 : sudoku.credited ? 1 : 0,
    },
    {
      href: "/app/juegos/panal",
      nombre: t("T-2722"),
      resumen: t("T-2723"),
      estado: panal.availability !== "AVAILABLE" ? 2 : panal.game?.points ? 1 : 0,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-lg">{t("T-2621")}</h1>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2622")}</p>
      </header>

      <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
        {juegos.map((juego) => (
          <li key={juego.href}>
            <Link
              href={juego.href}
              className="flex h-full flex-col gap-3 rounded-[var(--radius-cartel)] border-2 border-borde bg-fondo-alterno p-5 no-underline"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="text-display-md">{juego.nombre}</h2>
                <Insignia
                  fondo={juego.estado === 1 ? "amarillo" : juego.estado === 0 ? "sky" : "paper"}
                >
                  {estados[juego.estado] ?? ""}
                </Insignia>
              </div>
              <p className="text-sm text-tinta-suave">{juego.resumen}</p>
              <span className="mt-auto font-semibold text-enlace">{t("T-2624")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
