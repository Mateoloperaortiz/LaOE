import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { getEnv } from "@/env";
import {
  getDocumentWithArticles,
  listDocuments,
  listMedia,
  listPublishedDocuments,
  resolveDocumentRedirect,
  resolveMediaRedirect,
} from "@/modules/content";
import { grantPermissionAs, listSessionsFor } from "@/modules/identity";
import { changeMembershipStatus, getMemberSummary } from "@/modules/people";
import { auditLog, outbox } from "@/modules/system/schema";
import { deleteObject, getObject } from "@/shared/adapters/storage";
import { leaveUntilSoon, seedMember } from "../factories";
import { sampleNormativaPdf } from "../helpers/pdf";
import { truncateAll } from "./db";
import { isTestDatabaseUrl } from "./test-database";

const runFile = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
let directory = "";

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Solo las variables de la base/bucket de pruebas; el hijo nunca carga .env ni hereda NODE_OPTIONS. */
function childEnvironment(): NodeJS.ProcessEnv {
  const env = getEnv();
  if (!isTestDatabaseUrl(env.DATABASE_URL)) {
    throw new Error("El subprocess de normativa exige la base de integración _test");
  }
  return {
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "test",
    TZ: "UTC",
    APP_TIMEZONE: "America/Bogota",
    APP_URL: "http://127.0.0.1:3000",
    DATABASE_URL: env.DATABASE_URL,
    SESSION_SECRET: "normativa-cli-synthetic-test-secret-only",
    INSTITUTIONAL_EMAIL_DOMAINS: "eafit.edu.co",
    MAILER: "console",
    EMAIL_FROM: "normativa-test@example.test",
    LOG_LEVEL: "error",
    JOBS_ENABLED: "false",
    PUBLIC_INDEXING: "false",
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_REGION: env.S3_REGION,
    S3_BUCKET: env.S3_BUCKET,
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
    S3_FORCE_PATH_STYLE: String(env.S3_FORCE_PATH_STYLE),
  };
}

async function runCli(manifest: string, args: string[] = []) {
  try {
    const result = await runFile(
      process.execPath,
      // Igual que `npm run normativa:import`: el script llega al catálogo de textos, que es solo de servidor (ADR-081).
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        "scripts/normativa-import.ts",
        "--input",
        manifest,
        ...args,
      ],
      { cwd: root, env: childEnvironment(), timeout: 15_000, maxBuffer: 1024 * 1024 },
    );
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const result = error as { code?: unknown; stdout?: string; stderr?: string };
    return {
      code: typeof result.code === "number" ? result.code : -1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }
}

