"use client";

import { type KeyboardEvent, useId, useRef, useState } from "react";
import { t } from "@/shared/copy/client";
import { CheckIcon } from "@/shared/ui/icons/CheckIcon";
import styles from "./availability.module.css";

export function timeLabel(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export interface GridWindow {
  days: string[];
  startMinute: number;
  endMinute: number;
}

type Props = GridWindow & {
  label: string;
  selected: number[];
  disabled?: boolean;
  counts?: number[];
  total?: number;
  onChange?: (slots: number[]) => void;
  onInspect?: (slot: number) => void;
};

export function SlotGrid({
  days,
  startMinute,
  endMinute,
  label,
  selected,
  disabled,
  counts,
  total = 0,
  onChange,
  onInspect,
}: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [day, setDay] = useState(0);
  const [focused, setFocused] = useState(startMinute / 30);
  const drag = useRef<{ start: number; adding: boolean; base: number[] } | null>(null);
  const mouseClick = useRef(false);
  const selectedSet = new Set(selected);
  const rows = Array.from(
    { length: (endMinute - startMinute) / 30 },
    (_, index) => startMinute / 30 + index,
  );

  function paint(slot: number) {
    const gesture = drag.current;
    if (!gesture || !onChange || disabled) return;
    const next = new Set(gesture.base);
    const firstDay = Math.min(Math.floor(gesture.start / 48), Math.floor(slot / 48));
    const lastDay = Math.max(Math.floor(gesture.start / 48), Math.floor(slot / 48));
    const firstTime = Math.min(gesture.start % 48, slot % 48);
    const lastTime = Math.max(gesture.start % 48, slot % 48);
    for (let d = firstDay; d <= lastDay; d++) {
      for (let time = firstTime; time <= lastTime; time++) {
        const value = d * 48 + time;
        if (gesture.adding) next.add(value);
        else next.delete(value);
      }
    }
    onChange([...next].sort((a, b) => a - b));
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, slot: number) {
    const delta = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 48, ArrowLeft: -48 }[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = slot + delta;
    if (
      next < 0 ||
      next >= days.length * 48 ||
      next % 48 < startMinute / 30 ||
      next % 48 >= endMinute / 30
    )
      return;
    setFocused(next);
    setDay(Math.floor(next / 48));
    requestAnimationFrame(() =>
      root.current?.querySelector<HTMLButtonElement>(`button[data-slot="${next}"]`)?.focus(),
    );
  }

  return (
    <div ref={root} className={styles.gridRoot}>
      <div className={styles.dayPicker}>
        <label htmlFor={`${id}-day`}>{t("T-4656")}</label>
        <select
          id={`${id}-day`}
          value={day}
          onChange={(event) => {
            const value = Number(event.target.value);
            setDay(value);
            setFocused(value * 48 + startMinute / 30);
          }}
        >
          {days.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.gridScroll}>
        <table className={styles.grid} aria-label={label}>
          <thead>
            <tr>
              <th scope="col">{t("T-4674")}</th>
              {days.map((name, index) => (
                <th key={name} scope="col" data-visible={index === day}>
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((time) => (
              <tr key={time}>
                <th scope="row">{timeLabel(time * 30)}</th>
                {days.map((name, index) => {
                  const slot = index * 48 + time;
                  const count = counts?.[slot] ?? 0;
                  const marked = selectedSet.has(slot);
                  const state = counts
                    ? t("T-4618", { n: count, total })
                    : t(marked ? "T-4620" : "T-4621");
                  const intensity = counts
                    ? count === 0
                      ? 0
                      : count === total
                        ? 3
                        : count / Math.max(total, 1) >= 0.5
                          ? 2
                          : 1
                    : marked
                      ? 3
                      : 0;
                  return (
                    <td key={name} data-visible={index === day}>
                      <button
                        type="button"
                        data-slot={slot}
                        data-intensity={intensity}
                        aria-pressed={marked}
                        disabled={disabled}
                        aria-label={t("T-4622", {
                          día: name,
                          inicio: timeLabel(time * 30),
                          fin: timeLabel((time + 1) * 30),
                          estado: state,
                        })}
                        tabIndex={focused === slot ? 0 : -1}
                        onFocus={() => setFocused(slot)}
                        onKeyDown={(event) => navigate(event, slot)}
                        onPointerDown={(event) => {
                          mouseClick.current = false;
                          if (
                            event.pointerType !== "mouse" ||
                            event.button !== 0 ||
                            !onChange ||
                            disabled
                          )
                            return;
                          mouseClick.current = true;
                          drag.current = { start: slot, adding: !marked, base: selected };
                          paint(slot);
                        }}
                        onPointerEnter={(event) => {
                          if (event.buttons === 1) paint(slot);
                          else drag.current = null;
                        }}
                        onPointerUp={() => {
                          drag.current = null;
                        }}
                        onPointerCancel={() => {
                          drag.current = null;
                          mouseClick.current = false;
                        }}
                        onClick={(event) => {
                          if (onInspect) {
                            onInspect(slot);
                            return;
                          }
                          if (event.detail > 0 && mouseClick.current) {
                            mouseClick.current = false;
                            return;
                          }
                          const next = new Set(selected);
                          if (marked) next.delete(slot);
                          else next.add(slot);
                          onChange?.([...next].sort((a, b) => a - b));
                        }}
                      >
                        {counts ? (
                          <span>{count}</span>
                        ) : marked ? (
                          <CheckIcon size={16} />
                        ) : (
                          <span aria-hidden="true" className={styles.emptySlot} />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
