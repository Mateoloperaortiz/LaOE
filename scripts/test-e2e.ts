import { spawn } from "node:child_process";
import { Client } from "pg";
import { getEnv } from "@/env";
import { assertOwnedDatabase, createE2eEnvironment } from "../tests/e2e/environment";
import { e2eBuildEnvironment, planE2eServer } from "../tests/e2e/server-mode";
import { allowCorsOrigin, bucketClient } from "./lib/bucket-cors";

// Se decide antes de armar el entorno y queda escrito para Playwright (ADR-123 regla 1): sin
// filtro la corrida va contra el build, como el CI; con filtro, contra dev.
const plan = planE2eServer(process.env, process.argv.slice(2));
Object.assign(process.env, createE2eEnvironment(process.env), { E2E_SERVER: plan.server });
const url = assertOwnedDatabase(process.env.DATABASE_URL ?? "");
const name = url.pathname.slice(1);
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new Client({ connectionString: adminUrl.toString() });
let created = false;

async function run(
  args: string[],
  command = process.execPath,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const child = spawn(command, args, { stdio: "inherit", env });
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

/**
 * La subida directa sale del navegador hacia el bucket, que solo admite los orígenes de su CORS:
 * con otro `E2E_PORT` el de esta corrida falta (ADR-077). El bucket es local, porque
 * `createE2eEnvironment` ya rechazó cualquier otro, y lo comparten las demás sesiones: se suma.
 */
async function allowBrowserOrigin(): Promise<void> {
  const env = getEnv();
  const origin = new URL(env.APP_URL).origin;
  const s3 = bucketClient(env);
  try {
    await allowCorsOrigin({ s3, bucket: env.S3_BUCKET, origin, lock: admin });
  } catch (error) {
    throw new Error(`No se pudo admitir ${origin} en el CORS del bucket local`, { cause: error });
  } finally {
    s3.destroy();
  }
}

try {
  if (!process.argv.includes("--list")) {
    await admin.connect();
    await allowBrowserOrigin();
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const seeded = await run([
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/db-reset.ts",
    ]);
    if (seeded !== 0) throw new Error("No se pudo preparar la base desechable E2E");
    if (plan.compile) {
      // El mismo `npm run build` del CI, con el origen de esta corrida. Lo de `next dev` vive en
      // `.next/dev` y no se toca. Si falla, su salida ya quedó a la vista y no hay qué probar.
      const built = await run(["run", "build"], "npm", e2eBuildEnvironment(process.env));
      if (built !== 0) throw new Error("No se pudo compilar el build para la E2E");
    }
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
