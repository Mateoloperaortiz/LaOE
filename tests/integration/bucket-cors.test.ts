import { randomBytes } from "node:crypto";
import { CreateBucketCommand, DeleteBucketCommand } from "@aws-sdk/client-s3";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEnv } from "@/env";
import { allowCorsOrigin, bucketClient, readCorsRules } from "../../scripts/lib/bucket-cors";

// Contra Garage y PostgreSQL locales, en un bucket desechable: el CORS de `media` lo comparten las
// sesiones que estén corriendo E2E y esta prueba no lo toca.

describe("CORS del bucket para el lanzador E2E (ADR-077)", () => {
  const env = getEnv();
  const s3 = bucketClient(env);
  const bucket = `casa-cors-${randomBytes(6).toString("hex")}`;

  /** Cada llamada es un lanzador distinto: su propia conexión, como una sesión en otro worktree. */
  async function allow(origin: string): Promise<boolean> {
    const lock = new Client({ connectionString: env.DATABASE_URL });
    await lock.connect();
    try {
      return await allowCorsOrigin({ s3, bucket, origin, lock });
    } finally {
      await lock.end();
    }
  }

  async function origins(): Promise<string[]> {
    return (await readCorsRules(s3, bucket)).flatMap((rule) => rule.AllowedOrigins ?? []);
  }

  beforeAll(async () => {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  });
  afterAll(async () => {
    await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
    s3.destroy();
  });

  it("suma su origen a un bucket sin CORS, conserva el de otra sesión y no reescribe el que ya está", async () => {
    expect(await origins()).toEqual([]);
    expect(await allow("http://localhost:3011")).toBe(true);
    expect(await allow("http://localhost:3012")).toBe(true);
    expect(await origins()).toEqual(["http://localhost:3011", "http://localhost:3012"]);

    expect(await allow("http://localhost:3011")).toBe(false);
    expect(await origins()).toEqual(["http://localhost:3011", "http://localhost:3012"]);
  });

  it("ocho lanzadores a la vez dejan los ocho orígenes", async () => {
    const ports = Array.from({ length: 8 }, (_, index) => `http://localhost:${4100 + index}`);
    expect(await Promise.all(ports.map(allow))).toEqual(ports.map(() => true));
    expect(await origins()).toEqual(expect.arrayContaining(ports));
  });
});
