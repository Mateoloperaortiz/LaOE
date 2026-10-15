import { t } from "@/shared/copy";

export function PresenceStreak({
  streak,
}: {
  streak: {
    launched: boolean;
    currentStreak: number;
    longestStreak: number;
    weekStatus: "COMPLETED" | "PENDING" | "PAUSED" | "MISSED";
    bonus: number;
    nextBonus: number;
  };
}) {
  if (!streak.launched) {
    return (
      <section aria-labelledby="presence-streak" className="flex flex-col gap-3">
        <h2 id="presence-streak" className="text-display-md">
          {t("T-3440")}
        </h2>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-3462")}</p>
      </section>
    );
  }
  const statuses = {
    COMPLETED: "T-3443",
    PENDING: "T-3444",
    PAUSED: "T-3445",
    MISSED: "T-3446",
  } as const;
  return (
    <section aria-labelledby="presence-streak" className="flex flex-col gap-4">
      <h2 id="presence-streak" className="text-display-md">
        {t("T-3440")}
      </h2>
      <p className="max-w-prose text-sm text-tinta-suave">{t("T-3441")}</p>
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <div>
          <dt className="text-sm text-tinta-suave">{t("T-3411")}</dt>
          <dd className="font-semibold tabular-nums">
            {t(streak.currentStreak === 1 ? "T-3456" : "T-3442", { n: streak.currentStreak })}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-tinta-suave">{t("T-3412")}</dt>
          <dd className="font-semibold tabular-nums">
            {t(streak.longestStreak === 1 ? "T-3456" : "T-3442", { n: streak.longestStreak })}
          </dd>
        </div>
      </dl>
      <p className="font-semibold">{t(statuses[streak.weekStatus])}</p>
      <p className="text-sm">
        {streak.weekStatus === "COMPLETED"
          ? t("T-3447", { n: streak.bonus })
          : t("T-3448", { n: streak.nextBonus })}
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">{t("T-3449")}</summary>
        <p className="mt-3 max-w-prose text-tinta-suave">{t("T-3450")}</p>
      </details>
    </section>
  );
}
