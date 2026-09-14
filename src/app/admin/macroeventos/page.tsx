import type { Metadata } from "next";
import Link from "next/link";
import { listMacroevents, macroeventRoleCodes } from "@/modules/events";
import { requireAdminActor } from "@/modules/identity";
import { t } from "@/shared/copy";

export const metadata: Metadata = { title: t("T-2344") };

export default async function MacroeventsPage() {
  await requireAdminActor("/admin/macroeventos");
  const events = await listMacroevents();
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-lg">{t("T-2344")}</h1>
        <p className="max-w-prose text-tinta-suave">{t("T-2345")}</p>
      </header>
      <ul className="m-0 list-none divide-y divide-borde border-y border-borde p-0">
        {events.map((event) => (
          <li key={event.id} className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-display-md">{event.name}</h2>
              <p className="text-sm text-tinta-suave">
                {t("T-2350", { n: macroeventRoleCodes(event.slug).length })}
              </p>
            </div>
            <Link
              className="boton-secundario"
              href={`/admin/macroeventos/${event.slug}`}
              aria-label={`${t("T-2346")} · ${event.name}`}
            >
              {t("T-2346")}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
