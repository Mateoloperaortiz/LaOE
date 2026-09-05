import type { Metadata } from "next";
import { listRequestsByPerson } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import { getMembershipRef, getMyMembership, listAllCommittees } from "@/modules/people";
import { BarraTitulo, Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { Vacio } from "../_ui/Vacio";
import { createRequestAction, withdrawRequestAction } from "./actions";

// Solicitudes en Mi OE (06-mapa-del-sitio.md, ADR-037 regla 9): mis solicitudes con estado y respuesta
// de GH, y los tres pedidos: licencia, retiro voluntario y cambio de comité para el próximo semestre.

export const metadata: Metadata = { title: t("T-138") };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export default async function SolicitudesPage({ searchParams }: PageProps<"/app/solicitudes">) {
  const actor = await requireActor("/app/solicitudes");
  const search: Search = await searchParams;
  const enviada = single(search.enviada) === "1";
  const retirada = single(search.retirada) === "1";
  const error = single(search.error);
  const [requests, membership, mine, committees] = await Promise.all([
    listRequestsByPerson(actor.personId),
    getMembershipRef(actor.personId),
    getMyMembership(actor.personId),
    listAllCommittees(),
  ]);
  const kinds = tList("T-139");
  const kindLabels = tList("T-894");
  const [galeria, contacto] = tList("T-888") as [string, string];
  const [dejas, entras] = [t("T-884"), t("T-885")];
  const isActive = membership?.status === "ACTIVE";
  const mineIds = new Set(mine.committees.map((row) => row.committeeId));
  const pending = new Set(
    requests.filter((row) => row.status === "PENDING").map((row) => row.kind),
  );

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-138")}</h1>
        <p className="max-w-prose text-lg">{t("T-874")}</p>
        {enviada ? (
          <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
            {t("T-140")}
          </output>
        ) : null}
        {retirada ? (
          <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
            {t("T-879")}
          </output>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-xl bg-oe-orange px-4 py-3 font-semibold text-oe-navy">
            {error}
          </p>
        ) : null}
      </header>

      <section id="solicitudes" aria-labelledby="mis-solicitudes" className="flex flex-col gap-4">
        <BarraTitulo color="azul" className="self-start">
          <span id="mis-solicitudes">{t("T-877")}</span>
        </BarraTitulo>
        {requests.length === 0 ? (
          <Vacio texto={t("T-875")} />
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0">
            {requests.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{row.kindLabel}</span>
                  <Insignia
                    fondo={
                      row.status === "APPROVED"
                        ? "amarillo"
                        : row.status === "REJECTED"
                          ? "naranja"
                          : row.status === "PENDING"
                            ? "sky"
                            : "paper"
                    }
                  >
                    {row.statusLabel}
                  </Insignia>
                  <span className="text-sm text-tinta-suave">{formatDateTime(row.createdAt)}</span>
                </div>
                <p className="text-sm">{row.detail}</p>
                {row.status === "APPROVED" ? (
                  <p className="text-sm font-semibold">
                    <span className="eyebrow text-xs text-tinta-suave">{t("T-895")}: </span>
                    {t("T-141", { tipo: row.kindLabel })}
                  </p>
                ) : null}
                {row.status === "REJECTED" ? (
                  <p className="text-sm font-semibold">
                    <span className="eyebrow text-xs text-tinta-suave">{t("T-895")}: </span>
                    {t("T-142", { tipo: row.kindLabel, motivo: row.reason ?? "" })}
                  </p>
                ) : null}
                {row.status === "PENDING" ? (
                  <form action={withdrawRequestAction}>
                    <input type="hidden" name="requestId" value={row.id} />
                    <button type="submit" className="boton-secundario min-h-9 px-4 py-1 text-sm">
                      {t("T-878")}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!isActive ? (
        <Vacio texto={t("T-892")} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-3">
          <section id="leave" aria-labelledby="pedir-licencia" className="flex flex-col gap-4">
            <BarraTitulo color="amarillo" className="self-start">
              <span id="pedir-licencia">{kinds[0]}</span>
            </BarraTitulo>
            <p className="text-sm">{t("T-882")}</p>
            <form action={createRequestAction} className="flex flex-col gap-3">
              <input type="hidden" name="kind" value="LEAVE" />
              <label htmlFor="leave-reason" className="flex flex-col gap-1 text-sm font-semibold">
                {t("T-880")}
                <textarea
                  id="leave-reason"
                  name="reason"
                  rows={3}
                  required
                  className={inputClass}
                />
              </label>
              <label htmlFor="leave-until" className="flex flex-col gap-1 text-sm font-semibold">
                {t("T-881")}
                <input id="leave-until" name="until" type="date" className={inputClass} />
              </label>
              <button
                type="submit"
                className="boton-calido self-start"
                disabled={pending.has("LEAVE")}
              >
                {t("T-893")}
              </button>
              {pending.has("LEAVE") ? (
                <p className="text-sm text-tinta-suave">
                  {t("T-891", { tipo: kindLabels[0] ?? "" })}
                </p>
              ) : null}
            </form>
          </section>

          <section id="transfer" aria-labelledby="cambiar-comite" className="flex flex-col gap-4">
            <BarraTitulo color="amarillo" className="self-start">
              <span id="cambiar-comite">{kinds[2]}</span>
            </BarraTitulo>
            <p className="text-sm">{t("T-883")}</p>
            <form action={createRequestAction} className="flex flex-col gap-3">
              <input type="hidden" name="kind" value="TRANSFER" />
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-semibold">{dejas}</legend>
                {mine.committees.map((row) => (
                  <label
                    key={row.committeeId}
                    htmlFor={`leave-${row.committeeId}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      id={`leave-${row.committeeId}`}
                      type="checkbox"
                      name="leaveCommitteeIds"
                      value={row.committeeId}
                      className="size-5"
                    />
                    {row.committeeName}
                  </label>
                ))}
              </fieldset>
              <label htmlFor="join" className="flex flex-col gap-1 text-sm font-semibold">
                {entras}
                <select id="join" name="joinCommitteeIds" multiple size={6} className={inputClass}>
                  {committees
                    .filter((committee) => !mineIds.has(committee.id))
                    .map((committee) => (
                      <option key={committee.id} value={committee.id}>
                        {committee.name}
                      </option>
                    ))}
                </select>
              </label>
              <label
                htmlFor="transfer-reason"
                className="flex flex-col gap-1 text-sm font-semibold"
              >
                {t("T-880")}
                <textarea
                  id="transfer-reason"
                  name="reason"
                  rows={3}
                  required
                  className={inputClass}
                />
              </label>
              <button
                type="submit"
                className="boton-calido self-start"
                disabled={pending.has("TRANSFER")}
              >
                {t("T-893")}
              </button>
              {pending.has("TRANSFER") ? (
                <p className="text-sm text-tinta-suave">
                  {t("T-891", { tipo: kindLabels[2] ?? "" })}
                </p>
              ) : null}
            </form>
          </section>

          <section id="resignation" aria-labelledby="retirarme" className="flex flex-col gap-4">
            <BarraTitulo color="naranja" className="self-start">
              <span id="retirarme">{kinds[1]}</span>
            </BarraTitulo>
            <p className="text-sm">{t("T-143")}</p>
            <form action={createRequestAction} className="flex flex-col gap-3">
              <input type="hidden" name="kind" value="RESIGNATION" />
              <label
                htmlFor="resignation-reason"
                className="flex flex-col gap-1 text-sm font-semibold"
              >
                {t("T-880")}
                <textarea
                  id="resignation-reason"
                  name="reason"
                  rows={3}
                  required
                  className={inputClass}
                />
              </label>
              <label htmlFor="memorial" className="flex items-center gap-2 text-sm">
                <input id="memorial" type="checkbox" name="memorialConsent" className="size-5" />
                {galeria}
              </label>
              <label htmlFor="contact" className="flex items-center gap-2 text-sm">
                <input id="contact" type="checkbox" name="contactConsent" className="size-5" />
                {contacto}
              </label>
              <label htmlFor="personal-email" className="flex flex-col gap-1 text-sm font-semibold">
                {t("T-889")}
                <input
                  id="personal-email"
                  name="personalEmail"
                  type="email"
                  className={inputClass}
                />
              </label>
              <label htmlFor="confirm" className="flex items-center gap-2 text-sm">
                <input id="confirm" type="checkbox" name="confirm" className="size-5" required />
                {t("T-890")}
              </label>
              <button
                type="submit"
                className="boton-calido self-start"
                disabled={pending.has("RESIGNATION")}
              >
                {t("T-893")}
              </button>
              {pending.has("RESIGNATION") ? (
                <p className="text-sm text-tinta-suave">
                  {t("T-891", { tipo: kindLabels[1] ?? "" })}
                </p>
              ) : null}
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
