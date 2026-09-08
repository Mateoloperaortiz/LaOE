import Link from "next/link";
import type { RequestView } from "@/modules/crm";
import { Bloque } from "@/shared/admin-kit/AdminFields";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

// Pestaña Solicitudes de la Persona 360 (02-crm.md, ADR-037 regla 9): las solicitudes de la persona
// con la decisión de GH; decidir abre el panel de la bandeja.

export function TabSolicitudes({ requests }: { requests: RequestView[] }) {
  const columns = tList("T-998");
  return (
    <Bloque titulo={t("T-138")}>
      {requests.length === 0 ? (
        <p className="text-tinta-suave">{t("T-1052")}</p>
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {requests.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-1 border-borde border-t pt-3 first:border-t-0 first:pt-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{row.kindLabel}</span>
                <Insignia
                  fondo={
                    row.status === "PENDING"
                      ? "sky"
                      : row.status === "APPROVED"
                        ? "amarillo"
                        : row.status === "REJECTED"
                          ? "naranja"
                          : "paper"
                  }
                >
                  {row.statusLabel}
                </Insignia>
                <span className="text-sm text-tinta-suave">{formatDateTime(row.createdAt)}</span>
              </div>
              <p className="text-sm">{row.detail}</p>
              {row.decidedByName ? (
                <p className="text-xs text-tinta-suave">
                  {columns[5]}: {row.decidedByName}
                  {row.reason ? ` · ${row.reason}` : ""}
                </p>
              ) : null}
              <Link
                href={`/admin/solicitudes?solicitud=${row.id}`}
                className="self-start text-sm underline"
              >
                {row.status === "PENDING" ? tList("T-1001").join(" · ") : t("T-1013")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  );
}
