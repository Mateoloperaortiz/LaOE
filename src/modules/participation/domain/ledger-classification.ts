import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import type { GamerGame } from "../gamer-types";

/** El mismo origen legado decide la exclusión GH y la inclusión en Más gamer. */
export function legacyGamerKind(column: SQLWrapper): SQL<GamerGame | null> {
  return sql<GamerGame | null>`case upper(trim(coalesce(${column}, '')))
    when 'WORDLE' then 'WORDLE'
    when 'GAME2048' then 'GAME2048'
    when '2048' then 'GAME2048'
    when 'SUDOKU' then 'SUDOKU'
    when 'PANAL' then 'PANAL'
    else null end`;
}

/**
 * Una sola clasificación para todos los saldos GH. El puntaje interno de los juegos conserva su
 * historial; una reversión pertenece a la misma competencia que su entrada original. No se
 * adivina el origen de un ajuste por su motivo.
 */
export const ghPointCondition = sql`(
  not exists (
    select 1 from point_entry color_origin
    where color_origin.id = coalesce(point_entry.reversal_of_id, point_entry.id)
      and color_origin.kind::text = 'COLOR'
  )
  and (
  exists (select 1 from term historical_term
    where historical_term.id = point_entry.term_id and not historical_term.game_points_separated)
  or not exists (
  select 1 from point_entry origin
  where origin.id = coalesce(point_entry.reversal_of_id, point_entry.id)
    and (
      origin.kind::text in ('WORDLE', 'GAME2048', 'SUDOKU', 'PANAL')
      or (origin.kind::text = 'LEGACY' and ${legacyGamerKind(sql`origin.legacy_type`)} is not null)
    )
)))`;
