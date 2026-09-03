import { checkDatabase } from "@/modules/system";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkDatabase();
  const body = {
    status: database.ok ? "ok" : "error",
    // npm expone la versión del paquete al correr `npm run start`; Railway, el commit desplegado.
    version: process.env.npm_package_version ?? null,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    postgres: database.ok ? database.version : null,
    latencyMs: database.ok ? database.latencyMs : null,
    error: database.ok ? null : database.error,
    at: new Date().toISOString(),
  };
  return Response.json(body, {
    status: database.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
