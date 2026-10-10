import { and, eq, getTableColumns } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listResources } from "@/app/admin/_kit/registry";
import { GET as exportCsv } from "@/app/api/export/[tipo]/route";
import { GET as exportOwnData } from "@/app/api/mis-datos/route";
import { closeDb, getDb } from "@/db/client";
import { person } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import type { AnyResource } from "@/shared/admin-kit/types";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Un exporte con datos personales pide paso de seguridad reciente y deja su fila de auditoría
// (ADR-014). Las dos guardas de la ruta dependen de que el recurso esté marcado: acá se prueba la ruta
// con el registro de verdad y se recorre el registro para que ningún recurso se quede sin la marca.

const session = vi.hoisted(() => ({ getActor: vi.fn() }));
const IP = "203.0.113.7";

// La ruta arma el actor del comando con la IP del request, que sale de las cabeceras del proxy.
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));
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
    expect(await exportAudits(key)).toEqual([{ actorId: adminId, after: { rows: 0, total: 0 } }]);
  });
});

// La fila que dice quién se llevó datos personales dice también desde dónde (ADR-082 regla 2): el
// CSV de un recurso del admin y el paquete de «Mis datos».
describe("la auditoría de un exporte lleva la IP de quien lo pidió", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  function auditsOf(action: string) {
    return getDb()
      .select({ actorId: auditLog.actorId, entityId: auditLog.entityId, ip: auditLog.ip })
      .from(auditLog)
      .where(eq(auditLog.action, action));
  }

  it("el CSV de un recurso con datos personales queda auditado con la IP del request", async () => {
    const adminId = await seedMember("admin.exportes@eafit.edu.co");
    session.getActor.mockResolvedValue(adminSession(adminId, 1));

    const response = await requestExport("tareas");

    expect(response.status).toBe(200);
    expect(await auditsOf("export.csv")).toEqual([
      { actorId: adminId, entityId: "tareas", ip: IP },
    ]);
  });

  it("«Mis datos» queda auditado a nombre de la propia persona y con la IP del request", async () => {
    const personId = await seedMember("miembro.exportes@eafit.edu.co");
    session.getActor.mockResolvedValue({ ...adminSession(personId, 1), isAdmin: false });

    const response = await exportOwnData();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await auditsOf("export.self")).toEqual([
      { actorId: personId, entityId: personId, ip: IP },
    ]);
  });
});

// «Columna de persona»: lo que `exportRow` lee de la fila y que, por cómo se llama, es de una persona.
//  - `email`, o lo que termina en `Email`.
//  - Lo que termina en `Name` o en `Names`, salvo los nombres de cosas de `THING_NAMES`.
//  - `name` a secas, el nombre de lo que el recurso lista: es el de una persona (rankings, asambleas)
//    salvo en los recursos de `LISTS_THINGS`, que listan cosas.
//  - Las demás columnas de `person` que dicen algo de ella, por su nombre exacto: `PERSON_FIELDS`
//    (ADR-120 regla 7). Documento, celular, fecha de nacimiento e identificador externo no se llaman
//    nombre ni correo.
// Las listas son explícitas y la regla falla cerrado: un `…Name` nuevo, o el `name` de un recurso
// nuevo, cuenta como nombre de persona hasta que alguien lo clasifique acá, y una columna nueva de
// `person` no pasa hasta que alguien diga si es un dato de la persona.
const THING_NAMES = new Set([
  "committeeName",
  "eventName",
  "groupName",
  "organizationName",
  "segmentName",
  "tagNames",
  "templateName",
]);

const LISTS_THINGS = new Set([
  "campanas",
  "comites",
  "ediciones",
  "etiquetas",
  "eventos",
  "organizaciones",
  "pipelines",
  "plantillas",
  "segmentos",
]);

/** Columnas de `person` (`src/modules/people/schema.ts`) que son de la persona y no se llaman nombre ni correo. */
const PERSON_FIELDS = new Set([
  "anonymizedAt",
  "birthDate",
  "deletionRequestedAt",
  "documentNumber",
  "documentType",
  "epikId",
  "phone",
  "photoAssetId",
  "program",
  "sessionsRevokedAt",
]);

