import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single, withQuery } from "@/app/_lib/search";
import { approvalStatusLabel, listEventApprovals } from "@/modules/finance";
import { APPOINTMENT_KINDS, getPeopleByIds, listPendingSanctions } from "@/modules/people";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";
import { Button } from "@/shared/ui/Button";
import { DetailPanel } from "@/shared/ui/DetailPanel";
import { Field, TextArea } from "@/shared/ui/Field";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { SplitView } from "@/shared/ui/SplitView";
import { EmptyState } from "@/shared/ui/States";
import { WorkTable } from "@/shared/ui/WorkTable";
import { AVAL_KINDS } from "./_ui/kinds";
import { decideAvalAction } from "./actions";

// Los avales de la junta (ADR-195): cada cargo ve lo que le toca decidir. El aval de evento lo decide la
// Presidencia (A1) y las faltas por avalar, quien decide por la VP de Gestión Humana (A2, ADR-196).
// ADMIN ve la lista sin decidir: no decide por la junta.

const [titulo] = tList("T-5083");
export const metadata: Metadata = { title: titulo };

const TONE = { PENDING: "aviso", APPROVED: "exito", REJECTED: "error" } as const;

type Kind = (typeof AVAL_KINDS)[number];

export default async function Page({ searchParams }: PageProps<"/admin/avales">) {
  const roles = await requireAdminAreaRoles("/admin/avales");
  if (!roles.isAdmin && roles.boardSeats.length === 0) redirect("/admin");
  const query = await searchParams;
  const decides = (seat: string) => roles.boardSeats.some((item) => item.seat === seat);
  const decidesEvents = decides("PRESIDENT");
  const decidesFaltas = decides("VP_GH");
  const [events, faltas] = await Promise.all([
    decidesEvents || roles.isAdmin ? listEventApprovals({}) : [],
    decidesFaltas || roles.isAdmin ? listPendingSanctions() : [],
  ]);
  const pendingEvents = events.filter((row) => row.status === "PENDING");
  const recentEvents = events.filter((row) => row.status !== "PENDING").slice(0, 10);
  const selectedEvent = events.find((row) => row.id === single(query.aval)) ?? null;
  const selectedFalta = faltas.find((row) => row.id === single(query.falta)) ?? null;
  const people = await getPeopleByIds([
    ...new Set(events.flatMap((row) => (row.requestedById ? [row.requestedById] : []))),
  ]);

  const [heading, intro] = tList("T-5083");
  const [comite, , fechaEvento, loPidio, estado, pedidoEl, motivo] = tList("T-5085");
  const columnas = tList("T-5101");
  const [aprobar, rechazar, motivoCampo, loDecide, , vacio, decididos, volver] = tList("T-5086");
  const [persona, tipo, causa, referencia, fechaFalta, laAnoto] = tList("T-5096");
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
  };
  const eventRow = (row: (typeof events)[number]): Row => ({
    kind: "EVENT",
    id: row.id,
    title: row.title,
    committee: row.committeeName,
    date: row.eventOn,
    status: row.status,
    statusLabel: approvalStatusLabel(row.status),
  });
  const faltaRow = (row: (typeof faltas)[number]): Row => ({
    kind: "SANCTION",
    id: row.id,
    title: `${row.personName} · ${row.kindLabel}`,
    committee: row.committeeName ?? "—",
    date: row.occurredOn,
    status: "PENDING",
    statusLabel: row.stateLabel,
  });
  const isSelected = (row: Row) =>
    row.kind === "EVENT" ? row.id === selectedEvent?.id : row.id === selectedFalta?.id;

  const table = (rows: Row[], caption: string) => (
    <WorkTable
      caption={caption}
      columns={[
        { key: "que", label: columnas[0] ?? "" },
        { key: "tipo", label: columnas[1] ?? "" },
        { key: "comite", label: columnas[2] ?? "" },
        { key: "fecha", label: columnas[3] ?? "" },
        { key: "estado", label: columnas[4] ?? "" },
      ]}
      rows={rows.map((row) => ({
        id: `${row.kind}-${row.id}`,
        current: isSelected(row),
        cells: {
          que: (
            <Link
              href={withQuery(close, row.kind === "EVENT" ? { aval: row.id } : { falta: row.id })}
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
            {aprobar}
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
      </dl>
      {selectedEvent.description ? <p className="text-sm">{selectedEvent.description}</p> : null}
      {selectedEvent.status === "PENDING"
        ? decision("EVENT", selectedEvent.id, decidesEvents, cargos.PRESIDENT)
        : null}
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
            {table([...faltas.map(faltaRow), ...pendingEvents.map(eventRow)], heading ?? "")}
            {recentEvents.length > 0 ? table(recentEvents.map(eventRow), decididos ?? "") : null}
          </div>
        }
        detail={detail}
      />
    </div>
  );
}
