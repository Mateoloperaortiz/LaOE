import { cache } from "react";
import { SESSION_COOKIE } from "./cookie";
import type { Actor } from "./domain/actor";
import { findSessionByToken, resolveActor, touchSession } from "./domain/session";

// El actor del request, resuelto una sola vez (ADR-011). Aquí sí se leen cookies; el dominio nunca.

export const getActor = cache(async (): Promise<Actor | null> => {
  // El API público también se usa en jobs Node. Next solo se carga al atender un request.
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const actor = await resolveActor(token);
  if (actor) {
    const record = await findSessionByToken(token);
    if (record) {
      await touchSession(record);
    }
  }
  return actor;
});

function loginUrl(nextPath: string): string {
  return `/ingresar?next=${encodeURIComponent(nextPath)}`;
}

async function redirectRequest(path: string): Promise<never> {
  const { redirect } = await import("next/navigation");
  return redirect(path);
}

/** Para layouts y páginas: sin sesión válida, a /ingresar y vuelve. */
export async function requireActor(nextPath: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    return redirectRequest(loginUrl(nextPath));
  }
  return actor;
}

/** Para el área de administración: sin permiso ADMIN, a Mi OE. */
export async function requireAdminActor(nextPath = "/admin"): Promise<Actor> {
  const actor = await requireActor(nextPath);
  if (!actor.isAdmin) {
    return redirectRequest("/app");
  }
  return actor;
}

/** Para el panel de la junta (ADR-036 regla 12): ADMIN o BOARD. */
export async function requireBoardActor(nextPath = "/admin/junta"): Promise<Actor> {
  const actor = await requireActor(nextPath);
  if (!actor.isAdmin && !actor.permissions.some((item) => item.code === "BOARD")) {
    return redirectRequest("/app");
  }
  return actor;
}
