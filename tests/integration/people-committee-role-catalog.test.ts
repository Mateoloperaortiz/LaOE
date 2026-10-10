import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { listMyCommitteeCapabilities } from "@/modules/people";
import { rolesResource } from "@/modules/people/admin";
import { committeeRole } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedTerm,
  seedVeteran,
} from "./factories";

// Caracterización de `createCommitteeRole` y `updateCommitteeRole` (DT-147) por su única puerta, el
// recurso Cargos del kit (`rolesResource.create` y `.update`). Una conducta queda fijada como está hoy
// porque espera la decisión abierta 58 (DT-149 inciso a): marcar «es de dirección» en un cargo que ya
// tiene gente la pone a dirigir sin pasar las inhabilidades, sin auditoría por persona y sin evento.

type RoleInput = Parameters<NonNullable<typeof rolesResource.update>>[2];

// `truncateAll` no vacía el catálogo de cargos (DT-149 inciso e): lo que esta prueba crea lo borra ella,
// antes y después, para no dejarle cargos a los archivos que corran detrás.
const OWN_CODES = ["C9_VOCERIA", "C9_ARCHIVO", "C9_ENLACE", "C9_OTRO"];

const db = () => getDb();
const actor = (personId: string) => ({ personId, ip: null });

async function resetCatalog(): Promise<void> {
  await truncateAll();
  await db().delete(committeeRole).where(inArray(committeeRole.code, OWN_CODES));
}

/** El formulario del kit pasa por el esquema del recurso antes de llegar al comando. */
function parsed(raw: Record<string, unknown>): RoleInput {
  return rolesResource.schema.parse(raw);
}

function create(personId: string, raw: Record<string, unknown>): Promise<{ id: string }> {
  if (!rolesResource.create) {
    throw new Error("El recurso de cargos ya no crea");
  }
  return rolesResource.create(actor(personId), parsed(raw));
}

function update(personId: string, code: string, raw: Record<string, unknown>): Promise<void> {
  if (!rolesResource.update) {
    throw new Error("El recurso de cargos ya no edita");
  }
  return rolesResource.update(actor(personId), code, parsed(raw));
}

function auditsOf(code: string) {
  return db()
    .select({
      action: auditLog.action,
      actorId: auditLog.actorId,
      before: auditLog.before,
      after: auditLog.after,
    })
    .from(auditLog)
    .where(and(eq(auditLog.entityType, "committee_role"), eq(auditLog.entityId, code)))
    .orderBy(asc(auditLog.action));
}

function pendingEvents() {
  return db()
    .select({ eventType: outbox.eventType })
    .from(outbox)
    .where(isNull(outbox.processedAt));
}

const voceria = { code: "C9_VOCERIA", label: "Vocería", sortOrder: 70 };

