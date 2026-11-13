import Image from "next/image";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { single } from "@/app/_lib/search";
import { readCatalog } from "@/modules/inventory";
import { t } from "@/shared/copy";
import { PrintButton } from "@/shared/ui/PrintButton";
import { InventarioMarco } from "../_ui/Marco";

// Las etiquetas para imprimir (ADR-150 regla 5): un Code 128 por unidad identificada, o uno por
// material cuando se lleva por cantidades. Al imprimir solo quedan las etiquetas.

export default async function InventarioEtiquetasPage({
  searchParams,
}: PageProps<"/admin/inventario/etiquetas">) {
  await requireInventoryAccess("/admin/inventario/etiquetas", "MANAGE");
  const query = await searchParams;
  const material = single(query.material);
  const items = (await readCatalog()).filter((item) => !material || item.id === material);
  return (
    <InventarioMarco active="etiquetas" query={query} actions={<PrintButton />}>
      <h2 className="titulo-seccion print:hidden">{t("T-4351")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
        {items.flatMap((item) => {
          const codes =
            item.mode === "UNIT"
              ? item.units.filter((unit) => unit.state !== "LOST").map((unit) => unit.barcode)
              : [item.barcode];
          return codes.map((code) => (
            <article
              key={code}
              className="flex break-inside-avoid flex-col gap-1 rounded-tarjeta bg-white p-3 text-black"
            >
              <h3 className="font-semibold text-black">{item.name}</h3>
              <Image
                unoptimized
                src={`/admin/inventario/etiquetas/${encodeURIComponent(code)}`}
                alt={`${t("T-4361")} ${code}`}
                width={320}
                height={90}
              />
              <p>
                <code>{code}</code>
              </p>
              <p className="text-sm">
                {item.location} · {item.box}
              </p>
            </article>
          ));
        })}
      </div>
    </InventarioMarco>
  );
}
