import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminActor } from "@/modules/identity";
import { listOccasionsForTerm, loadGamificationSettings } from "@/modules/participation";
import { ChallengeEditor } from "@/modules/participation/components/ChallengeEditor";
import { listAllCommittees } from "@/modules/people";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { utcToBogotaInput } from "@/shared/lib/dates";
import { saveChallengeAction } from "../actions";

// Nuevo reto (ADR-067 regla 2): nace como borrador; la ocasión vinculada se elige entre las del
// semestre de la apertura con puntos.

export const metadata: Metadata = { title: t("T-2503") };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function NuevoRetoPage({
  searchParams,
}: PageProps<"/admin/gamificacion/retos/nuevo">) {
  await requireAdminActor("/admin/gamificacion/retos/nuevo");
  const search = (await searchParams) as Search;
  const error = single(search.error);
  const [settings, committees, current] = await Promise.all([
    loadGamificationSettings(),
    listAllCommittees(),
    getCurrentTerm(),
  ]);
  const terms = await listAllTerms();
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const occasions = term
    ? (await listOccasionsForTerm(term.id, ["DRAFT", "OPEN"])).filter((item) => item.points > 0)
    : [];
  const back = `/admin/gamificacion/retos${term ? `?termId=${term.id}` : ""}`;
  const now = new Date();
  const opensAt = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-lg">{t("T-2503")}</h1>
        {error ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {error}
          </p>
        ) : null}
      </header>
      <form action={saveChallengeAction} className="flex flex-col gap-6">
        <AdminFormBody>
          <input type="hidden" name="back" value={back} />
          <ChallengeEditor
            initial={{
              kind: "TRIVIA",
              title: "",
              description: "",
              audience: "ALL",
              audienceCommitteeIds: [],
              opensAt: utcToBogotaInput(opensAt),
              closesAt: utcToBogotaInput(new Date(opensAt.getTime() + 7 * 24 * 3_600_000)),
              basePoints: settings.defaults.trivia,
              passPercent: settings.defaults.passPercent,
              occasionId: null,
              questions: [{ prompt: "", options: ["", ""], correctIndex: 0 }],
            }}
            occasions={occasions.map((item) => ({
              id: item.id,
              label: item.title,
            }))}
            committees={committees.map((item) => ({ id: item.id, name: item.name }))}
            locked={false}
            defaults={settings.defaults}
          />
          <div className="flex items-center gap-3">
            <AdminSubmitButton type="submit" className="boton-primario">
              {tList("T-2510")[0]}
            </AdminSubmitButton>
            <Link href={back} className="boton-secundario">
              {t("T-254")}
            </Link>
          </div>
        </AdminFormBody>
      </form>
    </div>
  );
}
