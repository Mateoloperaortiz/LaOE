"use client";

import type { IScannerControls } from "@zxing/browser";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import type {
  checkoutAs,
  InventoryItemView,
  InventoryReservationView,
  returnAs,
} from "@/modules/inventory";
import { t } from "@/shared/copy/client";

type Result = { ok: boolean; error?: string };
type Candidate = {
  code: string;
  lineId: string;
  unitId: string | null;
  name: string;
  location: string;
  quantity: number;
};
type Props = {
  reservations: InventoryReservationView[];
  items: InventoryItemView[];
  initialRequestId: string;
  checkout: (input: Parameters<typeof checkoutAs>[1]) => Promise<Result>;
  receive: (input: Parameters<typeof returnAs>[1]) => Promise<Result>;
};

export function MovementScanner({
  reservations,
  items,
  initialRequestId,
  checkout,
  receive,
}: Props) {
  const router = useRouter();
  const [reservationId, setReservationId] = useState(reservations[0]?.id ?? "");
  const [requestId, setRequestId] = useState(initialRequestId);
  const [scans, setScans] = useState<string[]>([]);
  const [damaged, setDamaged] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState(false);
  const [opening, setOpening] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const generation = useRef(0);
  const reservation = reservations.find((entry) => entry.id === reservationId);
  const candidates =
    reservation?.lines.flatMap<Candidate>((line) => {
      const item = items.find((entry) => entry.id === line.itemId);
      const location = item ? `${item.location} · ${item.box}` : "";
      return line.mode === "UNIT"
        ? line.units.map((unit) => ({
            code: unit.barcode,
            lineId: line.id,
            unitId: unit.id,
            name: line.itemName,
            location,
            quantity: 1,
          }))
        : [
            {
              code: line.barcode,
              lineId: line.id,
              unitId: null,
              name: line.itemName,
              location,
              quantity: reservation.status === "OUT" ? line.outstanding : line.quantity,
            },
          ];
    }) ?? [];
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;

  const stop = useCallback(() => {
    generation.current += 1;
    controls.current?.stop();
    controls.current = null;
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream) for (const track of stream.getTracks()) track.stop();
    if (video.current) video.current.srcObject = null;
    setScanning(false);
    setOpening(false);
  }, []);
  useEffect(() => stop, [stop]);

  const addCode = useCallback((raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!candidatesRef.current.some((entry) => entry.code === value)) {
      setFailure(true);
      setMessage(t("T-4371"));
      return;
    }
    setScans((previous) => (previous.includes(value) ? previous : [...previous, value]));
    setFailure(false);
    setMessage("");
    setCode("");
  }, []);

  async function start() {
    stop();
    const current = generation.current;
    const element = video.current;
    if (!element) return;
    setOpening(true);
    setScanning(true);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (current !== generation.current) return;
      const reader = new BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 250,
        delayBetweenScanSuccess: 1200,
      });
      const handle = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" }, audio: false },
        element,
        (result) => {
          if (current === generation.current && result) addCode(result.getText());
        },
      );
      if (current !== generation.current) {
        handle.stop();
        return;
      }
      controls.current = handle;
      setOpening(false);
    } catch {
      if (current !== generation.current) return;
      stop();
      setFailure(true);
      setMessage(t("T-4368"));
    }
  }

  async function confirm(form: FormData, element: HTMLFormElement) {
    if (!reservation || saving) return;
    stop();
    setSaving(true);
    setMessage("");
    setFailure(false);
    try {
      const result =
        reservation.status === "CONFIRMED"
          ? await checkout({
              reservationId,
              requestId,
              collectorId: reservation.collectorId,
              barcodes: scans,
            })
          : await receive({
              reservationId,
              requestId,
              note: String(form.get("note") ?? "").trim() || undefined,
              lines: reservation.lines.flatMap((line) => {
                const selected = candidates.filter(
                  (entry) => entry.lineId === line.id && scans.includes(entry.code),
                );
                if (selected.length === 0) return [];
                const unitIds = selected.flatMap((entry) => (entry.unitId ? [entry.unitId] : []));
                const damagedUnitIds = selected.flatMap((entry) =>
                  entry.unitId && damaged.includes(entry.code) ? [entry.unitId] : [],
                );
                return [
                  {
                    lineId: line.id,
                    quantity:
                      line.mode === "UNIT"
                        ? unitIds.length
                        : Number(form.get(`quantity-${line.id}`)),
                    damagedQuantity:
                      line.mode === "UNIT"
                        ? damagedUnitIds.length
                        : Number(form.get(`damaged-${line.id}`)),
                    unitIds,
                    damagedUnitIds,
                  },
                ];
              }),
            });
      setFailure(!result.ok);
      setMessage(result.ok ? t("T-4302") : (result.error ?? t("T-4393")));
      if (result.ok) {
        element.reset();
        setScans([]);
        setDamaged([]);
        setRequestId(crypto.randomUUID());
        router.refresh();
      }
    } catch {
      setFailure(true);
      setMessage(t("T-4393"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inventory-panel">
      <label className="inventory-field">
        <span>{t("T-4382")}</span>
        <select
          value={reservationId}
          disabled={saving}
          onChange={(event) => {
            stop();
            setReservationId(event.target.value);
            setScans([]);
            setDamaged([]);
            setMessage("");
            setRequestId(crypto.randomUUID());
          }}
        >
          <option value="">{t("T-4382")}</option>
          {reservations.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.requesterName} · {entry.scopeLabel} ·{" "}
              {t(entry.status === "CONFIRMED" ? "T-4327" : "T-4328")} · {entry.id.slice(-6)}
            </option>
          ))}
        </select>
      </label>
      {reservation ? (
        <>
          <div className="inventory-summary">
            <dl>
              <div>
                <dt>{t("T-4323")}</dt>
                <dd>{reservation.requesterName}</dd>
              </div>
              <div>
                <dt>{t("T-4324")}</dt>
                <dd>{reservation.collectorName}</dd>
              </div>
            </dl>
          </div>
          <p>{t("T-4383")}</p>
          <div className="inventory-actions">
            <button
              type="button"
              className="boton-calido"
              disabled={opening || saving}
              onClick={() => void start()}
            >
              {t("T-4366")}
            </button>
            {scanning ? (
              <button type="button" className="boton-secundario" onClick={stop}>
                {t("T-4367")}
              </button>
            ) : null}
          </div>
          <video
            ref={video}
            playsInline
            muted
            hidden={!scanning}
            className="inventory-scanner-video"
          >
            <track kind="captions" />
          </video>
          <form
            className="inventory-fields"
            onSubmit={(event) => {
              event.preventDefault();
              addCode(code);
            }}
          >
            <label className="inventory-field">
              <span>{t("T-4369")}</span>
              <input
                value={code}
                maxLength={160}
                autoCapitalize="characters"
                autoComplete="off"
                disabled={saving}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <div className="inventory-actions">
              <button type="submit" className="boton-secundario" disabled={saving || !code.trim()}>
                {t("T-4370")}
              </button>
            </div>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const element = event.currentTarget;
              const form = new FormData(element);
              startTransition(() => confirm(form, element));
            }}
          >
            <h3>{t("T-4374")}</h3>
            <ul className="inventory-scan-list">
              {scans.map((value) => {
                const entry = candidates.find((candidate) => candidate.code === value);
                return entry ? (
                  <li key={value}>
                    <div>
                      <strong>{entry.name}</strong> · {entry.quantity}
                      <br />
                      <code>{value}</code>
                      <div className="inventory-muted">{entry.location}</div>
                      {reservation.status === "OUT" && entry.unitId ? (
                        <label>
                          <input
                            type="checkbox"
                            checked={damaged.includes(value)}
                            onChange={(event) =>
                              setDamaged((previous) =>
                                event.target.checked
                                  ? [...previous, value]
                                  : previous.filter((code) => code !== value),
                              )
                            }
                          />{" "}
                          {t("T-4379")}
                        </label>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="boton-secundario"
                      disabled={saving}
                      onClick={() => {
                        setScans((previous) => previous.filter((code) => code !== value));
                        setDamaged((previous) => previous.filter((code) => code !== value));
                      }}
                      aria-label={`${t("T-4373")} ${value}`}
                    >
                      {t("T-4373")}
                    </button>
                  </li>
                ) : null;
              })}
            </ul>
            {reservation.status === "OUT" ? (
              <>
                {reservation.lines
                  .filter((line) => line.mode === "QUANTITY" && scans.includes(line.barcode))
                  .map((line) => (
                    <fieldset key={line.id} className="inventory-fields">
                      <legend>{line.itemName}</legend>
                      <label className="inventory-field">
                        <span>{t("T-4378")}</span>
                        <input
                          name={`quantity-${line.id}`}
                          type="number"
                          min="1"
                          max={line.outstanding}
                          step="1"
                          defaultValue={line.outstanding}
                          required
                        />
                      </label>
                      <label className="inventory-field">
                        <span>{t("T-4379")}</span>
                        <input
                          name={`damaged-${line.id}`}
                          type="number"
                          min="0"
                          max={line.outstanding}
                          step="1"
                          defaultValue="0"
                          required
                        />
                      </label>
                    </fieldset>
                  ))}
                <label className="inventory-field">
                  <span>{t("T-4380")}</span>
                  <textarea name="note" maxLength={2000} />
                </label>
              </>
            ) : null}
            <button type="submit" disabled={saving || scans.length === 0} className="boton-calido">
              {t(saving ? "T-4400" : reservation.status === "CONFIRMED" ? "T-4375" : "T-4376")}
            </button>
          </form>
        </>
      ) : null}
      {message ? (
        <p role={failure ? "alert" : "status"} className="inventory-notice">
          {message}
        </p>
      ) : null}
    </div>
  );
}
