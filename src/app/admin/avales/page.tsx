import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single, withQuery } from "@/app/_lib/search";
import { approvalStatusLabel, listEventApprovals } from "@/modules/finance";
import { APPOINTMENT_KINDS, getPeopleByIds } from "@/modules/people";
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

// Los avales de la junta (ADR-195): cada cargo ve lo que le toca decidir. En A1 hay uno, el aval de
// evento, que decide la Presidencia. ADMIN ve la lista sin decidir: desde ADR-195 no decide avales.

const [titulo] = tList("T-5083");
export const metadata: Metadata = { title: titulo };

const TONE = { PENDING: "aviso", APPROVED: "exito", REJECTED: "error" } as const;

export default async function Page({ searchParams }: PageProps<"/admin/avales">) {
  const roles = await requireAdminAreaRoles("/admin/avales");
  if (!roles.isAdmin && roles.boardSeats.length === 0) redirect("/admin");
  const query = await searchParams;
  const decidesEvents = roles.boardSeats.some((item) => item.seat === "PRESIDENT");
  const seesEvents = decidesEvents || roles.isAdmin;
  const all = seesEvents ? await listEventApprovals({}) : [];
  const pending = all.filter((row) => row.status === "PENDING");
  const recent = all.filter((row) => row.status !== "PENDING").slice(0, 10);
  const selected = all.find((row) => row.id === single(query.aval)) ?? null;
  const people = await getPeopleByIds([
    ...new Set(all.flatMap((row) => (row.requestedById ? [row.requestedById] : []))),
  ]);

  const [heading, intro] = tList("T-5083");
  const [comite, evento, fechaEvento, loPidio, estado, pedidoEl, motivo] = tList("T-5085");
  const [aprobar, rechazar, motivoCampo, loDecide, , vacio, decididos, volver] = tList("T-5086");
  const kinds = tLabels("T-5084", AVAL_KINDS);
  const presidencia = tLabels("T-444", APPOINTMENT_KINDS).PRESIDENT;
  const error = single(query.error);
  const close = "/admin/avales";
  const day = (key: string) => formatDate(new Date(`${key}T12:00:00Z`));

  const table = (rows: typeof all, caption: string) => (
    <WorkTable
      caption={caption}
      columns={[
        { key: "evento", label: evento ?? "" },
        { key: "comite", label: comite ?? "" },
        { key: "fecha", label: fechaEvento ?? "" },
        { key: "estado", label: estado ?? "" },
      ]}
      rows={rows.map((row) => ({
        id: row.id,
        current: row.id === selected?.id,
        cells: {
          evento: (
            <Link
              href={withQuery(close, { aval: row.id })}
              scroll={false}
              className="font-semibold text-tinta no-underline hover:underline"
            >
              {row.title}
            </Link>
          ),
          comite: row.committeeName,
          fecha: day(row.eventOn),
          estado: (
            <Badge tone={TONE[row.status]} className="whitespace-nowrap">
              {approvalStatusLabel(row.status)}
            </Badge>
          ),
        },
      }))}
      empty={<EmptyState title={vacio ?? ""} />}
    />
  );

  const detail = selected ? (
    <DetailPanel
      title={selected.title}
      eyebrow={kinds.EVENT}
      closeHref={close}
      closeLabel={volver ?? ""}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-tinta-secundaria">{comite}</dt>
        <dd>{selected.committeeName}</dd>
        <dt className="text-tinta-secundaria">{fechaEvento}</dt>
        <dd>{day(selected.eventOn)}</dd>
        <dt className="text-tinta-secundaria">{loPidio}</dt>
        <dd>
          {selected.requestedById ? (people.get(selected.requestedById)?.fullName ?? "—") : "—"}
        </dd>
        <dt className="text-tinta-secundaria">{pedidoEl}</dt>
        <dd>{formatDateTime(selected.requestedAt)}</dd>
        <dt className="text-tinta-secundaria">{estado}</dt>
        <dd>
          <Badge tone={TONE[selected.status]} className="whitespace-nowrap">
            {approvalStatusLabel(selected.status)}
          </Badge>
        </dd>
        {selected.decisionNote ? (
          <>
            <dt className="text-tinta-secundaria">{motivo}</dt>
            <dd>{selected.decisionNote}</dd>
          </>
        ) : null}
      </dl>
      {selected.description ? <p className="text-sm">{selected.description}</p> : null}
      {selected.status === "PENDING" && decidesEvents ? (
        <form action={decideAvalAction} className="flex flex-col gap-3">
          <input name="avalId" type="hidden" value={selected.id} />
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
      ) : selected.status === "PENDING" ? (
        <p className="text-sm text-tinta-secundaria">
          {(loDecide ?? "").replace("{cargo}", presidencia)}
        </p>
      ) : null}
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
            {table(pending, heading ?? "")}
            {recent.length > 0 ? table(recent, decididos ?? "") : null}
          </div>
        }
        detail={detail}
      />
    </div>
  );
}
