"use client";

import { useId, useState } from "react";
import type { AvailabilitySaveState } from "@/modules/availability";
import { t } from "@/shared/copy/client";
import { ActionForm } from "@/shared/ui/ActionForm";
import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import styles from "./availability.module.css";
import { type GridWindow, SlotGrid, timeLabel } from "./SlotGrid";

export function AvailabilityEditor({
  title,
  termId,
  pollId,
  own,
  closed = false,
  days,
  startMinute,
  endMinute,
  saveAction,
}: GridWindow & {
  title: string;
  termId: string;
  pollId?: string;
  own: { slots: number[]; revision: string } | null;
  closed?: boolean;
  saveAction: (previous: AvailabilitySaveState, data: FormData) => Promise<AvailabilitySaveState>;
}) {
  const id = useId();
  const [selected, setSelected] = useState(own?.slots ?? []);
  const [rangeDay, setRangeDay] = useState(0);
  const [rangeStart, setRangeStart] = useState(startMinute);
  const [rangeEnd, setRangeEnd] = useState(Math.min(endMinute, startMinute + 60));
  const [state, action, pending] = useGuardedActionState<AvailabilitySaveState>(
    async (previous, data) => {
      const result = await saveAction(previous, data);
      if (result.status === "done") setSelected(result.slots);
      return result;
    },
    { status: "idle", revision: own?.revision ?? 0, slots: own?.slots ?? [] },
    ({ previous, message }) => ({ ...previous, status: "error", message }),
  );
  const dirty = selected.join(",") !== state.slots.join(",");
  const minutes = Array.from(
    { length: (endMinute - startMinute) / 30 + 1 },
    (_, index) => startMinute + index * 30,
  );

  function changeRange(add: boolean) {
    if (rangeStart >= rangeEnd) return;
    const next = new Set(selected);
    for (let minute = rangeStart; minute < rangeEnd; minute += 30) {
      const slot = rangeDay * 48 + minute / 30;
      if (add) next.add(slot);
      else next.delete(slot);
    }
    setSelected([...next].sort((a, b) => a - b));
  }

  return (
    <section aria-labelledby={`${id}-title`} className={styles.section}>
      <div>
        <h2 id={`${id}-title`}>{title}</h2>
        <p className={styles.meta}>{t("T-4605")}</p>
      </div>
      <p className={styles.meta}>{t("T-4623")}</p>
      <ActionForm
        action={action}
        onSubmit={(event) => {
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          if (
            submitter instanceof HTMLButtonElement &&
            submitter.value === "withdraw" &&
            !window.confirm(t("T-4665"))
          )
            event.preventDefault();
        }}
      >
        <input type="hidden" name="termId" value={termId} />
        {pollId ? <input type="hidden" name="pollId" value={pollId} /> : null}
        <input type="hidden" name="revision" value={state.revision} />
        <input type="hidden" name="slots" value={JSON.stringify(selected)} />
        <SlotGrid
          days={days}
          startMinute={startMinute}
          endMinute={endMinute}
          label={title}
          selected={selected}
          onChange={setSelected}
          disabled={pending || closed}
        />
        {!closed ? (
          <details className={styles.range}>
            <summary>{t("T-4655")}</summary>
            <fieldset disabled={pending} className={styles.toolbar}>
              <label htmlFor={`${id}-range-day`}>
                {t("T-4656")}
                <select
                  id={`${id}-range-day`}
                  value={rangeDay}
                  onChange={(event) => setRangeDay(Number(event.target.value))}
                >
                  {days.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor={`${id}-start`}>
                {t("T-4632")}
                <select
                  id={`${id}-start`}
                  value={rangeStart}
                  onChange={(event) => setRangeStart(Number(event.target.value))}
                >
                  {minutes.slice(0, -1).map((minute) => (
                    <option key={minute} value={minute}>
                      {timeLabel(minute)}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor={`${id}-end`}>
                {t("T-4633")}
                <select
                  id={`${id}-end`}
                  value={rangeEnd}
                  onChange={(event) => setRangeEnd(Number(event.target.value))}
                >
                  {minutes.slice(1).map((minute) => (
                    <option key={minute} value={minute}>
                      {timeLabel(minute)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="boton-secundario"
                type="button"
                disabled={rangeStart >= rangeEnd}
                onClick={() => changeRange(true)}
              >
                {t("T-4657")}
              </button>
              <button
                className="boton-secundario"
                type="button"
                disabled={rangeStart >= rangeEnd}
                onClick={() => changeRange(false)}
              >
                {t("T-4658")}
              </button>
            </fieldset>
          </details>
        ) : (
          <p className={styles.meta}>{t("T-4637")}</p>
        )}
        <div className={styles.toolbar}>
          {!closed ? (
            <button
              type="submit"
              name="intent"
              value="save"
              className="boton-primario"
              disabled={pending}
            >
              {t(pending ? "T-4625" : "T-4606")}
            </button>
          ) : null}
          {state.revision !== 0 ? (
            <button
              type="submit"
              name="intent"
              value="withdraw"
              className="boton-secundario"
              disabled={pending}
            >
              {t("T-4642")}
            </button>
          ) : null}
          <span className={styles.meta}>{t("T-4675", { n: selected.length })}</span>
        </div>
        <div className={styles.status} aria-live="polite">
          {dirty ? (
            <p>{t("T-4624")}</p>
          ) : state.status !== "error" ? (
            <p>{state.message ?? (state.revision === 0 ? t("T-4616") : t("T-4662"))}</p>
          ) : null}
        </div>
        {state.status === "error" ? (
          <p role="alert" className={styles.error}>
            {state.message}{" "}
            <button className="underline" type="button" onClick={() => window.location.reload()}>
              {t("T-4673")}
            </button>
          </p>
        ) : null}
      </ActionForm>
    </section>
  );
}
