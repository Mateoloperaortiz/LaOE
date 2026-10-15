import { t } from "@/shared/copy";
import type { GamerRankingMetric, GamerStanding } from "../gamer-types";
import styles from "./GamerPodium.module.css";

export function GamerPodium({
  leaderboard,
  personId,
  rankingMetric,
}: {
  leaderboard: readonly GamerStanding[];
  personId: string;
  rankingMetric: GamerRankingMetric;
}) {
  const groups = [1, 2, 3]
    .map((rank) => ({ rank, members: leaderboard.filter((row) => row.rank === rank) }))
    .filter((group) => group.members.length > 0);
  if (groups.length === 0) return null;
  const shared = groups.some((group) => group.members.length > 1);
  const limited = leaderboard.length === 10 && (leaderboard.at(-1)?.rank ?? 4) <= 3;

  return (
    <section aria-labelledby="gamer-podium-title" className={styles.podium}>
      <h3 id="gamer-podium-title" className={styles.title}>
        {t("T-3549")}
      </h3>
      <ol
        aria-label={t("T-3549")}
        className={styles.places}
        data-count={groups.length}
        data-shared={shared}
      >
        {groups.map(({ rank, members }) => (
          <li key={rank} className={styles.place} data-rank={rank}>
            <h4 className={styles.position}>
              <span className={styles.medal} aria-hidden="true">
                <span>{rank}</span>
              </span>
              <span>{t("T-3407", { n: rank })}</span>
            </h4>
            {members.length > 1 ? <p className={styles.shared}>{t("T-3550")}</p> : null}
            <ul aria-label={t("T-3407", { n: rank })} className={styles.members}>
              {members.map((row) => (
                <li
                  key={row.personId}
                  className={styles.member}
                  aria-current={row.personId === personId ? "true" : undefined}
                >
                  <p className={styles.name}>{row.anonymized ? t("T-223") : row.name}</p>
                  <p className={styles.score}>
                    {rankingMetric === "PARTICIPATIONS" ? (
                      t(row.participations === 1 ? "T-3553" : "T-3554", { n: row.participations })
                    ) : row.points === null ? (
                      <>{t("T-3477")}: —</>
                    ) : (
                      t(row.points === 1 ? "T-3478" : "T-3479", { n: row.points })
                    )}
                  </p>
                  {row.personId === personId ? (
                    <span className={styles.you}>{t("T-3552")}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {limited ? <p className={styles.caption}>{t("T-3551")}</p> : null}
    </section>
  );
}