/** Columnas de `person` que cualquier tabla tiene con ese nombre: por sí solas no dicen de quién son. */
const GENERIC_PERSON_COLUMNS = new Set([
  "createdAt",
  "id",
  "kind",
  "legacyId",
  "source",
  "stage",
  "updatedAt",
]);

/** `path` es la ruta que se leyó desde la fila: `leaderName`, `person.fullName`. */
function isPersonColumn(resourceKey: string, path: string): boolean {
  const field = path.slice(path.lastIndexOf(".") + 1);
  if (/email$/i.test(field)) return true;
  if (PERSON_FIELDS.has(field)) return true;
  if (!/(^n|N)ames?$/.test(field)) return false;
  return path === "name" ? !LISTS_THINGS.has(resourceKey) : !THING_NAMES.has(path);
}

type Exportable = Pick<AnyResource, "key" | "personalData" | "exportRow">;

/**
 * Una fila sonda. Anota cada ruta que se le lee, también adentro de un objeto (`person.fullName`) o de
 * los elementos de una lista (`members.map((member) => member.fullName)`), y aguanta lo que un exporte
 * le hace a un campo: llamarlo, recorrerlo o pegarlo. En las rutas de `absent` responde `undefined`.
 */
function probe(path: string[], absent: ReadonlySet<string>, read: Set<string>): unknown {
  return new Proxy(() => {}, {
    get(_target, property) {
      if (property === Symbol.toPrimitive) return () => "";
      if (property === Symbol.iterator) {
        return function* () {
          yield probe(path, absent, read);
        };
      }
      if (typeof property !== "string" || property === "then") return undefined;
      const next = [...path, property];
      const route = next.join(".");
      read.add(route);
      return absent.has(route) ? undefined : probe(next, absent, read);
    },
    apply(_target, _self, args: unknown[]) {
      const element = probe(path, absent, read);
      for (const arg of args) {
        if (typeof arg === "function") arg(element, element, element);
      }
      return element;
    },
  });
}

/**
 * Todo lo que el exporte lee de la fila, por cualquiera de sus ramas. Una sonda siempre es verdadera,
 * así que sola no llega al `row.name` de `row.anonymized ? … : row.name` ni al segundo de
 * `row.firstName ?? row.personName`: cada ruta que aparece se vuelve a correr ausente, junto con las
 * ausencias que la destaparon.
 */
function pathsReadByExport(resource: Exportable): string[] {
  const seen = new Set<string>();
  const pending: string[][] = [[]];
  for (let absent = pending.shift(); absent; absent = pending.shift()) {
    const read = new Set<string>();
    try {
      resource.exportRow(probe([], new Set(absent), read) as { id: string });
    } catch (error) {
      // Con la fila entera el exporte se tiene que dejar leer. Con una ruta ausente se puede romper
      // (`row.dueAt.toISOString()`): lo que alcanzó a leer ya quedó anotado.
      if (absent.length === 0) {
        throw new Error(`El exporte de «${resource.key}» no se dejó leer con la fila sonda`, {
          cause: error,
        });
      }
    }
    for (const path of read) {
      if (!seen.has(path)) {
        seen.add(path);
        pending.push([...absent, path]);
      }
    }
  }
  return [...seen].sort();
}

/** Por cada recurso sin la marca que exporta una columna de persona, su clave y esas columnas. */
function unmarkedPersonColumns(resources: readonly Exportable[]): string[] {
  return resources
    .filter((resource) => resource.personalData !== true)
    .flatMap((resource) => {
      const columns = pathsReadByExport(resource).filter((path) =>
        isPersonColumn(resource.key, path),
      );
      return columns.length > 0 ? [`${resource.key}: ${columns.join(", ")}`] : [];
    });
}

/**
 * Lo que lee el exporte de cada recurso que declara que no lleva datos personales, revisado ruta por
 * ruta (ADR-120 regla 7). `isPersonColumn` reconoce un dato de persona por cómo se llama: no ve el
 * nombre de alguien bajo `title` o `label`. Por eso la lista es exacta y falla cerrado: una ruta nueva,
 * o un recurso nuevo con `false`, no pasa hasta que alguien lea ese exporte, confirme que no entrega
 * nada de una persona y lo sume acá. Va también lo que el exporte le hace al campo
 * (`createdAt.toISOString`), que es como la sonda lo anota. Si lo que se suma es de una persona, lo
 * que corresponde es marcar el recurso con `personalData: true`, no esta lista.
 */
