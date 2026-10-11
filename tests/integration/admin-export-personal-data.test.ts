import { and, eq, getTableColumns } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { listResources } from "@/app/admin/_kit/registry";
import { GET as exportCsv } from "@/app/api/export/[tipo]/route";
import { GET as exportOwnData } from "@/app/api/mis-datos/route";
import { closeDb, getDb } from "@/db/client";
import { callsResource } from "@/modules/crm/admin";
import { occasionKindLabel } from "@/modules/participation/admin";
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
 * Lo que la sonda alcanza a leer al correr el exporte, por cualquiera de sus ramas. Una sonda siempre
 * es verdadera, así que sola no llega al `row.name` de `row.anonymized ? … : row.name` ni al segundo de
 * `row.firstName ?? row.personName`: cada ruta que aparece se vuelve a correr ausente, junto con las
 * ausencias que la destaparon. A la rama que depende del valor de un campo no llega nunca
 * (`row.kind === "PERSON" ? row.name : …`): eso lo cubre el texto, en `pathsReadByExport`.
 */
function pathsProbed(resource: Exportable): string[] {
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

/** Una función que recibe la fila de un exporte: su `exportRow`, o aquella a la que este se la entrega. */
type RowReader = (row: never) => unknown;

/** Por recurso, las funciones a las que su exporte le entrega la fila entera. */
type RowHandedTo = Record<string, readonly RowReader[]>;

const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const WHOLE_ROW = "@ROW@";

interface RowText {
  /** Las rutas que el texto escribe desde la fila, tramo por tramo: `person`, `person.fullName`. */
  paths: string[];
  /** Lo que lee de otra cosa, sea el elemento de una lista o una variable: `fullName` en `member.fullName`. */
  loose: string[];
  /** El cuerpo, con `@ROW@` donde nombra la fila sin leerle un campo: ahí la entrega entera. */
  rest: string;
}

/**
 * Lo que dice de su fila el texto de una función, lo corra o no la sonda (ADR-123 regla 14). Lee el
 * texto que Vitest ejecuta, sin los prefijos que les pone a los imports. Falla cerrado: si no reconoce
 * cómo la función llama a su fila, lanza; y la fila nombrada sin un campo detrás (pasada a otra
 * función, copiada con `...`, desarmada, o leída con una clave calculada) cuenta como entregada entera.
 */
function rowText(reader: RowReader): RowText {
  const source = Function.prototype.toString
    .call(reader)
    .replace(/__vi(?:te_ssr)?_import_\d+__\./g, "");
  const declaration =
    new RegExp(
      `^(?:async\\s+)?(?:function\\b\\s*)?(?:${IDENTIFIER})?\\s*\\(\\s*(${IDENTIFIER})?\\s*[,)]`,
    ).exec(source) ?? new RegExp(`^(?:async\\s+)?(${IDENTIFIER})\\s*=>`).exec(source);
  if (!declaration || source.includes("[native code]")) {
    throw new Error(`El texto de «${reader.name}» no deja leer cómo llama a su fila`);
  }
  const row = declaration[1];
  const paths = new Set<string>();
  let rest = source.slice(declaration[0].length);
  if (row !== undefined) {
    const mention = new RegExp(
      // No es la fila lo que cuelga de otra cosa (`item.row`); sí lo que se copia con `...row`.
      `(?<![\\w$])(?<!(?<!\\.\\.)\\.)${row.replaceAll("$", "\\$")}(?![\\w$])((?:\\s*\\??\\.\\s*${IDENTIFIER})*)`,
      "g",
    );
    rest = rest.replace(mention, (_mention, chain: string) => {
      const steps = chain.split(/\s*\??\.\s*/).filter((step) => step !== "");
      for (let length = 1; length <= steps.length; length += 1) {
        paths.add(steps.slice(0, length).join("."));
      }
      return steps.length > 0 ? "@FIELD@" : WHOLE_ROW;
    });
  }
  const loose = new Set<string>();
  // Un punto solo: los tres de `...lista` no leen nada.
  for (const [, name] of rest.matchAll(new RegExp(`(?<!\\.)\\.\\s*(${IDENTIFIER})`, "g"))) {
    if (name) loose.add(name);
  }
  return { paths: [...paths], loose: [...loose], rest };
}

/** Cuántas veces el texto le entrega la fila entera a `reader`, llamándola por su nombre. */
function handoversTo(text: RowText, reader: RowReader): number {
  if (reader.name === "") {
    throw new Error("Una función a la que se le entrega la fila tiene que tener nombre");
  }
  const call = new RegExp(
    `(?<![\\w$])${reader.name.replaceAll("$", "\\$")}\\)?\\s*\\(\\s*${WHOLE_ROW}\\s*\\)`,
    "g",
  );
  return [...text.rest.matchAll(call)].length;
}

/**
 * Todo lo que el exporte lee de la fila: lo que la sonda alcanza y lo que nombra su texto, que es como
 * se ve la rama que depende del valor de un campo (DT-303, ADR-123 regla 14). Del texto salen las rutas
 * escritas desde la fila y, como `*.campo`, lo que se lee de otra cosa y la sonda no vio leer con ese
 * nombre. Va también el texto de las funciones de `handedTo`, que reciben la fila entera.
 */
function pathsReadByExport(resource: Exportable, handedTo: RowHandedTo = {}): string[] {
  const probed = pathsProbed(resource);
  const seenByName = new Set(probed.map((path) => path.slice(path.lastIndexOf(".") + 1)));
  const readers = handedTo[resource.key] ?? [];
  const named = [resource.exportRow as RowReader, ...readers]
    .map(rowText)
    .flatMap((text) => [
      ...text.paths,
      ...text.loose
        .filter((name) => !seenByName.has(name) && !readers.some((reader) => reader.name === name))
        .map((name) => `*.${name}`),
    ]);
  return [...new Set([...probed, ...named])].sort();
}

/**
 * Lo que no cuadra entre a quién le entrega la fila un exporte y lo declarado en `handedTo`: lo que
 * pasa adentro de otra función no está en el texto del exporte, así que no pasa hasta que alguien
 * declare esa función y su texto se lea igual.
 */
function handoverDrift(resource: Exportable, readers: readonly RowReader[]): string[] {
  const own = rowText(resource.exportRow as RowReader);
  const whole = own.rest.split(WHOLE_ROW).length - 1;
  const calls = readers.map((reader) => handoversTo(own, reader));
  const declared = calls.reduce((sum, count) => sum + count, 0);
  return [
    ...(whole > declared
      ? [`${resource.key}: entrega la fila entera y nadie declaró a quién`]
      : []),
    ...readers.flatMap((reader, index) => [
      ...(calls[index] === 0 ? [`${resource.key}: ya no le entrega la fila a ${reader.name}`] : []),
      ...(rowText(reader).rest.includes(WHOLE_ROW)
        ? [`${resource.key}: ${reader.name} entrega la fila a su vez, y hasta ahí no se sigue`]
        : []),
    ]),
  ];
}

/** Por cada recurso sin la marca que exporta una columna de persona, su clave y esas columnas. */
function unmarkedPersonColumns(
  resources: readonly Exportable[],
  handedTo: RowHandedTo = {},
): string[] {
  return resources
    .filter((resource) => resource.personalData !== true)
    .flatMap((resource) => {
      const columns = pathsReadByExport(resource, handedTo).filter((path) =>
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
 * (`createdAt.toISOString`), que es como la sonda lo anota, y con `*.` lo que el texto del exporte lee
 * de algo que no es la fila y la sonda no vio leer con ese nombre (`*.key`, de `field.key`; ADR-123
 * regla 14). Si lo que se suma es de una persona, lo que corresponde es marcar el recurso con
 * `personalData: true`, no esta lista.
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
    "*.join",
    "*.key",
    "*.map",
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
    "*.indexOf",
    "approval",
    "approvedCount",
    "assemblyKind",
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
  segmentos: ["*.stringify", "count", "filter", "filter.toJSON", "name"],
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
 * Las funciones a las que el exporte de un recurso sin la marca le entrega la fila entera, leídas a
 * mano igual que sus rutas (ADR-123 regla 14). Lo que una de ellas lee de la fila se suma a lo que lee
 * el exporte, por su texto: `occasionKindLabel` lee `assemblyKind` solo si la ocasión es una asamblea.
 */
const ROW_HANDED_TO: RowHandedTo = {
  convocatorias: [callsResource.exportRow as RowReader],
  ocasiones: [occasionKindLabel as RowReader],
};

/**
 * Lo que no coincide entre lo revisado y lo que hoy leen los exportes de los recursos sin la marca:
 * rutas que nadie revisó, rutas revisadas que ya no se leen y revisiones de un recurso que ya no está
 * entre los que declaran `false`.
 */
function reviewDrift(
  resources: readonly Exportable[],
  reviewed: Record<string, readonly string[]>,
  handedTo: RowHandedTo = {},
): string[] {
  const unmarkedOnes = resources.filter((resource) => resource.personalData !== true);
  const drift = unmarkedOnes.flatMap((resource) => {
    const known = reviewed[resource.key] ?? [];
    const read = pathsReadByExport(resource, handedTo);
    const fresh = read.filter((path) => !known.includes(path));
    const gone = known.filter((path) => !read.includes(path));
    return [
      ...(fresh.length > 0 ? [`${resource.key}: sin revisar ${fresh.join(", ")}`] : []),
      ...(gone.length > 0 ? [`${resource.key}: ya no lee ${gone.join(", ")}`] : []),
      ...handoverDrift(resource, handedTo[resource.key] ?? []),
    ];
  });
  const isUnmarked = (key: string) => unmarkedOnes.some((resource) => resource.key === key);
  const orphans = Object.keys(reviewed)
    .filter((key) => !isUnmarked(key))
    .map((key) => `${key}: revisado, y no es un recurso sin datos personales`);
  const handedOrphans = Object.keys(handedTo)
    .filter((key) => !isUnmarked(key))
    .map(
      (key) =>
        `${key}: declara a quién le entrega la fila, y no es un recurso sin datos personales`,
    );
  return [...drift, ...orphans, ...handedOrphans];
}

interface ProbedRow {
  name: string;
  anonymized: boolean;
  alias: string | null;
  personName: string;
  person: { fullName: string };
  members: Array<{ fullName: string; label: string }>;
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
  [field: string]: unknown;
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
    expect(unmarkedPersonColumns(listResources(), ROW_HANDED_TO)).toEqual([]);
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
    expect(reviewDrift(listResources(), REVIEWED_PATHS, ROW_HANDED_TO)).toEqual([]);
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

  // DT-303, ADR-123 regla 14: la sonda no sabe qué valores probar, así que sola no llega a la rama que
  // depende del valor de un campo. El texto del exporte sí nombra esa lectura.
  it("una lectura que depende del valor de un campo se ve: el texto del exporte la nombra aunque la sonda no llegue a esa rama", () => {
    const hidden = unmarked("con-valor", (row) => ({
      quien: row.kind === "PERSON" ? row.name : row.slug,
    }));

    expect(pathsReadByExport(hidden)).toEqual(["kind", "name", "slug"]);
    expect(unmarkedPersonColumns([hidden])).toEqual(["con-valor: name"]);
  });

  it("también se ve cuando la rama que depende de un valor lee adentro de un objeto, de una lista o de una variable", () => {
    const found = unmarkedPersonColumns([
      unmarked("con-objeto", (row) => ({
        quien: row.kind === "PERSON" ? row.person.fullName : "",
      })),
      unmarked("con-lista", (row) => ({
        quienes:
          row.kind === "GROUP" ? row.members.map((member) => member.fullName).join(", ") : "",
      })),
      unmarked("con-variable", (row) => {
        const owner = row.owner;
        return { quien: row.kind === "PERSON" ? owner.epikId : owner.label };
      }),
      unmarked("con-opciones", (row) => {
        switch (row.kind) {
          case "PERSON":
            return { quien: row.phone };
          default:
            return { quien: row.slug };
        }
      }),
    ]);

    expect(found).toEqual([
      "con-objeto: person.fullName",
      "con-lista: *.fullName",
      "con-variable: *.epikId",
      "con-opciones: phone",
    ]);
  });

  it("lo que el texto nombra y la sonda no alcanza tampoco pasa sin revisar, se llame como se llame", () => {
    const drift = reviewDrift(
      [
        unmarked("con-valor", (row) => ({
          que: row.kind === "DRAFT" ? row.title : row.slug,
        })),
        unmarked("con-lista", (row) => ({
          que: row.kind === "GROUP" ? row.members.map((member) => member.label).join(", ") : "",
        })),
      ],
      { "con-valor": ["kind", "slug"], "con-lista": ["kind"] },
    );

    expect(drift).toEqual([
      "con-valor: sin revisar title",
      "con-lista: sin revisar *.join, *.label, members, members.map",
    ]);
  });

  it("un exporte que entrega la fila entera no pasa hasta que alguien declare a quién, y lo que esa función lee cuenta como suyo", () => {
    const quien = (row: ProbedRow) => (row.kind === "PERSON" ? row.name : row.slug);
    const copia = (row: ProbedRow) => ({ ...row });
    const field = "phone";
    const resources = [
      unmarked("entrega", (row) => ({ quien: quien(row) })),
      unmarked("entrega-declarada", (row) => ({ quien: quien(row) })),
      unmarked("entrega-a-dos", (row) => ({
        quien: quien(row),
        cuantos: String(Object.keys(row).length),
      })),
      unmarked("clave-calculada", (row) => ({ valor: String(row[field]) })),
      unmarked("desarmada", (row) => {
        const { title } = row;
        return { titulo: title };
      }),
      unmarked("ya-no-entrega", (row) => ({ titulo: row.title })),
      unmarked("entrega-en-cadena", (row) => ({ titulo: row.title, filas: String(copia(row)) })),
      { ...unmarked("ya-marcado", (row) => ({ quien: quien(row) })), personalData: true },
    ];
    const handedTo = {
      "entrega-declarada": [quien as RowReader],
      "entrega-a-dos": [quien as RowReader],
      "ya-no-entrega": [quien as RowReader],
      "entrega-en-cadena": [copia as RowReader],
      "ya-marcado": [quien as RowReader],
    };
    const drift = reviewDrift(
      resources,
      {
        entrega: ["kind", "slug"],
        "entrega-declarada": ["kind", "name", "slug"],
        "entrega-a-dos": ["*.keys", "*.length", "kind", "name", "slug"],
        "clave-calculada": ["phone"],
        desarmada: ["title"],
        "ya-no-entrega": ["kind", "name", "slug", "title"],
        "entrega-en-cadena": ["title"],
      },
      handedTo,
    );

    expect(drift).toEqual([
      "entrega: entrega la fila entera y nadie declaró a quién",
      "entrega-a-dos: entrega la fila entera y nadie declaró a quién",
      "clave-calculada: entrega la fila entera y nadie declaró a quién",
      "desarmada: entrega la fila entera y nadie declaró a quién",
      "ya-no-entrega: ya no le entrega la fila a quien",
      "entrega-en-cadena: copia entrega la fila a su vez, y hasta ahí no se sigue",
      "ya-marcado: declara a quién le entrega la fila, y no es un recurso sin datos personales",
    ]);
    // Declarada la función, la lectura que hace por un valor sale como dato de persona del recurso. Lo
    // de la clave calculada lo ve la sonda al correr, con el valor que la clave tenga ese día.
    expect(unmarkedPersonColumns(resources, handedTo)).toEqual([
      "entrega-declarada: name",
      "entrega-a-dos: name",
      "clave-calculada: phone",
      "ya-no-entrega: name",
    ]);
  });

  it("un exporte cuyo texto no deja ver cómo llama a su fila no pasa", () => {
    const sinTexto = unmarked(
      "sin-texto",
      ((row: ProbedRow) => ({ titulo: row.title })).bind(null),
    );
    const desarmado = {
      key: "desarmado",
      personalData: false,
      exportRow: (({ title }: ProbedRow) => ({
        titulo: title,
      })) as unknown as Exportable["exportRow"],
    };

    expect(() => reviewDrift([sinTexto], {})).toThrow(/no deja leer cómo llama a su fila/);
    expect(() => unmarkedPersonColumns([desarmado])).toThrow(/no deja leer cómo llama a su fila/);
  });
});
