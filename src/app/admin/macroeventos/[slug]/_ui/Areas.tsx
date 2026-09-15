import { macroeventAreas } from "@/modules/permanence";
import { t } from "@/shared/copy";

export function Areas({ slug, selected = [] }: { slug: string; selected?: string[] }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">{t("T-2377")}</legend>
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {macroeventAreas(slug).map((area) => (
          <label
            key={area.code}
            className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              name="areas"
              value={area.code}
              defaultChecked={selected.includes(area.code)}
              className="size-5 shrink-0 accent-oe-navy"
            />
            {area.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
