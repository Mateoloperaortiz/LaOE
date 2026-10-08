import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rowActionAction, saveResourceAction } from "@/app/admin/_kit/actions";
import { closeDb, getDb } from "@/db/client";
import { permission } from "@/modules/identity/schema";
import { tag } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import type { FormState } from "@/shared/admin-kit/types";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Lo que se escribe por el admin kit se audita con la IP del request (ADR-082 regla 2; ADR-116 regla
// 10). Acá va el camino entero, con el registro y la base de verdad: la action del kit, el recurso de
// permisos y la fila de `audit_log`. Conceder y revocar permisos es lo más sensible que hace el kit;
// un permiso no se edita, así que editar va con una etiqueta.

const session = vi.hoisted(() => ({ getActor: vi.fn() }));
const IP = "203.0.113.7";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
// El barrel del admin kit trae componentes con `next/font`, que no carga fuera de Next.
vi.mock("@/shared/admin-kit", async () => await import("@/shared/admin-kit/types"));
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  getActor: session.getActor,
}));

const initial: FormState = { ok: false, message: null, errors: {}, values: {} };
const TARGET = "destino.kit@eafit.edu.co";

function kitForm(values: Record<string, string>, resource = "permisos"): FormData {
  const data = new FormData();
  data.set("__resource", resource);
  data.set("__returnTo", `/admin/${resource}`);
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

/** A dónde redirige la action; si no redirige, lo que devolvió o el error con que falló. */
async function redirectOf(action: Promise<unknown>): Promise<unknown> {
  try {
    return await action;
  } catch (error) {
    return error instanceof Error ? error.message : error;
  }
}

function audits(action: string) {
  return getDb()
    .select({ actorId: auditLog.actorId, ip: auditLog.ip })
    .from(auditLog)
    .where(eq(auditLog.action, action));
}

async function seedAdminSession(): Promise<string> {
  const adminId = await seedMember("admin.kit@eafit.edu.co");
  await seedMember(TARGET);
  session.getActor.mockResolvedValue({
    personId: adminId,
    email: "admin.kit@eafit.edu.co",
    membershipStatus: "ACTIVE",
    isAdmin: true,
    permissions: [{ code: "ADMIN", committeeId: null }],
    otpVerifiedAt: new Date(),
  });
  return adminId;
}

describe("auditoría de lo que se escribe por el admin kit", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("conceder un permiso por el kit deja en la auditoría la IP de quien lo concedió", async () => {
    const adminId = await seedAdminSession();

    const saved = saveResourceAction(initial, kitForm({ email: TARGET, code: "BOARD" }));

    expect(await redirectOf(saved)).toBe("redirect:/admin/permisos?guardado=1");
    expect(await audits("permission.granted")).toEqual([{ actorId: adminId, ip: IP }]);
  });

  it("editar por el kit deja en la auditoría la IP de quien editó", async () => {
    const adminId = await seedAdminSession();
    await redirectOf(saveResourceAction(initial, kitForm({ name: "Egresados" }, "etiquetas")));
    const [created] = await getDb().select({ id: tag.id }).from(tag);
    if (!created) throw new Error("la etiqueta no se creó");

    const saved = saveResourceAction(
      initial,
      kitForm({ __id: created.id, name: "Egresadas" }, "etiquetas"),
    );

    expect(await redirectOf(saved)).toBe("redirect:/admin/etiquetas?guardado=1");
    expect(await audits("tag.updated")).toEqual([{ actorId: adminId, ip: IP }]);
  });

  it("revocar un permiso desde la fila deja en la auditoría la IP de quien lo revocó", async () => {
    const adminId = await seedAdminSession();
    await redirectOf(saveResourceAction(initial, kitForm({ email: TARGET, code: "BOARD" })));
    const [granted] = await getDb().select({ id: permission.id }).from(permission);
    if (!granted) throw new Error("el permiso no se concedió");

    const revoked = rowActionAction(kitForm({ __action: "revoke", __id: granted.id }));

    expect(await redirectOf(revoked)).toBe("redirect:/admin/permisos");
    expect(await audits("permission.revoked")).toEqual([{ actorId: adminId, ip: IP }]);
  });
});
