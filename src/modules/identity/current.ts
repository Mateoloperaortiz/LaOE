import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE } from "./cookie";
import type { Actor } from "./domain/actor";
import { findSessionByToken, resolveActor, touchSession } from "./domain/session";

// El actor del request, resuelto una sola vez (ADR-011). Aquí sí se leen cookies; el dominio nunca.

export const getActor = cache(async (): Promise<Actor | null> => {
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

/** Para layouts y páginas: sin sesión válida, a /ingresar y vuelve. */
export async function requireActor(nextPath: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    redirect(loginUrl(nextPath));
  }
  return actor;
}

/** Para el área de administración: sin permiso ADMIN, a Mi OE. */
export async function requireAdminActor(nextPath = "/admin"): Promise<Actor> {
  const actor = await requireActor(nextPath);
  if (!actor.isAdmin) {
    redirect("/app");
  }
  return actor;
}
