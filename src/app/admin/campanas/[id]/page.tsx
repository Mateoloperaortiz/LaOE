import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { single } from "@/app/_lib/search";
import {
  type CampaignHold,
  estimateAudience,
  getCampaign,
  getCampaignBacklog,
  listRecipients,
  RECIPIENT_STATUSES,
  SKIP_REASONS,
} from "@/modules/comms";
import { campaignStatusLabel, quotaProviderLabel, quotaReasonLabel } from "@/modules/comms/admin";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import { requireConfig } from "@/modules/system";
import { inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { BarraTitulo, Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import { cancelAction, scheduleAction, sendNowAction, sendTestFromCampaignAction } from "./actions";

// Detalle de una campaña (ADR-038 regla 8): destinatarios estimados y excluidos por motivo, programar
// o enviar ahora con step-up, cancelar, progreso y la tabla de destinatarios. En curso dice cuántos
// faltan y, si los detiene el cupo del día o un corte del proveedor, por qué y hasta cuándo (ADR-116
// regla 20); si hoy solo cabe una parte, cuántos salen hoy y cuántos siguen (ADR-120 regla 16).

const ID = /^[a-z0-9]{10,40}$/;

/**
 * Qué pasa con lo pendiente de una campaña en curso: qué lo detiene, cuánto sale hoy si solo cabe una
 * parte (ADR-120 regla 16), o que sale en los próximos lotes.
 */
function holdText(hold: CampaignHold | null): string {
  if (!hold) {
    return t("T-3223");
  }
  if (hold.by === "CUT") {
    return t("T-3220", {
      proveedor: quotaProviderLabel(hold.provider),
      causa: quotaReasonLabel(hold.reason),
      fecha: formatDateTime(hold.until),
    });
  }
  if (hold.by === "PARTIAL") {
    return t("T-3257", {
      hoy: hold.fits,
      resto: hold.waiting,
      fecha: formatDateTime(hold.until),
    });
  }
  return hold.by === "ROOM" ? t("T-3221", { fecha: formatDateTime(hold.until) }) : t("T-3222");
}

type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: PageProps<"/admin/campanas/[id]">): Promise<Metadata> {
  const { id } = await params;
  const campaign = ID.test(id) ? await getCampaign(id) : null;
  return { title: campaign?.name ?? t("T-1123") };
}

export default async function Page({ params, searchParams }: PageProps<"/admin/campanas/[id]">) {
  const { id } = await params;
  const base = `/admin/campanas/${id}`;
  const actor = await requireAdminActor(base);
  const campaign = ID.test(id) ? await getCampaign(id) : null;
  if (!campaign) {
    notFound();
  }
  const search: Search = await searchParams;
  const accion = single(search.accion);
  const error = single(search.error);
  const guardado = single(search.guardado);
  const prueba = single(search.prueba);
  const pruebaRechazada = single(search.pruebaRechazada);
  const editable = campaign.status === "DRAFT" || campaign.status === "SCHEDULED";
  if (accion === "enviar" && editable && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(`${base}?accion=enviar`)}`);
  }
  const [estimate, recipients, perMinute, backlog] = await Promise.all([
    editable ? estimateAudience(campaign.segmentId) : Promise.resolve(null),
    campaign.status === "DRAFT" || campaign.status === "SCHEDULED"
      ? Promise.resolve(null)
      : listRecipients(id),
    requireConfig("campaigns.perMinute"),
    campaign.status === "SENDING" ? getCampaignBacklog(id, new Date()) : Promise.resolve(null),
  ]);
  const [campoProgramar, botonProgramar] = tList("T-1129");
  const [, colPlantilla, colSegmento, , colProgramada, colEnviados] = tList("T-1125");
  const [colPersona, colEstado, colMotivo, colEnviado] = tList("T-1134");
  const recipientLabels: Readonly<Record<string, string>> = tLabels("T-1135", RECIPIENT_STATUSES);
  const reasonLabels: Readonly<Record<string, string>> = tLabels("T-1136", SKIP_REASONS);
  const recipientLabel = (status: string) => recipientLabels[status] ?? status;
  const reasonLabel = (reason: string | null) => (reason ? (reasonLabels[reason] ?? reason) : "");
  const defaultSchedule = utcToBogotaInput(new Date(Date.now() + 60 * 60_000));
  const aviso =
    guardado === "programada" && campaign.scheduledAt
      ? t("T-1139", { fecha: formatDateTime(campaign.scheduledAt) })
      : guardado === "enviando"
        ? t("T-1140")
        : guardado === "cancelada"
          ? t("T-1141")
          : "";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">
          <Link href="/admin/campanas">{t("T-1123")}</Link>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <BarraTitulo nivel="h1" color="azul" className="self-start">
            {campaign.name}
          </BarraTitulo>
          <Insignia fondo={campaign.status === "SENT" ? "azul" : "amarillo"}>
            {campaignStatusLabel(campaign.status)}
          </Insignia>
        </div>
        <p className="max-w-prose text-sm text-tinta-suave">
          {t("T-1124", { n: perMinute })}{" "}
          <Link href="/admin/campanas/cupo" className="underline">
            {t("T-3224")}
          </Link>
        </p>
        <dl className="grid gap-4 rounded-xl border border-borde bg-fondo p-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="eyebrow text-xs">{colPlantilla}</dt>
            <dd>
              <Link href={`/admin/plantillas/${campaign.templateId}`}>{campaign.templateName}</Link>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="eyebrow text-xs">{colSegmento}</dt>
            <dd>{campaign.segmentName}</dd>
          </div>
          {campaign.scheduledAt ? (
            <div className="flex flex-col gap-1">
              <dt className="eyebrow text-xs">{colProgramada}</dt>
              <dd>{formatDateTime(campaign.scheduledAt)}</dd>
            </div>
          ) : null}
          {campaign.status !== "DRAFT" ? (
            <div className="flex flex-col gap-1">
              <dt className="eyebrow text-xs">{colEnviados}</dt>
              <dd>
                {t("T-1133", {
                  enviados: campaign.sentCount,
                  total: campaign.totalCount,
                  fallidos: campaign.failedCount,
                  omitidos: campaign.skippedCount,
                })}
              </dd>
            </div>
          ) : null}
        </dl>
        {backlog && backlog.pending > 0 ? (
          <div className="flex max-w-prose flex-col gap-1 rounded-xl border border-borde bg-fondo-suave p-4 text-sm">
            <p className="font-semibold text-titulo">{t("T-3219", { n: backlog.pending })}</p>
            <p>{holdText(backlog.hold)}</p>
          </div>
        ) : null}
        {aviso ? <output className="block font-semibold text-titulo">{aviso}</output> : null}
        {prueba ? (
          <output className="block text-sm font-semibold text-titulo">
            {t("T-1121", { correo: prueba })}
          </output>
        ) : null}
        {pruebaRechazada ? (
          <p role="alert" className="text-sm font-semibold text-titulo">
            {t("T-3250", { correo: pruebaRechazada })}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="inline-block self-start rounded-lg bg-oe-orange px-2 py-1 text-sm text-oe-navy"
          >
            {error === "fecha" ? t("T-857") : error}
          </p>
        ) : null}
      </header>

      {estimate ? (
        <section
          aria-labelledby="audiencia"
          className="flex flex-col gap-4 rounded-xl border border-borde bg-fondo p-4 sm:p-5"
        >
          <BarraTitulo color="amarillo" className="self-start">
            <span id="audiencia">{t("T-1176")}</span>
          </BarraTitulo>
          <p className="max-w-prose font-semibold">
            {t("T-1128", {
              n: estimate.eligible,
              m: estimate.segment,
              a: estimate.noEmail,
              b: estimate.optedOut,
              c: estimate.noConsent,
            })}
          </p>
          {estimate.eligible === 0 ? (
            <p className="max-w-prose text-sm text-tinta-suave">{t("T-1138")}</p>
          ) : null}
          <div className="flex flex-wrap items-end gap-4 border-t border-borde pt-4">
            <form action={scheduleAction} className="flex flex-wrap items-end gap-3">
              <AdminFormBody>
                <input type="hidden" name="campaignId" value={campaign.id} />
                <div className="flex flex-col gap-1">
                  <label htmlFor="scheduledAt" className="eyebrow text-xs">
                    {campoProgramar}
                  </label>
                  <input
                    id="scheduledAt"
                    name="scheduledAt"
                    type="datetime-local"
                    required
                    defaultValue={
                      campaign.scheduledAt
                        ? utcToBogotaInput(campaign.scheduledAt)
                        : defaultSchedule
                    }
                    className={inputClass}
                  />
                </div>
                <AdminSubmitButton type="submit" className="boton-secundario">
                  {botonProgramar}
                </AdminSubmitButton>
              </AdminFormBody>
            </form>
            {accion === "enviar" ? (
              <form
                action={sendNowAction}
                className="flex basis-full flex-col gap-3 rounded-lg border border-borde bg-fondo-suave p-4"
              >
                <AdminFormBody>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <p className="max-w-prose">
                    {t("T-1131", { plantilla: campaign.templateName, n: estimate.eligible })}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <AdminSubmitButton
                      type="submit"
                      className="boton-calido"
                      disabled={estimate.eligible === 0}
                    >
                      {t("T-1130")}
                    </AdminSubmitButton>
                    <Link href={base} className="boton-secundario">
                      {t("T-254")}
                    </Link>
                  </div>
                </AdminFormBody>
              </form>
            ) : (
              <Link href={`${base}?accion=enviar`} className="boton-calido">
                {t("T-1130")}
              </Link>
            )}
            <form action={sendTestFromCampaignAction}>
              <AdminFormBody>
                <input type="hidden" name="campaignId" value={campaign.id} />
                <input type="hidden" name="templateId" value={campaign.templateId} />
                <AdminSubmitButton type="submit" className="boton-secundario">
                  {t("T-1120")}
                </AdminSubmitButton>
              </AdminFormBody>
            </form>
          </div>
        </section>
      ) : null}

      {campaign.status === "SCHEDULED" || campaign.status === "SENDING" ? (
        <form action={cancelAction} className="self-start">
          <AdminFormBody>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <AdminSubmitButton type="submit" className="boton-secundario">
              {t("T-1132")}
            </AdminSubmitButton>
          </AdminFormBody>
        </form>
      ) : null}

      {recipients ? (
        <section aria-labelledby="destinatarios" className="flex flex-col gap-4">
          <BarraTitulo color="naranja" className="self-start">
            <span id="destinatarios">{t("T-1175")}</span>
          </BarraTitulo>
          {recipients.rows.length === 0 ? (
            <p className="text-tinta-suave">{t("T-1138")}</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde">
              <table className="admin-data-table w-full text-left text-sm">
                <thead className="eyebrow bg-fondo-suave text-xs">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      {colPersona}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {colEstado}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {colMotivo}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {colEnviado}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.rows.map((row) => (
                    <tr key={row.id} className="border-t border-borde">
                      <td data-label={colPersona} className="px-3 py-2 font-semibold">
                        <Link href={`/admin/personas/${row.personId}`}>
                          {row.personName || row.email}
                        </Link>
                      </td>
                      <td data-label={colEstado} className="px-3 py-2">
                        <Insignia
                          fondo={
                            row.status === "SENT"
                              ? "azul"
                              : row.status === "FAILED"
                                ? "naranja"
                                : row.status === "SKIPPED"
                                  ? "paper"
                                  : "sky"
                          }
                        >
                          {recipientLabel(row.status)}
                        </Insignia>
                      </td>
                      <td data-label={colMotivo} className="px-3 py-2">
                        {reasonLabel(row.skipReason)}
                      </td>
                      <td data-label={colEnviado} className="px-3 py-2">
                        {row.sentAt ? formatDateTime(row.sentAt) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {recipients.total > recipients.rows.length ? (
            <Link
              href={`/admin/mensajes?campaignId=${campaign.id}`}
              className="self-start underline"
            >
              {t("T-1041")}
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
