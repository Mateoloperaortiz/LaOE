import { t, tLabels } from "@/shared/copy";

const EVALUATIONS = ["PENDING", "GOOD", "INSUFFICIENT"] as const;

export function TeamParticipations({
  items,
  term,
}: {
  items: readonly {
    groupId: string;
    label: string;
    evaluation: "PENDING" | "GOOD" | "INSUFFICIENT";
  }[];
  term: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-display-md">
        {t("T-2383")} · {term}
      </h2>
      {items.length ? (
        <ul className="m-0 list-none divide-y divide-borde p-0">
          {items.map((item) => (
            <li
              key={`${item.groupId}:${item.label}`}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <span className="font-semibold">{item.label}</span>
              <span className="text-sm text-tinta-suave">
                {tLabels("T-750", EVALUATIONS)[item.evaluation]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-tinta-suave">{t("T-2392")}</p>
      )}
    </section>
  );
}
