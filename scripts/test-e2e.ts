import { spawn } from "node:child_process";
import { Client } from "pg";
import { assertOwnedDatabase, createE2eEnvironment } from "../tests/e2e/environment";

Object.assign(process.env, createE2eEnvironment(process.env));
const url = assertOwnedDatabase(process.env.DATABASE_URL ?? "");
const name = url.pathname.slice(1);
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.toString() });
let created = false;

async function run(args: string[]): Promise<number> {
  const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    return await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

try {
  if (!process.argv.includes("--list")) {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const seeded = await run([
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/db-reset.ts",
    ]);
    if (seeded !== 0) throw new Error("No se pudo preparar la base desechable E2E");
  }
  process.exitCode = await run([
    "--conditions=react-server",
    "node_modules/@playwright/test/cli.js",
    "test",
    ...process.argv.slice(2),
  ]);
} finally {
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
