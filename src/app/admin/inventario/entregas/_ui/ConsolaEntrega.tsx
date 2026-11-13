"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/shared/copy/client";
import { abrirLector, type LectorAbierto } from "./lector";

type Result = { ok: boolean; error?: string };
type Unit = { id: string; barcode: string };
type Line = {
  id: string;
  itemId: string;
  itemName: string;
  barcode: string;
  mode: "UNIT" | "QUANTITY";
  quantity: number;
  outstanding: number;
  units: Unit[];
};
type Reservation = {
  id: string;
  status: "CONFIRMED" | "OUT";
  collectorId: string;
  lines: Line[];
};
type Place = { location: string; box: string };
type CheckoutInput = {
  reservationId: string;
  requestId: string;
  collectorId: string;
  barcodes: string[];
};
type ReturnInput = {
  reservationId: string;
  requestId: string;
  note?: string;
  lines: Array<{
    lineId: string;
    quantity: number;
    damagedQuantity: number;
    unitIds: string[];
    damagedUnitIds: string[];
  }>;
};

type Candidate = {
  code: string;
  lineId: string;
  unitId: string | null;
  name: string;
  place: Place | null;
  quantity: number;
};

type Draft = {
  requestId: string;
  scans: string[];
  damaged: string[];
  note: string;
  quantities: Record<string, number>;
  damagedQuantities: Record<string, number>;
  /** Se pidió confirmar y no llegó al servidor: se reintenta con la misma clave. */
  pending: boolean;
};

const nuevoBorrador = (): Draft => ({
  requestId: crypto.randomUUID(),
  scans: [],
  damaged: [],
  note: "",
  quantities: {},
  damagedQuantities: {},
  pending: false,
});

function leerBorrador(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function guardarBorrador(key: string, draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(key, JSON.stringify(draft));
    else window.localStorage.removeItem(key);
  } catch {
    // Sin almacenamiento la consola sigue funcionando; solo no sobrevive a una recarga.
  }
}

