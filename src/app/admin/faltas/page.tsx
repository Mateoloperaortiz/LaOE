import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single, withQuery } from "@/app/_lib/search";
import {
  getPeopleByIds,
  listSanctionsOfTerm,
  listTermRoster,
  SANCTION_KINDS,
} from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate, todayKey } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";
import { Button, buttonClass } from "@/shared/ui/Button";
import { DetailPanel } from "@/shared/ui/DetailPanel";
import { Field, Select, TextArea, TextInput } from "@/shared/ui/Field";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { SplitView } from "@/shared/ui/SplitView";
import { EmptyState } from "@/shared/ui/States";
import { WorkTable } from "@/shared/ui/WorkTable";
import { recordGhSanctionAction, revokeGhSanctionAction } from "./actions";

// Faltas y sanciones de Gestión Humana (ADR-196 regla 5): quien decide por la VP de GH registra
// cualquier sanción, que vale de una vez, y anula una avalada con su motivo. Las faltas que anotan los
// comités le llegan a «Avales». ADMIN ve la lista sin botones: no sanciona.

const [titulo] = tList("T-5097");
export const metadata: Metadata = { title: titulo };

const TONE = {
  LIVE: "error",
  EXPIRED: "neutral",
  REVOKED: "neutral",
  PENDING: "aviso",
  REJECTED: "neutral",
} as const;

