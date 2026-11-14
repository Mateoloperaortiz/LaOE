import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single } from "@/app/_lib/search";
import { getMatchCap, listPredictionMatches, marketStatusLabel } from "@/modules/predictions";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";
import { Button } from "@/shared/ui/Button";
import { Field, Select, TextArea, TextInput } from "@/shared/ui/Field";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { EmptyState } from "@/shared/ui/States";
import {
  cancelMarketAction,
  createMarketAction,
  openMarketAction,
  resolveMarketAction,
  setCapAction,
} from "./actions";

// Los pronósticos del Athletic en la Operación (ADR-197 regla 7): quien lidera el Athletic crea, abre,
// resuelve y cancela los pronósticos de cada partido; quien decide por la VP de Gestión Humana fija el
// tope por persona y por partido.

const [titulo] = tList("T-5146");
export const metadata: Metadata = { title: titulo };

const TONE = { DRAFT: "neutral", OPEN: "aviso", RESOLVED: "exito", CANCELLED: "error" } as const;

export default async function Page({ searchParams }: PageProps<"/admin/pronosticos">) {
  const roles = await requireAdminAreaRoles("/admin/pronosticos");
  const setsCap = roles.boardSeats.some((item) => item.seat === "VP_GH");
  if (!roles.leadsAthletic && !setsCap) redirect("/admin");
  const query = await searchParams;
  const now = new Date();
  const [matches, cap] = await Promise.all([listPredictionMatches(now), getMatchCap()]);
  const [heading, intro, topeTitulo, topeCampo, guardarTope, sinTope, topeActual] = tList("T-5146");
  const [
    nuevo,
    queCampo,
    opcionesCampo,
    crear,
    abrir,
    cancelar,
    resultado,
    registrar,
    bolsa,
    bolsaParleys,
    sinPartidos,
    gano,
  ] = tList("T-5147");
  const error = single(query.error);

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={heading} description={intro} />
      {error ? (
        <Banner tone="error" title={error} />
      ) : single(query.guardado) === "1" ? (
        <Banner tone="exito" title={t("T-4302")} />
      ) : null}
      <p className="text-sm">
        {cap === null ? sinTope : (topeActual ?? "").replace("{n}", String(cap))}
      </p>
      {setsCap ? (
        <form action={setCapAction} className="flex flex-wrap items-end gap-3">
          <h2 className="w-full text-display-md">{topeTitulo}</h2>
          <Field id="pronosticos-tope" label={topeCampo ?? ""}>
            <TextInput
              id="pronosticos-tope"
              name="cap"
              type="number"
              min={1}
              max={1000}
              required
              defaultValue={cap ?? ""}
            />
          </Field>
          <Button type="submit" variant="secundaria" area="operacion">
            {guardarTope}
          </Button>
        </form>
      ) : null}
      {matches.length === 0 ? <EmptyState title={sinPartidos ?? ""} /> : null}
      {matches.map((match) => {
        const started = match.startsAt <= now;
        return (
          <section
            key={match.id}
            aria-labelledby={`partido-${match.id}`}
            className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde p-4"
          >
            <header className="flex flex-col gap-1">
              <h2 id={`partido-${match.id}`} className="text-display-md">
                {match.title}
              </h2>
              <p className="m-0 text-sm text-tinta-secundaria">
                {formatDateTime(match.startsAt)} ·{" "}
                {(bolsaParleys ?? "").replace("{n}", String(match.parlayPool))}
              </p>
            </header>
            {match.markets.map((market) => (
              <article
                key={market.id}
                aria-label={market.title}
                className="flex flex-col gap-2 border-l-2 border-borde pl-3"
              >
                <p className="m-0 flex flex-wrap items-center gap-2 font-semibold">
                  {market.title}
                  <Badge tone={TONE[market.status]}>{marketStatusLabel(market.status)}</Badge>
                  <span className="text-sm font-normal text-tinta-secundaria">
                    {(bolsa ?? "").replace("{n}", String(market.pool))}
                  </span>
                </p>
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {market.options.map((option) => (
                    <li key={option.id}>
                      {option.label} · {option.pool}
                      {market.winningOptionId === option.id ? ` · ${gano}` : ""}
                    </li>
                  ))}
                </ul>
                {roles.leadsAthletic ? (
                  <div className="flex flex-wrap items-end gap-2">
                    {market.status === "DRAFT" && !started ? (
                      <form action={openMarketAction}>
                        <input type="hidden" name="marketId" value={market.id} />
                        <Button type="submit" area="operacion">
                          {abrir}
                        </Button>
                      </form>
                    ) : null}
                    {market.status === "OPEN" && started ? (
                      <form action={resolveMarketAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="marketId" value={market.id} />
                        <Field id={`resultado-${market.id}`} label={resultado ?? ""}>
                          <Select id={`resultado-${market.id}`} name="optionId" required>
                            {market.options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Button type="submit" area="operacion">
                          {registrar}
                        </Button>
                      </form>
                    ) : null}
                    {market.status === "DRAFT" || market.status === "OPEN" ? (
                      <form action={cancelMarketAction}>
                        <input type="hidden" name="marketId" value={market.id} />
                        <Button type="submit" variant="secundaria" area="operacion">
                          {cancelar}
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
            {roles.leadsAthletic && !started ? (
              <form action={createMarketAction} className="flex max-w-xl flex-col gap-3">
                <h3 className="font-semibold">{nuevo}</h3>
                <input type="hidden" name="occasionId" value={match.id} />
                <Field id={`que-${match.id}`} label={queCampo ?? ""}>
                  <TextInput
                    id={`que-${match.id}`}
                    name="title"
                    required
                    minLength={2}
                    maxLength={160}
                  />
                </Field>
                <Field id={`opciones-${match.id}`} label={opcionesCampo ?? ""}>
                  <TextArea id={`opciones-${match.id}`} name="options" rows={3} required />
                </Field>
                <Button type="submit" variant="secundaria" area="operacion" className="self-start">
                  {crear}
                </Button>
              </form>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
