import type { Metadata } from "next";
import { single } from "@/app/_lib/search";
import { requireActor } from "@/modules/identity";
import { myPredictions, ticketStatusLabel } from "@/modules/predictions";
import { tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { placeParlayAction, placeSingleAction } from "./actions";

// Los pronósticos del Athletic en Mi OE (ADR-197 regla 7): quien registró su asistencia a un partido
// pronostica con sus GH Points hasta que empieza, dentro del tope por partido. Se paga por bolsa.

const [titulo] = tList("T-5150");
export const metadata: Metadata = { title: titulo };

const CONTROL = "min-h-11 rounded-xl border border-borde bg-fondo px-3";

export default async function Page({ searchParams }: PageProps<"/app/pronosticos">) {
  const actor = await requireActor("/app/pronosticos");
  const query = await searchParams;
  const mine = await myPredictions(actor.personId);
  const [
    heading,
    intro,
    saldo,
    teQuedan,
    sencillo,
    parley,
    cuanto,
    pronosticar,
    tuyos,
    vacio,
    sinPartidos,
    ninguna,
    listo,
  ] = tList("T-5150");
  const error = single(query.error);
  const open = (markets: (typeof mine.matches)[number]["markets"]) =>
    markets.filter((market) => market.status === "OPEN");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pantalla">{heading}</h1>
        <p className="text-secundario text-tinta-secundaria">{intro}</p>
        <p className="font-semibold">{(saldo ?? "").replace("{n}", String(mine.balance))}</p>
      </header>
      {error ? (
        <p role="alert" className="font-semibold text-oe-orange">
          {error}
        </p>
      ) : single(query.listo) === "1" ? (
        <output className="block font-semibold text-titulo">{listo}</output>
      ) : null}
      {mine.matches.length === 0 ? <p className="text-tinta-secundaria">{sinPartidos}</p> : null}
      {mine.matches.map((match) => {
        const remaining = Math.max((mine.cap ?? 0) - match.spent, 0);
        const markets = open(match.markets);
        return (
          <section
            key={match.id}
            aria-labelledby={`partido-${match.id}`}
            className="flex flex-col gap-4 rounded-tarjeta bg-superficie p-4"
          >
            <div className="flex flex-col gap-1">
              <h2 id={`partido-${match.id}`} className="titulo-seccion">
                {match.title}
              </h2>
              <p className="m-0 text-sm text-tinta-secundaria">
                {formatDateTime(match.startsAt)} ·{" "}
                {(teQuedan ?? "").replace("{n}", String(remaining))}
              </p>
            </div>
            <form action={placeSingleAction} className="flex flex-col gap-2">
              <h3 className="font-semibold">{sencillo}</h3>
              <input type="hidden" name="occasionId" value={match.id} />
              <label className="sr-only" htmlFor={`sencillo-${match.id}`}>
                {sencillo}
              </label>
              <select id={`sencillo-${match.id}`} name="pick" required className={CONTROL}>
                {markets.map((market) => (
                  <optgroup key={market.id} label={market.title}>
                    {market.options.map((option) => (
                      <option key={option.id} value={`${market.id}:${option.id}`}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <label className="flex flex-col gap-1" htmlFor={`sencillo-${match.id}-stake`}>
                <span>{cuanto}</span>
                <input
                  id={`sencillo-${match.id}-stake`}
                  name="stake"
                  type="number"
                  min={1}
                  max={remaining || undefined}
                  required
                  className={CONTROL}
                />
              </label>
              <button type="submit" className="boton-primario self-start">
                {pronosticar}
              </button>
            </form>
            {markets.length > 1 ? (
              <form action={placeParlayAction} className="flex flex-col gap-2">
                <h3 className="font-semibold">{parley}</h3>
                <input type="hidden" name="occasionId" value={match.id} />
                {markets.map((market) => (
                  <div key={market.id} className="flex flex-col gap-1">
                    <label htmlFor={`parley-${match.id}-${market.id}`}>{market.title}</label>
                    <select
                      id={`parley-${match.id}-${market.id}`}
                      name="picks"
                      defaultValue=""
                      className={CONTROL}
                    >
                      <option value="">{ninguna}</option>
                      {market.options.map((option) => (
                        <option key={option.id} value={`${market.id}:${option.id}`}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <label className="flex flex-col gap-1" htmlFor={`parley-${match.id}-stake`}>
                  <span>{cuanto}</span>
                  <input
                    id={`parley-${match.id}-stake`}
                    name="stake"
                    type="number"
                    min={1}
                    max={remaining || undefined}
                    required
                    className={CONTROL}
                  />
                </label>
                <button type="submit" className="boton-secundario self-start">
                  {pronosticar}
                </button>
              </form>
            ) : null}
          </section>
        );
      })}
      <section aria-labelledby="tus-pronosticos" className="flex flex-col gap-3">
        <h2 id="tus-pronosticos" className="titulo-seccion">
          {tuyos}
        </h2>
        {mine.tickets.length === 0 ? <p className="text-tinta-secundaria">{vacio}</p> : null}
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
          {mine.tickets.map((ticket) => (
            <li key={ticket.id} className="flex flex-col gap-1 rounded-xl border border-borde p-3">
              <p className="m-0 font-semibold">
                {ticketStatusLabel(ticket.status)} · {ticket.stake}
                {ticket.payout ? ` → ${ticket.payout}` : ""}
              </p>
              <p className="m-0 text-tinta-secundaria">
                {ticket.picks.map((pick) => `${pick.marketTitle}: ${pick.optionLabel}`).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
