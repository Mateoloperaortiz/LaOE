/** Las pestañas de la Operación del inventario, en el orden de T-5064 (ADR-191 regla 3). */
export const INVENTORY_TABS = [
  "materiales",
  "logistica",
  "prestamos",
  "novedades",
  "etiquetas",
] as const;

export type InventoryTab = (typeof INVENTORY_TABS)[number];

export const INVENTORY_PATHS: Record<InventoryTab, string> = {
  materiales: "/admin/inventario",
  logistica: "/admin/inventario/logistica",
  prestamos: "/admin/inventario/prestamos",
  novedades: "/admin/inventario/novedades",
  etiquetas: "/admin/inventario/etiquetas",
};
