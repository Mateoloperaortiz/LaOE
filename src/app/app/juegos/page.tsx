import type { Metadata } from "next";
import Link from "next/link";
import { single } from "@/app/_lib/search";
import { requireActor } from "@/modules/identity";
import {
  getGamerLeaderboard,
  getGamerProfile,
  getTodayColor,
  getTodayGame2048,
  getTodayPanal,
  getTodaySudoku,
  getTodayWordle,
} from "@/modules/participation";
import { GamePreview } from "@/modules/participation/components/GamePreview";
import {
  GamerLeaderboard,
  GamerSeason,
  GamerStreak,
} from "@/modules/participation/components/GamerSeason";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { ActionForm } from "@/shared/ui/ActionForm";
import { ArrowRightIcon } from "@/shared/ui/icons/ArrowRightIcon";
import styles from "./Juegos.module.css";

// Catálogo A (ADR-134): Color protagonista, cuatro juegos conservados y clasificación real.
// Cada juego vive en su ruta: las lecturas del catálogo no inician partidas.

export const metadata: Metadata = { title: t("T-2621") };

type Estado = 0 | 1 | 2; // T-2623: disponible hoy · ya sumaste hoy · no disponible ahora

export default async function JuegosPage({ searchParams }: PageProps<"/app/juegos">) {
  const actor = await requireActor("/app/juegos");
  const search = await searchParams;
  const [wordle, game2048, sudoku, panal, color, terms, current] = await Promise.all([
    getTodayWordle(actor.personId),
    getTodayGame2048(actor.personId),
    getTodaySudoku(actor.personId),
    getTodayPanal(actor.personId),
    getTodayColor(actor.personId),
    listAllTerms(),
    getCurrentTerm(),
  ]);
  const term = terms.find((item) => item.id === single(search.semestre)) ?? current;
  const [profile, leaderboard] = term
    ? await Promise.all([getGamerProfile(actor.personId, term.id), getGamerLeaderboard(term.id)])
    : [null, []];
  const estados = tList("T-2623");
  const colorState: Estado = color.availability !== "AVAILABLE" ? 2 : color.credited ? 1 : 0;
  const closed = Boolean(term?.pointsClosedAt) || term?.id !== current?.id;
  const juegos = [
    {
      game: "WORDLE",
      href: "/app/juegos/wordle",
      nombre: t("T-2626"),
      resumen: t("T-2627"),
      estado: wordle.availability !== "AVAILABLE" ? 2 : wordle.game?.status === "WON" ? 1 : 0,
    },
    {
      game: "GAME2048",
      href: "/app/juegos/2048",
      nombre: t("T-2628"),
      resumen: t("T-2629"),
      estado: game2048.availability !== "AVAILABLE" ? 2 : game2048.credited ? 1 : 0,
    },
    {
      game: "SUDOKU",
      href: "/app/juegos/sudoku",
      nombre: t("T-2675"),
      resumen: t("T-2676"),
      estado: sudoku.availability !== "AVAILABLE" ? 2 : sudoku.credited ? 1 : 0,
    },
    {
      game: "PANAL",
      href: "/app/juegos/panal",
      nombre: t("T-2722"),
      resumen: t("T-2723"),
      estado: panal.availability !== "AVAILABLE" ? 2 : panal.game?.points ? 1 : 0,
    },
  ] as const;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <h1 className="text-display-lg">{t("T-2621")}</h1>
          <p className={styles.intro}>{t("T-3486")}</p>
        </div>
        <Link href="#mas-gamer" className={styles.rankingLink}>
          {t("T-3400")}
          <ArrowRightIcon />
        </Link>
      </header>

      <section className={styles.feature} aria-labelledby="color-feature-title">
        <div>
          <h2 id="color-feature-title" className={styles.featureQuestion}>
            {t("T-3488")}
          </h2>
          <p className={styles.featureText}>{t("T-3489")}</p>
          <Link href="/app/juegos/color" className={styles.featureAction}>
            {t("T-3490")}
            <ArrowRightIcon />
          </Link>
          <p className={styles.featureNote}>{t("T-3491")}</p>
          <div className="mt-3">
            <Insignia fondo={colorState === 1 ? "amarillo" : colorState === 0 ? "sky" : "paper"}>
              {estados[colorState] ?? ""}
            </Insignia>
          </div>
        </div>
        <div className={styles.featureArt}>
          <GamePreview game="COLOR" featured />
        </div>
      </section>

      <section aria-labelledby="games-catalogue-title">
        <h2 id="games-catalogue-title" className={styles.catalogueTitle}>
          {t("T-3492")}
        </h2>
        <ul className={styles.catalogue}>
          {juegos.map((juego) => (
            <li key={juego.href}>
              <Link href={juego.href} className={styles.gameLink}>
                <GamePreview game={juego.game} />
                <div className={styles.gameCopy}>
                  <h3 className={styles.gameName}>{juego.nombre}</h3>
                  <p className={styles.gameDescription}>{juego.resumen}</p>
                  <Insignia
                    fondo={juego.estado === 1 ? "amarillo" : juego.estado === 0 ? "sky" : "paper"}
                  >
                    {estados[juego.estado] ?? ""}
                  </Insignia>
                </div>
                <ArrowRightIcon />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div id="mas-gamer" className={styles.gamer}>
        {terms.length > 1 ? (
          <ActionForm action="/app/juegos#mas-gamer" method="get" className={styles.semester}>
            <label htmlFor="gamer-semestre">{t("T-550")}</label>
            <select
              id="gamer-semestre"
              name="semestre"
              defaultValue={term?.id}
              className="rounded-xl border-2 border-borde bg-fondo px-3 py-2"
            >
              {terms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code}
                </option>
              ))}
            </select>
            <button type="submit" className="boton-secundario px-3 py-2 text-sm">
              {t("T-250")}
            </button>
          </ActionForm>
        ) : null}
        {term && profile ? (
          <>
            <GamerSeason profile={profile} termCode={term.code} closed={closed} />
            <GamerStreak profile={profile} closed={closed} />
            <GamerLeaderboard
              leaderboard={leaderboard}
              personId={actor.personId}
              rankingMetric={profile.rankingMetric}
            />
          </>
        ) : (
          <p className="text-sm text-tinta-suave">{t("T-3437")}</p>
        )}
      </div>
    </div>
  );
}
