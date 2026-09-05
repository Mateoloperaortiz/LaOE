import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pipeline } from "../schema";

// Pipelines (02-crm.md, ADR-037): lecturas mínimas; los comandos y el kanban llegan en el tramo 4.

/** Ids de los pipelines de admisión activos: `/unirse` busca con ellos la convocatoria abierta. */
export async function listAdmissionPipelineIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: pipeline.id })
    .from(pipeline)
    .where(and(eq(pipeline.kind, "ADMISSION"), eq(pipeline.isArchived, false)));
  return rows.map((row) => row.id);
}

/** Opciones para el constructor de formularios (acción "entrar al pipeline"). */
export async function listPipelineOptions(): Promise<
  Array<{ id: string; name: string; kind: "ADMISSION" | "SPONSORSHIP" | "CUSTOM" }>
> {
  return getDb()
    .select({ id: pipeline.id, name: pipeline.name, kind: pipeline.kind })
    .from(pipeline)
    .where(eq(pipeline.isArchived, false))
    .orderBy(asc(pipeline.name));
}
