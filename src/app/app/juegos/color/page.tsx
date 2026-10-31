import type { Metadata } from "next";
import { requireActor } from "@/modules/identity";
import { getTodayColor } from "@/modules/participation";
import { ColorGame } from "@/modules/participation/components/ColorGame";
import { t } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { ArrowLeftIcon } from "@/shared/ui/icons/ArrowLeftIcon";
import { nextColorRoundAction, startColorAction, submitColorRoundAction } from "./actions";

export const metadata: Metadata = { title: t("T-3487") };

export default async function ColorPage() {
  const actor = await requireActor("/app/juegos/color");
  const today = await getTodayColor(actor.personId);
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/app/juegos"
        className="inline-flex items-center gap-2 self-start text-sm font-semibold"
      >
        <ArrowLeftIcon />
        {t("T-2621")}
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-display-lg">{t("T-3487")}</h1>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-3493")}</p>
      </header>
      <ColorGame
        key={`${today.day}:${today.availability}`}
        initial={today}
        onStart={startColorAction}
        onNextRound={nextColorRoundAction}
        onSubmit={submitColorRoundAction}
      />
    </div>
  );
}
