import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminActor } from "@/modules/identity";
import { listAllTerms } from "@/modules/participation";
import { getPeopleByIds } from "@/modules/people";
import { type ImportJobRow, listImportJobs } from "@/modules/system";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

// Importaciones del roster y ensayos de migración (06-mapa-del-sitio.md): estado y resumen de cada una.

export const metadata: Metadata = { title: t("T-426") };

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
  const grupos = tList("T-482");
  return (["NEW", "CHANGED", "UNCHANGED", "ERROR"] as const)
    .map((key, index) => `${numero(summary, key)} ${(grupos[index] ?? key).toLowerCase()}`)
    .join(" · ");
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
          <table className="w-full text-left text-sm">
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
                  <td className="px-3 py-2 font-semibold">
                    {job.type === "ROSTER" ? (
                      <Link href={`/admin/personas/importar?job=${job.id}`}>{job.filename}</Link>
                    ) : (
                      job.filename
                    )}
                  </td>
                  <td className="px-3 py-2">{job.type}</td>
                  <td className="px-3 py-2">
                    {job.termId ? (termCode.get(job.termId) ?? "") : ""}
                  </td>
                  <td className="px-3 py-2">
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
                  <td className="px-3 py-2 text-xs">{resumen(job)}</td>
                  <td className="px-3 py-2">{formatDateTime(job.createdAt)}</td>
                  <td className="px-3 py-2">
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
