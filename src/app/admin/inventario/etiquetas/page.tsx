import Image from "next/image";
import Link from "next/link";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { readCatalog } from "@/modules/inventory";
import { PrintButton } from "@/modules/inventory/components/PrintButton";
import { t } from "@/shared/copy";
import "@/modules/inventory/components/inventory.css";

export default async function InventoryLabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireInventoryAccess("/admin/inventario/etiquetas", "MANAGE");
  const query = await searchParams;
  const items = (await readCatalog()).filter(
    (item) => !query.material || item.id === query.material,
  );
  return (
    <div className="inventory">
      <header className="inventory-heading inventory-print-hide">
        <h1>{t("T-4351")}</h1>
        <Link href="/admin/inventario">{t("T-4303")}</Link>
        <PrintButton />
      </header>
      <div className="inventory-labels">
        {items.flatMap((item) => {
          const codes =
            item.mode === "UNIT"
              ? item.units.filter((unit) => unit.state !== "LOST").map((unit) => unit.barcode)
              : [item.barcode];
          return codes.map((code) => (
            <article key={code} className="inventory-label">
              <h2>{item.name}</h2>
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
              <p>
                {item.location} · {item.box}
              </p>
            </article>
          ));
        })}
      </div>
    </div>
  );
}
