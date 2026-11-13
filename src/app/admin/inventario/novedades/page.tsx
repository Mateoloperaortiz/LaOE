import { requireInventoryAccess } from "@/app/_authz/inventory";
import { single, withQuery } from "@/app/_lib/search";
import { listIncidents } from "@/modules/inventory";
import { t, tLabels } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { DetailPanel } from "@/shared/ui/DetailPanel";
import { Field, TextArea } from "@/shared/ui/Field";
import { SplitView } from "@/shared/ui/SplitView";
import { EmptyState } from "@/shared/ui/States";
import { WorkTable } from "@/shared/ui/WorkTable";
import { InventarioMarco } from "../_ui/Marco";
import { manageIncidentAction, referIncidentAction } from "../actions";

// Las novedades de los préstamos (ADR-150 regla 8): quién sacó qué, la nota y la gestión de la VP. La
// VP gestiona antes de remitir; remitir abre una tarea de ADMIN y no registra un llamado de atención.

export default async function InventarioNovedadesPage({
  searchParams,
}: PageProps<"/admin/inventario/novedades">) {
  const { session } = await requireInventoryAccess("/admin/inventario/novedades", "MANAGE");
  const [query, incidents] = await Promise.all([searchParams, listIncidents(session.personId)]);
  const labels = tLabels("T-4403", ["OPEN", "RESOLVED", "REFERRED"] as const);
  const selected = incidents.find((row) => row.id === single(query.novedad));
  const close = "/admin/inventario/novedades";
  const tone = { OPEN: "aviso", RESOLVED: "exito", REFERRED: "info" } as const;

  const detail = selected ? (
    <DetailPanel
      title={`${selected.personName} · ${selected.scopeLabel}`}
      eyebrow={
        <Badge tone={tone[selected.status]} className="whitespace-nowrap">
          {labels[selected.status]}
        </Badge>
      }
      closeHref={close}
      closeLabel={t("T-4407")}
    >
      <p className="text-sm text-tinta-secundaria">
        <time dateTime={selected.createdAt.toISOString()}>
          {formatDateTime(selected.createdAt)}
        </time>
      </p>
      <p>{selected.note}</p>
      <form action={manageIncidentAction} className="flex flex-col gap-3">
        <input name="incidentId" type="hidden" value={selected.id} />
        <Field id="novedad-gestion" label={t("T-4353")}>
          <TextArea
            id="novedad-gestion"
            name="management"
            minLength={5}
            maxLength={3000}
            required
            rows={4}
            defaultValue={selected.management}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="save" area="operacion">
            {t("T-4342")}
          </Button>
          {selected.status !== "REFERRED" ? (
            <Button
              type="submit"
              name="intent"
              value="resolve"
              variant="secundaria"
              area="operacion"
            >
              {t("T-4355")}
            </Button>
          ) : null}
        </div>
      </form>
      {selected.status !== "REFERRED" ? (
        <form action={referIncidentAction} className="flex flex-col gap-2">
          <input name="incidentId" type="hidden" value={selected.id} />
          <p className="text-sm text-tinta-secundaria">{t("T-4402")}</p>
          <Button
            type="submit"
            variant="secundaria"
            area="operacion"
            disabled={!selected.management.trim()}
            className="self-start"
          >
            {t("T-4356")}
          </Button>
        </form>
      ) : null}
    </DetailPanel>
  ) : null;

  return (
    <InventarioMarco active="novedades" query={query}>
      <SplitView
        list={
          <WorkTable
            caption={t("T-4352")}
            columns={[
              { key: "persona", label: t("T-4347") },
              { key: "frente", label: t("T-4348") },
              { key: "fecha", label: t("T-4305") },
              { key: "estado", label: t("T-4362") },
            ]}
            rows={incidents.map((row) => ({
              id: row.id,
              current: row.id === selected?.id,
              cells: {
                persona: (
                  <Link
                    href={withQuery(close, { novedad: row.id })}
                    scroll={false}
                    className="font-semibold text-tinta no-underline hover:underline"
                  >
                    {row.personName}
                  </Link>
                ),
                frente: row.scopeLabel,
                fecha: formatDateTime(row.createdAt),
                estado: (
                  <Badge tone={tone[row.status]} className="whitespace-nowrap">
                    {labels[row.status]}
                  </Badge>
                ),
              },
            }))}
            empty={<EmptyState title={t("T-4398")} />}
          />
        }
        detail={detail}
      />
    </InventarioMarco>
  );
}
