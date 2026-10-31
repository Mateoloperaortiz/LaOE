import type { Metadata } from "next";
import { requireAdminActor } from "@/modules/identity";
import { getPeopleByIds } from "@/modules/people";
import { type ImportJobRow, listImportJobs } from "@/modules/system";
import { listAllTerms } from "@/modules/terms";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";

// Importaciones del roster y ensayos de migración (06-mapa-del-sitio.md): estado y resumen de cada una.

export const metadata: Metadata = { title: t("T-426") };

// Los cuatro grupos de la vista previa, en el orden de T-482.
const IMPORT_GROUPS = ["NEW", "CHANGED", "UNCHANGED", "ERROR"] as const;

const STATUS_INDEX: Record<ImportJobRow["status"], number> = {
  PREVIEW: 0,
  APPLIED: 1,
  DISCARDED: 2,
  FAILED: 3,
};

function numero(summary: Record<string, unknown>, key: string): number {
  const value = summary[key];
  return typeof value === "number" ? value : 0;
}

/** El resumen con las palabras de la vista previa (T-482) o del cierre (T-487). */
function resumen(job: ImportJobRow): string {
  const summary = job.summary as Record<string, unknown>;
  if (job.status === "APPLIED") {
    return t("T-487", { n: numero(summary, "created"), m: numero(summary, "updated") });
  }
  const grupos = tLabels("T-482", IMPORT_GROUPS);
  return IMPORT_GROUPS.map(
    (key) => `${numero(summary, key)} ${(grupos[key] ?? key).toLowerCase()}`,
  ).join(" · ");
}

export default async function ImportacionesPage() {
  await requireAdminActor("/admin/sistema/importaciones");
  const [jobs, terms] = await Promise.all([listImportJobs(), listAllTerms()]);
  const people = await getPeopleByIds(
    jobs.flatMap((job) => (job.createdById ? [job.createdById] : [])),
  );
  const termCode = new Map(terms.map((term) => [term.id, term.code]));
  const columnas = tList("T-492");
  const estados = tList("T-493");
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display-lg">{t("T-426")}</h1>
      {jobs.length === 0 ? (
        <p className="text-tinta-suave">{t("T-256")}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde">
          <table className="admin-data-table w-full text-left text-sm">
            <thead className="eyebrow bg-fondo-suave text-xs">
              <tr>
                {columnas.map((columna) => (
                  <th key={columna} scope="col" className="px-3 py-2">
                    {columna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-borde align-top">
                  <td data-label={columnas[0]} className="px-3 py-2 font-semibold">
                    {job.type === "ROSTER" ? (
                      <Link href={`/admin/personas/importar?job=${job.id}`}>{job.filename}</Link>
                    ) : (
                      job.filename
                    )}
                  </td>
                  <td data-label={columnas[1]} className="px-3 py-2">
                    {job.type}
                  </td>
                  <td data-label={columnas[2]} className="px-3 py-2">
                    {job.termId ? (termCode.get(job.termId) ?? "") : ""}
                  </td>
                  <td data-label={columnas[3]} className="px-3 py-2">
                    <Insignia
                      fondo={
                        job.status === "APPLIED"
                          ? "amarillo"
                          : job.status === "PREVIEW"
                            ? "sky"
                            : "paper"
                      }
                    >
                      {estados[STATUS_INDEX[job.status]] ?? job.status}
                    </Insignia>
                  </td>
                  <td data-label={columnas[4]} className="px-3 py-2 text-xs">
                    {resumen(job)}
                  </td>
                  <td data-label={columnas[5]} className="px-3 py-2">
                    {formatDateTime(job.createdAt)}
                  </td>
                  <td data-label={columnas[6]} className="px-3 py-2">
                    {job.createdById
                      ? (people.get(job.createdById)?.fullName?.trim() ?? "")
                      : t("T-515")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
