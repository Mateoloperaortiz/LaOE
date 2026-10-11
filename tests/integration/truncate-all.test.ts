import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { getConfig } from "@/modules/system";
import { heldThenSettled, holdTransaction } from "../helpers/locks";
import { truncateAll } from "./db";

// Lo que el vaciado de la base de pruebas deja hoy, antes de cambiar de dónde saca su lista y cómo
// restaura los catálogos (spec #244, DT-030 y DT-149 inciso e). Varias de estas pruebas fijan un
// defecto conocido, que una prueba le hereda la configuración o un cargo a la siguiente: el ticket que
// lo corrija las cambia a propósito.

// Los catálogos que llenan las migraciones y sobreviven al vaciado. Los dos primeros se borran y se
// vuelven a escribir; a los de cargos el vaciado no llega. Las migraciones también llenan `page` y
// `event`, y esas sí quedan vacías.
const REWRITTEN = ["app_config", "badge_definition"];
const UNTOUCHED = ["committee_role", "macroevent_role"];
const CATALOGS = [...REWRITTEN, ...UNTOUCHED];

// Dónde deja la preparación de la suite la foto de los catálogos (ADR-124 regla 2): escrito acá y no
// leído del vaciado.
const BASELINE = "catalog_baseline";

// Los valores de la migración 0030, escritos acá y no leídos del vaciado.
const GAMIFICATION_AT_MIGRATION = {
  "gamification.enabled": false,
  "gamification.caps": { daily: 20, weekly: 60 },
  "gamification.defaults": { trivia: 5, presential: 10, evidence: 10, passPercent: 80 },
};

// Las que ninguna migración siembra (ADR-115 reglas 5 y 6), con un valor cualquiera.
const CAMPAIGNS_UNSEEDED = {
  "campaigns.transactionalReserve": 7,
  "campaigns.quotaCut": { at: "2026-01-01T00:00:00.000Z" },
  "campaigns.quotaExhaustedAt": "2026-01-01T00:00:00.000Z",
};

// Lo que la fila de relleno no adivina: los valores que piden los CHECK de estas tablas. Una tabla
// nueva cuyo CHECK rechace el relleno pone la prueba en rojo con el nombre de la restricción, y se
// suma acá.
const DIGITS = "123456789".repeat(9);
const CHECKED: Record<string, Record<string, string>> = {
  boost_campaign: { percent: "25", challenge_id: "'x'" },
  budget_prerequest: { month: "'2026-01'" },
  card: { person_id: "'x'" },
  challenge: { occasion_id: "'x'" },
  challenge_evidence_file: { object_key: "'evidence/aaaaaaaaaa/bbbbbbbbbb.jpg'" },
  challenge_question: { options: `'["a", "b"]'` },
  committee_budget: { year: "2026" },
  competition_extra_jury_score: { scores: "'{5,5,5,5,5}'" },
  competition_point_entry: { result_id: "'x'" },
  competition_rotation: { planned_seconds: "60" },
  document_article: { number: "1" },
  game2048_run: { seed: "'0123456789abcdef'" },
  interaction: { person_id: "'x'" },
  occasion: { public_id: "'0123456789'" },
  panal_word: { word: "'PANAL'" },
  recognition: { committee_id: "'x'", month: "1" },
  reward: { participation_id: "'x'" },
  sudoku_run: { seed: "'0123456789abcdef'", givens: `'${DIGITS}'`, solution: `'${DIGITS}'` },
  term: { code: "'2026-1'" },
  wordle_attempt: { guess: "'PANAL'", feedback: "'[0, 0, 0, 0, 0]'" },
  wordle_game: { answer: "'PANAL'" },
};

// Un tipo y no una interfaz: es la forma de una fila que devuelve PostgreSQL.
type RequiredColumn = {
  table: string;
  name: string;
  type: string;
  enum: string;
  position: number;
};

async function query<T extends Record<string, unknown>>(text: string, db: Executor = getDb()) {
  return (await db.execute<T>(sql.raw(text))).rows;
}

async function tablesOf(schema: string): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `select tablename as name from pg_tables where schemaname = '${schema}' order by 1`,
  );
  return rows.map((row) => row.name);
}

function publicTables(): Promise<string[]> {
  return tablesOf("public");
}

