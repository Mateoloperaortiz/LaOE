import { loadDesk } from "@/app/admin/_kit/desk";
import { t, tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { InboxIcon } from "@/shared/ui/icons/InboxIcon";
import { formatCount } from "@/shared/ui/list-navigation";

// El contador de la Mesa en la barra superior (ADR-159 regla 2). Llega en streaming: el layout lo
// envuelve en `Suspense` para que leer la Mesa no demore ninguna página, y mientras tanto se ve el
// enlace sin número. Se recalcula cuando el layout vuelve a pintarse, como después de una acción.

export function DeskLink({ total }: { total: number | null }) {
  const [one, other] = tList("T-4867");
  return (
    <Link
      href="/admin/mesa"
      className="admin-desk"
      aria-label={total === null ? t("T-4864") : formatCount(total, { one, other })}
    >
      <InboxIcon size={18} />
      <span className="admin-desk-label">{t("T-4864")}</span>
      {total ? (
        <span className="admin-desk-count" aria-hidden="true">
          {total > 99 ? "99+" : total}
        </span>
      ) : null}
    </Link>
  );
}

export async function DeskCounter() {
  const desk = await loadDesk();
  return <DeskLink total={desk.total} />;
}
