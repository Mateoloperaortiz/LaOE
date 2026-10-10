import type { Metadata } from "next";
import Link from "next/link";
import { single } from "@/app/_lib/search";
import { getCampaignQuotaStatus } from "@/modules/comms";
import { quotaProviderLabel, quotaReasonLabel } from "@/modules/comms/admin";
import { requireAdminActor } from "@/modules/identity";
import { inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { BarraTitulo } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { liftCutAction, resetReserveAction, saveReserveAction } from "./actions";

// El cupo de correo de las campañas (ADR-115 regla 5, ADR-116 reglas 19 y 20), solo ADMIN: por dónde
// salen, el cupo del día, lo enviado hoy, el margen para lo transaccional y el corte vigente con su
// causa. «Hoy» es el día del proveedor, que no es el de Colombia, y la pantalla dice a qué hora vuelve
// a empezar (ADR-121 regla 5). Tres acciones con auditoría: cambiar el margen, volver al de por
// defecto y levantar el corte.

const BASE = "/admin/campanas/cupo";

export const metadata: Metadata = { title: t("T-3224") };

const cardClass = "flex flex-col gap-4 rounded-xl border border-borde bg-fondo p-4 sm:p-5";

export default async function Page({ searchParams }: PageProps<"/admin/campanas/cupo">) {
  await requireAdminActor(BASE);
  const search = await searchParams;
  const guardado = single(search.guardado);
  const error = single(search.error);
  const status = await getCampaignQuotaStatus(new Date());
  const { daily, cut } = status;
  const proveedor = quotaProviderLabel(status.provider);
  const [tituloHoy, tituloMargen, tituloCorte] = tList("T-3228");
  const [dtProveedor, dtCupo, dtEnviados, dtMargen, dtCaben] = tList("T-3229");
  const [campoMargen, botonMargen] = tList("T-3232");
  const aviso =
    guardado === "margen" && status.reserveSetting !== null
      ? t("T-3234", { n: status.reserveSetting })
      : guardado === "margen-defecto"
        ? t("T-3243")
        : guardado === "corte"
          ? t("T-3240")
          : guardado === "sin-corte"
            ? t("T-3241")
            : "";
  const datos: [string | undefined, string | number][] = daily
    ? [
        [dtProveedor, proveedor],
        [dtCupo, daily.limit],
        [dtEnviados, daily.sentToday],
        [
          dtMargen,
          status.reserveSetting === null ? t("T-3231", { n: daily.reserve }) : daily.reserve,
        ],
        [dtCaben, daily.room],
      ]
    : [[dtProveedor, proveedor]];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">
          <Link href="/admin/campanas">{t("T-1123")}</Link>
        </p>
        <BarraTitulo nivel="h1" color="azul" className="self-start">
          {t("T-3224")}
        </BarraTitulo>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-3227")}</p>
        {aviso ? <output className="block font-semibold text-titulo">{aviso}</output> : null}
        {error === "margen" ? (
          <p
            role="alert"
            className="inline-block self-start rounded-lg bg-oe-orange px-2 py-1 text-sm text-oe-navy"
          >
            {t("T-3235")}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="cupo-hoy" className={cardClass}>
        <BarraTitulo color="amarillo" className="self-start">
          <span id="cupo-hoy">{tituloHoy}</span>
        </BarraTitulo>
        <dl className="grid gap-4 sm:grid-cols-2">
          {datos.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1">
              <dt className="eyebrow text-xs">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="max-w-prose text-sm text-tinta-suave">
          {daily
            ? t("T-3259", { proveedor, fecha: formatDateTime(daily.resetsAt) })
            : t("T-3230", { proveedor })}
        </p>
      </section>

      <section aria-labelledby="cupo-margen" className={cardClass}>
        <BarraTitulo color="naranja" className="self-start">
          <span id="cupo-margen">{tituloMargen}</span>
        </BarraTitulo>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-3233")}</p>
        <form action={saveReserveAction} className="flex flex-wrap items-end gap-3">
          <AdminFormBody>
            <div className="flex flex-col gap-1">
              <label htmlFor="reserve" className="eyebrow text-xs">
                {campoMargen}
              </label>
              <input
                id="reserve"
                name="reserve"
                type="number"
                inputMode="numeric"
                min={0}
                max={999999}
                step={1}
                required
                defaultValue={status.reserveSetting ?? daily?.reserve ?? ""}
                className={inputClass}
              />
            </div>
            <AdminSubmitButton type="submit" className="boton-secundario">
              {botonMargen}
            </AdminSubmitButton>
          </AdminFormBody>
        </form>
        {status.reserveSetting !== null ? (
          <form action={resetReserveAction} className="self-start">
            <AdminFormBody>
              <AdminSubmitButton type="submit" className="boton-secundario">
                {t("T-3242")}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="cupo-corte" className={cardClass}>
        <BarraTitulo color="azul" className="self-start">
          <span id="cupo-corte">{tituloCorte}</span>
        </BarraTitulo>
        {cut ? (
          <>
            <p className="max-w-prose font-semibold">
              {t("T-3237", {
                proveedor: quotaProviderLabel(cut.provider),
                causa: quotaReasonLabel(cut.reason),
                desde: formatDateTime(cut.at),
                hasta: formatDateTime(cut.until),
              })}
            </p>
            <p className="max-w-prose text-sm text-tinta-suave">{t("T-3239")}</p>
            <form action={liftCutAction} className="self-start">
              <AdminFormBody>
                <AdminSubmitButton type="submit" className="boton-calido">
                  {t("T-3238")}
                </AdminSubmitButton>
              </AdminFormBody>
            </form>
          </>
        ) : (
          <p className="text-tinta-suave">{t("T-3236")}</p>
        )}
      </section>
    </div>
  );
}
