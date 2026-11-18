import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single, withQuery } from "@/app/_lib/search";
import { listCreativeApprovals } from "@/modules/comms";
import { findPublishedCrisisProtocol } from "@/modules/content";
import {
  approvalStatusLabel,
  byRisk,
  contractStatusLabel,
  getEventApprovalDetail,
  listContracts,
  listEventApprovals,
  pendingFinancialApprovals,
  proposalTitle,
  RISK_LEVELS,
  type RiskLevel,
  riskLevelLabel,
} from "@/modules/finance";
import {
  APPOINTMENT_KINDS,
  boardApprovalLabel,
  getPeopleByIds,
  listPendingSanctions,
  pendingCandidacies,
} from "@/modules/people";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate, formatDateTime, todayKey } from "@/shared/lib/dates";
import { formatExactMoney } from "@/shared/lib/money";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";
import { Button } from "@/shared/ui/Button";
import { DetailPanel } from "@/shared/ui/DetailPanel";
import { Field, Select, TextArea } from "@/shared/ui/Field";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { SplitView } from "@/shared/ui/SplitView";
import { EmptyState } from "@/shared/ui/States";
import { WorkTable } from "@/shared/ui/WorkTable";
import { AvalHistoria, RiesgoBadge, RiesgoRojo } from "../_kit/aval";
import { ContractDetails } from "../_kit/ContractDetails";
import { CreativeDetails } from "../_kit/CreativeDetails";
import { AVAL_KINDS, avalParam } from "./_ui/kinds";
import { changeRiskAction, decideAvalAction, returnAvalAction } from "./actions";

// Los avales de la junta (ADR-195): cada cargo ve lo que le toca decidir. El aval de evento lo decide la
// Presidencia (A1) y las faltas por avalar, quien decide por la VP de Gestión Humana (A2, ADR-196).
// ADMIN ve la lista sin decidir: no decide por la junta. La Presidencia también devuelve el aval con
// comentarios y cambia su semáforo, y la lista va del riesgo más alto al más bajo (ADR-197).

const [titulo] = tList("T-5083");
export const metadata: Metadata = { title: titulo };

const TONE = { PENDING: "aviso", APPROVED: "exito", REJECTED: "error", RETURNED: "info" } as const;

type Kind = (typeof AVAL_KINDS)[number];

