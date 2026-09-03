import Link from "next/link";
import { TABS, type Tab, tabLabels } from "./etiquetas";

type Props = { personId: string; active: Tab };

export function Pestanas({ personId, active }: Props) {
  const labels = tabLabels();
  return (
    <nav aria-label={labels.resumen} className="overflow-x-auto">
      <ul className="flex list-none gap-1 border-b border-borde p-0">
        {TABS.map((tab) => (
          <li key={tab}>
            <Link
              href={`/admin/personas/${personId}?pestana=${tab}`}
              aria-current={tab === active ? "page" : undefined}
              className={`inline-block whitespace-nowrap rounded-t-xl px-3 py-2 text-sm font-semibold ${
                tab === active ? "bg-oe-navy text-oe-paper" : "text-titulo hover:bg-fondo-suave"
              }`}
            >
              {labels[tab]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
