"use client";

import { useEffect, useId, useRef, useState } from "react";
import { t, tList } from "@/shared/copy";
import styles from "./committee-podium.module.css";

/** Valores ya calculados y formateados por el servidor; el cliente solo abre el detalle. */
export interface CommitteePodiumEntry {
  id: string;
  rank: number;
  name: string;
  score: string;
  rawScore: string;
  adjustment: string;
  occasions: number;
}

export function CommitteePodium({ entries }: { entries: CommitteePodiumEntry[] }) {
  const id = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = entries.find((entry) => entry.id === selectedId);
  const groups = [1, 2, 3]
    .map((rank) => ({ rank, entries: entries.filter((entry) => entry.rank === rank) }))
    .filter((group) => group.entries.length > 0);
  const remaining = entries.filter((entry) => entry.rank > 3);
  const [rawLabel, adjustmentLabel, scoreLabel, occasionsLabel] = tList("T-2608");

  useEffect(() => {
    if (selectedId) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [selectedId]);

  function select(entry: CommitteePodiumEntry, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setSelectedId((current) => (current === entry.id ? null : entry.id));
  }

  function buttonLabel(entry: CommitteePodiumEntry) {
    return t("T-2603", { comité: entry.name, puesto: entry.rank, porcentaje: entry.score });
  }

  return (
    <section className={styles.root} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <h3 id={`${id}-title`}>{t("T-2600")}</h3>
      </header>
      <div className={styles.stage}>
        <p className={styles.measure}>{t("T-2601")}</p>
        <div className={styles.podium} data-single={groups.length === 1}>
          {groups.map((group) => (
            <fieldset
              className={styles.podiumGroup}
              data-rank={group.rank}
              key={group.rank}
              aria-label={t("T-2604", { n: group.rank })}
            >
              <div className={styles.winners}>
                {group.entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={styles.winner}
                    aria-expanded={selectedId === entry.id}
                    aria-controls={`${id}-detail`}
                    aria-label={buttonLabel(entry)}
                    onClick={(event) => select(entry, event.currentTarget)}
                  >
                    <span className={styles.winnerName}>{entry.name}</span>
                    <span className={styles.winnerScore}>{entry.score}</span>
                    <span className={styles.winnerHint}>{t("T-2602")}</span>
                  </button>
                ))}
                {group.entries.length > 1 && <span className={styles.tie}>{t("T-2605")}</span>}
              </div>
              <div className={styles.step} aria-hidden="true">
                {group.rank}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
      <div className={styles.body}>
        <section
          className={styles.detail}
          id={`${id}-detail`}
          aria-labelledby={`${id}-detail-title`}
          hidden={!selected}
        >
          <div className={styles.detailHeader}>
            <h4 id={`${id}-detail-title`} ref={detailRef} tabIndex={-1}>
              {selected && t("T-2606", { comité: selected.name, puesto: selected.rank })}
            </h4>
            <button
              type="button"
              className={styles.close}
              onClick={() => {
                setSelectedId(null);
                triggerRef.current?.focus();
              }}
            >
              {t("T-2607")}
            </button>
          </div>
          {selected && (
            <dl className={styles.breakdown}>
              <dt>{rawLabel}</dt>
              <dd>{selected.rawScore}</dd>
              <dt>{adjustmentLabel}</dt>
              <dd>{selected.adjustment}</dd>
              <dt>{scoreLabel}</dt>
              <dd>{selected.score}</dd>
              <dt>{occasionsLabel}</dt>
              <dd>{selected.occasions}</dd>
            </dl>
          )}
          <p className={styles.note}>{t("T-2610")}</p>
        </section>
        {remaining.length > 0 && (
          <>
            <div className={styles.listHeading} aria-hidden="true">
              <span>{t("T-2611")}</span>
              <span>{scoreLabel}</span>
            </div>
            <ol className={styles.list} start={remaining[0]?.rank} aria-label={t("T-2611")}>
              {remaining.map((entry) => (
                <li key={entry.id} value={entry.rank}>
                  <button
                    type="button"
                    className={styles.listButton}
                    aria-label={buttonLabel(entry)}
                    aria-expanded={selectedId === entry.id}
                    aria-controls={`${id}-detail`}
                    onClick={(event) => select(entry, event.currentTarget)}
                  >
                    <span className={styles.listRank}>{entry.rank}</span>
                    <span className={styles.listName}>{entry.name}</span>
                    <span className={styles.listScore}>{entry.score}</span>
                    <span className={styles.listHint}>{t("T-2602")}</span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
        <details className={styles.help}>
          <summary>{t("T-2612")}</summary>
          <p>{t("T-2613")}</p>
          <p>{t("T-2614")}</p>
        </details>
      </div>
    </section>
  );
}