// La consola de entregas y devoluciones del CML (ADR-150 reglas 5 y 6, ADR-191 regla 6). Leer un
// código no mueve nada: lo agrega a la lista con su ubicación y su caja, y el movimiento se guarda al
// confirmar, con una clave que el servidor no repite. Lo que va en la lista vive también en el
// teléfono: si se recarga la página o se cae la señal, sigue ahí, y la confirmación pendiente se
// vuelve a enviar sola cuando vuelve la conexión.
export function ConsolaEntrega({
  reservation,
  places,
  checkout,
  receive,
}: {
  reservation: Reservation;
  places: Record<string, Place>;
  checkout: (input: CheckoutInput) => Promise<Result>;
  receive: (input: ReturnInput) => Promise<Result>;
}) {
  const router = useRouter();
  const key = `oe-inventario-${reservation.id}-${reservation.status}`;
  const [draft, setDraft] = useState<Draft>(nuevoBorrador);
  const [restored, setRestored] = useState(false);
  const [code, setCode] = useState("");
  const [last, setLast] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const lector = useRef<LectorAbierto | null>(null);
  const out = reservation.status === "OUT";

  const candidates: Candidate[] = reservation.lines.flatMap<Candidate>((line) => {
    const place = places[line.itemId] ?? null;
    return line.mode === "UNIT"
      ? line.units.map((unit) => ({
          code: unit.barcode,
          lineId: line.id,
          unitId: unit.id,
          name: line.itemName,
          place,
          quantity: 1,
        }))
      : [
          {
            code: line.barcode,
            lineId: line.id,
            unitId: null,
            name: line.itemName,
            place,
            quantity: out ? line.outstanding : line.quantity,
          },
        ];
  });
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;

  useEffect(() => {
    const saved = leerBorrador(key);
    if (saved && (saved.scans.length > 0 || saved.pending)) {
      setDraft(saved);
      setRestored(true);
    }
  }, [key]);

  const update = useCallback(
    (change: (current: Draft) => Draft) =>
      setDraft((current) => {
        const next = change(current);
        guardarBorrador(key, next);
        return next;
      }),
    [key],
  );

  const detener = useCallback(() => {
    lector.current?.detener();
    lector.current = null;
    setScanning(false);
  }, []);
  useEffect(() => detener, [detener]);

  const agregar = useCallback(
    (raw: string) => {
      const value = raw.trim().toUpperCase();
      if (!candidatesRef.current.some((entry) => entry.code === value)) {
        setFailure(true);
        setMessage(t("T-4371"));
        return;
      }
      setLast(value);
      setCode("");
      update((current) => {
        if (current.scans.includes(value)) {
          setFailure(false);
          setMessage(t("T-4372"));
          return current;
        }
        setFailure(false);
        setMessage("");
        return { ...current, scans: [value, ...current.scans] };
      });
      if ("vibrate" in navigator) navigator.vibrate?.(40);
    },
    [update],
  );

  async function escanear() {
    detener();
    const element = video.current;
    if (!element) return;
    setScanning(true);
    try {
      lector.current = await abrirLector(element, agregar);
    } catch {
      detener();
      setFailure(true);
      setMessage(t("T-4368"));
    }
  }

  const confirmar = useCallback(
    async (current: Draft) => {
      if (saving || current.scans.length === 0) return;
      detener();
      if (!navigator.onLine) {
        update((value) => ({ ...value, pending: true }));
        setFailure(true);
        setMessage(t("T-5073"));
        return;
      }
      setSaving(true);
      setMessage("");
      try {
        const result = !out
          ? await checkout({
              reservationId: reservation.id,
              requestId: current.requestId,
              collectorId: reservation.collectorId,
              barcodes: current.scans,
            })
          : await receive({
              reservationId: reservation.id,
              requestId: current.requestId,
              ...(current.note.trim() ? { note: current.note.trim() } : {}),
              lines: reservation.lines.flatMap((line) => {
                const selected = candidates.filter(
                  (entry) => entry.lineId === line.id && current.scans.includes(entry.code),
                );
                if (selected.length === 0) return [];
                const unitIds = selected.flatMap((entry) => (entry.unitId ? [entry.unitId] : []));
                const damagedUnitIds = selected.flatMap((entry) =>
                  entry.unitId && current.damaged.includes(entry.code) ? [entry.unitId] : [],
                );
                return [
                  {
                    lineId: line.id,
                    quantity:
                      line.mode === "UNIT"
                        ? unitIds.length
                        : (current.quantities[line.id] ?? line.outstanding),
                    damagedQuantity:
                      line.mode === "UNIT"
                        ? damagedUnitIds.length
                        : (current.damagedQuantities[line.id] ?? 0),
                    unitIds,
                    damagedUnitIds,
                  },
                ];
              }),
            });
        setFailure(!result.ok);
        if (result.ok) {
          guardarBorrador(key, null);
          setDraft(nuevoBorrador());
          setRestored(false);
          setLast(null);
          setMessage(t("T-4302"));
          router.refresh();
        } else {
          update((value) => ({ ...value, pending: false }));
          setMessage(result.error ?? t("T-4393"));
        }
      } catch {
        update((value) => ({ ...value, pending: true }));
        setFailure(true);
        setMessage(t("T-5073"));
      } finally {
        setSaving(false);
      }
    },
    [candidates, checkout, detener, key, out, receive, reservation, router, saving, update],
  );

  // Cuando vuelve la señal, la confirmación pendiente sale sola, con su misma clave.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    const retry = () => {
      if (draftRef.current.pending) void confirmar(draftRef.current);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [confirmar]);

  const lastEntry = last ? candidates.find((entry) => entry.code === last) : undefined;
  return (
    <div className="flex flex-col gap-4 pb-28">
      {restored ? <p className="text-sm text-tinta-secundaria">{t("T-5072")}</p> : null}
      <p className="text-sm text-tinta-secundaria">{t("T-4383")}</p>
      <div className="flex flex-wrap gap-2">
        {scanning ? (
          <button type="button" className="boton-secundario min-h-11" onClick={detener}>
            {t("T-4367")}
          </button>
        ) : (
          <button
            type="button"
            className="boton-primario min-h-11"
            disabled={saving}
            onClick={() => void escanear()}
          >
            {t("T-4366")}
          </button>
        )}
      </div>
      <video
        ref={video}
        playsInline
        muted
        hidden={!scanning}
        className="aspect-[4/3] w-full rounded-tarjeta bg-black object-cover"
      >
        <track kind="captions" />
      </video>
      {lastEntry ? (
        <section
          aria-labelledby="ultima-lectura"
          className="flex flex-col gap-1 rounded-tarjeta bg-info-fondo p-4 text-estado-tinta"
        >
          <h3 id="ultima-lectura" className="text-sm">
            {t("T-5071")}
          </h3>
          <p className="text-lg font-semibold">{lastEntry.name}</p>
          {lastEntry.place ? (
            <p className="text-lg">
              {lastEntry.place.location} · {lastEntry.place.box}
            </p>
          ) : null}
        </section>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          agregar(code);
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-semibold">{t("T-4369")}</span>
          <input
            value={code}
            maxLength={160}
            autoCapitalize="characters"
            autoComplete="off"
            disabled={saving}
            onChange={(event) => setCode(event.target.value)}
            className="campo min-h-11"
          />
        </label>
        <button
          type="submit"
          className="boton-secundario min-h-11"
          disabled={saving || !code.trim()}
        >
          {t("T-4370")}
        </button>
      </form>
      <section aria-labelledby="revisados" className="flex flex-col gap-2">
        <h3 id="revisados" className="font-semibold">
          {t("T-4374")}
        </h3>
        <ul className="flex list-none flex-col gap-2 p-0">
          {draft.scans.map((value) => {
            const entry = candidates.find((candidate) => candidate.code === value);
            if (!entry) return null;
            return (
              <li
                key={value}
                className="flex items-start justify-between gap-3 rounded-tarjeta bg-superficie p-3 sombra-flota"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {entry.name} · {entry.quantity}
                  </p>
                  {entry.place ? (
                    <p className="text-sm">
                      {entry.place.location} · {entry.place.box}
                    </p>
                  ) : null}
                  <p className="text-xs text-tinta-secundaria">
                    <code>{value}</code>
                  </p>
                  {out && entry.unitId ? (
                    <label className="mt-1 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.damaged.includes(value)}
                        onChange={(event) =>
                          update((current) => ({
                            ...current,
                            damaged: event.target.checked
                              ? [...current.damaged, value]
                              : current.damaged.filter((item) => item !== value),
                          }))
                        }
                      />
                      {t("T-4379")}
                    </label>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="boton-secundario min-h-11 shrink-0"
                  disabled={saving}
                  aria-label={`${t("T-4373")} ${value}`}
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      scans: current.scans.filter((item) => item !== value),
                      damaged: current.damaged.filter((item) => item !== value),
                    }))
                  }
                >
                  {t("T-4373")}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {out
        ? reservation.lines
            .filter((line) => line.mode === "QUANTITY" && draft.scans.includes(line.barcode))
            .map((line) => (
              <fieldset key={line.id} className="grid grid-cols-2 gap-3">
                <legend className="col-span-2 font-semibold">
                  {line.itemName} · {t("T-4377")}: {line.outstanding}
                </legend>
                <label className="flex flex-col gap-1">
                  <span>{t("T-4378")}</span>
                  <input
                    type="number"
                    min="1"
                    max={line.outstanding}
                    step="1"
                    required
                    value={draft.quantities[line.id] ?? line.outstanding}
                    onChange={(event) =>
                      update((current) => ({
                        ...current,
                        quantities: {
                          ...current.quantities,
                          [line.id]: Number(event.target.value),
                        },
                      }))
                    }
                    className="campo min-h-11"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span>{t("T-4379")}</span>
                  <input
                    type="number"
                    min="0"
                    max={line.outstanding}
                    step="1"
                    required
                    value={draft.damagedQuantities[line.id] ?? 0}
                    onChange={(event) =>
                      update((current) => ({
                        ...current,
                        damagedQuantities: {
                          ...current.damagedQuantities,
                          [line.id]: Number(event.target.value),
                        },
                      }))
                    }
                    className="campo min-h-11"
                  />
                </label>
              </fieldset>
            ))
        : null}
      {out ? (
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{t("T-4380")}</span>
          <textarea
            maxLength={2000}
            rows={3}
            value={draft.note}
            onChange={(event) => update((current) => ({ ...current, note: event.target.value }))}
            className="campo"
          />
        </label>
      ) : null}
      {message ? (
        <p
          role={failure ? "alert" : "status"}
          className={`rounded-control p-3 text-sm font-semibold ${
            failure ? "bg-error-fondo text-error" : "bg-exito-fondo text-exito"
          }`}
        >
          {message}
        </p>
      ) : null}
      <div className="sticky bottom-4 z-10 rounded-tarjeta bg-superficie p-3 sombra-flota">
        <button
          type="button"
          className="boton-primario min-h-12 w-full"
          disabled={saving || draft.scans.length === 0}
          onClick={() => void confirmar(draft)}
        >
          {t(saving ? "T-4400" : out ? "T-4376" : "T-4375")}
        </button>
      </div>
    </div>
  );
}
