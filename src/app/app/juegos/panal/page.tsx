import type { Metadata } from "next";
import Link from "next/link";
import { requireActor } from "@/modules/identity";
import { getTodayPanal } from "@/modules/participation";
import { Panal } from "@/modules/participation/components/Panal";
import { t } from "@/shared/copy";
import { startPanalAction, submitPanalAction } from "./actions";

export const metadata: Metadata = { title: t("T-2722") };

export default async function PanalPage() {
  const actor = await requireActor("/app/juegos/panal");
  const today = await getTodayPanal(actor.personId);
  return (
    <div className="flex flex-col gap-3 sm:gap-6">
      <Link href="/app/juegos" className="text-sm font-semibold">
        {t("T-2621")}
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-display-lg">{t("T-2722")}</h1>
        <p className="text-sm text-tinta-suave">{t("T-2724")}</p>
      </header>
      <Panal
        key={`${today.day}:${today.availability}`}
        initial={today}
        onStart={startPanalAction}
        onWord={submitPanalAction}
      />
    </div>
  );
}