async function fixture(kind: "ESTATUTOS" | "REGLAMENTO" = "ESTATUTOS", wrongHash = false) {
  const name = kind.toLowerCase();
  const pdf = sampleNormativaPdf();
  const png = await sharp(randomBytes(96 * 96 * 3), {
    raw: { width: 96, height: 96, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const json = {
    format: "oe-normativa/2",
    kind,
    source: `${name}.pdf`,
    pages: 2,
    sha256: wrongHash ? "0".repeat(64) : hash(pdf),
    units: [
      {
        key: "art-1",
        unitType: "ARTICLE",
        chapterKey: "cap-1",
        chapterTitle: "Organización de prueba",
        number: "1",
        title: "Naturaleza",
        pages: [1],
        blocks: [
          {
            type: "text",
            text: "La organización estudiantil de prueba se rige por sus estatutos.",
          },
          { type: "image", assetId: "organigrama", alt: "Organigrama sintético de prueba." },
        ],
      },
      {
        key: "anexo-1",
        unitType: "SECTION",
        chapterKey: "anexo-1",
        chapterTitle: "Anexo de prueba",
        number: null,
        title: "Condiciones de prueba",
        pages: [2],
        blocks: [
          { type: "table", headers: ["Condición", "Valor"], rows: [["Refrigerio", "3 horas"]] },
        ],
      },
    ],
  };
  await Promise.all([
    writeFile(join(directory, `${name}.pdf`), pdf),
    writeFile(join(directory, `${name}.json`), JSON.stringify(json)),
    writeFile(join(directory, `${name}.png`), png),
  ]);
  return {
    manifest: {
      pdf: `${name}.pdf`,
      json: `${name}.json`,
      title: `${kind} sintéticos del CLI`,
      version: "2040-05-08",
      audience: "MEMBERS",
      assets: { organigrama: { path: `${name}.png`, sha256: hash(png) } },
    },
    pdf,
    png,
  };
}

async function manifestFile(documents: unknown[]): Promise<string> {
  const path = join(directory, "manifest.json");
  await writeFile(path, JSON.stringify({ documents }));
  return path;
}

async function writesSnapshot() {
  const [documents, media, audit, jobs] = await Promise.all([
    listDocuments({ q: "", page: 1, pageSize: 100 }),
    listMedia({ q: "", page: 1, pageSize: 100 }),
    getDb().select().from(auditLog),
    getDb().select().from(outbox),
  ]);
  return { documents: documents.total, media: media.total, audit: audit.length, jobs: jobs.length };
}

describe("comando operativo de normativa", () => {
  beforeEach(async () => {
    await truncateAll();
    directory = await mkdtemp(join(tmpdir(), "oe-normativa-cli-test-"));
  });

  afterEach(async () => {
    const [documents, media] = await Promise.all([
      listDocuments({ q: "", page: 1, pageSize: 100 }),
      listMedia({ q: "", page: 1, pageSize: 100 }),
    ]);
    const keys = [
      ...documents.rows.map((row) => row.fileKey),
      ...media.rows.flatMap((row) => [
        row.objectKey,
        ...Object.values(row.variants).map((variant) => variant.key),
      ]),
    ];
    await Promise.all(keys.map((key) => deleteObject(key)));
    await rm(directory, { recursive: true, force: true });
  });

  afterAll(closeDb);

  // Cuatro subprocesos del CLI en serie (15 s de tope cada uno): con los archivos de integración
  // en paralelo (ADR-140) el límite general de 20 s se queda corto sin que nada esté roto.
  it(
    "simula, carga un borrador con imagen privada, repite sin duplicados y publica la carga idéntica",
    { timeout: 90_000 },
    async () => {
      const email = "cli.admin.sintetico@eafit.edu.co";
      const actorId = await seedMember(email);
      await grantPermissionAs(SYSTEM_ACTOR, { email, code: "ADMIN" });
      const input = await fixture();
      const path = await manifestFile([input.manifest]);
      const before = await writesSnapshot();
      const simulated = await runCli(path);
      expect(simulated.code, simulated.stderr).toBe(0);
      expect(simulated.stdout).toContain("SIMULACIÓN");
      expect(await writesSnapshot()).toEqual(before);

      const actorArgs = ["--actor-id", actorId, "--apply"];
      const premature = await runCli(path, [...actorArgs, "--publish"]);
      expect(premature.code).toBe(1);
      expect(premature.stderr).toContain("carga previa idéntica");
      expect(await writesSnapshot()).toEqual(before);
      const applied = await runCli(path, actorArgs);
      expect(applied.code, applied.stderr).toBe(0);
      const documents = await listDocuments({ q: "", page: 1, pageSize: 100 });
      expect(documents.total).toBe(1);
      const document = documents.rows[0];
      if (!document) throw new Error("Falta el documento cargado por el CLI");
      expect(document).toMatchObject({
        status: "DRAFT",
        articleCount: 1,
        unitCount: 2,
        sha256: hash(input.pdf),
        uploadedById: actorId,
      });
      expect(document.contentSha256).toMatch(/^[a-f0-9]{64}$/);
      const detail = await getDocumentWithArticles(document.id);
      expect(detail?.articles.map((article) => article.articleKey)).toEqual(["art-1", "anexo-1"]);
      const media = await listMedia({ q: "", page: 1, pageSize: 100 });
      expect(media.total).toBe(1);
      const image = media.rows[0];
      if (!image) throw new Error("Falta la imagen cargada por el CLI");
      expect(image).toMatchObject({
        visibility: "PRIVATE",
        status: "READY",
        width: 96,
        height: 96,
        uploadedById: actorId,
      });
      expect(hash(await getObject(image.objectKey))).toBe(hash(input.png));
      expect(detail?.articles[0]?.blocks).toContainEqual({
        type: "image",
        assetId: image.id,
        alt: "Organigrama sintético de prueba.",
      });
      expect(await resolveMediaRedirect(image.id, null, { authenticated: false })).toEqual({
        status: 403,
      });
      expect(await listPublishedDocuments()).toEqual([]);
      expect(await listSessionsFor(actorId)).toEqual([]);

      const loaded = await writesSnapshot();
      const repeated = await runCli(path, actorArgs);
      expect(repeated.code, repeated.stderr).toBe(0);
      expect(repeated.stdout).toContain("unchanged");
      expect(await writesSnapshot()).toEqual(loaded);

      const published = await runCli(path, [...actorArgs, "--publish"]);
      expect(published.code, published.stderr).toBe(0);
      expect(await listPublishedDocuments()).toMatchObject([
        { id: document.id, articleCount: 1, unitCount: 2 },
      ]);
      expect((await getDocumentWithArticles(document.id))?.articles).toEqual(detail?.articles);
      expect(
        (await resolveDocumentRedirect(document.id, { authenticated: true, isAdmin: false }))
          .status,
      ).toBe(302);
      expect((await listMedia({ q: "", page: 1, pageSize: 100 })).rows).toEqual(media.rows);
      const audit = await getDb()
        .select({ action: auditLog.action, actorId: auditLog.actorId })
        .from(auditLog);
      expect(audit).toEqual(
        expect.arrayContaining([
          { action: "document.uploaded", actorId },
          { action: "document.articles-replaced", actorId },
          { action: "document.published", actorId },
          { action: "media.uploaded", actorId },
        ]),
      );
      const complete = await writesSnapshot();
      const republished = await runCli(path, [...actorArgs, "--publish"]);
      expect(republished.code, republished.stderr).toBe(0);
      expect(await writesSnapshot()).toEqual(complete);
    },
  );

  it("un SHA incompatible en el segundo documento impide escribir el primero", async () => {
    const email = "cli.hash.sintetico@eafit.edu.co";
    const actorId = await seedMember(email);
    await grantPermissionAs(SYSTEM_ACTOR, { email, code: "ADMIN" });
    const first = await fixture();
    const second = await fixture("REGLAMENTO", true);
    const path = await manifestFile([first.manifest, second.manifest]);
    const before = await writesSnapshot();
    const result = await runCli(path, ["--actor-id", actorId, "--apply"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("SHA256 del PDF original");
    expect(await writesSnapshot()).toEqual(before);
  });

  it("un miembro sin ADMIN no puede cargar archivos ni crear sesiones", async () => {
    const actorId = await seedMember("cli.miembro.sintetico@eafit.edu.co");
    const input = await fixture();
    const path = await manifestFile([input.manifest]);
    const before = await writesSnapshot();
    const result = await runCli(path, ["--actor-id", actorId, "--apply"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ADMIN existente y habilitado");
    expect(await writesSnapshot()).toEqual(before);
    expect(await listSessionsFor(actorId)).toEqual([]);
  });

  it("un ADMIN en licencia conserva Mi OE pero no puede importar normativa", async () => {
    const email = "cli.licencia.sintetica@eafit.edu.co";
    const actorId = await seedMember(email);
    await grantPermissionAs(SYSTEM_ACTOR, { email, code: "ADMIN" });
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(ctx, actorId, {
        to: "ON_LEAVE",
        reason: "Licencia sintética",
        leaveUntil: leaveUntilSoon(),
      }),
    );
    expect((await getMemberSummary(actorId))?.canSignIn).toBe(true);
    const input = await fixture();
    const path = await manifestFile([input.manifest]);
    const before = await writesSnapshot();
    const result = await runCli(path, ["--actor-id", actorId, "--apply"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ADMIN existente y habilitado");
    expect(await writesSnapshot()).toEqual(before);
    expect(await listSessionsFor(actorId)).toEqual([]);
  });
});
