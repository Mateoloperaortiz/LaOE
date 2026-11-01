"use client";

import { useId, useState } from "react";
import type { AvailabilityGroup, PollActionState } from "@/modules/availability";
import { t } from "@/shared/copy/client";
import { ActionForm } from "@/shared/ui/ActionForm";
import { useGuardedActionState } from "@/shared/ui/use-guarded-action-state";
import styles from "./availability.module.css";
import { timeLabel } from "./SlotGrid";

type PollAction = (previous: PollActionState, data: FormData) => Promise<PollActionState>;

export function MeetingPollForm({
  termId,
  group,
  today,
  endsOn,
  createAction,
}: {
  termId: string;
  group: AvailabilityGroup;
  today: string;
  endsOn: string;
  createAction: PollAction;
}) {
  const id = useId();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [start, setStart] = useState(480);
  const [end, setEnd] = useState(1200);
  const [state, action, pending] = useGuardedActionState<PollActionState>(
    createAction,
    { status: "idle" },
    ({ message }) => ({ status: "error", message }),
  );
  const times = Array.from({ length: 49 }, (_, index) => index * 30);
  return (
    <details className={styles.range}>
      <summary>{t("T-4626")}</summary>
      <ActionForm action={action} className={styles.section}>
        <p>{t("T-4661", { grupo: group.name })}</p>
        <input type="hidden" name="termId" value={termId} />
        <input type="hidden" name="groupType" value={group.type} />
        <input type="hidden" name="groupId" value={group.id} />
        {dates.map((value) => (
          <input key={value} type="hidden" name="dates" value={value} />
        ))}
        <fieldset disabled={pending} className={styles.section}>
          <label className={styles.field} htmlFor={`${id}-title`}>
            {t("T-4627")}
            <input
              id={`${id}-title`}
              name="title"
              required
              minLength={2}
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div>
            <h3>{t("T-4628")}</h3>
            <p className={styles.meta}>{t("T-4629")}</p>
          </div>
          <div className={styles.toolbar}>
            <label htmlFor={`${id}-date`}>
              {t("T-4630")}
              <input
                id={`${id}-date`}
                type="date"
                min={today}
                max={endsOn}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="boton-secundario"
              disabled={
                !date || date < today || date > endsOn || dates.length >= 14 || dates.includes(date)
              }
              onClick={() => {
                setDates([...dates, date].sort());
                setDate("");
              }}
            >
              {t("T-4630")}
            </button>
          </div>
          <ul className={styles.dates}>
            {dates.map((value) => (
              <li key={value}>
                <button
                  type="button"
                  aria-label={t("T-4631", { fecha: value })}
                  onClick={() => setDates(dates.filter((item) => item !== value))}
                >
                  {value}
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.toolbar}>
            <label htmlFor={`${id}-start`}>
              {t("T-4632")}
              <select
                id={`${id}-start`}
                name="startMinute"
                value={start}
                onChange={(event) => setStart(Number(event.target.value))}
              >
                {times.slice(0, -1).map((value) => (
                  <option key={value} value={value}>
                    {timeLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-end`}>
              {t("T-4633")}
              <select
                id={`${id}-end`}
                name="endMinute"
                value={end}
                onChange={(event) => setEnd(Number(event.target.value))}
              >
                {times.slice(1).map((value) => (
                  <option key={value} value={value}>
                    {timeLabel(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            className="boton-primario justify-self-start"
            disabled={dates.length === 0 || start >= end}
          >
            {t(pending ? "T-4625" : "T-4634")}
          </button>
        </fieldset>
        {state.status === "error" ? (
          <p role="alert" className={styles.error}>
            {state.message}
          </p>
        ) : null}
      </ActionForm>
    </details>
  );
}

export function CloseMeetingPoll({
  pollId,
  closeAction,
}: {
  pollId: string;
  closeAction: PollAction;
}) {
  const [state, action, pending] = useGuardedActionState<PollActionState>(
    closeAction,
    { status: "idle" },
    ({ message }) => ({ status: "error", message }),
  );
  return (
    <ActionForm
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(t("T-4666"))) event.preventDefault();
      }}
    >
      <input type="hidden" name="pollId" value={pollId} />
      <button type="submit" className="boton-secundario" disabled={pending}>
        {t("T-4638")}
      </button>
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
      ) : null}
    </ActionForm>
  );
}
