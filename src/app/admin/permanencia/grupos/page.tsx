import type { Metadata } from "next";
import { single } from "@/app/_lib/search";
import { requireAdminActor } from "@/modules/identity";
import { workGroupsResource } from "@/modules/permanence/admin";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { ResourcePage } from "../../_kit/ResourcePage";
import { seedWorkCommitteesAction } from "./actions";

// Grupos de trabajo por el kit (ADR-036 regla 6) más la siembra de los comités de trabajo del término.

export const metadata: Metadata = { title: workGroupsResource.names.plural };

type Search = Record<string, string | string[] | undefined>;

export default async function Page({ searchParams }: PageProps<"/admin/permanencia/grupos">) {
  await requireAdminActor("/admin/permanencia/grupos");
  const search = (await searchParams) as Search;
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const sembrados = single(search.sembrados);
  const termino = single(search.termino);
  const [, sembrar] = tList("T-746");
  return (
    <div className="flex flex-col gap-8">
      <ResourcePage resource={workGroupsResource} searchParams={search} />
      {term ? (
        <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4">
          {sembrados ? (
            <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
              {t("T-756", { n: sembrados, término: termino })}
            </output>
          ) : null}
          <form action={seedWorkCommitteesAction} className="flex items-center gap-2">
            <AdminFormBody>
              <input type="hidden" name="termId" value={term.id} />
              <AdminSubmitButton
                type="submit"
                className="boton-secundario min-h-9 px-3 py-1 text-sm"
              >
                {sembrar} · {term.code}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
        </section>
      ) : null}
    </div>
  );
}
