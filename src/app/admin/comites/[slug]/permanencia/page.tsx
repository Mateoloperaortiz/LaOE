import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasPermission } from "@/modules/identity";
import { listInternalRoster } from "@/modules/people";
import { deviatesFromNominal, getRule, getTableView } from "@/modules/permanence";
import { ReglaForm } from "@/modules/permanence/components/ReglaForm";
import { TablaReglas } from "@/modules/permanence/components/TablaReglas";
import { getCurrentTerm } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { LogoComite } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { requireAdminAreaRoles } from "../../../_kit/acceso";
import { reglaFormLabels, reglaFormValues } from "../../../permanencia/_ui/reglas";
import {
  applyCommitteeTemplateAction,
  copyCommitteeRulesAction,
  deleteCommitteeRuleAction,
  saveCommitteeRuleAction,
} from "./actions";

// Permanencia del comité para su líder (ADR-026, ADR-036): su tabla dentro del nominal, copiar del
// semestre anterior o cargar la referencia; los puntajes, el destacado y el progreso llegan en F4-T5.

export async function generateMetadata({
  params,
}: PageProps<"/admin/comites/[slug]/permanencia">): Promise<Metadata> {
  const { slug } = await params;
  const roster = await listInternalRoster(slug);
  return { title: t("T-818", { comité: roster?.committee.name ?? slug }) };
}

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function PermanenciaComitePage({
  params,
  searchParams,
}: PageProps<"/admin/comites/[slug]/permanencia">) {
  const { slug } = await params;
  const base = `/admin/comites/${slug}/permanencia`;
  const roles = await requireAdminAreaRoles(base);
  const roster = await listInternalRoster(slug);
  if (!roster) {
    notFound();
  }
  const committee = roster.committee;
  if (!roles.isAdmin && !hasPermission(roles.actor, "COMMITTEE_LEADER", committee.id)) {
    redirect("/app");
  }
  const term = roster.term ?? (await getCurrentTerm());
  const search = (await searchParams) as Search;
  const accion = single(search.accion);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const referencia = single(search.referencia);
  const [nuevoCriterio, copiar, referenciaBtn] = tList("T-715");
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-818", { comité: committee.name })}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const view = await getTableView({
    termId: term.id,
    scope: "COMMITTEE",
    committeeId: committee.id,
  });
  const locked = view.lockedAt !== null && !roles.isAdmin;
  const editing = accion === "editar" ? await getRule(single(search.regla)) : null;
  const hidden = { slug };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center gap-4">
        <LogoComite slug={committee.logoKey ?? committee.slug} name={committee.name} size={64} />
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{t("T-818", { comité: committee.name })}</h1>
          <p className="max-w-prose text-tinta-suave">
            {t("T-739", { nominal: term.permanenceCommitteeNominal })}
          </p>
          {guardado ? (
            <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
              {referencia ? t("T-735", { n: referencia }) : t("T-259")}
            </output>
          ) : null}
          {error ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {error}
            </p>
          ) : null}
        </div>
        <Link href={`/admin/comites/${slug}`} className="boton-secundario ml-auto self-start">
          {committee.name}
        </Link>
      </header>

      {locked ? (
        <p className="rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
          {t("T-731", { comité: committee.name })}
        </p>
      ) : null}

      <TablaReglas
        titulo={t("T-121", { comité: committee.name })}
        nominal={term.permanenceCommitteeNominal}
        sums={view.sums}
        deviates={deviatesFromNominal(view.sums.veterans, term.permanenceCommitteeNominal)}
        rules={view.rules}
        lockedAt={view.lockedAt}
        comment={view.comment}
        editHref={locked ? null : (id) => `${base}?accion=editar&regla=${id}`}
        deleteAction={locked ? null : deleteCommitteeRuleAction}
        deleteHidden={hidden}
        acciones={
          locked ? null : (
            <>
              <Link
                href={`${base}?accion=nueva`}
                className="boton-calido min-h-9 px-3 py-1 text-sm"
              >
                {nuevoCriterio}
              </Link>
              {view.rules.length === 0 ? (
                <>
                  <form action={copyCommitteeRulesAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <button type="submit" className="boton-secundario min-h-9 px-3 py-1 text-sm">
                      {copiar}
                    </button>
                  </form>
                  <form action={applyCommitteeTemplateAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <button type="submit" className="boton-secundario min-h-9 px-3 py-1 text-sm">
                      {referenciaBtn}
                    </button>
                  </form>
                </>
              ) : null}
            </>
          )
        }
      />

      {!locked && (accion === "nueva" || (accion === "editar" && editing)) ? (
        <ResourcePanel
          title={editing ? editing.label : (nuevoCriterio ?? "")}
          closeHref={base}
          closeLabel={t("T-291")}
        >
          <ReglaForm
            action={saveCommitteeRuleAction}
            values={reglaFormValues(editing)}
            hidden={{ ...hidden, id: editing?.id ?? "" }}
            committeeScoped
            labels={reglaFormLabels()}
            cancelHref={base}
            error={error || null}
          />
        </ResourcePanel>
      ) : null}
    </div>
  );
}
