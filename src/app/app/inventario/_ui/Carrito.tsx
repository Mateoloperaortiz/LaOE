"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { t, tList } from "@/shared/copy/client";

type Item = { id: string; name: string; available: number; location: string; box: string };
type Source = { value: string; label: string; delegates: { id: string; name: string }[] };

const fieldClass = "campo min-h-11 w-full";

function Reservar({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="boton-primario min-h-11 shrink-0"
      disabled={pending || count === 0}
    >
      {t(pending ? "T-4400" : "T-4314")}
    </button>
  );
}

// La reserva como un carrito (ADR-191 regla 5): se suma y se resta con botones grandes, y abajo queda
// siempre cuánto llevas y el botón de reservar. La disponibilidad se vuelve a comprobar en el
// servidor al confirmar (ADR-150 regla 4).
export function Carrito({
  items,
  sources,
  startsAt,
  endsAt,
  action,
}: {
  items: Item[];
  sources: Source[];
  startsAt: string;
  endsAt: string;
  action: (form: FormData) => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState(sources[0]?.value ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const source = sources.find((entry) => entry.value === sourceId);
  const total = Object.values(quantities).reduce((sum, value) => sum + value, 0);
  const [one, other] = tList("T-5069");
  const change = (id: string, max: number, delta: number) =>
    setQuantities((current) => ({
      ...current,
      [id]: Math.min(max, Math.max(0, (current[id] ?? 0) + delta)),
    }));
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="endsAt" value={endsAt} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{t("T-4315")}</span>
          <select
            name="source"
            value={sourceId}
            required
            onChange={(event) => setSourceId(event.target.value)}
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
          <span className="font-semibold">{t("T-4316")}</span>
          <select key={sourceId} name="collectorId" defaultValue="" className={fieldClass}>
            <option value="">{t("T-4317")}</option>
            {source?.delegates.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-tinta-secundaria">{t("T-4365")}</p>
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
