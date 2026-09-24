import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single } from "@/app/_lib/search";
import { listCompetitions } from "@/modules/competition";
import { listEditionOptions } from "@/modules/events";
import { Campo, Casilla, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { createCompetitionAction } from "./actions";

// The Games en el admin (ADR-089): ADMIN ve todas las competencias y crea la de cada edición; la
// Dirección, los operadores y los jueces ven las suyas.

export async function generateMetadata() {
  return { title: t("T-2763") };
}

export default async function CompetitionsPage({ searchParams }: PageProps<"/admin/the-games">) {
  const roles = await requireAdminAreaRoles("/admin/the-games");
  const search = await searchParams;
  const mine = roles.isAdmin ? null : roles.competitions;
  if (mine && mine.length === 0) redirect("/admin");
  const [competitions, editions] = await Promise.all([
    roles.isAdmin ? listCompetitions() : Promise.resolve([]),
    roles.isAdmin ? listEditionOptions() : Promise.resolve([]),
  ]);
  const rows = mine
    ? mine.map((item) => ({
        id: item.competitionId,
        name: item.name,
        href: item.operator
          ? `/admin/the-games/${item.competitionId}`
          : `/admin/the-games/${item.competitionId}/juez`,
      }))
    : competitions.map((item) => ({
        id: item.id,
        name: item.isRehearsal ? `${item.name} · ${t("T-2892")}` : item.name,
        href: `/admin/the-games/${item.id}`,
      }));
  const [edicion, direccion, nombre, ensayo] = tList("T-2802");
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-lg">{t("T-2763")}</h1>
        <p className="max-w-prose text-tinta-suave">{t("T-2799")}</p>
      </header>
      {single(search.error) ? (
        <p role="alert" className="text-sm font-semibold text-oe-orange">
          {single(search.error)}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-tinta-suave">{t("T-2800")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-borde p-0">
          {rows.map((row) => (
            <li key={row.id} className="py-3">
              <Link href={row.href} className="font-semibold underline">
                {row.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {roles.isAdmin ? (
        <section className="flex max-w-2xl flex-col gap-4">
          <h2 className="text-display-md">{t("T-2801")}</h2>
          <form action={createCompetitionAction} className="flex flex-col gap-4">
            <Campo id="editionId" label={edicion ?? ""}>
              <select id="editionId" name="editionId" required className={inputClass}>
                {editions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="slug" label={direccion ?? ""}>
              <input
                id="slug"
                name="slug"
                required
                pattern="[a-z0-9-]{2,40}"
                className={inputClass}
              />
            </Campo>
            <Campo id="name" label={nombre ?? ""}>
              <input id="name" name="name" required maxLength={80} className={inputClass} />
            </Campo>
            <Casilla id="isRehearsal" name="isRehearsal" label={ensayo ?? ""} />
            <div>
              <AdminSubmitButton className="boton-primario min-h-11">
                {t("T-2803")}
              </AdminSubmitButton>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
