"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { t } from "@/shared/copy/client";

type Item = { id: string; name: string; available: number; location: string; box: string };
type Source = { value: string; label: string; delegates: { id: string; name: string }[] };

function ReserveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="boton-calido" disabled={pending}>
      {t(pending ? "T-4400" : "T-4314")}
    </button>
  );
}

export function ReservationComposer({
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
  const source = sources.find((entry) => entry.value === sourceId);
  return (
    <form action={action} className="inventory-panel">
      <h2>{t("T-4314")}</h2>
      <p className="inventory-muted">{t("T-4386")}</p>
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="endsAt" value={endsAt} />
      <div className="inventory-fields">
        <label className="inventory-field">
          <span>{t("T-4315")}</span>
          <select
            name="source"
            value={sourceId}
            required
            onChange={(event) => setSourceId(event.target.value)}
          >
            {sources.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inventory-field">
          <span>{t("T-4316")}</span>
          <select key={sourceId} name="collectorId" defaultValue="">
            <option value="">{t("T-4317")}</option>
            {source?.delegates.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="inventory-muted">{t("T-4365")}</p>
      <table className="inventory-table inventory-table-responsive">
        <thead>
          <tr>
            <th scope="col">{t("T-4308")}</th>
            <th scope="col">{t("T-4309")}</th>
            <th scope="col">{t("T-4313")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.name}</strong>
                <div className="inventory-muted">
                  {item.location} · {item.box}
                </div>
              </td>
              <td data-label={t("T-4309")}>{item.available}</td>
              <td>
                <input type="hidden" name="itemId" value={item.id} />
                <label className="inventory-field">
                  <span className="sr-only">
                    {t("T-4313")} · {item.name}
                  </span>
                  <input
                    name={`quantity-${item.id}`}
                    type="number"
                    min="0"
                    max={item.available}
                    step="1"
                    defaultValue="0"
                    disabled={item.available === 0}
                  />
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{t("T-4318")}</p>
      <ReserveButton />
    </form>
  );
}
