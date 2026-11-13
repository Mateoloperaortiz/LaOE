import { and, asc, eq, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { savedView } from "../schema";

// Vistas guardadas de las tablas de la Operación (ADR-170 regla 1): una tabla del kit con su búsqueda,
// sus filtros y sus columnas, guardada con un nombre. Es de quien la guarda o se comparte con todos los
// que pueden abrir esa tabla, que vuelve a exigir su permiso. Solo guarda la dirección: nunca filas.

export const SAVED_VIEW_NAME_MAX = 60;
export const SAVED_VIEWS_PER_TABLE = 20;
const TABLE_PATH = /^\/admin(\/[a-z0-9-]+)+$/;
const QUERY_MAX = 1000;

export interface SavedViewRow {
  id: string;
  ownerId: string;
  basePath: string;
  name: string;
  query: string;
  shared: boolean;
}

/** Las vistas de una tabla que ve una persona: las suyas y las compartidas, por nombre. */
export async function listSavedViews(personId: string, basePath: string): Promise<SavedViewRow[]> {
  return getDb()
    .select({
      id: savedView.id,
      ownerId: savedView.ownerId,
      basePath: savedView.basePath,
      name: savedView.name,
      query: savedView.query,
      shared: savedView.shared,
    })
    .from(savedView)
    .where(
      and(
        eq(savedView.basePath, basePath),
        or(eq(savedView.ownerId, personId), eq(savedView.shared, true)),
      ),
    )
    .orderBy(asc(savedView.name));
}

/** La dirección que se guarda: sin el registro abierto, la página ni avisos de un momento. */
export function savedViewQuery(raw: string): string {
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  for (const key of ["editar", "nuevo", "guardado", "error", "pagina", "vista", "lote", "ids"]) {
    params.delete(key);
  }
  params.sort();
  return params.toString();
}

export async function saveView(
  ctx: CommandContext,
  input: { basePath: string; name: string; query: string; shared: boolean },
): Promise<{ id: string }> {
  const ownerId = ctx.actor.personId;
  if (!ownerId) {
    throw new DomainError(t("T-032"));
  }
  const name = input.name.trim();
  if (name.length < 2 || name.length > SAVED_VIEW_NAME_MAX) {
    throw new DomainError(t("T-4932"), "name");
  }
  if (!TABLE_PATH.test(input.basePath)) {
    throw new DomainError(t("T-032"));
  }
  const query = savedViewQuery(input.query);
  if (query.length > QUERY_MAX) {
    throw new DomainError(t("T-4932"), "name");
  }
  const mine = await ctx.tx
    .select({ id: savedView.id })
    .from(savedView)
    .where(and(eq(savedView.ownerId, ownerId), eq(savedView.basePath, input.basePath)));
  if (mine.length >= SAVED_VIEWS_PER_TABLE) {
    throw new DomainError(t("T-4933", { n: SAVED_VIEWS_PER_TABLE }), "name");
  }
  try {
    const [row] = await ctx.tx
      .insert(savedView)
      .values({
        ownerId,
        basePath: input.basePath,
        name,
        query,
        shared: input.shared,
      })
      .returning({ id: savedView.id });
    if (!row) throw new Error("No se pudo guardar la vista");
    await ctx.audit({
      action: "saved-view.created",
      entityType: "saved_view",
      entityId: row.id,
      after: { basePath: input.basePath, name, query, shared: input.shared },
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "saved_view_owner_table_name_unique")) {
      throw new DomainError(t("T-4934"), "name");
    }
    throw error;
  }
}

/** Solo quien la guardó la borra; una compartida deja de verse para todos. */
export async function deleteSavedView(ctx: CommandContext, id: string): Promise<void> {
  const ownerId = ctx.actor.personId;
  if (!ownerId) {
    throw new DomainError(t("T-032"));
  }
  const [row] = await ctx.tx
    .delete(savedView)
    .where(and(eq(savedView.id, id), eq(savedView.ownerId, ownerId)))
    .returning({ id: savedView.id, name: savedView.name, basePath: savedView.basePath });
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  await ctx.audit({
    action: "saved-view.deleted",
    entityType: "saved_view",
    entityId: row.id,
    before: { basePath: row.basePath, name: row.name },
  });
}

/** Al anonimizar a una persona se van sus vistas, también las que compartió (ADR-170 regla 1). */
export async function deleteSavedViewsOf(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(savedView)
    .where(eq(savedView.ownerId, personId))
    .returning({ id: savedView.id });
  return rows.length;
}

/** Guardar una vista desde la Operación, con el actor del request (ADR-082 regla 2). */
export function saveViewAs(
  actor: Actor,
  input: { basePath: string; name: string; query: string; shared: boolean },
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => saveView(ctx, input));
}

/** Borrar una vista propia desde la Operación. */
export function deleteSavedViewAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => deleteSavedView(ctx, id));
}