export default async function Page({ searchParams }: PageProps<"/admin/avales">) {
  const roles = await requireAdminAreaRoles("/admin/avales");
  if (!roles.isAdmin && roles.boardSeats.length === 0) redirect("/admin");
  const query = await searchParams;
  const decides = (seat: string) => roles.boardSeats.some((item) => item.seat === seat);
  const decidesEvents = decides("PRESIDENT");
  const decidesFaltas = decides("VP_GH");
  const decidesFinance = decides("VP_FINANCE");
  const decidesCreatives = decides("VP_COMMUNICATIONS");
  const signsContracts = decidesFinance || decidesEvents;
  const [events, faltas, candidacies, finance, contracts, creatives] = await Promise.all([
    decidesEvents || roles.isAdmin ? listEventApprovals({}) : [],
    decidesFaltas || roles.isAdmin ? listPendingSanctions() : [],
    decidesFaltas || roles.isAdmin ? pendingCandidacies() : [],
    decidesFinance || roles.isAdmin ? pendingFinancialApprovals() : [],
    signsContracts || roles.isAdmin ? listContracts({ pendingOnly: false }) : [],
    decidesCreatives || roles.isAdmin ? listCreativeApprovals({ pendingOnly: false }) : [],
  ]);
  // Abiertos: por decidir y devueltos al comité, del riesgo más alto al más bajo (ADR-197 regla 2).
  const openEvents = events
    .filter((row) => row.status === "PENDING" || row.status === "RETURNED")
    .sort(byRisk);
  const recentEvents = events
    .filter((row) => row.status === "APPROVED" || row.status === "REJECTED")
    .slice(0, 10);
  const selectedId = events.find((row) => row.id === single(query.aval))?.id;
  const [selectedEvent, protocol] = await Promise.all([
    selectedId ? getEventApprovalDetail(selectedId) : null,
    selectedId ? findPublishedCrisisProtocol() : null,
  ]);
  const selectedFalta = faltas.find((row) => row.id === single(query.falta)) ?? null;
  const selectedCandidacy = candidacies.find((row) => row.id === single(query.postulacion));
  const financial = finance.find((row) => row.id === single(query.finanzas));
  const contract = contracts.find((row) => row.id === single(query.contrato));
  const creative = creatives.find((row) => row.id === single(query.pieza));
  const people = await getPeopleByIds([
    ...new Set([
      ...(financial?.requestedById ? [financial.requestedById] : []),
      ...events.flatMap((row) => (row.requestedById ? [row.requestedById] : [])),
      ...(selectedEvent?.entries ?? []).flatMap((entry) =>
        entry.authorId ? [entry.authorId] : [],
      ),
    ]),
  ]);
  const names = new Map([...people].map(([id, item]) => [id, item.fullName]));

  const [heading, intro] = tList("T-5083");
  const [comite, , fechaEvento, loPidio, estado, pedidoEl, motivo] = tList("T-5085");
  const columnas = tList("T-5101");
  const [aprobar, rechazar, motivoCampo, loDecide, , vacio, decididos, volver] = tList("T-5086");
  const [persona, tipo, causa, referencia, fechaFalta, laAnoto] = tList("T-5096");
  const [riesgoCampo, porQue] = tList("T-5103");
  const [devolver, comentarios] = tList("T-5106");
  const [cambiarTitulo, nivelCampo, motivoCambio, cambiar] = tList("T-5107");
  const [imprimir, , version] = tList("T-5114");
  const kinds = tLabels("T-5084", AVAL_KINDS);
  const cargos = tLabels("T-444", APPOINTMENT_KINDS);
  const error = single(query.error);
  const close = "/admin/avales";
  const day = (key: string) => formatDate(new Date(`${key}T12:00:00Z`));

  type Row = {
    kind: Kind;
    id: string;
    title: string;
    committee: string;
    date: string;
    status: keyof typeof TONE;
    statusLabel: string;
    risk: RiskLevel | null | undefined;
  };
  const eventRow = (row: (typeof events)[number]): Row => ({
    kind: "EVENT",
    id: row.id,
    title: row.title,
    committee: row.committeeName,
    date: row.eventOn,
    status: row.status,
    statusLabel: approvalStatusLabel(row.status),
    risk: row.riskLevel,
  });
  const faltaRow = (row: (typeof faltas)[number]): Row => ({
    kind: "SANCTION",
    id: row.id,
    title: `${row.personName} · ${row.kindLabel}`,
    committee: row.committeeName ?? "—",
    date: row.occurredOn,
    status: "PENDING",
    statusLabel: row.stateLabel,
    risk: undefined,
  });
  const candidacyRows: Row[] = candidacies.map((row) => ({
    kind: "CANDIDACY",
    id: row.id,
    title: `${row.personName} · ${row.roleLabel}`,
    committee: row.committeeName,
    date: todayKey(row.requestedAt),
    status: row.status,
    statusLabel: boardApprovalLabel(row.status),
    risk: undefined,
  }));
  const financialRows: Row[] = finance.map((row) => ({
    kind: row.proposal.kind,
    id: row.id,
    title: proposalTitle(row.proposal),
    committee: row.committeeName,
    date: todayKey(row.requestedAt),
    status: row.status,
    statusLabel: boardApprovalLabel(row.status),
    risk: undefined,
  }));
  const isSelected = (row: Row) => single(query[avalParam(row.kind)]) === row.id;
  const contractRows: Row[] = contracts.map((row) => ({
    kind: "CONTRACT",
    id: row.id,
    title: row.title,
    committee: row.committeeName,
    date: todayKey(row.requestedAt),
    status: row.status,
    statusLabel: contractStatusLabel(row.status),
    risk: undefined,
  }));
  const creativeRows: Row[] = creatives.map((row) => ({
    kind: "CREATIVE",
    id: row.id,
    title: row.title,
    committee: row.committeeName,
    date: todayKey(row.requestedAt),
    status: row.status,
    statusLabel: boardApprovalLabel(row.status),
    risk: undefined,
  }));
  const recent = [
    ...creativeRows.filter((row) => row.status !== "PENDING").slice(0, 10),
    ...contractRows.filter((row) => row.status !== "PENDING").slice(0, 10),
    ...recentEvents.map(eventRow),
  ];

  const table = (rows: Row[], caption: string) => (
    <WorkTable
      caption={caption}
      columns={[
        { key: "que", label: columnas[0] ?? "" },
        { key: "tipo", label: columnas[1] ?? "" },
        { key: "comite", label: columnas[2] ?? "" },
        { key: "fecha", label: columnas[3] ?? "" },
        { key: "estado", label: columnas[4] ?? "" },
        { key: "riesgo", label: columnas[5] ?? "" },
      ]}
      rows={rows.map((row) => ({
        id: `${row.kind}-${row.id}`,
        current: isSelected(row),
        cells: {
          que: (
            <Link
              href={withQuery(close, { [avalParam(row.kind)]: row.id })}
              scroll={false}
              className="font-semibold text-tinta no-underline hover:underline"
            >
              {row.title}
            </Link>
          ),
          tipo: kinds[row.kind],
          comite: row.committee,
          fecha: day(row.date),
          estado: (
            <Badge tone={TONE[row.status]} className="whitespace-nowrap">
              {row.statusLabel}
            </Badge>
          ),
          riesgo: row.risk === undefined ? "—" : <RiesgoBadge level={row.risk} />,
        },
      }))}
      empty={<EmptyState title={vacio ?? ""} />}
    />
  );

  const decision = (kind: Kind, id: string, canDecide: boolean, cargo: string) =>
    canDecide ? (
      <form action={decideAvalAction} className="flex flex-col gap-3">
        <input name="avalId" type="hidden" value={id} />
        <input name="tipo" type="hidden" value={kind} />
        <Field id="aval-motivo" label={motivoCampo ?? ""}>
          <TextArea id="aval-motivo" name="note" maxLength={500} rows={3} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="decision" value="APPROVED" area="operacion">
            {kind === "CONTRACT" ? tList("T-5171")[5] : aprobar}
          </Button>
          <Button
            type="submit"
            name="decision"
            value="REJECTED"
            variant="secundaria"
            area="operacion"
          >
            {rechazar}
          </Button>
        </div>
      </form>
    ) : (
      <p className="text-sm text-tinta-secundaria">{(loDecide ?? "").replace("{cargo}", cargo)}</p>
    );

  const detail = selectedEvent ? (
    <DetailPanel
      title={selectedEvent.title}
      eyebrow={kinds.EVENT}
      closeHref={close}
      closeLabel={volver ?? ""}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-tinta-secundaria">{comite}</dt>
        <dd>{selectedEvent.committeeName}</dd>
        <dt className="text-tinta-secundaria">{fechaEvento}</dt>
        <dd>{day(selectedEvent.eventOn)}</dd>
        <dt className="text-tinta-secundaria">{loPidio}</dt>
        <dd>
          {selectedEvent.requestedById
            ? (people.get(selectedEvent.requestedById)?.fullName ?? "—")
            : "—"}
        </dd>
        <dt className="text-tinta-secundaria">{pedidoEl}</dt>
        <dd>{formatDateTime(selectedEvent.requestedAt)}</dd>
        <dt className="text-tinta-secundaria">{estado}</dt>
        <dd>
          <Badge tone={TONE[selectedEvent.status]} className="whitespace-nowrap">
            {approvalStatusLabel(selectedEvent.status)}
          </Badge>
        </dd>
        {selectedEvent.decisionNote ? (
          <>
            <dt className="text-tinta-secundaria">{motivo}</dt>
            <dd>{selectedEvent.decisionNote}</dd>
          </>
        ) : null}
        <dt className="text-tinta-secundaria">{riesgoCampo}</dt>
        <dd>
          <RiesgoBadge level={selectedEvent.riskLevel} />
        </dd>
        {selectedEvent.riskJustification ? (
          <>
            <dt className="text-tinta-secundaria">{porQue}</dt>
            <dd>{selectedEvent.riskJustification}</dd>
          </>
        ) : null}
      </dl>
      {selectedEvent.riskLevel === "RED" ? <RiesgoRojo protocol={protocol} /> : null}
      {selectedEvent.description ? <p className="text-sm">{selectedEvent.description}</p> : null}
      <p className="text-sm">
        <span className="text-tinta-secundaria">
          {(version ?? "").replace("{versión}", String(selectedEvent.version))} ·{" "}
        </span>
        <Link href={`/admin/avales/${selectedEvent.id}/imprimir`}>{imprimir}</Link>
      </p>
      {selectedEvent.status === "PENDING" ? (
        <>
          {decision("EVENT", selectedEvent.id, decidesEvents, cargos.PRESIDENT)}
          {decidesEvents ? (
            <form action={returnAvalAction} className="flex flex-col gap-3">
              <input name="avalId" type="hidden" value={selectedEvent.id} />
              <Field id="aval-comentarios" label={comentarios ?? ""}>
                <TextArea id="aval-comentarios" name="note" maxLength={1000} rows={3} />
              </Field>
              <Button type="submit" variant="secundaria" area="operacion" className="self-start">
                {devolver}
              </Button>
            </form>
          ) : null}
        </>
      ) : null}
      {decidesEvents && selectedEvent.status !== "REJECTED" ? (
        <form action={changeRiskAction} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{cambiarTitulo}</h3>
          <input name="avalId" type="hidden" value={selectedEvent.id} />
          <Field id="aval-nivel" label={nivelCampo ?? ""}>
            <Select
              id="aval-nivel"
              name="riskLevel"
              defaultValue={selectedEvent.riskLevel ?? ""}
              required
            >
              <option value="" disabled>
                —
              </option>
              {RISK_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {riskLevelLabel(level)}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="aval-motivo-semaforo" label={motivoCambio ?? ""}>
            <TextArea id="aval-motivo-semaforo" name="note" maxLength={500} rows={2} />
          </Field>
          <Button type="submit" variant="secundaria" area="operacion" className="self-start">
            {cambiar}
          </Button>
        </form>
      ) : null}
      <AvalHistoria entries={selectedEvent.entries} names={names} headingId="aval-historia" />
    </DetailPanel>
  ) : creative ? (
    <DetailPanel
      title={creative.title}
      eyebrow={kinds.CREATIVE}
      closeHref={close}
      closeLabel={volver ?? ""}
    >
      <CreativeDetails piece={creative} />
      {creative.status === "PENDING" &&
        decision("CREATIVE", creative.id, decidesCreatives, cargos.VP_COMMUNICATIONS)}
    </DetailPanel>
  ) : contract ? (
    <DetailPanel
      title={contract.title}
      eyebrow={kinds.CONTRACT}
      closeHref={close}
      closeLabel={volver ?? ""}
    >
      <ContractDetails row={contract} />
      {contract.status === "PENDING" &&
        (signsContracts ? decision("CONTRACT", contract.id, true, "") : <p>{t("T-5176")}</p>)}
    </DetailPanel>
  ) : financial ? (
    <DetailPanel
      title={proposalTitle(financial.proposal)}
      eyebrow={kinds[financial.proposal.kind]}
      closeHref={close}
      closeLabel={volver ?? ""}
    >
      <p>
        {financial.committeeName} · {financial.year}
      </p>
      <p>
        {loPidio} · {names.get(financial.requestedById ?? "") ?? "—"} ·{" "}
        {formatDateTime(financial.requestedAt)}
      </p>
      {financial.proposal.kind === "PURCHASE" ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt>{tList("T-2194")[1]}</dt>
          <dd>{financial.proposal.lineName}</dd>
          <dt>{tList("T-2307")[1]}</dt>
          <dd>{financial.proposal.supplier || "—"}</dd>
          <dt>{tList("T-2194")[0]}</dt>
          <dd>{day(financial.proposal.plannedOn)}</dd>
          {financial.proposal.eventTitle && (
            <>
              <dt>{tList("T-2299")[1]}</dt>
              <dd>{financial.proposal.eventTitle}</dd>
            </>
          )}
        </dl>
      ) : financial.proposal.kind === "TRANSFER" ? (
        <>
          <p>
            {financial.proposal.eventTitle} · {day(financial.proposal.eventOn)}
          </p>
          <p>{financial.proposal.reason}</p>
        </>
      ) : (
        <>
          <p>
            {tList("T-2288")[2]} · {day(financial.proposal.submittedOn)}
          </p>
          {financial.proposal.notes && <p>{financial.proposal.notes}</p>}
          <dl>
            {financial.proposal.lines.map((line) => (
              <div key={line.id} className="flex justify-between gap-4">
                <dt>{line.name}</dt>
                <dd>{formatExactMoney(line.assigned)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {decision(financial.proposal.kind, financial.id, decidesFinance, cargos.VP_FINANCE)}
    </DetailPanel>
  ) : selectedCandidacy ? (
    <DetailPanel
      title={selectedCandidacy.personName}
      eyebrow={kinds.CANDIDACY}
      closeHref={close}
      closeLabel={volver ?? ""}
    >
      <p>
        {selectedCandidacy.committeeName} · {selectedCandidacy.roleLabel}
      </p>
      <p>
        {pedidoEl} · {formatDateTime(selectedCandidacy.requestedAt)}
      </p>
      {decision("CANDIDACY", selectedCandidacy.id, decidesFaltas, cargos.VP_GH)}
    </DetailPanel>
  ) : selectedFalta ? (
    <DetailPanel
      title={selectedFalta.personName}
      eyebrow={kinds.SANCTION}
      closeHref={close}
      closeLabel={volver ?? ""}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-tinta-secundaria">{persona}</dt>
        <dd>{selectedFalta.personName}</dd>
        <dt className="text-tinta-secundaria">{tipo}</dt>
        <dd>{selectedFalta.kindLabel}</dd>
        <dt className="text-tinta-secundaria">{comite}</dt>
        <dd>{selectedFalta.committeeName ?? "—"}</dd>
        <dt className="text-tinta-secundaria">{fechaFalta}</dt>
        <dd>{day(selectedFalta.occurredOn)}</dd>
        <dt className="text-tinta-secundaria">{laAnoto}</dt>
        <dd>{selectedFalta.issuedByName ?? "—"}</dd>
        {selectedFalta.reference ? (
          <>
            <dt className="text-tinta-secundaria">{referencia}</dt>
            <dd>{selectedFalta.reference}</dd>
          </>
        ) : null}
      </dl>
      <p className="text-sm">
        <span className="text-tinta-secundaria">{causa}: </span>
        {selectedFalta.cause}
      </p>
      {decision("SANCTION", selectedFalta.id, decidesFaltas, cargos.VP_GH)}
    </DetailPanel>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={heading} description={intro} />
      {error ? (
        <Banner tone="error" title={error} />
      ) : query.guardado === "1" ? (
        <Banner tone="exito" title={t("T-4302")} />
      ) : null}
      <SplitView
        list={
          <div className="flex flex-col gap-6">
            {table(
              [
                ...faltas.map(faltaRow),
                ...candidacyRows,
                ...financialRows,
                ...contractRows.filter((row) => row.status === "PENDING"),
                ...creativeRows.filter((row) => row.status === "PENDING"),
                ...openEvents.map(eventRow),
              ],
              heading ?? "",
            )}
            {recent.length > 0 ? table(recent, decididos ?? "") : null}
          </div>
        }
        detail={detail}
      />
    </div>
  );
}