async function tablesWithRows(): Promise<string[]> {
  const rows = await query<{ name: string }>(
    (await publicTables())
      .map((table) => `select '${table}' as name where exists (select 1 from "${table}")`)
      .join(" union all "),
  );
  return rows.map((row) => row.name).sort();
}

/** Las tablas cuyo archivo principal tiene alguna página. */
async function tablesWithPages(): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `select relname as name from pg_class
     where relnamespace = 'public'::regnamespace and relkind = 'r' and pg_relation_size(oid) > 0
     order by 1`,
  );
  return rows.map((row) => row.name);
}

/** El archivo de cada tabla, índice y TOAST de `public`: cambia si se le crea uno nuevo. */
async function fileNodes(): Promise<Record<string, string>> {
  const rows = await query<{ relation: string; filenode: string }>(
    `with own as (select oid, reltoastrelid from pg_class where relnamespace = 'public'::regnamespace),
          toast as (select reltoastrelid as oid from own where reltoastrelid <> 0),
          toast_index as (select indexrelid as oid from pg_index where indrelid in (select oid from toast))
     select c.oid::regclass::text as relation, pg_relation_filenode(c.oid)::text as filenode
     from pg_class c
     where c.relkind in ('r', 'i', 't')
       and c.oid in (select oid from own union select oid from toast union select oid from toast_index)
     order by 1`,
  );
  return Object.fromEntries(rows.map(({ relation, filenode }) => [relation, filenode]));
}

/**
 * Un valor cualquiera del tipo. Los textos y las fechas llevan la posición de su columna, así dos
 * textos de una fila no coinciden y una ventana queda con su apertura antes de su cierre.
 */
function anyValue(column: RequiredColumn): string {
  switch (column.type) {
    case "text":
      return `'x${column.position}'`;
    case "integer":
    case "numeric":
      return "1";
    case "boolean":
      return "false";
    case "date":
      return `date '2026-01-01' + ${column.position}`;
    case "timestamp with time zone":
      return `timestamptz '2026-01-01 00:00+00' + interval '${column.position} hours'`;
    case "jsonb":
    case "ARRAY":
      return "'{}'";
    case "USER-DEFINED":
      return `(enum_range(null::"${column.enum}"))[1]`;
    default:
      throw new Error(
        `La fila de relleno no sabe llenar ${column.table}.${column.name} (${column.type})`,
      );
  }
}

/**
 * Le pone una fila a cada tabla sin pasar por ningún comando: solo las columnas obligatorias y sin
 * claves foráneas, que es un estado que el dominio no produce y acá hace falta para tocarlas todas.
 * Va dentro de una transacción: el permiso para saltarse las claves foráneas es solo de ella.
 */
async function fill(
  tx: Executor,
  tables: string[],
  extra: Record<string, string> = {},
): Promise<void> {
  await tx.execute(sql`select set_config('session_replication_role', 'replica', true)`);
  const required = await query<RequiredColumn>(
    `select table_name as "table", column_name as name, data_type as type, udt_name as enum,
            ordinal_position::int as position
     from information_schema.columns
     where table_schema = 'public' and is_nullable = 'NO' and column_default is null
       and is_generated = 'NEVER'
     order by table_name, ordinal_position`,
    tx,
  );
  for (const table of tables) {
    const values = {
      ...Object.fromEntries(
        required
          .filter((column) => column.table === table)
          .map((column) => [column.name, anyValue(column)]),
      ),
      ...CHECKED[table],
      ...extra,
    };
    const names = Object.keys(values).map((name) => `"${name}"`);
    await query(
      `insert into "${table}" (${names.join(", ")}) values (${Object.values(values).join(", ")})`,
      tx,
    );
  }
}

async function fillEveryTableButTheCatalogs(): Promise<void> {
  const tables = (await publicTables()).filter((table) => !CATALOGS.includes(table));
  await getDb().transaction((tx) => fill(tx, tables));
}

/** Las filas de un catálogo, enteras y en orden: lo que se compara antes y después de vaciar. */
async function rowsOf(table: string, schema = "public"): Promise<unknown[]> {
  const [found] = await query<{ rows: unknown[] }>(
    `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]') as rows from "${schema}"."${table}" t`,
  );
  return found?.rows ?? [];
}

