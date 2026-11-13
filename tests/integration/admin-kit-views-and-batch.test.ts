import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { batchRowAction, deleteViewAction, saveViewAction } from "@/app/admin/_kit/actions";
import { closeDb, getDb } from "@/db/client";
import { task } from "@/modules/crm/schema";
import { deleteSavedViewsOf, listSavedViews } from "@/modules/system/domain/saved-views";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { seedMember, seedTask } from "../factories";
import { truncateAll } from "./db";

// Vistas guardadas y acciones en lote del kit (ADR-170): una vista es una dirección con nombre, propia
// o compartida; el lote corre la misma acción de fila, una por una, con su auditoría.

const session = vi.hoisted(() => ({ getActor: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/shared/admin-kit", async () => {
  const {
    formDataToInput,
    formDataToValues,
    isInlineField,
    MULTI_SEPARATOR,
    storedFormData,
    withLockedFormValues,
  } = await import("@/shared/admin-kit/types");
  return {
    formDataToInput,
    formDataToValues,
    isInlineField,
    MULTI_SEPARATOR,
    storedFormData,
    withLockedFormValues,
  };
});
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  getActor: session.getActor,
}));

async function settle(action: Promise<unknown>): Promise<unknown> {
  try {
    return await action;
  } catch (error) {
    return error instanceof Error ? error.message : error;
  }
}

async function adminSession(email: string): Promise<string> {
  const id = await seedMember(email);
  session.getActor.mockResolvedValue({
    personId: id,
    email,
    membershipStatus: "ACTIVE",
    isAdmin: true,
    permissions: [{ code: "ADMIN", committeeId: null }],
    otpVerifiedAt: new Date(),
  });
  return id;
}

function viewForm(name: string, query: string, shared = false): FormData {
  const data = new FormData();
  data.set("__basePath", "/admin/tareas");
  data.set("__query", query);
  data.set("name", name);
  if (shared) data.set("shared", "on");
  return data;
}

describe("vistas guardadas", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("guardar vuelve a la tabla con la vista abierta y sin la página ni el registro abierto", async () => {
    const owner = await adminSession("vistas.duena@eafit.edu.co");

    const result = await settle(
      saveViewAction(viewForm("Abiertas mías", "status=OPEN&assignee=mine&pagina=3&editar=x")),
    );

    expect(result).toBe("redirect:/admin/tareas?assignee=mine&status=OPEN&vista=guardada");
    const views = await listSavedViews(owner, "/admin/tareas");
    expect(views).toMatchObject([{ name: "Abiertas mías", query: "assignee=mine&status=OPEN" }]);
    const audits = await getDb()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.action, "saved-view.created"));
    expect(audits).toHaveLength(1);
  });

  it("otra persona ve solo las compartidas y no puede borrar las ajenas", async () => {
    const owner = await adminSession("vistas.duena@eafit.edu.co");
    await settle(saveViewAction(viewForm("Mía", "status=OPEN")));
    await settle(saveViewAction(viewForm("Del equipo", "status=DONE", true)));
    const other = await adminSession("vistas.otra@eafit.edu.co");

    const seen = await listSavedViews(other, "/admin/tareas");

    expect(seen.map((view) => view.name)).toEqual(["Del equipo"]);
    const shared = seen[0];
    if (!shared) throw new Error("falta la compartida");
    const data = new FormData();
    data.set("__id", shared.id);
    data.set("__returnTo", "/admin/tareas");
    expect(await settle(deleteViewAction(data))).toBe(
      `redirect:/admin/tareas?error=${encodeURIComponent(t("T-032"))}`,
    );
    expect(await listSavedViews(owner, "/admin/tareas")).toHaveLength(2);
  });

  it("un nombre repetido en la misma tabla no se guarda", async () => {
    await adminSession("vistas.duena@eafit.edu.co");
    await settle(saveViewAction(viewForm("Abiertas", "status=OPEN")));

    const result = await settle(saveViewAction(viewForm("Abiertas", "status=DONE")));

    expect(result).toBe(
      `redirect:/admin/tareas?status=DONE&error=${encodeURIComponent(t("T-4934"))}`,
    );
  });

  it("al anonimizar a una persona se van sus vistas, también las compartidas", async () => {
    const owner = await adminSession("vistas.duena@eafit.edu.co");
    await settle(saveViewAction(viewForm("Compartida", "status=OPEN", true)));
    const other = await adminSession("vistas.otra@eafit.edu.co");

    expect(await deleteSavedViewsOf(owner)).toBe(1);

    expect(await listSavedViews(other, "/admin/tareas")).toEqual([]);
  });
});

describe("acciones en lote", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("marca como hechas las que aplican, salta la que ya estaba hecha y audita cada una", async () => {
    const adminId = await adminSession("lote.admin@eafit.edu.co");
    const ids = [
      await seedTask("Llamar a la aliada"),
      await seedTask("Reservar el salón"),
      await seedTask("Ya hecha"),
    ];
    await getDb()
      .update(task)
      .set({ status: "DONE" })
      .where(eq(task.id, ids[2] ?? ""));
    const data = new FormData();
    data.set("__resource", "tareas");
    data.set("__action", "done");
    data.set("__returnTo", "/admin/tareas?status=OPEN");
    for (const id of ids) data.append("ids", id);

    const result = await settle(batchRowAction(data));

    expect(result).toBe("redirect:/admin/tareas?status=OPEN&lote_hechas=2&lote_fallidas=1");
    const rows = await getDb()
      .select({ status: task.status })
      .from(task)
      .where(inArray(task.id, ids));
    expect(rows.every((row) => row.status === "DONE")).toBe(true);
    const audits = await getDb()
      .select({ actorId: auditLog.actorId, ip: auditLog.ip })
      .from(auditLog)
      .where(eq(auditLog.action, "task.completed"));
    expect(audits).toEqual([
      { actorId: adminId, ip: "203.0.113.7" },
      { actorId: adminId, ip: "203.0.113.7" },
    ]);
  });

  it("una acción que el recurso no declaró para el lote no corre", async () => {
    await adminSession("lote.admin@eafit.edu.co");
    const data = new FormData();
    data.set("__resource", "permisos");
    data.set("__action", "revoke");
    data.set("__returnTo", "/admin/permisos");
    data.append("ids", "cualquiera");

    expect(await settle(batchRowAction(data))).toBe("redirect:/admin");
  });
});
