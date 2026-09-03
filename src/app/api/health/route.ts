import { comprobarBaseDeDatos } from "@/modules/system";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = await comprobarBaseDeDatos();
  const cuerpo = {
    status: base.ok ? "ok" : "error",
    // npm expone la versión del paquete al correr `npm run start`; Railway, el commit desplegado.
    version: process.env.npm_package_version ?? null,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    postgres: base.ok ? base.version : null,
    latenciaMs: base.ok ? base.latenciaMs : null,
    error: base.ok ? null : base.error,
    at: new Date().toISOString(),
  };
  return Response.json(cuerpo, {
    status: base.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
