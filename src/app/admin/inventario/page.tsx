import { notFound } from "next/navigation";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { single, withQuery } from "@/app/_lib/search";
import { requireAdminActor } from "@/modules/identity";
import { getIncidentForReview, readCatalog } from "@/modules/inventory";
import { t } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Button, buttonClass } from "@/shared/ui/Button";
import { DetailPanel } from "@/shared/ui/DetailPanel";
import { Field, Select, TextInput } from "@/shared/ui/Field";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { SplitView } from "@/shared/ui/SplitView";
import { EmptyState } from "@/shared/ui/States";
import { Surface } from "@/shared/ui/Surface";
import { WorkTable } from "@/shared/ui/WorkTable";
import { InventarioMarco } from "./_ui/Marco";
import { adjustStockAction, createItemAction, updateItemAction } from "./actions";

// Los materiales de la OE (ADR-150 regla 1, ADR-191 regla 3): la tabla de trabajo a la izquierda y el
// material abierto, o el alta de uno nuevo, a la derecha. Solo la VP administrativa vigente entra.
// ADMIN llega aquí únicamente con una novedad remitida (ADR-150 regla 8), que se lee aparte.

export default async function InventarioMaterialesPage({
  searchParams,
}: PageProps<"/admin/inventario">) {
  const query = await searchParams;
  const incidencia = single(query.incidencia);
  const persona = single(query.persona);
  if (incidencia || persona) {
    await requireAdminActor("/admin/inventario");
    if (!incidencia || !persona) notFound();
    const incident = await getIncidentForReview(incidencia, persona);
    if (!incident || incident.status !== "REFERRED") notFound();
    return (
      <div className="flex flex-col gap-5">
        <ScreenHeader title={t("T-4352")} />
        <Surface as="article" className="flex max-w-2xl flex-col gap-3 p-5">
          <h2 className="titulo-seccion">
            {incident.personName} · {incident.scopeLabel}
          </h2>
          <p>{incident.note}</p>
          <h3 className="font-semibold">{t("T-4353")}</h3>
          <p>{incident.management}</p>
          <p className="text-sm text-tinta-secundaria">{t("T-4402")}</p>
          <Link
            className={buttonClass({ area: "operacion", className: "self-start" })}
            href={`/admin/personas/${encodeURIComponent(incident.personId)}?pestana=membresia`}
          >
            {t("T-4356")}
          </Link>
        </Surface>
      </div>
    );
  }

  await requireInventoryAccess("/admin/inventario", "MANAGE");
  const items = await readCatalog();
  const selected = items.find((item) => item.id === single(query.material));
  const creating = !selected && single(query.nuevo) === "1";
  const close = "/admin/inventario";
  const modes = { UNIT: t("T-4336"), QUANTITY: t("T-4337") };

  const detail = selected ? (
    <DetailPanel
      title={selected.name}
      eyebrow={<code>{selected.code}</code>}
      closeHref={close}
      closeLabel={t("T-4407")}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-tinta-secundaria">{t("T-4310")}</dt>
        <dd className="font-semibold">{selected.total}</dd>
        <dt className="text-tinta-secundaria">{t("T-4399")}</dt>
        <dd className="font-semibold">{selected.quarantined}</dd>
        <dt className="text-tinta-secundaria">{t("T-4335")}</dt>
        <dd>{modes[selected.mode]}</dd>
      </dl>
      <Link
        href={`/admin/inventario/etiquetas?material=${selected.id}`}
        className={buttonClass({ variant: "secundaria", area: "operacion", size: "compacto" })}
      >
        {t("T-4404")}
      </Link>
      <form action={updateItemAction} className="flex flex-col gap-3">
        <input type="hidden" name="itemId" value={selected.id} />
        <h3 className="font-semibold">{t("T-4342")}</h3>
        <Field id="editar-nombre" label={t("T-4334")}>
          <TextInput
            id="editar-nombre"
            name="name"
            defaultValue={selected.name}
            minLength={2}
            maxLength={160}
            required
          />
        </Field>
        <Field id="editar-ubicacion" label={t("T-4311")}>
          <TextInput
            id="editar-ubicacion"
            name="location"
            defaultValue={selected.location}
            maxLength={160}
            required
          />
        </Field>
        <Field id="editar-caja" label={t("T-4312")}>
          <TextInput
            id="editar-caja"
            name="box"
            defaultValue={selected.box}
            maxLength={160}
            required
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={selected.active} />
          {t("T-4397")}
        </label>
        <Button type="submit" area="operacion" className="self-start">
          {t("T-4342")}
        </Button>
      </form>
      <form action={adjustStockAction} className="flex flex-col gap-3">
        <input type="hidden" name="itemId" value={selected.id} />
        <h3 className="font-semibold">{t("T-4339")}</h3>
        <Field id="ajuste-delta" label={t("T-4340")}>
          <TextInput
            id="ajuste-delta"
            name="delta"
            type="number"
            step="1"
            min={selected.mode === "UNIT" ? 0 : -10000}
            max="10000"
            defaultValue="0"
            required
          />
        </Field>
        {selected.mode === "QUANTITY" ? (
          <Field id="ajuste-liberar" label={t("T-4341")}>
            <TextInput
              id="ajuste-liberar"
              name="releaseQuarantine"
              type="number"
              min="0"
              max={selected.quarantined}
              step="1"
              defaultValue="0"
            />
          </Field>
        ) : null}
        <Field id="ajuste-motivo" label={t("T-4326")}>
          <TextInput id="ajuste-motivo" name="reason" minLength={5} maxLength={1000} required />
        </Field>
        <Button type="submit" variant="secundaria" area="operacion" className="self-start">
          {t("T-4339")}
        </Button>
      </form>
      {selected.mode === "UNIT"
        ? (["remove", "release"] as const).map((intent) => {
            const units = selected.units.filter(
              (unit) => unit.state === (intent === "remove" ? "AVAILABLE" : "QUARANTINED"),
            );
            if (units.length === 0) return null;
            return (
              <form key={intent} action={adjustStockAction} className="flex flex-col gap-3">
                <input type="hidden" name="itemId" value={selected.id} />
                <input type="hidden" name="intent" value={intent} />
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 font-semibold">
                    {t(intent === "remove" ? "T-4401" : "T-4341")}
                  </legend>
                  {units.map((unit) => (
                    <label key={unit.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="unitId" value={unit.id} />
                      <code>{unit.barcode}</code>
                    </label>
                  ))}
                </fieldset>
                <Field id={`unidades-${intent}-motivo`} label={t("T-4326")}>
                  <TextInput
                    id={`unidades-${intent}-motivo`}
                    name="reason"
                    minLength={5}
                    maxLength={1000}
                    required
                  />
                </Field>
                <Button type="submit" variant="secundaria" area="operacion" className="self-start">
                  {t("T-4342")}
                </Button>
              </form>
            );
          })
        : null}
    </DetailPanel>
  ) : creating ? (
    <DetailPanel title={t("T-4333")} closeHref={close} closeLabel={t("T-4407")}>
      <form action={createItemAction} className="flex flex-col gap-3">
        <Field id="nuevo-nombre" label={t("T-4334")}>
          <TextInput id="nuevo-nombre" name="name" minLength={2} maxLength={160} required />
        </Field>
        <Field id="nuevo-modo" label={t("T-4335")}>
          <Select id="nuevo-modo" name="mode" defaultValue="UNIT">
            <option value="UNIT">{t("T-4336")}</option>
            <option value="QUANTITY">{t("T-4337")}</option>
          </Select>
        </Field>
        <Field id="nuevo-total" label={t("T-4310")}>
          <TextInput
            id="nuevo-total"
            name="total"
            type="number"
            min="1"
            max="10000"
            step="1"
            required
          />
        </Field>
        <Field id="nuevo-ubicacion" label={t("T-4311")}>
          <TextInput id="nuevo-ubicacion" name="location" maxLength={160} required />
        </Field>
        <Field id="nuevo-caja" label={t("T-4312")}>
          <TextInput id="nuevo-caja" name="box" maxLength={160} required />
        </Field>
        <Button type="submit" area="operacion" className="self-start">
          {t("T-4338")}
        </Button>
      </form>
    </DetailPanel>
  ) : null;

  return (
    <InventarioMarco
      active="materiales"
      query={query}
      actions={
        <Link href="/admin/inventario?nuevo=1" className={buttonClass({ area: "operacion" })}>
          {t("T-4333")}
        </Link>
      }
    >
      <SplitView
        list={
          <WorkTable
            caption={t("T-4332")}
            columns={[
              { key: "material", label: t("T-4308") },
              { key: "seguimiento", label: t("T-4335") },
              { key: "existencias", label: t("T-4310"), numeric: true },
              { key: "revision", label: t("T-4399"), numeric: true },
              { key: "lugar", label: t("T-4311") },
              { key: "estado", label: t("T-4362") },
            ]}
            rows={items.map((item) => ({
              id: item.id,
              current: item.id === selected?.id,
              cells: {
                material: (
                  <Link
                    href={withQuery("/admin/inventario", { material: item.id })}
                    scroll={false}
                    className="font-semibold text-tinta no-underline hover:underline"
                  >
                    {item.name}
                  </Link>
                ),
                seguimiento: modes[item.mode],
                existencias: item.total,
                revision: item.quarantined,
                lugar: `${item.location} · ${item.box}`,
                estado: (
                  <Badge tone={item.active ? "exito" : "neutral"} className="whitespace-nowrap">
                    {t(item.active ? "T-4392" : "T-4391")}
                  </Badge>
                ),
              },
            }))}
            empty={<EmptyState title={t("T-4358")} description={t("T-4385")} />}
          />
        }
        detail={detail}
      />
    </InventarioMarco>
  );
}
