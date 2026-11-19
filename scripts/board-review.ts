import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Client } from "pg";
import { z } from "zod";
import { parseEnv } from "@/env";
import { reviewTarget } from "./lib/board-review-environment";
import { allowCorsOrigin, bucketClient } from "./lib/bucket-cors";

const sessionSchema = z.object({
  database: z.string().regex(/^casa_junta_[a-f0-9]{16}$/),
  port: z.number().int(),
  revision: z.string().min(1),
});
type ReviewSession = z.infer<typeof sessionSchema>;
const help =
  "Usa junta:ensayo -- preparar [carpeta privada de sesiones] [puerto] o junta:ensayo -- abrir <carpeta de la sesión>.";
async function runNode(args: string[], env: NodeJS.ProcessEnv, server = false) {
  const child = spawn(process.execPath, args, { env, stdio: "inherit" });
  let stopping = false;
  const stop = () => {
    stopping = true;
    child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await new Promise<void>((ok, fail) => {
      child.once("error", fail);
      child.once("exit", (code, signal) => {
        if (code === 0 || (server && stopping && signal === "SIGTERM")) ok();
        else fail(new Error(`El proceso local terminó con código ${String(code ?? signal)}`));
      });
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
async function prepare(parent: string, port: number) {
  const database = `casa_junta_${randomBytes(8).toString("hex")}`;
  const target = reviewTarget(database, port);
  const root = await realpath("."),
    requested = resolve(parent);
  await mkdir(requested, { recursive: true, mode: 0o700 });
  const base = await realpath(requested),
    distance = relative(root, base);
  if (!isAbsolute(distance) && !(distance === ".." || distance.startsWith(`..${sep}`)))
    throw new Error("Elige una carpeta privada fuera del checkout para los accesos.");
  const revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const dir = await mkdtemp(join(base, "junta-"));
  const admin = new Client({ connectionString: target.adminUrl });
  let created = false;
  try {
    await admin.connect();
    await admin.query(`create database ${database}`);
    created = true;
    await runNode(["--import", "tsx", "scripts/db-release.ts"], target.env);
    Object.assign(process.env, target.env);
    const { closeDb } = await import("@/db/client");
    try {
      const { prepareBoardScenarios } = await import("../tests/review/board-scenarios");
      const { writeReviewMaterials } = await import("../tests/review/board-materials");
      const scenarios = await prepareBoardScenarios();
      await writeReviewMaterials(dir, target.appUrl, scenarios, revision);
    } finally {
      await closeDb();
    }
    await writeFile(
      join(dir, "sesion.json"),
      `${JSON.stringify({ database, port, revision } satisfies ReviewSession, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    process.stdout.write(
      "Sesión preparada en " +
        dir +
        "\nOrigen local " +
        target.appUrl +
        "\nEl acta y los accesos están en esa carpeta.\n",
    );
  } catch (error) {
    // El nombre es aleatorio y solo se retira la base que este intento llegó a crear.
    if (created) await admin.query(`drop database ${database}`);
    await rm(dir, { recursive: true, force: true });
    throw error;
  } finally {
    await admin.end();
  }
}

async function openReview(dir: string) {
  const session = sessionSchema.parse(JSON.parse(await readFile(join(dir, "sesion.json"), "utf8")));
  const target = reviewTarget(session.database, session.port);
  const runtime: NodeJS.ProcessEnv = { ...target.env, NODE_ENV: "production" };
  const config = parseEnv(runtime);
  const lock = new Client({ connectionString: target.adminUrl });
  const s3 = bucketClient(config);
  try {
    await lock.connect();
    await allowCorsOrigin({ s3, bucket: config.S3_BUCKET, origin: target.appUrl, lock });
  } finally {
    s3.destroy();
    await lock.end();
  }
  await runNode(["node_modules/next/dist/bin/next", "build"], {
    ...runtime,
    JOBS_ENABLED: "false",
  });
  // La sesión sigue sirviendo sus propios archivos aunque otro check recompile el checkout.
  const serverDir = await mkdtemp(join(resolve(dir), "servidor-"));
  try {
    await cp(".next/standalone", serverDir, {
      recursive: true,
      dereference: true,
      filter: (source) => !basename(source).startsWith(".env"),
    });
    await Promise.all([
      cp(".next/static", join(serverDir, ".next/static"), { recursive: true }),
      cp("public", join(serverDir, "public"), { recursive: true }),
    ]);
    process.stdout.write(`Ensayo de la Junta en ${target.appUrl} · ${resolve(dir)}\n`);
    await runNode(
      [join(serverDir, "server.js")],
      {
        ...runtime,
        HOSTNAME: "127.0.0.1",
        PORT: String(session.port),
      },
      true,
    );
  } finally {
    await rm(serverDir, { recursive: true, force: true });
  }
}
try {
  const [mode, folder, port, ...rest] = process.argv.slice(2);
  if (mode === "preparar" && !rest.length)
    await prepare(
      folder ?? join(homedir(), ".local", "share", "laoe", "ensayos-junta"),
      Number(port ?? 3650),
    );
  else if (mode === "abrir" && folder && !port) await openReview(folder);
  else throw new Error(help);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "No se pudo preparar el ensayo de la Junta."}\n`,
  );
  process.exitCode = 1;
}
