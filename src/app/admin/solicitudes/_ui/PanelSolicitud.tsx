import Link from "next/link";
import type { RequestView } from "@/modules/crm";
import { ResourcePanel } from "@/shared/admin-kit";
import { Campo, Dato, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { decideRequestAction } from "../actions";

// Panel de una solicitud (bandeja y Persona 360): detalle, texto de lo que pasa al aprobar y los dos
// botones; rechazar pide el motivo que la persona va a leer.

export function PanelSolicitud({
  request,
  closeHref,
  returnTo,
  error,
  nextTermCode,
}: {
  request: RequestView;
  closeHref: string;
  returnTo: string;
  error: string;
  nextTermCode: string | null;
}) {
  const [aprobar, rechazar] = tList("T-1001");
  const [, , , pedidaEl, estado, decididaPor] = tList("T-998");
  const explanation =
    request.kind === "LEAVE"
      ? t("T-1004", { nombre: request.personName })
      : request.kind === "RESIGNATION"
        ? t("T-1005", { nombre: request.personName })
        : request.kind === "EXCUSE"
          ? t("T-2217", { nombre: request.personName, detalle: request.detail })
          : t("T-1006", {
              nombre: request.personName,
              término: nextTermCode ?? "",
              deja: request.detail.split(" · ")[0]?.replace(/^[^:]*:\s*/, "") ?? "",
              entra: request.detail.split(" · ")[1]?.replace(/^[^:]*:\s*/, "") ?? "",
            });
  return (
    <ResourcePanel
      title={`${request.kindLabel} · ${request.personName}`}
      closeHref={closeHref}
      closeLabel={t("T-291")}
    >
      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
        >
          {error}
        </p>
      ) : null}
      <dl className="grid gap-3">
        <Dato
          etiqueta={tList("T-998")[0] ?? ""}
          valor={
            <Link href={`/admin/personas/${request.personId}`} className="underline">
              {request.personName}
            </Link>
          }
        />
        <Dato etiqueta={tList("T-998")[2] ?? ""} valor={request.detail} />
        <Dato etiqueta={pedidaEl ?? ""} valor={formatDateTime(request.createdAt)} />
        <Dato
          etiqueta={estado ?? ""}
          valor={
            <Insignia fondo={request.status === "PENDING" ? "sky" : "paper"}>
              {request.statusLabel}
            </Insignia>
          }
        />
        {request.decidedByName ? (
          <Dato
            etiqueta={decididaPor ?? ""}
            valor={`${request.decidedByName}${request.decidedAt ? ` · ${formatDateTime(request.decidedAt)}` : ""}`}
          />
        ) : null}
        {request.reason ? <Dato etiqueta={t("T-1002")} valor={request.reason} /> : null}
        {typeof request.payload.reason === "string" ? (
          <Dato etiqueta={t("T-880")} valor={request.payload.reason} />
        ) : null}
        {typeof request.payload.evidence === "string" && request.payload.evidence ? (
          <Dato etiqueta={tList("T-2218")[2] ?? ""} valor={request.payload.evidence} />
        ) : null}
      </dl>
      {request.status === "PENDING" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm">{explanation}</p>
          {request.kind === "TRANSFER" && nextTermCode ? (
            <p className="text-sm text-tinta-suave">{t("T-1014", { término: nextTermCode })}</p>
          ) : null}
          <form action={decideRequestAction} className="flex flex-col gap-3">
            <AdminFormBody>
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="decision" value="APPROVED" />
              <AdminSubmitButton type="submit" className="boton-calido self-start">
                {aprobar}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
          <form action={decideRequestAction} className="flex flex-col gap-3">
            <AdminFormBody>
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="decision" value="REJECTED" />
              <Campo id={`motivo-${request.id}`} label={t("T-1002")}>
                <textarea
                  id={`motivo-${request.id}`}
                  name="reason"
                  rows={3}
                  className={inputClass}
                />
              </Campo>
              <AdminSubmitButton type="submit" className="boton-secundario self-start">
                {rechazar}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
        </div>
      ) : (
        <p className="text-sm text-tinta-suave">{t("T-1007")}</p>
      )}
    </ResourcePanel>
  );
}
