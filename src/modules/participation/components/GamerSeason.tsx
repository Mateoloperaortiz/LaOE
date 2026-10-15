import { Insignia } from "@/shared/brand";
import { t } from "@/shared/copy";
import type { GamerProfile, GamerStanding } from "../gamer-types";

export function GamerSeason({
  profile,
  termCode,
  closed,
}: {
  profile: GamerProfile;
  termCode: string;
  closed: boolean;
}) {
  const dayStatus =
    profile.todayGames.length === 5
      ? "T-3468"
      : profile.launched
        ? profile.todayGames.length
          ? "T-3414"
          : "T-3415"
        : profile.todayGames.length
          ? "T-3466"
          : "T-3467";
  return (
    <section aria-labelledby="gamer-season" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-borde pb-3">
        <h2 id="gamer-season" className="text-display-md">
          {t("T-3400")}
        </h2>
        <span className="text-sm text-tinta-suave">{t("T-3401", { semestre: termCode })}</span>
      </div>
      {profile.rankingMetric === null ? (
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-3483")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {[
              profile.rankingMetric === "POINTS"
                ? [t("T-3477"), profile.points ?? "—"]
                : [t("T-3403"), profile.participations],
              profile.launched
                ? [
                    t("T-3411"),
                    t(profile.currentStreak === 1 ? "T-3457" : "T-3413", {
                      n: profile.currentStreak,
                    }),
                  ]
                : [t("T-3404"), profile.activeDays],
              [t("T-3405"), profile.rank === null ? t("T-3406") : t("T-3407", { n: profile.rank })],
              closed && profile.launched
                ? [t("T-3404"), profile.activeDays]
                : [t("T-3408"), t("T-3409", { n: profile.todayGames.length })],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-sm text-tinta-suave">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="max-w-prose text-sm">{t(closed ? "T-3417" : dayStatus)}</p>
        </>
      )}
    </section>
  );
}

export function GamerLeaderboard({
  leaderboard,
  personId,
  rankingMetric,
}: {
  leaderboard: readonly GamerStanding[];
  personId: string;
  rankingMetric: GamerProfile["rankingMetric"];
}) {
  if (rankingMetric === null) return null;
  const byPoints = rankingMetric === "POINTS";
  return (
    <section aria-labelledby="gamer-ranking" className="flex flex-col gap-4">
      <h2 id="gamer-ranking" className="text-display-md">
        {t("T-3425")}
      </h2>
      <p className="max-w-prose text-sm text-tinta-suave">{t(byPoints ? "T-3402" : "T-3480")}</p>
      <p className="max-w-prose text-sm text-tinta-suave">{t(byPoints ? "T-3426" : "T-3481")}</p>
      {leaderboard.length === 0 ? (
        <p className="text-sm text-tinta-suave">{t(byPoints ? "T-3427" : "T-3484")}</p>
      ) : (
        <section
          aria-labelledby="gamer-ranking"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: el teclado debe poder desplazar la clasificación cuando sus columnas no caben.
          tabIndex={0}
          className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-titulo"
        >
          <table className="w-full text-sm">
            <caption className="sr-only">{t("T-3425")}</caption>
            <thead>
              <tr className="text-left">
                <th scope="col" className="py-3 pr-3">
                  {t("T-3438")}
                </th>
                <th scope="col" className="py-3 pr-3">
                  {t("T-3428")}
                </th>
                {byPoints ? (
                  <th scope="col" className="py-3 pr-3 text-right">
                    {t("T-3477")}
                  </th>
                ) : null}
                <th scope="col" className="py-3 pr-3 text-right">
                  {t("T-3403")}
                </th>
                <th scope="col" className="py-3 text-right">
                  {t("T-3404")}
                </th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => (
                <tr
                  key={row.personId}
                  aria-current={row.personId === personId ? "true" : undefined}
                  className={`border-t border-borde ${row.personId === personId ? "bg-oe-yellow-soft text-oe-navy" : ""}`}
                >
                  <td className="py-3 pr-3 font-semibold tabular-nums">{row.rank}</td>
                  <th scope="row" className="py-3 pr-3 text-left font-semibold">
                    {row.anonymized ? t("T-223") : row.name}
                  </th>
                  {byPoints ? (
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums">
                      {row.points ?? "—"}
                    </td>
                  ) : null}
                  <td className="py-3 pr-3 text-right tabular-nums">{row.participations}</td>
                  <td className="py-3 text-right tabular-nums">{row.activeDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}

export function GamerStreak({ profile, closed }: { profile: GamerProfile; closed: boolean }) {
  if (profile.rankingMetric === null) return null;
  if (!profile.launched) {
    return (
      <section aria-labelledby="gamer-streak" className="flex flex-col gap-3">
        <h2 id="gamer-streak" className="text-display-md">
          {t("T-3410")}
        </h2>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-3461")}</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="gamer-streak">
      <div className="flex flex-col gap-4 rounded-[var(--radius-cartel)] border border-borde bg-fondo-alterno p-4 sm:p-5">
        <h2 id="gamer-streak" className="text-display-md">
          {t("T-3410")}
        </h2>
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-sm text-tinta-suave">{t("T-3412")}</dt>
            <dd className="font-semibold tabular-nums">
              {t(profile.longestStreak === 1 ? "T-3457" : "T-3413", { n: profile.longestStreak })}
            </dd>
          </div>
        </dl>
        {!closed ? (
          <p className="text-sm text-tinta-suave">
            {t(profile.weekWildcardUsed ? "T-3419" : "T-3418")}
          </p>
        ) : null}
        <ul className="flex list-none flex-wrap gap-2 p-0" aria-label={t("T-3420")}>
          {profile.milestones.map((milestone) => (
            <li key={milestone.days}>
              <Insignia fondo={milestone.reachedOn ? "amarillo" : "paper"}>
                {t(milestone.reachedOn ? "T-3421" : "T-3422", { n: milestone.days })}
              </Insignia>
            </li>
          ))}
        </ul>
        {profile.nextMilestone !== null ? (
          <p className="text-sm text-tinta-suave">
            {t("T-3423", {
              n: profile.nextMilestone,
              faltan: Math.max(0, profile.nextMilestone - profile.currentStreak),
            })}
          </p>
        ) : (
          <p className="text-sm font-semibold">{t("T-3424")}</p>
        )}
      </div>
    </section>
  );
}
