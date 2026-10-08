import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listResources } from "@/app/admin/_kit/registry";
import { GET as exportCsv } from "@/app/api/export/[tipo]/route";
import { closeDb, getDb } from "@/db/client";
import { auditLog } from "@/modules/system/schema";
import type { AnyResource } from "@/shared/admin-kit/types";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Un exporte con datos personales pide paso de seguridad reciente y deja su fila de auditoría
// (ADR-014). Las dos guardas de la ruta dependen de que el recurso esté marcado: acá se prueba la ruta
// con el registro de verdad y se recorre el registro para que ningún recurso se quede sin la marca.

const session = vi.hoisted(() => ({ getActor: vi.fn() }));

// El barrel del admin kit trae componentes con `next/font`, que no carga fuera de Next: de él la ruta
// y los recursos solo usan los contratos y el CSV.
vi.mock("@/shared/admin-kit", async () => ({
  ...(await import("@/shared/admin-kit/types")),
  ...(await import("@/shared/admin-kit/csv")),
}));
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  getActor: session.getActor,
}));

const MINUTE = 60_000;

/** Una sesión de ADMIN cuyo último paso de seguridad fue hace `minutes` minutos. */
function adminSession(personId: string, minutes: number) {
  return {
    personId,
    email: "admin.exportes@eafit.edu.co",
    membershipStatus: "ACTIVE",
    isAdmin: true,
    permissions: [{ code: "ADMIN", committeeId: null }],
    otpVerifiedAt: new Date(Date.now() - minutes * MINUTE),
  };
}

function requestExport(key: string): Promise<Response> {
  return exportCsv(new Request(`http://localhost/api/export/${key}`), {
    params: Promise.resolve({ tipo: key }),
  });
}

function exportAudits(key: string) {
  return getDb()
    .select({ actorId: auditLog.actorId, after: auditLog.after })
    .from(auditLog)
    .where(and(eq(auditLog.action, "export.csv"), eq(auditLog.entityId, key)));
}

describe("exportes del admin con nombres de personas", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it.each([
    ["tareas", "/admin/tareas"],
    ["grupos", "/admin/permanencia/grupos"],
  ])("el exporte de %s sin paso de seguridad reciente manda al paso y no entrega ni registra nada", async (key, screen) => {
    const adminId = await seedMember("admin.exportes@eafit.edu.co");
    session.getActor.mockResolvedValue(adminSession(adminId, 16));

    const response = await requestExport(key);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "http://sin-destino.invalid");
    expect(location.pathname).toBe("/ingresar/paso");
    expect(location.searchParams.get("next")).toBe(`${screen}?descarga=1`);
    expect(await exportAudits(key)).toEqual([]);
  });

  it.each([
    "tareas",
    "grupos",
  ])("el exporte de %s con paso de seguridad reciente entrega el CSV y deja su fila de auditoría", async (key) => {
    const adminId = await seedMember("admin.exportes@eafit.edu.co");
    session.getActor.mockResolvedValue(adminSession(adminId, 1));

    const response = await requestExport(key);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(await exportAudits(key)).toEqual([{ actorId: adminId, after: { rows: 0 } }]);
  });
});

// «Columna de persona»: un campo de la fila que `exportRow` lee y que se llama `email`, termina en
// `Email`, o termina en `Name` sin ser el nombre de una cosa. La lista de cosas es explícita y la regla
// falla cerrado: un `…Name` nuevo cuenta como nombre de persona hasta que alguien lo clasifique acá.
// Queda fuera el `name` propio de la fila, que es el nombre de lo que el recurso lista (un comité, una
// etiqueta): el recurso que lista personas declara su marca.
const THING_NAMES = new Set([
  "committeeName",
  "eventName",
  "groupName",
  "organizationName",
  "segmentName",
  "tagNames",
  "templateName",
]);

function isPersonColumn(field: string): boolean {
  return /email$/i.test(field) || (/Names?$/.test(field) && !THING_NAMES.has(field));
}

/** Un valor que aguanta lo que un exporte le hace a un campo: leerlo, llamarlo, recorrerlo o pegarlo. */
function anything(): unknown {
  return new Proxy(() => {}, {
    get(_target, property) {
      if (property === Symbol.toPrimitive) return () => "";
      if (property === Symbol.iterator) return function* () {};
      if (property === "then") return undefined;
      return anything();
    },
    apply: () => anything(),
  });
}

/** Los campos de la fila que el exporte lee: una fila sonda anota cada uno que `exportRow` le pide. */
function fieldsReadByExport(resource: AnyResource): string[] {
  const read = new Set<string>();
  const row = new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property === "string") read.add(property);
        return anything();
      },
    },
  );
  try {
    resource.exportRow(row as { id: string });
  } catch (error) {
    throw new Error(`El exporte de «${resource.key}» no se dejó leer con la fila sonda`, {
      cause: error,
    });
  }
  return [...read].sort();
}

describe("marca de datos personales en el registro del admin", () => {
  afterAll(() => closeDb());

  it("ningún recurso exportable entrega nombre o correo de una persona sin la marca", () => {
    const unmarked = listResources().filter((resource) => resource.personalData !== true);
    const leaks = unmarked.flatMap((resource) => {
      const columns = fieldsReadByExport(resource).filter(isPersonColumn);
      return columns.length > 0 ? [`${resource.key}: ${columns.join(", ")}`] : [];
    });
    expect(leaks).toEqual([]);
  });

  it("los recursos que exportan nombre o correo ya están marcados y la sonda los reconoce", () => {
    const marked = listResources().filter((resource) => resource.personalData === true);
    expect(marked.map((resource) => resource.key)).toEqual(
      expect.arrayContaining(["personas", "permisos", "check-ins", "tareas", "grupos"]),
    );
    // La junta declara que no lleva datos personales (ADR-036 regla 12: agregados sin nombres).
    expect(listResources().find((resource) => resource.key === "junta")?.personalData).toBe(false);
  });
});
