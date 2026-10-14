import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGalleryCollection } from "@/modules/content";
import { requireActor } from "@/modules/identity";
import { hasLiveConsent } from "@/modules/people";
import { t } from "@/shared/copy";
import { GalleryHome } from "./GalleryHome";

export const metadata: Metadata = { title: t("T-3270") };

export default async function FotosPage() {
  const actor = await requireActor("/app/fotos");
  if (!(await hasLiveConsent(actor.personId, "MEMBERSHIP"))) redirect("/autorizacion");
  return <GalleryHome collection={await getGalleryCollection("dias-2026")} />;
}