const REVIEWED_PATHS: Record<string, readonly string[]> = {
  alias: ["createdAt", "createdAt.toISOString", "occasionTitle", "path"],
  campanas: [
    "failedCount",
    "name",
    "scheduledAt",
    "scheduledAt.toISOString",
    "segmentName",
    "sentCount",
    "skippedCount",
    "status",
    "templateName",
    "totalCount",
  ],
  cargos: [
    "capabilities",
    "capabilities.includes",
    "code",
    "isLeadership",
    "label",
    "replacedByCode",
    "required",
    "retired",
    "sortOrder",
  ],
  cartelera: [
    "audience",
    "createdAt",
    "createdAt.toISOString",
    "pinned",
    "publishedAt",
    "publishedAt.toISOString",
    "pushCount",
    "pushSentAt",
    "pushSentAt.toISOString",
    "title",
  ],
  comites: ["contactUrl", "name", "publicationStatus", "slug", "status"],
  convocatorias: [
    "accepted",
    "capacity",
    "closesAt",
    "closesAt.toISOString",
    "entries",
    "groupId",
    "groupName",
    "opensAt",
    "opensAt.toISOString",
    "selection",
    "status",
    "title",
  ],
  ediciones: [
    "endsAt",
    "endsAt.toISOString",
    "eventName",
    "location",
    "name",
    "publicationStatus",
    "registrationUrl",
    "slug",
    "startsAt",
    "startsAt.toISOString",
  ],
  etiquetas: ["color", "name"],
  eventos: [
    "audience",
    "editionCount",
    "name",
    "publicationStatus",
    "slug",
    "sortOrder",
    "summary",
  ],
  formularios: [
    "audience",
    "closesAt",
    "closesAt.toISOString",
    "fields",
    "fields.length",
    "maxSubmissions",
    "opensAt",
    "opensAt.toISOString",
    "slug",
    "status",
    "submissionCount",
    "title",
  ],
  junta: ["committee", "indicator", "term", "value"],
  ocasiones: [
    "approval",
    "approvedCount",
    "category",
    "checkInClosesAt",
    "checkInClosesAt.toISOString",
    "checkInOpensAt",
    "checkInOpensAt.toISOString",
    "endsAt",
    "endsAt.toISOString",
    "kind",
    "newMembersOnly",
    "points",
    "publicId",
    "requireRotatingCode",
    "startsAt",
    "startsAt.toISOString",
    "status",
    "title",
  ],
  organizaciones: ["contactCount", "kind", "name", "tagNames", "tagNames.join", "website"],
  paginas: ["audience", "slug", "status", "title", "updatedAt", "updatedAt.toISOString"],
  pipelines: ["isArchived", "kind", "name", "openCards"],
  plantillas: ["name", "slug", "subject", "updatedAt", "updatedAt.toISOString"],
  presupuestos: [
    "assignedTotal",
    "committeeName",
    "kind",
    "sanctionPercent",
    "status",
    "studentDevelopmentApprovedOn",
    "submittedOn",
    "title",
    "vpFinanceApprovedOn",
    "year",
  ],
  segmentos: ["count", "filter", "filter.toJSON", "name"],
  terminos: [
    "code",
    "endsOn",
    "pointsClosedAt",
    "pointsClosedAt.toISOString",
    "requiredOrdinaryAssemblies",
    "semester",
    "startsOn",
  ],
};

/**
 * Lo que no coincide entre lo revisado y lo que hoy leen los exportes de los recursos sin la marca:
 * rutas que nadie revisó, rutas revisadas que ya no se leen y revisiones de un recurso que ya no está
 * entre los que declaran `false`.
 */
function reviewDrift(
  resources: readonly Exportable[],
  reviewed: Record<string, readonly string[]>,
): string[] {
  const unmarkedOnes = resources.filter((resource) => resource.personalData !== true);
  const drift = unmarkedOnes.flatMap((resource) => {
    const known = reviewed[resource.key] ?? [];
    const read = pathsReadByExport(resource);
    const fresh = read.filter((path) => !known.includes(path));
    const gone = known.filter((path) => !read.includes(path));
    return [
      ...(fresh.length > 0 ? [`${resource.key}: sin revisar ${fresh.join(", ")}`] : []),
      ...(gone.length > 0 ? [`${resource.key}: ya no lee ${gone.join(", ")}`] : []),
    ];
  });
  const orphans = Object.keys(reviewed)
    .filter((key) => !unmarkedOnes.some((resource) => resource.key === key))
    .map((key) => `${key}: revisado, y no es un recurso sin datos personales`);
  return [...drift, ...orphans];
}

