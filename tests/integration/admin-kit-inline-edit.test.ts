import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inlineEditAction, saveResourceAction } from "@/app/admin/_kit/actions";
import { closeDb, getDb } from "@/db/client";
import { committeeRole, tag } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import type { InlineState } from "@/shared/admin-kit/InlineEditCell";
import type { FormState } from "@/shared/admin-kit/types";
import { t } from "@/shared/copy";
import { seedMember } from "../factories";
import { truncateAll } from "./db";

// Edición en línea de una celda del kit (ADR-167 regla 5): pasa por el mismo esquema y el mismo
// `update` que el panel, con el actor y la IP de siempre en la auditoría, y no toca los demás campos.

const session = vi.hoisted(() => ({ getActor: vi.fn() }));
const IP = "203.0.113.7";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
// El barrel del kit trae componentes con `next/font`: la action solo usa lo que va nombrado acá.
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

const initialForm: FormState = { ok: false, message: null, errors: {}, values: {} };
const initial: InlineState = { ok: false, message: null, at: 0 };

function form(resource: string, values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  data.set("__resource", resource);
  data.set("__returnTo", `/admin/${resource}`);
  for (const [name, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(name, item);
  }
  return data;
}

function cell(resource: string, id: string, field: string, value: string): FormData {
  return form(resource, { __id: id, __field: field, value });
}

async function settle(action: Promise<unknown>): Promise<unknown> {
  try {
    return await action;
  } catch (error) {
    return error instanceof Error ? error.message : error;
  }
}

async function seedAdminSession(): Promise<string> {
  const adminId = await seedMember("admin.celda@eafit.edu.co");
  session.getActor.mockResolvedValue({
    personId: adminId,
    email: "admin.celda@eafit.edu.co",
    membershipStatus: "ACTIVE",
    isAdmin: true,
    permissions: [{ code: "ADMIN", committeeId: null }],
    otpVerifiedAt: new Date(),
  });
  return adminId;
}

async function seedTag(name: string): Promise<string> {
  await settle(saveResourceAction(initialForm, form("etiquetas", { name, color: "#123456" })));
  const [created] = await getDb().select({ id: tag.id }).from(tag).where(eq(tag.name, name));
  if (!created) throw new Error("la etiqueta no se creó");
  return created.id;
}

describe("edición en línea por el admin kit", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("cambia solo el campo de la celda, con el mismo update y la IP en la auditoría", async () => {
    const adminId = await seedAdminSession();
    const id = await seedTag("Egresados");

    const result = await inlineEditAction(initial, cell("etiquetas", id, "name", "Egresadas"));

    expect(result).toMatchObject({ ok: true, message: null });
    const [row] = await getDb().select().from(tag).where(eq(tag.id, id));
    expect(row).toMatchObject({ name: "Egresadas", color: "#123456" });
    const audits = await getDb()
      .select({ actorId: auditLog.actorId, ip: auditLog.ip })
      .from(auditLog)
      .where(eq(auditLog.action, "tag.updated"));
    expect(audits).toEqual([{ actorId: adminId, ip: IP }]);
  });

  it("valida con el mismo esquema: un nombre vacío no se guarda y el error vuelve a la celda", async () => {
    await seedAdminSession();
    const id = await seedTag("Aliados");

    const result = await inlineEditAction(initial, cell("etiquetas", id, "name", ""));

    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
    const [row] = await getDb().select({ name: tag.name }).from(tag).where(eq(tag.id, id));
    expect(row?.name).toBe("Aliados");
  });

  it("un campo que el recurso no declaró para la celda no se edita así", async () => {
    await seedAdminSession();
    const id = await seedTag("Prensa");

    const result = await inlineEditAction(initial, cell("etiquetas", id, "color", "#000000"));

    expect(result).toMatchObject({ ok: false, message: t("T-4904") });
    const [row] = await getDb().select({ color: tag.color }).from(tag).where(eq(tag.id, id));
    expect(row?.color).toBe("#123456");
  });

  it("conserva las casillas y las listas del registro al cambiar otro campo", async () => {
    await seedAdminSession();
    await settle(
      saveResourceAction(
        initialForm,
        form("cargos", {
          code: "VOCERIA_CELDA",
          label: "Vocería",
          isLeadership: "on",
          required: "on",
          capabilities: ["OCCASIONS", "PERMANENCE"],
          sortOrder: "7",
        }),
      ),
    );

    const result = await inlineEditAction(
      initial,
      cell("cargos", "VOCERIA_CELDA", "label", "Vocería del comité"),
    );

    expect(result).toMatchObject({ ok: true });
    const [row] = await getDb()
      .select()
      .from(committeeRole)
      .where(eq(committeeRole.code, "VOCERIA_CELDA"));
    expect(row).toMatchObject({
      label: "Vocería del comité",
      isLeadership: true,
      required: true,
      sortOrder: 7,
    });
    expect([...(row?.capabilities ?? [])].sort()).toEqual(["OCCASIONS", "PERMANENCE"]);
  });

  it("quien no es ADMIN no edita: vuelve a Mi OE sin tocar nada", async () => {
    await seedAdminSession();
    const id = await seedTag("Junta");
    const memberId = await seedMember("miembro.celda@eafit.edu.co");
    session.getActor.mockResolvedValue({
      personId: memberId,
      email: "miembro.celda@eafit.edu.co",
      membershipStatus: "ACTIVE",
      isAdmin: false,
      permissions: [],
      otpVerifiedAt: new Date(),
    });

    const result = await settle(inlineEditAction(initial, cell("etiquetas", id, "name", "Otra")));

    expect(result).toBe("redirect:/app");
    const [row] = await getDb().select({ name: tag.name }).from(tag).where(eq(tag.id, id));
    expect(row?.name).toBe("Junta");
  });
});