describe("el catálogo de cargos de comité (createCommitteeRole y updateCommitteeRole)", () => {
  beforeEach(resetCatalog);
  afterAll(async () => {
    await resetCatalog();
    await closeDb();
  });

  it("crear un cargo lo deja en el catálogo como salió del formulario, con su auditoría y sin evento", async () => {
    const admin = await seedMember("admin@eafit.edu.co");

    const created = await create(admin, {
      code: " c9_voceria ",
      label: "  Vocería  ",
      capabilities: ["PERMANENCE", "ROSTER", "ROSTER"],
      sortOrder: "70",
    });

    expect(created).toEqual({ id: "C9_VOCERIA" });
    const row = {
      code: "C9_VOCERIA",
      label: "Vocería",
      isLeadership: false,
      required: false,
      // Sin repetidos y en el orden del catálogo de capacidades, no en el que llegaron.
      capabilities: ["ROSTER", "PERMANENCE"],
      sortOrder: 70,
      retired: false,
      replacedByCode: null,
    };
    expect(await rolesResource.get("C9_VOCERIA")).toEqual({ id: "C9_VOCERIA", ...row });
    expect(await auditsOf("C9_VOCERIA")).toEqual([
      { action: "committee-role.created", actorId: admin, before: null, after: row },
    ]);
    expect(await pendingEvents()).toEqual([]);
  });

  it("un código repetido se niega con su texto y no pisa el cargo que ya estaba", async () => {
    const admin = await seedMember("admin@eafit.edu.co");
    await create(admin, voceria);

    await expect(
      create(admin, { code: "c9_voceria", label: "Otra vocería", isLeadership: true }),
    ).rejects.toEqual(new DomainError(t("T-474"), "code"));

    expect(await rolesResource.get("C9_VOCERIA")).toMatchObject({
      label: "Vocería",
      isLeadership: false,
    });
    expect(await auditsOf("C9_VOCERIA")).toHaveLength(1);
  });

  it("el reemplazo de un cargo retirado tiene que existir y ser otro cargo, al crear y al editar", async () => {
    const admin = await seedMember("admin@eafit.edu.co");
    const invalid = new DomainError(t("T-2211"), "replacedByCode");
    await create(admin, voceria);

    await expect(
      create(admin, { code: "C9_ARCHIVO", label: "Archivo", replacedByCode: "C9_ENLACE" }),
    ).rejects.toEqual(invalid);
    await expect(
      create(admin, { code: "C9_ARCHIVO", label: "Archivo", replacedByCode: "c9_archivo" }),
    ).rejects.toEqual(invalid);
    expect(await rolesResource.get("C9_ARCHIVO")).toBeNull();

    await create(admin, {
      code: "C9_ARCHIVO",
      label: "Archivo",
      retired: true,
      replacedByCode: " c9_voceria ",
    });
    expect(await rolesResource.get("C9_ARCHIVO")).toMatchObject({
      retired: true,
      replacedByCode: "C9_VOCERIA",
    });

    await expect(
      update(admin, "C9_VOCERIA", { ...voceria, replacedByCode: "C9_ENLACE" }),
    ).rejects.toEqual(invalid);
    await expect(
      update(admin, "C9_VOCERIA", { ...voceria, replacedByCode: "C9_VOCERIA" }),
    ).rejects.toEqual(invalid);
    expect(await rolesResource.get("C9_VOCERIA")).toMatchObject({ replacedByCode: null });
    expect(await auditsOf("C9_VOCERIA")).toHaveLength(1);
  });

  it("editar un cargo cambia nombre, dirección, obligatorio, capacidades, orden, retiro y reemplazo, y deja el antes y el después en la auditoría", async () => {
    const admin = await seedMember("admin@eafit.edu.co");
    await create(admin, voceria);
    await create(admin, { code: "C9_ARCHIVO", label: "Archivo" });

    await update(admin, "C9_VOCERIA", {
      // El código no cambia aunque el formulario mande otro: es la clave de las pertenencias.
      code: "C9_OTRO",
      label: "Vocería general",
      isLeadership: true,
      required: true,
      capabilities: ["BOARD"],
      sortOrder: 5,
      retired: true,
      replacedByCode: "c9_archivo",
    });

    const values = {
      label: "Vocería general",
      isLeadership: true,
      required: true,
      capabilities: ["BOARD"],
      sortOrder: 5,
      retired: true,
      replacedByCode: "C9_ARCHIVO",
    };
    expect(await rolesResource.get("C9_VOCERIA")).toEqual({
      id: "C9_VOCERIA",
      code: "C9_VOCERIA",
      ...values,
    });
    expect(await rolesResource.get("C9_OTRO")).toBeNull();
    expect(await auditsOf("C9_OTRO")).toEqual([]);
    expect(await auditsOf("C9_VOCERIA")).toEqual([
      expect.objectContaining({ action: "committee-role.created" }),
      {
        action: "committee-role.updated",
        actorId: admin,
        before: {
          code: "C9_VOCERIA",
          label: "Vocería",
          isLeadership: false,
          required: false,
          capabilities: [],
          sortOrder: 70,
          retired: false,
          replacedByCode: null,
        },
        after: values,
      },
    ]);
    expect(await pendingEvents()).toEqual([]);
  });

  it("editar un cargo que no existe se niega con el texto de no encontrado y no escribe nada", async () => {
    const admin = await seedMember("admin@eafit.edu.co");

    await expect(
      update(admin, "C9_ENLACE", { code: "C9_ENLACE", label: "Enlace" }),
    ).rejects.toEqual(new DomainError(t("T-032")));

    expect(await rolesResource.get("C9_ENLACE")).toBeNull();
    expect(await auditsOf("C9_ENLACE")).toEqual([]);
  });

  it("hoy marcar «es de dirección» en un cargo que ya tiene gente la pone a dirigir su comité sin pasar las inhabilidades, sin auditoría por persona y sin evento (DT-149 a, decisión abierta 58)", async () => {
    const termId = await seedTerm();
    const admin = await seedMember("admin@eafit.edu.co");
    const a3 = await seedCommittee("c9-a3", "A3");
    const pixel = await seedCommittee("c9-pixel", "Pixel");
    // Al asignar un cargo de dirección corre la guarda de nuevo (ADR-060 regla 11); acá llega por el catálogo.
    const nuevo = await seedMember("nuevo@eafit.edu.co");
    const veterana = await seedVeteran("veterana@eafit.edu.co");
    await create(admin, voceria);
    await seedCommitteeMembership(nuevo, a3, termId, "C9_VOCERIA");
    await seedCommitteeMembership(veterana, pixel, termId, "C9_VOCERIA");
    expect(await listMyCommitteeCapabilities(nuevo, termId)).toEqual([]);
    expect(await listMyCommitteeCapabilities(veterana, termId)).toEqual([]);

    await update(admin, "C9_VOCERIA", {
      ...voceria,
      isLeadership: true,
      capabilities: ["BOARD", "ROSTER"],
    });

    const directs = async (personId: string) =>
      (await listMyCommitteeCapabilities(personId, termId)).map((row) => [
        row.committee.slug,
        row.capabilities,
        row.roles.map((role) => role.roleCode),
      ]);
    expect(await directs(nuevo)).toEqual([["c9-a3", ["ROSTER", "BOARD"], ["C9_VOCERIA"]]]);
    expect(await directs(veterana)).toEqual([["c9-pixel", ["ROSTER", "BOARD"], ["C9_VOCERIA"]]]);
    // Una sola fila de auditoría, la del cargo: ninguna nombra a quienes pasaron a dirigir.
    const audits = await db()
      .select({ action: auditLog.action, entityId: auditLog.entityId })
      .from(auditLog)
      .orderBy(asc(auditLog.action));
    expect(audits).toEqual([
      { action: "committee-role.created", entityId: "C9_VOCERIA" },
      { action: "committee-role.updated", entityId: "C9_VOCERIA" },
    ]);
    expect(await pendingEvents()).toEqual([]);
  });

  it("los comandos no comprueban quién llama: que sea ADMIN lo exige el kit de /admin (ADR-082 regla 5) y la auditoría guarda a quien llegó", async () => {
    const cualquiera = await seedMember("cualquiera@eafit.edu.co");

    await create(cualquiera, voceria);
    await update(cualquiera, "C9_VOCERIA", { ...voceria, label: "Vocería de cualquiera" });

    expect(await rolesResource.get("C9_VOCERIA")).toMatchObject({ label: "Vocería de cualquiera" });
    expect((await auditsOf("C9_VOCERIA")).map((row) => row.actorId)).toEqual([
      cualquiera,
      cualquiera,
    ]);
  });
});
