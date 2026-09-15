import type { Metadata } from "next";
import { excerpt } from "@/modules/content";
import { requireActor } from "@/modules/identity";
import { getMyMembership, listInternalCommittees } from "@/modules/people";
import { t } from "@/shared/copy";
import { cargoEnComite } from "../_ui/PersonaTarjeta";
import { CommitteeDirectory } from "./CommitteeDirectory";

export const metadata: Metadata = { title: t("T-309") };

export default async function ComitesInternosPage() {
  const actor = await requireActor("/app/comites");
  const [mine, all] = await Promise.all([
    getMyMembership(actor.personId),
    listInternalCommittees(),
  ]);
  const mineIds = new Set(mine.committees.map((item) => item.committeeId));
  const byId = new Map(all.map((item) => [item.id, item]));
  return (
    <CommitteeDirectory
      mine={mine.committees.map((item) => ({
        id: item.committeeId,
        slug: item.committeeSlug,
        name: item.committeeName,
        logoKey: byId.get(item.committeeId)?.logoKey ?? null,
        summary: cargoEnComite(item, item.committeeName),
      }))}
      others={all
        .filter((item) => !mineIds.has(item.id))
        .map((item) => ({
          id: item.id,
          slug: item.slug,
          name: item.name,
          logoKey: item.logoKey,
          summary: excerpt(item.presentation ?? "", 220),
        }))}
    />
  );
}
