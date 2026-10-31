import type { Metadata } from "next";
import { findUpcomingEditionsForMembers } from "@/modules/events";
import { requireActor } from "@/modules/identity";
import { listMemberAgenda } from "@/modules/participation";
import { canParticipate } from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { agendaItems, MemberAgenda } from "../_ui/MemberAgenda";

export const metadata: Metadata = { title: t("T-1661") };

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor("/app/agenda");
  const participationAllowed = canParticipate(actor.membershipStatus);
  const [term, params] = await Promise.all([getCurrentTerm(), searchParams]);
  const selected = typeof params.actividad === "string" ? params.actividad : "";
  const now = new Date();
  const [occasions, editions] = await Promise.all([
    term ? listMemberAgenda(term.id, now, 100) : [],
    findUpcomingEditionsForMembers(100, now),
  ]);
  const items = agendaItems(occasions, editions);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{t("T-1661")}</h1>
          <p className="mt-3 max-w-prose text-tinta-suave">{t("T-1672")}</p>
        </div>
        {participationAllowed ? (
          <Link href="/app/ajustes#calendario" className="boton-secundario">
            {t("T-308")}
          </Link>
        ) : null}
      </header>
      {selected && !items.some((item) => item.key === selected) ? (
        <output>{t("T-1687")}</output>
      ) : null}
      <MemberAgenda
        items={items}
        personId={actor.personId}
        selected={selected}
        participationAllowed={participationAllowed}
      />
    </div>
  );
}
