import type { Metadata } from "next";
import Link from "next/link";
import { listRecognitionsByPeople, monthName, type RecognitionView } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import { listDirectory, listInternalCommittees } from "@/modules/people";
import { t, tList } from "@/shared/copy";
import { cargoEnComite, cargoEtiqueta, PersonaTarjeta } from "../_ui/PersonaTarjeta";
import { Vacio } from "../_ui/Vacio";

// Directorio de Mi OE (06-mapa-del-sitio.md): nombre, foto con consentimiento, comités del término con
// el cargo y cargos de junta. Sin correos. Búsqueda por nombre y filtro por comité.

export const metadata: Metadata = { title: t("T-070") };

const PAGE_SIZE = 24;

export default async function PersonasPage({ searchParams }: PageProps<"/app/personas">) {
  await requireActor("/app/personas");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const comite = typeof params.comite === "string" ? params.comite : "";
  const pagina = Math.max(1, Number.parseInt(String(params.pagina ?? "1"), 10) || 1);
  const [directory, committees] = await Promise.all([
    listDirectory({ q, committeeId: comite || null, page: pagina, pageSize: PAGE_SIZE }),
    listInternalCommittees(),
  ]);
  const term = directory.term;
  const recognitions = term
    ? await listRecognitionsByPeople(
        directory.rows.map((entry) => entry.personId),
        term.id,
      )
    : new Map<string, RecognitionView[]>();
  const insigniasDe = (personId: string) =>
    (recognitions.get(personId) ?? [])
      .filter((item) => item.announcementId !== null && item.kind === "MEMBER_OF_MONTH")
      .map((item) => t("T-703", { mes: monthName(item.month) }));
  const pages = Math.max(1, Math.ceil(directory.total / PAGE_SIZE));
  const [anterior, siguiente] = tList("T-258") as [string, string];
  const link = (page: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (comite) query.set("comite", comite);
    if (page > 1) query.set("pagina", String(page));
    const qs = query.toString();
    return `/app/personas${qs ? `?${qs}` : ""}`;
  };
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-display-lg">{t("T-070")}</h1>
      <form method="get" className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="eyebrow text-xs">
            {t("T-071")}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            className="w-72 max-w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="comite" className="eyebrow text-xs">
            {t("T-372")}
          </label>
          <select
            id="comite"
            name="comite"
            defaultValue={comite}
            className="rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none"
          >
            <option value="">{t("T-373")}</option>
            {committees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="boton-secundario">
          {t("T-250")}
        </button>
      </form>
      {directory.rows.length === 0 ? (
        <Vacio texto={t("T-371")} elemento="asterisco" color="text-oe-navy" />
      ) : (
        <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {directory.rows.map((entry) => (
            <li key={entry.personId}>
              <PersonaTarjeta
                nombre={entry.fullName}
                fotoId={entry.photoAssetId}
                estado={entry.status}
                comites={entry.committees.map((item) => cargoEnComite(item.roleLabel, item.name))}
                cargos={entry.appointments.map(cargoEtiqueta)}
                insignias={insigniasDe(entry.personId)}
              />
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label={t("T-070")} className="flex items-center gap-4">
          {pagina > 1 ? (
            <Link href={link(pagina - 1)} className="boton-secundario text-sm">
              {anterior}
            </Link>
          ) : null}
          <span className="text-sm text-tinta-suave">
            {pagina} / {pages}
          </span>
          {pagina < pages ? (
            <Link href={link(pagina + 1)} className="boton-secundario text-sm">
              {siguiente}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
