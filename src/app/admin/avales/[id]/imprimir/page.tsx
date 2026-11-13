import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { findPublishedCrisisProtocol } from "@/modules/content";
import { approvalStatusLabel, getEventApprovalDetail } from "@/modules/finance";
import { getPeopleByIds } from "@/modules/people";
import { tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { PrintButton } from "@/shared/ui/PrintButton";
import { AvalHistoria, RiesgoBadge, RiesgoRojo } from "../../../_kit/aval";

// El aval de evento en una hoja para imprimir o guardar en PDF (ADR-197 regla 1), con la versión
// vigente, el semáforo y la historia. Lo ven la Presidencia, ADMIN y quien maneja las finanzas del
// comité que lo pidió.

const [, encabezado] = tList("T-5114");
export const metadata: Metadata = { title: encabezado };

const ID = /^[a-z0-9-]{10,40}$/;

export default async function Page({ params }: PageProps<"/admin/avales/[id]/imprimir">) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const roles = await requireAdminAreaRoles(`/admin/avales/${id}/imprimir`);
  const aval = await getEventApprovalDetail(id);
  if (!aval) notFound();
  const presidency = roles.boardSeats.some((item) => item.seat === "PRESIDENT");
  const finance = roles.committees.some(
    (item) => item.committee.id === aval.committeeId && item.capabilities.includes("FINANCE"),
  );
  if (!roles.isAdmin && !presidency && !finance) redirect("/admin");

  const [protocol, people] = await Promise.all([
    aval.riskLevel === "RED" ? findPublishedCrisisProtocol() : null,
    getPeopleByIds([
      ...new Set(
        [
          aval.requestedById,
          aval.decidedById,
          ...aval.entries.map((entry) => entry.authorId),
        ].filter((item): item is string => Boolean(item)),
      ),
    ]),
  ]);
  const names = new Map([...people].map(([personId, item]) => [personId, item.fullName]));
  const name = (personId: string | null) => (personId ? (names.get(personId) ?? "—") : "—");
  const [comite, evento, fechaEvento, loPidio, estado, pedidoEl, motivo] = tList("T-5085");
  const [riesgo, porQue] = tList("T-5103");
  const [, , version, loDecidio, decididoEl] = tList("T-5114");
  const [, , , , , , , volver] = tList("T-5086");
  const back =
    roles.isAdmin || presidency
      ? `/admin/avales?aval=${aval.id}`
      : `/admin/comites/${aval.committeeSlug}?area=finanzas`;

  return (
    <div data-imprime-solo className="flex flex-col gap-6">
      <div data-no-imprimir className="flex flex-wrap items-center gap-3">
        <Link href={back}>{volver}</Link>
        <PrintButton />
      </div>
      <article data-imprimir className="flex max-w-3xl flex-col gap-5">
        <header className="flex flex-col gap-1">
          <p className="eyebrow text-xs">
            {encabezado} · {(version ?? "").replace("{versión}", String(aval.version))}
          </p>
          <h1 className="text-display-md">{aval.title}</h1>
        </header>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-tinta-secundaria">{comite}</dt>
          <dd>{aval.committeeName}</dd>
          <dt className="text-tinta-secundaria">{evento}</dt>
          <dd>{aval.title}</dd>
          <dt className="text-tinta-secundaria">{fechaEvento}</dt>
          <dd>{formatDate(new Date(`${aval.eventOn}T12:00:00Z`))}</dd>
          <dt className="text-tinta-secundaria">{loPidio}</dt>
          <dd>{name(aval.requestedById)}</dd>
          <dt className="text-tinta-secundaria">{pedidoEl}</dt>
          <dd>{formatDateTime(aval.requestedAt)}</dd>
          <dt className="text-tinta-secundaria">{estado}</dt>
          <dd>{approvalStatusLabel(aval.status)}</dd>
          {aval.decidedAt ? (
            <>
              <dt className="text-tinta-secundaria">{loDecidio}</dt>
              <dd>{name(aval.decidedById)}</dd>
              <dt className="text-tinta-secundaria">{decididoEl}</dt>
              <dd>{formatDateTime(aval.decidedAt)}</dd>
            </>
          ) : null}
          {aval.decisionNote ? (
            <>
              <dt className="text-tinta-secundaria">{motivo}</dt>
              <dd>{aval.decisionNote}</dd>
            </>
          ) : null}
          <dt className="text-tinta-secundaria">{riesgo}</dt>
          <dd>
            <RiesgoBadge level={aval.riskLevel} />
          </dd>
          {aval.riskJustification ? (
            <>
              <dt className="text-tinta-secundaria">{porQue}</dt>
              <dd>{aval.riskJustification}</dd>
            </>
          ) : null}
        </dl>
        {aval.riskLevel === "RED" ? <RiesgoRojo protocol={protocol} /> : null}
        {aval.description ? (
          <p className="text-sm whitespace-pre-line">{aval.description}</p>
        ) : null}
        <AvalHistoria entries={aval.entries} names={names} headingId="aval-historia-hoja" />
      </article>
    </div>
  );
}