interface ProbedRow {
  name: string;
  anonymized: boolean;
  alias: string | null;
  personName: string;
  person: { fullName: string };
  members: Array<{ fullName: string }>;
  committeeName: string;
  documentType: string;
  documentNumber: string;
  phone: string;
  birthDate: string;
  owner: { epikId: string; label: string };
  title: string;
  label: string;
  kind: string;
  slug: string;
}

/**
 * Un recurso de mentira que se declara sin datos personales: su clave y lo que su exporte lee de la
 * fila. La marca es obligatoria (ADR-119 regla 9), así que «sin marca» ya solo puede ser un `false`.
 */
function unmarked(key: string, exportRow: (row: ProbedRow) => Record<string, string>): Exportable {
  return { key, personalData: false, exportRow: exportRow as unknown as Exportable["exportRow"] };
}

// El recurso que no dice si lleva datos personales no compila. `npm run typecheck` sostiene esta
// línea: si la marca volviera a ser opcional, el `@ts-expect-error` quedaría sin error que esperar.
// @ts-expect-error -- falta `personalData` (ADR-119 regla 9)
const undeclared: Exportable = { key: "sin-declarar", exportRow: () => ({}) };

describe("marca de datos personales en el registro del admin", () => {
  afterAll(() => closeDb());

  it("ningún recurso exportable entrega un dato de una persona sin la marca", () => {
    expect(unmarkedPersonColumns(listResources())).toEqual([]);
  });

  it("cada recurso del registro declara si lleva datos personales, con sí o con no", () => {
    // El compilador ya lo exige; esto mira el registro armado, que borra el tipo de cada fila con un
    // cast y compone recursos con `...` (cartelera, ediciones, convocatorias).
    const undecided = [...listResources(), undeclared]
      .filter((resource) => typeof resource.personalData !== "boolean")
      .map((resource) => resource.key);
    expect(undecided).toEqual(["sin-declarar"]);
  });

  it("los recursos marcados con datos personales son exactamente los que se revisaron", () => {
    // Quitarle la marca a uno de estos le quita el paso de seguridad y el registro a su exporte: no
    // pasa sin tocar esta lista. Uno nuevo con la marca se suma acá.
    const marked = listResources().filter((resource) => resource.personalData === true);
    expect(marked.map((resource) => resource.key).sort()).toEqual([
      "asambleas",
      "check-ins",
      "grupos",
      "horario-preferencial",
      "inscritos",
      "insignias",
      "ledger",
      "mensajes",
      "permanencia",
      "permisos",
      "personas",
      "rankings",
      "respuestas",
      "retos",
      "tareas",
    ]);
    // La junta declara que no lleva datos personales (ADR-036 regla 12: agregados sin nombres).
    expect(listResources().find((resource) => resource.key === "junta")?.personalData).toBe(false);
  });

  it("el recorrido ve el nombre de una persona aunque sea el de la fila, esté detrás de una condición, adentro de otro objeto o en una lista", () => {
    const found = unmarkedPersonColumns([
      unmarked("recurso-nuevo", (row) => ({ nombre: row.name })),
      unmarked("con-anonimizados", (row) => ({ nombre: row.anonymized ? "" : row.name })),
      unmarked("con-respaldo", (row) => ({ nombre: row.alias ?? row.personName })),
      unmarked("con-objeto", (row) => ({ nombre: row.person.fullName })),
      unmarked("con-lista", (row) => ({
        nombres: row.members.map((member) => member.fullName).join(", "),
      })),
      // Listan cosas: el nombre de un comité no es el de una persona.
      unmarked("comites", (row) => ({ nombre: row.name, comite: row.committeeName })),
      { ...unmarked("ya-marcado", (row) => ({ nombre: row.name })), personalData: true },
    ]);

    expect(found).toEqual([
      "recurso-nuevo: name",
      "con-anonimizados: name",
      "con-respaldo: personName",
      "con-objeto: person.fullName",
      "con-lista: members.map.fullName",
    ]);
  });

  // DT-275, ADR-120 regla 7: los datos de `person` que no se llaman nombre ni correo.
  it("el recorrido ve también el documento, el celular, la fecha de nacimiento y el identificador externo de una persona", () => {
    const found = unmarkedPersonColumns([
      unmarked("con-documento", (row) => ({
        documento: `${row.documentType} ${row.documentNumber}`,
      })),
      unmarked("con-celular", (row) => ({ celular: row.phone })),
      unmarked("con-nacimiento", (row) => ({
        nacimiento: row.anonymized ? "" : row.birthDate.slice(0, 10),
      })),
      unmarked("con-epik", (row) => ({ epik: row.owner.epikId })),
      { ...unmarked("ya-marcado", (row) => ({ celular: row.phone })), personalData: true },
    ]);

    expect(found).toEqual([
      "con-documento: documentNumber, documentType",
      "con-celular: phone",
      "con-nacimiento: birthDate",
      "con-epik: owner.epikId",
    ]);
  });

  it("cada columna de la tabla de personas está clasificada: o es un dato de la persona o es una genérica", () => {
    const columns = Object.keys(getTableColumns(person));
    const personal = columns.filter((column) => isPersonColumn("personas", column));

    // Una columna nueva de `person` cae acá hasta que alguien la ponga en una de las dos listas.
    expect(
      columns.filter((column) => !personal.includes(column) && !GENERIC_PERSON_COLUMNS.has(column)),
    ).toEqual([]);
    expect(personal.filter((column) => GENERIC_PERSON_COLUMNS.has(column))).toEqual([]);
    // Y ninguna lista guarda una columna que la tabla ya no tiene.
    expect(
      [...PERSON_FIELDS, ...GENERIC_PERSON_COLUMNS].filter((column) => !columns.includes(column)),
    ).toEqual([]);
    expect(personal.sort()).toEqual([
      "anonymizedAt",
      "birthDate",
      "deletionRequestedAt",
      "documentNumber",
      "documentType",
      "email",
      "epikId",
      "firstName",
      "fullName",
      "lastName",
      "personalEmail",
      "phone",
      "photoAssetId",
      "preferredName",
      "program",
      "sessionsRevokedAt",
    ]);
  });

  it("cada ruta que lee el exporte de un recurso sin datos personales está revisada", () => {
    expect(reviewDrift(listResources(), REVIEWED_PATHS)).toEqual([]);
  });

  it("una ruta que nadie revisó no pasa aunque no se llame como un dato de persona, y lo revisado no se queda viejo", () => {
    const drift = reviewDrift(
      [
        unmarked("con-titulo", (row) => ({ titulo: row.title })),
        unmarked("con-objeto", (row) => ({ quien: row.owner.label })),
        unmarked("revisado", (row) => ({ comite: row.committeeName, enlace: row.slug })),
        unmarked("recortado", (row) => ({ enlace: row.slug })),
        { ...unmarked("ya-marcado", (row) => ({ titulo: row.title })), personalData: true },
      ],
      {
        "con-objeto": ["owner"],
        revisado: ["committeeName", "slug"],
        recortado: ["slug", "title"],
        "ya-marcado": ["title"],
      },
    );

    expect(drift).toEqual([
      "con-titulo: sin revisar title",
      "con-objeto: sin revisar owner.label",
      "recortado: ya no lee title",
      "ya-marcado: revisado, y no es un recurso sin datos personales",
    ]);
  });

  // El límite que queda (DT-303): la sonda no sabe qué valores probar, así que no llega a la rama que
  // depende del valor de un campo. Esa lectura no aparece ni como dato de persona ni como ruta sin
  // revisar: la ataja solo quien lee el exporte al revisarlo.
  it("una lectura que depende del valor de un campo no se ve: la sonda no llega a esa rama", () => {
    const hidden = unmarked("con-valor", (row) => ({
      quien: row.kind === "PERSON" ? row.name : row.slug,
    }));

    expect(pathsReadByExport(hidden)).toEqual(["kind", "slug"]);
    expect(unmarkedPersonColumns([hidden])).toEqual([]);
  });
});
