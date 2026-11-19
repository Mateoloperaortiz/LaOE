"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { t, tList } from "@/shared/copy/client";

type Item = { id: string; name: string; available: number; location: string; box: string };
type Source = {
  value: string;
  label: string;
  macro: boolean;
  events: { id: string; title: string; eventOn: string }[];
};

const fieldClass = "campo min-h-11 w-full";

function Reservar({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="boton-primario min-h-11 shrink-0"
      disabled={pending || count === 0}
    >
      {pending ? t("T-4400") : tList("T-5189")[1]}
    </button>
  );
}

// La reserva como un carrito (ADR-191 regla 5): se suma y se resta con botones grandes, y abajo queda
// siempre cuánto llevas y el botón de reservar. La disponibilidad se vuelve a comprobar en el
// servidor al confirmar (ADR-150 regla 4).
export function Carrito({
  items,
  requestKey,
  sources,
  startsAt,
  endsAt,
  action,
}: {
  items: Item[];
  requestKey: string;
  sources: Source[];
  startsAt: string;
  endsAt: string;
  action: (form: FormData) => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState(sources[0]?.value ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const source = sources.find((entry) => entry.value === sourceId);
  const [purpose, setPurpose] = useState(sources[0]?.macro ? "MACROEVENT" : "COMMITTEE_EVENT");
  const [selectedEvent, setSelectedEvent] = useState("");
  const labels = tList("T-5189");
  const event = source?.events.find((row) => row.id === selectedEvent);
  const total = Object.values(quantities).reduce((sum, value) => sum + value, 0);
  const [one, other] = tList("T-5069");
  const change = (id: string, max: number, delta: number) =>
    setQuantities((current) => ({
      ...current,
      [id]: Math.min(max, Math.max(0, (current[id] ?? 0) + delta)),
    }));
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="requestKey" value={requestKey} />
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="endsAt" value={endsAt} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{t("T-4315")}</span>
          <select
            name="source"
            value={sourceId}
            required
            onChange={(event) => {
              const value = event.target.value;
              setSourceId(value);
              setSelectedEvent("");
              setPurpose(
                sources.find((row) => row.value === value)?.macro
                  ? "MACROEVENT"
                  : "COMMITTEE_EVENT",
              );
            }}
            className={fieldClass}
          >
            {sources.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{labels[6]}</span>
          <select
            name="purpose"
            className={fieldClass}
            value={purpose}
            onChange={(e) => {
              setPurpose(e.target.value);
              setSelectedEvent("");
            }}
          >
            {source?.macro ? (
              <option value="MACROEVENT">{labels[3]}</option>
            ) : (
              <option value="COMMITTEE_EVENT">{labels[2]}</option>
            )}
            <option value="OTHER">{labels[4]}</option>
            {!source?.macro && <option value="EXCEPTION">{labels[5]}</option>}
          </select>
        </label>
      </div>
      {purpose === "COMMITTEE_EVENT" ? (
        <label>
          {labels[7]}
          <select
            className={fieldClass}
            name="eventApprovalId"
            required
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
          >
            <option value="">{tList("T-5193")[5]}</option>
            {source?.events.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title} · {row.eventOn}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          {labels[13]}
          <textarea
            className={fieldClass}
            name="supportingRecord"
            required
            minLength={3}
            maxLength={2000}
          />
        </label>
      )}
      {event ? (
        <input type="hidden" name="title" value={event.title} />
      ) : (
        <label>
          {t("T-335")}
          <input className={fieldClass} name="title" required minLength={2} maxLength={180} />
        </label>
      )}
      {purpose === "OTHER" ? (
        <>
          <input type="hidden" name="eventStartsOn" value={startsAt.slice(0, 10)} />
          <input type="hidden" name="eventEndsOn" value={endsAt.slice(0, 10)} />
          <p>
            {labels[11]} · {endsAt.replace("T", " ")}
          </p>
        </>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2" key={event?.id ?? purpose}>
          <label>
            {labels[8]}
            <input
              className={fieldClass}
              name="eventStartsOn"
              type="date"
              readOnly={!!event}
              defaultValue={event?.eventOn}
              required
            />
          </label>
          <label>
            {labels[9]}
            <input
              className={fieldClass}
              name="eventEndsOn"
              type="date"
              defaultValue={event?.eventOn}
              min={event?.eventOn}
              required
            />
          </label>
        </div>
      )}
      <label>
        {labels[12]}
        <textarea className={fieldClass} name="minutes" required minLength={3} maxLength={6000} />
      </label>
      {purpose !== "OTHER" && (
        <label>
          {labels[14]}
          <input className={fieldClass} name="lateReason" maxLength={2000} />
        </label>
      )}
      <ul className="flex list-none flex-col gap-2 p-0">
        {items.map((item) => {
          const value = quantities[item.id] ?? 0;
          return (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-tarjeta bg-superficie p-3 sombra-flota"
            >
              <div className="min-w-0">
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-tinta-secundaria">
                  {item.location} · {item.box} · {t("T-4309")}: {item.available}
                </p>
              </div>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name={`quantity-${item.id}`} value={value} />
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="boton-secundario min-h-11 min-w-11 px-0"
                  aria-label={t("T-5067", { material: item.name })}
                  disabled={value === 0}
                  onClick={() => change(item.id, item.available, -1)}
                >
                  −
                </button>
                <output
                  aria-label={`${t("T-4313")} · ${item.name}`}
                  className="min-w-8 text-center font-semibold"
                >
                  {value}
                </output>
                <button
                  type="button"
                  className="boton-secundario min-h-11 min-w-11 px-0"
                  aria-label={t("T-5068", { material: item.name })}
                  disabled={value >= item.available}
                  onClick={() => change(item.id, item.available, 1)}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-tinta-secundaria">{t("T-4318")}</p>
      <div className="sticky bottom-24 z-10 flex items-center justify-between gap-3 rounded-tarjeta bg-superficie p-3 sombra-flota">
        <p aria-live="polite" className="font-semibold">
          {(total === 1 ? (one ?? "") : (other ?? "")).replace("{n}", String(total))}
        </p>
        <Reservar count={total} />
      </div>
    </form>
  );
}