async function config(schema = "public"): Promise<Record<string, unknown>> {
  const rows = await query<{ key: string; value: unknown }>(
    `select key, value from "${schema}".app_config`,
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

/**
 * Escribe la clave en la base sin avisarle a la caché, con un autor y una fecha vieja: el autor es una
 * persona que no existe, y por eso va sin claves foráneas.
 */
async function writeKey(key: string, value: unknown): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('session_replication_role', 'replica', true)`);
    await tx.execute(sql`
      insert into app_config (key, value, updated_by_id, updated_at)
      values (${key}, ${JSON.stringify(value)}::jsonb, 'alguien', timestamptz '2020-01-01 00:00+00')
      on conflict (key) do update
        set value = excluded.value, updated_by_id = excluded.updated_by_id, updated_at = excluded.updated_at
    `);
  });
}

let found: Record<string, unknown[]>;

beforeAll(async () => {
  await truncateAll();
  found = Object.fromEntries(
    await Promise.all(CATALOGS.map(async (table) => [table, await rowsOf(table)] as const)),
  );
});

// Este archivo cambia a propósito lo que el vaciado no devuelve a su valor: sin esto, el cargo y la
// configuración de sus pruebas les quedarían a todos los archivos que corran después.
afterEach(async () => {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('session_replication_role', 'replica', true)`);
    for (const table of CATALOGS) {
      const name = sql.identifier(table);
      await tx.execute(sql`delete from ${name}`);
      await tx.execute(
        sql`insert into ${name} select * from jsonb_populate_recordset(null::${name}, ${JSON.stringify(found[table])}::jsonb)`,
      );
    }
  });
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe("el vaciado de la base entre pruebas", () => {
  it("deja sin filas cada tabla de public, menos los cuatro catálogos que llenan las migraciones", async () => {
    await fillEveryTableButTheCatalogs();
    expect(await tablesWithRows()).toEqual(await publicTables());

    await truncateAll();

    expect(await tablesWithRows()).toEqual(CATALOGS);
  });

  it("no toca los catálogos de cargos: el cargo que una prueba creó le queda a la siguiente (DT-149 e)", async () => {
    await getDb().transaction((tx) => fill(tx, UNTOUCHED));
    const committee = await rowsOf("committee_role");
    const macroevent = await rowsOf("macroevent_role");
    expect(committee).toHaveLength((found.committee_role?.length ?? 0) + 1);
    expect(macroevent).toHaveLength((found.macroevent_role?.length ?? 0) + 1);

    await truncateAll();

    expect(await rowsOf("committee_role")).toEqual(committee);
    expect(await rowsOf("macroevent_role")).toEqual(macroevent);
  });

  it("vuelve a escribir la configuración con el valor que dejó la prueba anterior, sin su autor ni su fecha (DT-149 e)", async () => {
    const before = await config();
    await writeKey("score.shrinkK", 9);

    await truncateAll();

    expect(await config()).toEqual({ ...before, "score.shrinkK": 9 });
    expect(
      await query(
        `select updated_by_id as author, updated_at > timestamptz '2020-01-02' as rewritten
         from app_config where key = 'score.shrinkK'`,
      ),
    ).toEqual([{ author: null, rewritten: true }]);
  });

  it("deja la versión de la política de privacidad en su valor de prueba, traiga el que traiga", async () => {
    await writeKey("privacy.policyVersion", "otra-v9");

    await truncateAll();

    expect((await config())["privacy.policyVersion"]).toBe("prueba-v1");
  });

  it("devuelve las tres claves de gamificación al valor de su migración", async () => {
    await writeKey("gamification.enabled", true);
    await writeKey("gamification.caps", { daily: 1, weekly: 2 });
    await writeKey("gamification.defaults", {
      trivia: 1,
      presential: 2,
      evidence: 3,
      passPercent: 4,
    });

    await truncateAll();

    expect(await config()).toMatchObject(GAMIFICATION_AT_MIGRATION);
  });

  it("no vuelve a escribir las tres claves de campañas que ninguna migración siembra", async () => {
    const before = await config();
    for (const [key, value] of Object.entries(CAMPAIGNS_UNSEEDED)) {
      await writeKey(key, value);
    }
    expect(await config()).toEqual({ ...before, ...CAMPAIGNS_UNSEEDED });

    await truncateAll();

    expect(Object.keys(await config()).filter((key) => key in CAMPAIGNS_UNSEEDED)).toEqual([]);
    expect(await config()).toEqual(before);
  });

  it("no repone la clave que una prueba borró, ni siquiera las que vuelve a su valor", async () => {
    const deleted = ["privacy.policyVersion", "gamification.enabled", "score.shrinkK"];
    const kept = Object.entries(await config()).filter(([key]) => !deleted.includes(key));
    expect(kept).toHaveLength(Object.keys(await config()).length - deleted.length);
    await query(`delete from app_config where key in ('${deleted.join("', '")}')`);

    await truncateAll();

    expect(await config()).toEqual(Object.fromEntries(kept));
  });

  it("conserva las insignias que no son edición especial como la prueba las dejó, y saca las ediciones especiales", async () => {
    await query(
      "update badge_definition set active = false where code = (select min(code) from badge_definition)",
    );
    const left = await rowsOf("badge_definition");
    expect(left.length).toBeGreaterThan(0);
    await getDb().transaction(async (tx) => {
      const special = { family: "'SPECIAL'" };
      await fill(tx, ["badge_definition"], {
        ...special,
        id: "'de-reto'",
        code: "'de-reto'",
        special_challenge_id: "'x'",
      });
      await fill(tx, ["badge_definition"], {
        ...special,
        id: "'de-ocasion'",
        code: "'de-ocasion'",
        special_occasion_id: "'x'",
      });
    });
    expect(await rowsOf("badge_definition")).toHaveLength(left.length + 2);

    await truncateAll();

    expect(await rowsOf("badge_definition")).toEqual(left);
  });

  it("limpia la caché de configuración: la lectura siguiente sale de la base", async () => {
    const cached = await getConfig("score.shrinkK");
    await writeKey("score.shrinkK", (cached ?? 0) + 4);
    expect(await getConfig("score.shrinkK")).toBe(cached);

    await truncateAll();

    expect(await getConfig("score.shrinkK")).toBe((cached ?? 0) + 4);
  });

  it("espera a la transacción que todavía escribe en una de sus tablas, en vez de fallar, y no deja su fila", async () => {
    const writing = await holdTransaction((tx) => fill(tx, ["tag"]));

    const emptying = await heldThenSettled(writing, () => truncateAll());

    expect(emptying.during).toBe("hizo cola");
    expect(emptying.after.status).toBe("fulfilled");
    expect(await tablesWithRows()).toEqual(CATALOGS);
  });

  it("no le estrena archivo a ninguna tabla, índice ni TOAST, y deja sin páginas las tablas que tenían filas (ADR-119 regla 23)", async () => {
    await fillEveryTableButTheCatalogs();
    const files = await fileNodes();
    expect(await tablesWithPages()).toEqual(await publicTables());

    await truncateAll();

    expect(await fileNodes()).toEqual(files);
    expect(await tablesWithPages()).toEqual(CATALOGS);
  });
});

