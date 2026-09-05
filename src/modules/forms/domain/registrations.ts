import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getEdition, listEditions } from "@/modules/events";
import { getPeopleByIds } from "@/modules/people";
import { editionRegistration } from "../schema";

// Inscripciones a ediciones (ADR-013, ADR-037 regla 5): nacen de la acción `editionId` de un formulario.

export type RegistrationRecord = typeof editionRegistration.$inferSelect;

export interface RegistrationRow extends RegistrationRecord {
  fullName: string;
  email: string;
  editionName: string;
}

export interface RegistrationListParams {
  editionId: string;
  q: string;
  page: number;
  pageSize: number;
}

/** Inscritos de una edición con nombre y correo; la búsqueda filtra por nombre o correo en la página completa. */
export async function listRegistrations(
  params: RegistrationListParams,
): Promise<{ rows: RegistrationRow[]; total: number }> {
  const [rows, edition] = await Promise.all([
    getDb()
      .select()
      .from(editionRegistration)
      .where(eq(editionRegistration.editionId, params.editionId))
      .orderBy(desc(editionRegistration.createdAt)),
    getEdition(params.editionId),
  ]);
  const people = await getPeopleByIds(rows.map((row) => row.personId));
  const needle = params.q.trim().toLowerCase();
  const all = rows
    .map((row) => ({
      ...row,
      fullName: people.get(row.personId)?.fullName ?? "",
      email: people.get(row.personId)?.email ?? "",
      editionName: edition?.name ?? "",
    }))
    .filter(
      (row) =>
        !needle ||
        row.fullName.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle),
    );
  const start = (params.page - 1) * params.pageSize;
  return { rows: all.slice(start, start + params.pageSize), total: all.length };
}

export async function getRegistration(id: string): Promise<RegistrationRow | null> {
  const [row] = await getDb()
    .select()
    .from(editionRegistration)
    .where(eq(editionRegistration.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  const [people, edition] = await Promise.all([
    getPeopleByIds([row.personId]),
    getEdition(row.editionId),
  ]);
  return {
    ...row,
    fullName: people.get(row.personId)?.fullName ?? "",
    email: people.get(row.personId)?.email ?? "",
    editionName: edition?.name ?? "",
  };
}

/** Inscripciones de una persona con el nombre de la edición (pestaña Formularios de la 360, edición pública). */
export async function listRegistrationsByPerson(
  personId: string,
): Promise<
  Array<RegistrationRecord & { editionName: string; eventSlug: string; editionSlug: string }>
> {
  const rows = await getDb()
    .select()
    .from(editionRegistration)
    .where(eq(editionRegistration.personId, personId))
    .orderBy(desc(editionRegistration.createdAt));
  if (rows.length === 0) {
    return [];
  }
  const editions = await listEditions({ q: "", page: 1, pageSize: 10_000 });
  const byId = new Map(editions.rows.map((edition) => [edition.id, edition]));
  return rows.map((row) => {
    const edition = byId.get(row.editionId);
    return {
      ...row,
      editionName: edition ? `${edition.eventName} · ${edition.name}` : "",
      eventSlug: edition?.eventSlug ?? "",
      editionSlug: edition?.slug ?? "",
    };
  });
}

/** Cuántos inscritos vigentes tiene cada edición (columna del admin de ediciones). */
export async function countRegistrationsByEdition(
  editionIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (editionIds.length === 0) {
    return map;
  }
  const rows = await getDb()
    .select({ editionId: editionRegistration.editionId, n: count() })
    .from(editionRegistration)
    .where(inArray(editionRegistration.editionId, editionIds))
    .groupBy(editionRegistration.editionId);
  for (const row of rows) {
    map.set(row.editionId, row.n);
  }
  return map;
}

/** Si la persona ya está inscrita a la edición (botón T-869 en la edición pública). */
export async function isRegistered(editionId: string, personId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: editionRegistration.id })
    .from(editionRegistration)
    .where(
      and(eq(editionRegistration.editionId, editionId), eq(editionRegistration.personId, personId)),
    )
    .limit(1);
  return row !== undefined;
}
