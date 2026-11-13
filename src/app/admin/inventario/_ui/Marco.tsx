import type { ReactNode } from "react";
import { AdminSectionSelect } from "@/shared/admin-kit/AdminSectionSelect";
import { t, tLabels, tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Banner } from "@/shared/ui/Banner";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { INVENTORY_PATHS, INVENTORY_TABS, type InventoryTab } from "./tabs";

type Props = {
  active: InventoryTab;
  /** Por qué administra quien mira (ADR-193): la Presidencia ve que está supliendo a la VP. */
  managerRole: "VP" | "PRESIDENCY" | null;
  query?: Record<string, string | string[] | undefined>;
  actions?: ReactNode;
  children: ReactNode;
};

// El marco de las pantallas de la VP administrativa (ADR-150, ADR-191 regla 3): el título, las
// pestañas como pastillas y el aviso de lo que acaba de pasar, que llega por la dirección.
export function InventarioMarco({ active, managerRole, query = {}, actions, children }: Props) {
  const labels = tLabels("T-5064", INVENTORY_TABS);
  const [supplyTitle, supplyBody] = tList("T-5077");
  const error = typeof query.error === "string" ? query.error : "";
  const saved = query.guardado === "1";
  return (
    <div className="flex flex-col gap-5">
      <ScreenHeader title={t("T-4303")} actions={actions} />
      <nav aria-label={t("T-4300")} className="min-w-0 print:hidden">
        <AdminSectionSelect
          label={t("T-4300")}
          value={active}
          options={INVENTORY_TABS.map((tab) => ({
            value: tab,
            label: labels[tab],
            href: INVENTORY_PATHS[tab],
          }))}
        />
        <ul className="hidden list-none flex-wrap gap-1 p-0 md:flex">
          {INVENTORY_TABS.map((tab) => (
            <li key={tab}>
              <Link
                href={INVENTORY_PATHS[tab]}
                aria-current={tab === active ? "page" : undefined}
                className={`inline-flex min-h-8 items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold no-underline ${
                  tab === active ? "bg-accion text-accion-tinta" : "text-titulo hover:bg-relleno"
                }`}
              >
                {labels[tab]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {managerRole === "PRESIDENCY" ? (
        <Banner tone="info" title={supplyTitle ?? ""}>
          {supplyBody}
        </Banner>
      ) : null}
      {error ? (
        <Banner tone="error" title={error} />
      ) : saved ? (
        <Banner tone="exito" title={t("T-4302")} />
      ) : null}
      {children}
    </div>
  );
}
