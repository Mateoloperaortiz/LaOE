import type { ReactNode } from "react";
import { groupRoleHistory, type RoleHistoryEntry } from "@/modules/people";
import { t } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";

export function RoleHistoryList({
  entries,
  actions,
  showTerm = true,
}: {
  entries: readonly RoleHistoryEntry[];
  actions?: (entry: RoleHistoryEntry) => ReactNode;
  showTerm?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {groupRoleHistory(entries).map((semester) => (
        <section
          key={semester.termId}
          aria-label={semester.termCode || t("T-2399")}
          className="flex min-w-0 flex-col gap-3"
        >
          {showTerm ? (
            <p className="font-semibold text-titulo">{semester.termCode || t("T-2399")}</p>
          ) : null}
          {semester.scopes.map((group) => (
            <div key={group.scope} className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-semibold text-tinta-suave">{group.scope}</p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                {group.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2"
                  >
                    <span className="min-w-0 break-words">
                      {item.label}
                      {item.endedAt ? (
                        <span className="text-tinta-suave"> · {formatDate(item.endedAt)}</span>
                      ) : null}
                    </span>
                    {actions?.(item)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
