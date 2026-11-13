import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single } from "@/app/_lib/search";
import { currentSeatAuthority, getPeopleByIds, listCommitteesForSelection } from "@/modules/people";
import { listCapMembers, listCompanions } from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";
import { tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Banner } from "@/shared/ui/Banner";
import { Button } from "@/shared/ui/Button";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { EmptyState } from "@/shared/ui/States";
import { WorkTable } from "@/shared/ui/WorkTable";
import { assignCompanionAction } from "./actions";

// La bitácora del CAP (ADR-197 regla 4): cada comité del semestre con su acompañante, que asigna la
// Presidencia entre quienes están en el CAP. La leen la Presidencia y el CAP.

const [titulo] = tList("T-5130");
export const metadata: Metadata = { title: titulo };

export default async function Page({ searchParams }: PageProps<"/admin/cap">) {
  const roles = await requireAdminAreaRoles("/admin/cap");
  if (!roles.readsCapLog) redirect("/admin");
  const query = await searchParams;
  const term = await getCurrentTerm();
  if (!term) redirect("/admin");
  const presidency = (await currentSeatAuthority(roles.actor.personId, "PRESIDENT")) === "HOLDER";
  const [committees, companions, members] = await Promise.all([
    listCommitteesForSelection(),
    listCompanions(term.id),
    listCapMembers(term.id),
  ]);
  const people = await getPeopleByIds([...new Set([...companions.values(), ...members])]);
  const name = (personId: string | undefined) =>
    personId ? (people.get(personId)?.fullName ?? "—") : "—";

  const [heading, intro, sinAcompanante, asignar, plantillas] = tList("T-5130");
  const columnas = tList("T-5131");
  const error = single(query.error);

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={heading} description={intro} />
      {error ? (
        <Banner tone="error" title={error} />
      ) : single(query.guardado) === "1" ? (
        <Banner tone="exito" title={tList("T-4302")[0]} />
      ) : null}
      <p className="flex flex-wrap gap-4 text-sm">
        <Link href="/admin/cap/ediciones">{tList("T-5135")[0]}</Link>
        {presidency ? <Link href="/admin/cap/plantillas">{plantillas}</Link> : null}
      </p>
      <WorkTable
        caption={heading ?? ""}
        columns={[
          { key: "comite", label: columnas[0] ?? "" },
          { key: "acompanante", label: columnas[1] ?? "" },
        ]}
        rows={committees.map((committee) => ({
          id: committee.id,
          cells: {
            comite: (
              <Link
                href={`/admin/cap/${committee.slug}`}
                className="font-semibold text-tinta no-underline hover:underline"
              >
                {committee.name}
              </Link>
            ),
            acompanante: presidency ? (
              <form action={assignCompanionAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="committeeId" value={committee.id} />
                <label className="sr-only" htmlFor={`acompanante-${committee.id}`}>
                  {`${columnas[1] ?? ""}: ${committee.name}`}
                </label>
                <select
                  id={`acompanante-${committee.id}`}
                  name="personId"
                  defaultValue={companions.get(committee.id) ?? ""}
                  className="min-h-9 rounded-control border border-borde px-2"
                >
                  <option value="">{sinAcompanante}</option>
                  {members.map((personId) => (
                    <option key={personId} value={personId}>
                      {name(personId)}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="secundaria" area="operacion">
                  {asignar}
                </Button>
              </form>
            ) : (
              (name(companions.get(committee.id)) ?? sinAcompanante)
            ),
          },
        }))}
        empty={<EmptyState title={tList("T-5131")[2] ?? ""} />}
      />
    </div>
  );
}
