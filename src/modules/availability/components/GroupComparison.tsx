"use client";

import { useId, useState } from "react";
import type { AvailabilityComparison } from "@/modules/availability";
import { t } from "@/shared/copy/client";
import styles from "./availability.module.css";
import { type GridWindow, SlotGrid, timeLabel } from "./SlotGrid";

export function GroupComparison({
  comparison,
  days,
  startMinute,
  endMinute,
}: GridWindow & { comparison: AvailabilityComparison }) {
  const id = useId();
  const [slot, setSlot] = useState<number | null>(null);
  const available =
    slot === null ? [] : comparison.members.filter((member) => member.slots?.includes(slot));
  const unanswered = comparison.members.filter((member) => member.slots === null);
  const unanimous =
    comparison.total > 0 && comparison.counts.some((count) => count === comparison.total);
  return (
    <section aria-labelledby={`${id}-title`} className={styles.compare}>
      <div>
        <h2 id={`${id}-title`}>{t("T-4645")}</h2>
        <p className={styles.meta}>
          {t("T-4615", { n: comparison.answered, total: comparison.total })}
        </p>
      </div>
      <p className={styles.meta}>{t("T-4605")}</p>
      <SlotGrid
        days={days}
        startMinute={startMinute}
        endMinute={endMinute}
        label={t("T-4645")}
        counts={comparison.counts}
        total={comparison.total}
        selected={slot === null ? [] : [slot]}
        onInspect={setSlot}
      />
      <div className={styles.detail} aria-live="polite">
        {slot === null ? (
          <p>{t("T-4646")}</p>
        ) : (
          <>
            <h3>
              {days[Math.floor(slot / 48)]} · {timeLabel((slot % 48) * 30)}–
              {timeLabel(((slot % 48) + 1) * 30)}
            </h3>
            <p>{t("T-4618", { n: available.length, total: comparison.total })}</p>
            {available.length ? (
              <ul className={styles.people}>
                {available.map((member) => (
                  <li key={member.personId}>{member.name}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.meta}>{t("T-4647")}</p>
            )}
          </>
        )}
      </div>
      {!unanimous ? <p className={styles.meta}>{t("T-4664")}</p> : null}
      {unanswered.length ? (
        <details>
          <summary>
            {t("T-4648")} ({unanswered.length})
          </summary>
          <ul className={styles.people}>
            {unanswered.map((member) => (
              <li key={member.personId}>{member.name}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
