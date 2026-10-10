import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { getEnv } from "@/env";
import { captureLogs, type LoggedLine, recordsOf } from "../helpers/logs";

// Lo que `/api/health` le responde a cualquiera con la base sin abrir, y lo que deja en el registro
// (DT-159 inciso c, ADR-121 regla 7). Los fallos son los de verdad: el pool de la casa contra un
// puerto cerrado y contra el PostgreSQL de las pruebas con una base y un usuario que no existen.

const USER = "usuario_sintetico_c9";
const DATABASE = "base_sintetica_c9";
const FIELDS = ["status", "version", "commit", "postgres", "latencyMs", "error", "at"];

function testDatabaseWith(change: (url: URL) => void): string {
  const url = new URL(getEnv().DATABASE_URL);
  change(url);
  return url.toString();
}

interface Answer {
  status: number;
  cacheControl: string | null;
  text: string;
  body: Record<string, unknown>;
  lines: LoggedLine[];
}

async function health(): Promise<Answer> {
  const { result, lines } = await captureLogs(async () => {
    const response = await GET();
    const text = await response.text();
    return {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      text,
      body: JSON.parse(text) as Record<string, unknown>,
    };
  });
  return { ...result, lines };
}

/** La salud con el pool de la casa apuntando a `connectionString`; al terminar le devuelve el suyo. */
async function healthAgainst(connectionString: string): Promise<Answer> {
  const house = globalThis as typeof globalThis & { __casaDigitalDb?: unknown };
  const original = house.__casaDigitalDb;
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });
  house.__casaDigitalDb = drizzle({ client: pool, casing: "snake_case" });
  try {
    return await health();
  } finally {
    house.__casaDigitalDb = original;
    await pool.end();
  }
}

const FAILURES: [string, () => string, RegExp][] = [
  [
    "el puerto no responde",
    () => `postgres://${USER}:clave-sintetica@127.0.0.1:1/${DATABASE}`,
    /^ECONNREFUSED$/,
  ],
  [
    "la base no existe",
    () =>
      testDatabaseWith((url) => {
        url.pathname = `/${DATABASE}`;
      }),
    /^3D000$/,
  ],
  [
    "el usuario no entra",
    () =>
      testDatabaseWith((url) => {
        url.username = USER;
        url.password = "clave-sintetica";
      }),
    /^28/,
  ],
];

describe("GET /api/health", () => {
  it("con la base arriba responde 200, la versión de PostgreSQL y ningún error, sin caché", async () => {
    const answer = await health();
    expect(answer.status).toBe(200);
    expect(answer.cacheControl).toBe("no-store");
    expect(Object.keys(answer.body)).toEqual(FIELDS);
    expect(answer.body.status).toBe("ok");
    expect(String(answer.body.postgres)).toMatch(/^PostgreSQL 18/);
    expect(answer.body.latencyMs).toEqual(expect.any(Number));
    expect(answer.body.error).toBeNull();
    expect(answer.lines).toEqual([]);
  });

  it.each(
    FAILURES,
  )("si %s responde 503 con un valor fijo, y el fallo va al registro sin usuario, base, host ni puerto", async (_name, connectionString, code) => {
    const target = new URL(connectionString());
    const answer = await healthAgainst(target.toString());

    // El estado, los campos y la caché son los de siempre: los leen Railway y el smoke.
    expect(answer.status).toBe(503);
    expect(answer.cacheControl).toBe("no-store");
    expect(Object.keys(answer.body)).toEqual(FIELDS);
    expect(answer.body.status).toBe("error");
    expect(answer.body.postgres).toBeNull();
    expect(answer.body.latencyMs).toBeNull();

    // El cuerpo dice que la base no respondió y nada más: no depende de lo que el error escriba.
    expect(answer.body.error).toBe("database_unavailable");
    for (const written of [USER, DATABASE, target.hostname, target.host]) {
      expect(answer.text).not.toContain(written);
    }

    // El detalle queda en el registro, con su código y sin los datos de la conexión.
    const failures = recordsOf(answer.lines, "la salud no pudo consultar la base");
    expect(failures).toHaveLength(1);
    expect(String((failures[0]?.err as Record<string, unknown>).code)).toMatch(code);
    for (const { line } of answer.lines) {
      for (const written of [USER, DATABASE, target.hostname]) {
        expect(line).not.toContain(written);
      }
    }
  });
});
