import { requireInventoryAccess } from "@/app/_authz/inventory";
import { listEditions, listMacroevents } from "@/modules/events";
import { getPeopleByIds, listActiveMemberRefs, listAllCommittees } from "@/modules/people";
import { listAllTerms } from "@/modules/terms";
import { t } from "@/shared/copy";
import { APP_TIME_ZONE, dateKeyIn, todayKey } from "@/shared/lib/dates";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Field, Select } from "@/shared/ui/Field";
import { EmptyState } from "@/shared/ui/States";
import { Surface } from "@/shared/ui/Surface";
import { WorkTable } from "@/shared/ui/WorkTable";
import { InventarioMarco } from "../_ui/Marco";
import { directorAction, grantAction } from "../actions";

// Las direcciones logísticas y los permisos para reservar (ADR-150 reglas 2 y 3): la VP nombra y retira
// solo cargos de Logística, y habilita o quita el permiso de reservar ligado a cada cargo concreto.

export default async function InventarioLogisticaPage({
  searchParams,
}: PageProps<"/admin/inventario/logistica">) {
  const { context } = await requireInventoryAccess("/admin/inventario/logistica", "MANAGE");
  const [query, members, committees, editions, macroevents, terms, people] = await Promise.all([
    searchParams,
    listActiveMemberRefs(),
    listAllCommittees(),
    listEditions({ q: "", page: 1, pageSize: 200 }),
    listMacroevents(),
    listAllTerms(),
    getPeopleByIds(context.sources.map((source) => source.personId)),
  ]);
  const macroIds = new Set(macroevents.map((event) => event.id));
  // Una edición de macroevento cuenta si cae en un semestre actual o futuro (ADR-150 regla 3).
  const eligibleEditions = editions.rows.filter(
    (edition) =>
      macroIds.has(edition.eventId) &&
      terms.some((term) => {
        const day = dateKeyIn(APP_TIME_ZONE, edition.startsAt);
        return term.startsOn <= day && term.endsOn >= day && term.endsOn >= todayKey();
      }),
  );
  return (
    <InventarioMarco active="logistica" query={query}>
      <Surface as="section" aria-labelledby="directores" className="flex flex-col gap-4 p-5">
        <h2 id="directores" className="titulo-seccion">
          {t("T-4346")}
        </h2>
        <form action={directorAction} className="grid gap-3 md:grid-cols-2">
          <Field id="director-frente" label={t("T-4348")}>
            <Select id="director-frente" name="scope" required defaultValue="">
              <option value="" disabled>
                {t("T-4348")}
              </option>
              {committees
                .filter((committee) => committee.status !== "INACTIVE")
                .map((committee) => (
                  <option key={committee.id} value={`COMMITTEE:${committee.id}`}>
                    {committee.name}
                  </option>
                ))}
              {eligibleEditions.map((edition) => (
                <option key={edition.id} value={`MACROEVENT:${edition.id}`}>
                  {edition.eventName} · {edition.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="director-persona" label={t("T-4347")}>
            <Select id="director-persona" name="personId" required defaultValue="">
              <option value="" disabled>
                {t("T-4347")}
              </option>
              {members
                .filter((member) => !member.anonymized)
                .map((member) => (
                  <option key={member.personId} value={member.personId}>
                    {member.fullName}
                  </option>
                ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input name="coDirector" type="checkbox" />
            {t("T-4349")}
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" name="assigned" value="true" area="operacion">
              {t("T-4395")}
            </Button>
            <Button
              type="submit"
              name="assigned"
              value="false"
              variant="secundaria"
              area="operacion"
            >
              {t("T-4396")}
            </Button>
          </div>
        </form>
      </Surface>
      <section aria-labelledby="permisos" className="flex flex-col gap-3">
        <h2 id="permisos" className="titulo-seccion">
          {t("T-4343")}
        </h2>
        <WorkTable
          caption={t("T-4343")}
          columns={[
            { key: "persona", label: t("T-4347") },
            { key: "frente", label: t("T-4348") },
            { key: "estado", label: t("T-4362") },
            { key: "accion", label: t("T-4343") },
          ]}
          rows={context.sources.map((source) => ({
            id: `${source.kind}:${source.id}`,
            cells: {
              persona: people.get(source.personId)?.fullName ?? "",
              frente: source.label,
              estado: (
                <Badge tone={source.granted ? "exito" : "neutral"}>
                  {t(source.granted ? "T-4359" : "T-4360")}
                </Badge>
              ),
              accion: (
                <form action={grantAction}>
                  <input type="hidden" name="sourceKind" value={source.kind} />
                  <input type="hidden" name="sourceId" value={source.id} />
                  <input type="hidden" name="enabled" value={String(!source.granted)} />
                  <Button
                    type="submit"
                    variant={source.granted ? "secundaria" : "principal"}
                    area="operacion"
                    size="compacto"
                    aria-label={`${t(source.granted ? "T-4345" : "T-4344")} · ${people.get(source.personId)?.fullName ?? ""} · ${source.label}`}
                  >
                    {t(source.granted ? "T-4345" : "T-4344")}
                  </Button>
                </form>
              ),
            },
          }))}
          empty={<EmptyState title={t("T-4394")} />}
        />
      </section>
    </InventarioMarco>
  );
}
