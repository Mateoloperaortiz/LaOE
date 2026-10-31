import { COMMITTEE_AREA_KEYS, type CommitteeArea } from "@/modules/people";
import { AdminSectionSelect } from "@/shared/admin-kit/AdminSectionSelect";
import { t, tLabels } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";

// Áreas de la vista del comité (ADR-058): una pestaña por área donde el actor tiene alguna capacidad,
// en el orden de T-2174; en pantallas angostas, el mismo selector que usan las pestañas de la Persona 360.

export function areaLabel(area: CommitteeArea): string {
  return tLabels("T-2174", COMMITTEE_AREA_KEYS)[area] ?? area;
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
