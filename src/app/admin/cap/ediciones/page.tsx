import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { listEditionFollowUps } from "@/modules/permanence";
import { tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { EmptyState } from "@/shared/ui/States";
import { WorkTable } from "@/shared/ui/WorkTable";

// El seguimiento de los macroeventos (ADR-197 regla 5): cada edición del último año y del próximo, con
// cuántos empalmes de su mesa van y si su seguimiento se cerró. Lo leen la Presidencia y el CAP.

const [titulo] = tList("T-5135");
export const metadata: Metadata = { title: titulo };

export default async function Page() {
  const roles = await requireAdminAreaRoles("/admin/cap/ediciones");
  if (!roles.readsCapLog) redirect("/admin");
  const rows = await listEditionFollowUps();
  const [heading, intro, edicion, empalmes, estado, abierto, cerrado, vacio] = tList("T-5135");
  const [, , , , , , volver] = tList("T-5130");
  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={heading} description={intro} />
      <p className="text-sm">
        <Link href="/admin/cap">{volver}</Link>
      </p>
      <WorkTable
        caption={heading ?? ""}
        columns={[
          { key: "edicion", label: edicion ?? "" },
          { key: "empalmes", label: empalmes ?? "" },
          { key: "estado", label: estado ?? "" },
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: {
            edicion: (
              <span className="flex flex-col">
                <Link
                  href={`/admin/cap/ediciones/${row.id}`}
                  className="font-semibold text-tinta no-underline hover:underline"
                >
                  {row.label}
                </Link>
                <span className="text-sm text-tinta-secundaria">{formatDate(row.startsAt)}</span>
              </span>
            ),
            empalmes: `${row.delivered}/${row.total}`,
            estado: (
              <Badge tone={row.closedAt ? "exito" : "neutral"}>
                {row.closedAt ? cerrado : abierto}
              </Badge>
            ),
          },
        }))}
        empty={<EmptyState title={vacio ?? ""} />}
      />
    </div>
  );
}