export default async function Page({ searchParams }: PageProps<"/admin/faltas">) {
  const roles = await requireAdminAreaRoles("/admin/faltas");
  const canAct = roles.boardSeats.some((item) => item.seat === "VP_GH");
  if (!roles.isAdmin && !canAct) redirect("/admin");
  const query = await searchParams;
  const term = await getCurrentTerm();
  const [heading, intro] = tList("T-5097");
  const [persona, eligePersona, vacio, volver] = tList("T-5098");
  const [, causa, referencia, fechaFalta, , comite] = tList("T-5096");
  const [campoTipo, campoCausal, campoReferencia, campoFecha, campoHasta] = tList("T-2230");
  const [registrar, anular] = tList("T-2232");
  const kinds = tLabels("T-2229", SANCTION_KINDS);
  const columnas = tList("T-5101");
  const error = single(query.error);
  const close = "/admin/faltas";
  const day = (key: string) => formatDate(new Date(`${key}T12:00:00Z`));
  if (!term) {
    return <ScreenHeader title={heading} description={t("T-827")} />;
  }

  const sanctions = await listSanctionsOfTerm(term.id);
  const selected = sanctions.find((row) => row.id === single(query.sancion)) ?? null;
  const creating = canAct && single(query.nueva) === "1";
  const roster = creating ? await listTermRoster(term.id) : [];
  const candidates = creating
    ? [
        ...(
          await getPeopleByIds([
            ...new Set(
              roster
                .filter((row) => row.status !== "INACTIVE" && row.leftAt === null)
                .map((row) => row.personId),
            ),
          ])
        ).values(),
      ].sort((a, b) => a.fullName.localeCompare(b.fullName, "es-CO"))
    : [];

  const form = creating ? (
    <DetailPanel title={registrar ?? ""} closeHref={close} closeLabel={volver ?? ""}>
      <p className="text-sm text-tinta-secundaria">{t("T-2231")}</p>
      <form action={recordGhSanctionAction} className="flex flex-col gap-3">
        <Field id="falta-persona" label={persona ?? ""}>
          <Select id="falta-persona" name="personId" required defaultValue="">
            <option value="" disabled>
              {eligePersona}
            </option>
            {candidates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName || item.email}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="falta-tipo" label={campoTipo ?? ""}>
          <Select id="falta-tipo" name="kind" required>
            {SANCTION_KINDS.map((code) => (
              <option key={code} value={code}>
                {kinds[code]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="falta-causa" label={campoCausal ?? ""}>
          <TextArea
            id="falta-causa"
            name="cause"
            required
            minLength={5}
            maxLength={1000}
            rows={4}
          />
        </Field>
        <Field id="falta-referencia" label={campoReferencia ?? ""}>
          <TextInput id="falta-referencia" name="reference" maxLength={120} />
        </Field>
        <Field id="falta-fecha" label={campoFecha ?? ""}>
          <TextInput
            id="falta-fecha"
            name="occurredOn"
            type="date"
            required
            defaultValue={todayKey()}
          />
        </Field>
        <Field id="falta-hasta" label={campoHasta ?? ""}>
          <TextInput id="falta-hasta" name="suspendedUntil" type="date" />
        </Field>
        <Button type="submit" area="operacion" className="self-start">
          {registrar}
        </Button>
      </form>
    </DetailPanel>
  ) : null;

  const detail = selected ? (
    <DetailPanel
      title={selected.personName}
      eyebrow={selected.kindLabel}
      closeHref={close}
      closeLabel={volver ?? ""}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-tinta-secundaria">{fechaFalta}</dt>
        <dd>{day(selected.occurredOn)}</dd>
        <dt className="text-tinta-secundaria">{comite}</dt>
        <dd>{selected.committeeName ?? "—"}</dd>
        {selected.reference ? (
          <>
            <dt className="text-tinta-secundaria">{referencia}</dt>
            <dd>{selected.reference}</dd>
          </>
        ) : null}
        <dt className="text-tinta-secundaria">{columnas[4]}</dt>
        <dd>
          <Badge tone={TONE[selected.state]} className="whitespace-nowrap">
            {selected.stateLabel}
          </Badge>
        </dd>
      </dl>
      <p className="text-sm">
        <span className="text-tinta-secundaria">{causa}: </span>
        {selected.cause}
      </p>
      {selected.decisionNote || selected.revokeReason ? (
        <p className="text-sm text-tinta-secundaria">
          {selected.revokeReason ?? selected.decisionNote}
        </p>
      ) : null}
      {canAct && selected.state === "LIVE" ? (
        <form action={revokeGhSanctionAction} className="flex flex-col gap-3">
          <input name="sanctionId" type="hidden" value={selected.id} />
          <input name="personId" type="hidden" value={selected.personId} />
          <Field id="falta-anular" label={t("T-2240")}>
            <TextArea id="falta-anular" name="reason" required minLength={2} rows={3} />
          </Field>
          <Button type="submit" variant="secundaria" area="operacion" className="self-start">
            {anular}
          </Button>
        </form>
      ) : null}
    </DetailPanel>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title={heading}
        description={intro}
        actions={
          canAct ? (
            <Link
              href={withQuery(close, { nueva: "1" })}
              className={buttonClass({ area: "operacion" })}
            >
              {registrar}
            </Link>
          ) : null
        }
      />
      {error ? (
        <Banner tone="error" title={error} />
      ) : query.guardado === "1" ? (
        <Banner tone="exito" title={t("T-4302")} />
      ) : null}
      <SplitView
        list={
          <WorkTable
            caption={heading ?? ""}
            columns={[
              { key: "persona", label: persona ?? "" },
              { key: "tipo", label: columnas[1] ?? "" },
              { key: "comite", label: columnas[2] ?? "" },
              { key: "fecha", label: columnas[3] ?? "" },
              { key: "estado", label: columnas[4] ?? "" },
            ]}
            rows={sanctions.map((row) => ({
              id: row.id,
              current: row.id === selected?.id,
              cells: {
                persona: (
                  <Link
                    href={withQuery(close, { sancion: row.id })}
                    scroll={false}
                    className="font-semibold text-tinta no-underline hover:underline"
                  >
                    {row.personName}
                  </Link>
                ),
                tipo: row.kindLabel,
                comite: row.committeeName ?? "—",
                fecha: day(row.occurredOn),
                estado: (
                  <Badge tone={TONE[row.state]} className="whitespace-nowrap">
                    {row.stateLabel}
                  </Badge>
                ),
              },
            }))}
            empty={<EmptyState title={vacio ?? ""} />}
          />
        }
        detail={form ?? detail}
      />
    </div>
  );
}
