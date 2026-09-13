import Link from "next/link";
import { COMMITTEE_AREAS, type CommitteeArea } from "@/modules/people";
import { AdminSectionSelect } from "@/shared/admin-kit/AdminSectionSelect";
import { t, tList } from "@/shared/copy";

// Áreas de la vista del comité (ADR-058): una pestaña por área donde el actor tiene alguna capacidad,
// en el orden de T-2174; en pantallas angostas, el mismo selector que usan las pestañas de la Persona 360.

export function areaLabel(area: CommitteeArea): string {
  const labels = tList("T-2174");
  const index = COMMITTEE_AREAS.findIndex((item) => item.key === area);
  return labels[index] ?? area;
}

export function Areas({
  base,
  active,
  areas,
}: {
  base: string;
  active: CommitteeArea;
  areas: CommitteeArea[];
}) {
  return (
    <nav aria-label={t("T-1502")} className="min-w-0">
      <AdminSectionSelect
        label={t("T-1502")}
        value={active}
        options={areas.map((area) => ({
          value: area,
          label: areaLabel(area),
          href: `${base}?area=${area}`,
        }))}
      />
      <ul className="hidden list-none flex-wrap gap-1 border-b border-borde p-0 md:flex">
        {areas.map((area) => (
          <li key={area}>
            <Link
              href={`${base}?area=${area}`}
              aria-current={area === active ? "page" : undefined}
              className={`inline-block whitespace-nowrap rounded-t-xl px-3 py-2 text-sm font-semibold ${
                area === active ? "bg-oe-navy text-oe-paper" : "text-titulo hover:bg-fondo-suave"
              }`}
            >
              {areaLabel(area)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
