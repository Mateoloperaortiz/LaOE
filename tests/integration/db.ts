import { and, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { badgeDefinition } from "@/modules/participation/schema";
import { clearConfigCache } from "@/modules/system/domain/config";
import { appConfig } from "@/modules/system/schema";

// Deja las tablas vacías entre pruebas. El vaciado alcanza a app_config y badge_definition, como a toda
// tabla de `public` que no sea un catálogo de cargos, así que esos dos catálogos de las migraciones se
// restauran después.
// Los valores de la migración 0030: una prueba que activa gamificación no debe filtrarlo a la siguiente.
const GAMIFICATION_SEED: Record<string, unknown> = {
  "gamification.enabled": false,
  "gamification.caps": { daily: 20, weekly: 60 },
  "gamification.defaults": { trivia: 5, presential: 10, evidence: 10, passPercent: 80 },
};

// Claves que ninguna migración siembra y que una prueba puede dejar escritas (ADR-115 reglas 5 y 6):
// no se restauran, o el margen o el corte por cuota de una prueba le quedarían a la siguiente.
const UNSEEDED = new Set([
  "campaigns.transactionalReserve",
  "campaigns.quotaCut",
  "campaigns.quotaExhaustedAt",
]);

// Los catálogos de cargos: los llenan las migraciones y el vaciado no los toca. Son los únicos nombres
// de tabla escritos en este archivo, y `tests/unit/test-emptying-table-names.test.ts` no admite otros
// que los catálogos de migración. No se pueden deducir: las migraciones también llenan `page` y
// `event` con filas literales, y esas sí se vacían. Un catálogo nuevo que una migración llene se suma
// acá; si no, queda vacío y su prueba falla a la vista.
const KEPT = ["committee_role", "macroevent_role"];

/**
 * Las tablas que se vacían: las de `public` menos los catálogos de cargos (ADR-124 regla 1). La lista
 * sale de PostgreSQL en cada vaciado, así que una tabla nueva entra sola, referencie o no a otra. El
 * filtro por esquema importa: en la misma base viven `drizzle`, con el registro de migraciones, y los
 * esquemas que crea `e2e-baseline.test.ts`. Los nombres salen con su esquema, para que las sentencias
 * alcancen lo mismo que el filtro.
 */
async function tablesToEmpty(): Promise<string[]> {
  const { rows } = await getDb().execute<{ name: string }>(sql`
    select format('%I.%I', schemaname, tablename) as name
    from pg_tables
    where schemaname = 'public'
      and tablename not in (${sql.join(
        KEPT.map((table) => sql`${table}`),
        sql`, `,
      )})
    order by 1
  `);
  return rows.map((row) => row.name);
}

export async function truncateAll(): Promise<void> {
  const db = getDb();
  const config = (await db.select().from(appConfig)).filter((row) => !UNSEEDED.has(row.key));
  // Solo el catálogo sembrado: las ediciones especiales de una prueba referencian
  // ocasiones/retos que el vaciado borra y no deben sobrevivir.
  const badges = await db
    .select()
    .from(badgeDefinition)
    .where(
      and(isNull(badgeDefinition.specialChallengeId), isNull(badgeDefinition.specialOccasionId)),
    );
  const tables = await tablesToEmpty();
  // Borrar y no truncar: `TRUNCATE` le crea a PostgreSQL un archivo nuevo por tabla, por TOAST y por
  // índice en cada prueba, y la suite le dejaba al checkpoint siguiente cerca de un millón (DT-188).
  // Todo en una transacción. Sin los disparadores de las claves foráneas el orden entre tablas no
  // importa (el PostgreSQL de pruebas usa un superusuario, como la E2E), y el candado es el que tomaba
  // `TRUNCATE`, así que sigue esperando a lo que una prueba anterior dejó escribiendo. Una sola
  // sentencia borra todas y devuelve cuáles tenían filas.
  const used = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('session_replication_role', 'replica', true)`);
    await tx.execute(sql.raw(`lock table ${tables.join(", ")} in access exclusive mode`));
    const { rows } = await tx.execute<{ name: string }>(
      sql.raw(`with ${tables.map((table, index) => `d${index} as (delete from ${table} returning 1)`).join(", ")}
        ${tables.map((table, index) => `select '${table}' as name where exists (select 1 from d${index})`).join(" union all ")}`),
    );
    return rows.map((row) => row.name);
  });
  // `VACUUM` devuelve a cero páginas las tablas que tenían filas, sin darles un archivo nuevo: las
  // filas de la prueba siguiente vuelven a quedar en el orden en que se insertan, como tras un truncado.
  // Sin esto el orden físico deja de coincidir con el de inserción y una prueba que lee sin `order by`
  // se vuelve inestable.
  if (used.length > 0) {
    await db.execute(sql.raw(`vacuum ${used.join(", ")}`));
  }
  if (config.length > 0) {
    await db
      .insert(appConfig)
      .values(
        config.map((row) => ({
          key: row.key,
          value:
            row.key === "privacy.policyVersion"
              ? "prueba-v1"
              : (GAMIFICATION_SEED[row.key] ?? row.value),
        })),
      )
      .onConflictDoNothing();
  }
  if (badges.length > 0) {
    await db.insert(badgeDefinition).values(badges).onConflictDoNothing();
  }
  clearConfigCache();
}
