import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor } from "@/modules/identity";
import {
  type AchievementRow,
  type CollectionFamily,
  collectionFor,
  loadGamificationSettings,
} from "@/modules/participation";
import { BadgeArt } from "@/modules/participation/components/BadgeArt";
import { BadgeUnlock } from "@/modules/participation/components/BadgeUnlock";
import { listAllTerms } from "@/modules/terms";
import { Insignia, Progreso } from "@/shared/brand";
import { type CopyCode, t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { Vacio } from "../../_ui/Vacio";
import { markSeenAction, setFeaturedAction } from "./actions";

// La colección del miembro (ADR-067 reglas 9 y 10): cada familia con sus tres niveles, el
// progreso sobre toda la historia, las ediciones especiales y el diálogo de desbloqueo de lo que
// todavía no vio. El filtro por semestre limita los logros mostrados, no la cuenta.

export const metadata: Metadata = { title: t("T-2471") };

type FactFamily = CollectionFamily["family"];

const FAMILY_INDEX: Record<FactFamily, number> = {
  EN_PARCHE: 0,
  EXPLORADOR: 1,
  RELAMPAGO: 2,
  PALABRA_A_PALABRA: 3,
};

const FAMILY_DESCRIPTION: Record<FactFamily, CopyCode> = {
  EN_PARCHE: "T-2474",
  EXPLORADOR: "T-2476",
  RELAMPAGO: "T-2478",
  PALABRA_A_PALABRA: "T-2480",
};

const FAMILY_CONDITIONS: Record<FactFamily, CopyCode> = {
  EN_PARCHE: "T-2475",
  EXPLORADOR: "T-2477",
  RELAMPAGO: "T-2479",
  PALABRA_A_PALABRA: "T-2481",
};

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** El origen del logro con los textos de T-2576 según `sourceKind`. */
function originText(achievement: AchievementRow, origin: string): string {
  const origins = tList("T-2576");
  switch (achievement.sourceKind) {
    case "CHECKIN":
      return origins[0]?.replace("{actividad}", origin) ?? origin;
    case "CHALLENGE":
      return origins[1]?.replace("{reto}", origin) ?? origin;
    case "WORDLE":
      return origins[2]?.replace("{fecha}", origin) ?? origin;
    case "HISTORICAL":
      return origins[3] ?? "";
    default:
      return origins[4] ?? origin;
  }
}

function LevelPiece({
  family,
  level,
  back,
}: {
  family: CollectionFamily;
  level: CollectionFamily["levels"][number];
  back: string;
}) {
  const conditions = tList(FAMILY_CONDITIONS[family.family]);
  const unlocked = level.achievement !== null && level.achievement.revokedAt === null;
  const revoked = level.achievement !== null && level.achievement.revokedAt !== null;
  const levelLabel = t("T-2482", { nivel: level.badge.level });
  return (
    <li className="flex items-start gap-4 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4">
      <BadgeArt
        family={family.family}
        level={level.badge.level}
        unlocked={unlocked}
        className="mt-1"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{levelLabel}</span>
          {level.achievement?.featuredPosition ? (
            <Insignia fondo="amarillo">{t("T-2502")}</Insignia>
          ) : null}
        </p>
        {unlocked && level.achievement ? (
          <>
            <p className="text-sm text-tinta-suave">
              {t("T-2485", {
                fecha: formatDate(level.achievement.unlockedAt),
                origen: originText(level.achievement, level.origin),
              })}
            </p>
            {level.achievement.historical ? (
              <p className="text-sm text-tinta-suave">{t("T-2487")}</p>
            ) : null}
            <form action={setFeaturedAction}>
              <input type="hidden" name="achievementId" value={level.achievement.id} />
              <input type="hidden" name="back" value={back} />
              <input
                type="hidden"
                name="featured"
                value={level.achievement.featuredPosition ? "0" : "1"}
              />
              <button type="submit" className="boton-secundario text-sm">
                {level.achievement.featuredPosition ? t("T-2492") : t("T-2491")}
              </button>
            </form>
          </>
        ) : revoked ? (
          <p className="text-sm text-tinta-suave">
            {t("T-2488", { motivo: t(FAMILY_DESCRIPTION[family.family]) })}
          </p>
        ) : (
          <p className="text-sm text-tinta-suave">
            {t("T-2484", {
              condición: conditions[level.badge.level - 1] ?? "",
            })}
          </p>
        )}
      </div>
    </li>
  );
}

export default async function ColeccionPage({
  searchParams,
}: PageProps<"/app/gh-points/coleccion">) {
  const actor = await requireActor("/app/gh-points/coleccion");
  const settings = await loadGamificationSettings();
  if (!settings.enabled) {
    redirect("/app/gh-points");
  }
  const params = await searchParams;
  const semester = single(params.semestre);
  const error = single(params.error);
  const [collection, allTerms] = await Promise.all([
    collectionFor(actor.personId, { termId: semester || null }),
    listAllTerms(),
  ]);
  const termCode = new Map(allTerms.map((row) => [row.id, row.code]));
  const familyNames = tList("T-2473");
  const back = `/app/gh-points/coleccion${semester ? `?semestre=${semester}` : ""}`;
  const hasAny =
    collection.specials.length > 0 ||
    collection.families.some((family) => family.levels.some((level) => level.achievement !== null));

  return (
    <div className="flex flex-col gap-8">
      <BadgeUnlock
        unseen={collection.unseen.map((item) => ({
          achievementId: item.achievement.id,
          name: item.badge.name,
          family: item.badge.family,
          level: item.badge.level,
          boosterKind: item.boosterKind,
        }))}
        onSeen={markSeenAction}
      />
      <header className="flex flex-col gap-2">
        <h1 className="text-display-lg">{t("T-2471")}</h1>
        <p className="max-w-2xl text-tinta-suave">{t("T-2472")}</p>
        <p className="text-sm text-tinta-suave">{t("T-2494")}</p>
      </header>
      {collection.terms.length > 0 ? (
        <form method="get" className="member-filter">
          <div className="flex flex-col gap-1">
            <label htmlFor="semestre" className="eyebrow text-xs">
              {t("T-2489")}
            </label>
            <select
              id="semestre"
              name="semestre"
              defaultValue={semester}
              className="rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none"
            >
              <option value="">{t("T-2490")}</option>
              {collection.terms.map((id) => (
                <option key={id} value={id}>
                  {termCode.get(id) ?? id}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="boton-secundario">
            {t("T-250")}
          </button>
        </form>
      ) : null}
      {error === "destacadas" ? (
        <p role="alert" className="text-sm text-oe-orange">
          {t("T-2493")}
        </p>
      ) : null}
      {!hasAny ? <Vacio texto={t("T-2500")} elemento="estrella" color="text-oe-blue" /> : null}
      {collection.families.map((family) => (
        <section key={family.family} className="flex flex-col gap-3">
          <header className="flex flex-col gap-1">
            <h2 className="text-display-md">{familyNames[FAMILY_INDEX[family.family]]}</h2>
            <p className="text-sm text-tinta-suave">{t(FAMILY_DESCRIPTION[family.family])}</p>
          </header>
          <div className="flex flex-col gap-1">
            <Progreso
              valor={family.progress.current}
              maximo={
                family.progress.next ??
                family.levels.at(-1)?.badge.threshold ??
                family.progress.current
              }
              nombre={familyNames[FAMILY_INDEX[family.family]] ?? family.family}
              etiqueta={t("T-2483", {
                n: family.progress.current,
                total:
                  family.progress.next ??
                  family.levels.at(-1)?.badge.threshold ??
                  family.progress.current,
              })}
            />
            <output className="text-sm text-tinta-suave">
              {t("T-2483", {
                n: family.progress.current,
                total:
                  family.progress.next ??
                  family.levels.at(-1)?.badge.threshold ??
                  family.progress.current,
              })}
            </output>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {family.levels.map((level) => (
              <LevelPiece key={level.badge.id} family={family} level={level} back={back} />
            ))}
          </ul>
        </section>
      ))}
      {collection.specials.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-display-md">{familyNames[4]}</h2>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {collection.specials.map((item) => (
              <li
                key={item.achievement.id}
                className="flex items-start gap-4 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
              >
                <BadgeArt family="SPECIAL" level={1} unlocked className="mt-1" />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium">{item.badge.name}</p>
                  <p className="text-sm text-tinta-suave">{t("T-2501", { origen: item.origin })}</p>
                  <p className="text-sm text-tinta-suave">
                    {t("T-2485", {
                      fecha: formatDate(item.achievement.unlockedAt),
                      origen: item.origin,
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
