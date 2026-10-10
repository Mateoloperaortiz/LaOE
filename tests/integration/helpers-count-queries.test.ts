import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { term } from "@/modules/terms/schema";
import { countQueries } from "../helpers/queries";
import { truncateAll } from "./db";
import { seedTerm } from "./factories";

// El ayudante que cuenta consultas (ciclo 8, DT-224, DT-225 y DT-294): lo que afirma una prueba de
// «esta lectura hace N consultas» vale lo que valga esta cuenta.

const db = () => getDb();

describe("ayudante que cuenta las consultas de una lectura", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("cuenta cada consulta en el orden en que salió, con su SQL sin valores y las filas que trajo", async () => {
    await seedTerm("2019-1");
    await seedTerm("2019-2");
    await seedTerm("2020-1");

    const { result, queries } = await countQueries(async () => {
      const one = await db().execute(sql`select 1 as uno`);
      const old = await db().select().from(term).where(sql`${term.code} like ${"2019-%"}`);
      return [one.rows.length, old.length];
    });

    expect(result).toEqual([1, 2]);
    expect(queries.map((query) => query.rows)).toEqual([1, 2]);
    expect(queries[0]?.text).toBe("select 1 as uno");
    expect(queries[1]?.text).toContain('from "term"');
    expect(queries[1]?.text).toContain("$1");
    expect(queries[1]?.text).not.toContain("2019");
  });

  it("cuenta por separado las consultas que salen a la vez", async () => {
    const { queries } = await countQueries(() =>
      Promise.all([
        db().execute(sql`select 1`),
        db().execute(sql`select 2`),
        db().execute(sql`select 3`),
      ]),
    );

    expect(queries.map((query) => query.text).sort()).toEqual(["select 1", "select 2", "select 3"]);
  });

  it("cuenta las de una transacción con su begin y su commit", async () => {
    const { queries } = await countQueries(() =>
      db().transaction(async (tx) => {
        await tx.execute(sql`select 1`);
      }),
    );

    expect(queries.map((query) => query.text)).toEqual(["begin", "select 1", "commit"]);
  });

  it("una función que no consulta cuenta cero y devuelve lo suyo", async () => {
    await db().execute(sql`select 1`);

    const { result, queries } = await countQueries(async () => "sin base");

    expect(result).toBe("sin base");
    expect(queries).toEqual([]);
  });

  it("deja de contar al terminar, también cuando la función falla", async () => {
    const original = Client.prototype.query;
    const seen: string[] = [];

    await expect(
      countQueries(async () => {
        await db().execute(sql`select 1`);
        throw new Error("falla de la lectura");
      }).then(({ queries }) => seen.push(...queries.map((query) => query.text))),
    ).rejects.toThrow("falla de la lectura");
    expect(Client.prototype.query).toBe(original);

    const { queries } = await countQueries(async () => {
      await db().execute(sql`select 2`);
    });
    await db().execute(sql`select 3`);

    expect(seen).toEqual([]);
    expect(queries.map((query) => query.text)).toEqual(["select 2"]);
  });

  it("una consulta que falla queda contada, sin filas", async () => {
    const { result, queries } = await countQueries(() =>
      db()
        .execute(sql`select 1 from tabla_que_no_existe`)
        .then(
          () => "respondió",
          () => "falló",
        ),
    );

    expect(result).toBe("falló");
    expect(queries).toEqual([{ text: "select 1 from tabla_que_no_existe", rows: 0 }]);
  });
});