describe("la foto de los catálogos que toma la preparación de la suite", () => {
  it("vive fuera de public y cubre solo los cuatro catálogos: no las páginas ni los eventos que una migración también llena", async () => {
    expect(await tablesOf(BASELINE)).toEqual(CATALOGS);
  });

  it("guarda la configuración de las migraciones, con la versión de la política de privacidad en su valor de prueba", async () => {
    const photographed = await config(BASELINE);

    expect(photographed).toMatchObject({
      ...GAMIFICATION_AT_MIGRATION,
      "privacy.policyVersion": "prueba-v1",
    });
    expect(Object.keys(photographed).filter((key) => key in CAMPAIGNS_UNSEEDED)).toEqual([]);
    expect(
      await query(
        `select key from "${BASELINE}".app_config where updated_by_id is not null order by 1`,
      ),
    ).toEqual([]);
  });

  it("guarda los cargos y las insignias de las migraciones, sin ninguna edición especial", async () => {
    for (const table of ["badge_definition", ...UNTOUCHED]) {
      expect(await rowsOf(table, BASELINE), table).not.toEqual([]);
    }
    expect(
      await query(
        `select code from "${BASELINE}".badge_definition
         where special_challenge_id is not null or special_occasion_id is not null`,
      ),
    ).toEqual([]);
  });
});
