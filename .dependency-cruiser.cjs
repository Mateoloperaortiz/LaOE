const { readdirSync } = require("node:fs");
const { findModuleCycle } = require("./scripts/ci/module-cycle.mjs");

// Grafo permitido entre módulos (ADR-080), sin ciclos (ADR-110): de qué otros módulos importa cada uno
// por su index.ts. Es la única fuente: 01-arquitectura remite aquí. Una dependencia nueva se decide
// agregándola a esta tabla; sin eso, `npm run deps:check` falla. Las claves foráneas entre schema.ts
// quedan fuera (regla schema-solo-importa-schema).
const MODULE_DEPS = {
  comms: ["content", "participation", "people", "system", "terms"],
  competition: ["events", "forms", "people"],
  content: [],
  crm: ["content", "events", "forms", "identity", "participation", "people", "system", "terms"],
  events: ["content"],
  finance: ["people", "terms"],
  forms: ["events", "people", "system"],
  identity: ["comms", "people"],
  inventory: ["people", "permanence", "system", "terms"],
  participation: ["events", "forms", "people", "system", "terms"],
  people: ["content", "events", "system", "terms"],
  permanence: ["events", "participation", "people", "system", "terms"],
  system: [],
  terms: [],
  wallet: ["identity", "people", "terms"],
};

const moduleDirs = readdirSync("src/modules", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const undeclared = moduleDirs.filter((name) => !(name in MODULE_DEPS));
const orphaned = Object.keys(MODULE_DEPS).filter((name) => !moduleDirs.includes(name));
if (undeclared.length > 0 || orphaned.length > 0) {
  throw new Error(
    `MODULE_DEPS no coincide con src/modules. Sin declarar: ${undeclared.join(", ") || "ninguno"}. Sobran: ${orphaned.join(", ") || "ninguno"}.`,
  );
}

// La tabla no admite ciclos entre módulos de dominio (ADR-110). `sin-ciclos` solo ve ciclos de archivos:
// dos módulos pueden importarse por sus index.ts sin que ningún archivo cierre el círculo. El detector
// vive en su módulo para tener prueba (`tests/unit/module-cycle.test.ts`, ADR-121 regla 13).
const moduleCycle = findModuleCycle(MODULE_DEPS);
if (moduleCycle) {
  throw new Error(
    `MODULE_DEPS tiene un ciclo entre módulos de dominio: ${moduleCycle.join(" → ")}. Una dependencia que cierra un ciclo no se declara: la composición sube a src/app o el aviso va por un evento de dominio (ADR-110).`,
  );
}

const moduleDependencyRules = Object.entries(MODULE_DEPS).map(([name, allowed]) => ({
  name: `dependencias-de-${name}`,
  comment: `${name} solo importa de: ${allowed.join(", ") || "ningún otro módulo"} (MODULE_DEPS, ADR-080).`,
  severity: "error",
  from: { path: `^src/modules/${name}/`, pathNot: "/schema\\.ts$" },
  to: {
    path: "^src/modules/[^/]+/",
    pathNot: `^src/modules/(${[name, ...allowed].join("|")})/`,
  },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...moduleDependencyRules,
    {
      name: "sin-ciclos",
      comment:
        "Sin ciclos, salvo entre archivos schema.ts: las claves foráneas entre módulos son referencias perezosas y Drizzle las resuelve.",
      severity: "error",
      from: {},
      to: { circular: true, viaOnly: { pathNot: "/schema\\.ts$" } },
    },
    {
      name: "modulos-solo-por-su-api-publica",
      comment:
        "Un módulo solo importa de otro módulo por su index.ts (ADR-001): lecturas explícitas y eventos, nunca su dominio, esquema o acciones.",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/", pathNot: "/schema\\.ts$" },
      to: {
        path: "^src/modules/([^/]+)/",
        pathNot: ["^src/modules/$1/", "^src/modules/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "schema-solo-importa-schema",
      comment:
        "Un schema.ts solo importa de otro módulo su schema.ts (claves foráneas), nunca dominio ni acciones.",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/schema\\.ts$" },
      to: {
        path: "^src/modules/([^/]+)/",
        pathNot: ["^src/modules/$1/", "^src/modules/[^/]+/schema\\.ts$"],
      },
    },
    {
      name: "db-solo-conoce-esquemas",
      comment:
        "src/db (transacción, auditoría, outbox) conoce las tablas de los módulos, no su dominio.",
      severity: "error",
      from: { path: "^src/db/" },
      to: { path: "^src/modules/", pathNot: "^src/modules/[^/]+/schema\\.ts$" },
    },
    {
      name: "app-no-consulta-la-base",
      comment:
        "Las páginas y rutas leen por las lecturas exportadas de cada módulo, no por src/db (01-arquitectura).",
      severity: "error",
      from: { path: "^src/app/" },
      to: { path: "^src/db/" },
    },
    {
      name: "app-no-entra-al-dominio",
      comment:
        "src/app usa la API pública de los módulos (index.ts y actions.ts), no domain/ ni schema.ts.",
      severity: "error",
      from: { path: "^src/app/" },
      to: { path: "^src/modules/[^/]+/(domain/|schema\\.ts$|jobs\\.ts$)" },
    },
    {
      name: "componentes-sin-servidor",
      comment: "Los componentes client no importan base de datos, entorno ni dominio.",
      severity: "error",
      from: { path: "/components/" },
      to: { path: "^src/(db/|env\\.ts$|modules/[^/]+/(domain/|schema\\.ts$))" },
    },
    {
      name: "contratos-de-eventos-neutrales",
      comment:
        "src/domain-events solo declara contratos (nombre y esquema): no conoce módulos, base, entorno ni lo compartido (ADR-084).",
      severity: "error",
      from: { path: "^src/domain-events/" },
      to: { path: "^src/", pathNot: "^src/domain-events/" },
    },
    {
      name: "dominio-sin-admin-kit",
      comment:
        "El dominio, los jobs y el esquema no conocen la UI del admin: DomainError vive en src/shared/lib/errors (ADR-083).",
      severity: "error",
      from: { path: "^src/modules/[^/]+/(domain/|jobs\\.ts$|schema\\.ts$)" },
      to: { path: "^src/shared/admin-kit/" },
    },
    {
      name: "shared-sin-negocio",
      comment: "src/shared no conoce los módulos: lo que necesite lo recibe por parámetros.",
      severity: "error",
      from: { path: "^src/shared/" },
      to: { path: "^src/modules/" },
    },
  ],
  options: {
    // `knip.ts` entra al grafo porque `tests/unit/module-public-interface.test.ts` lo importa para
    // leer su configuración (ADR-125 regla 3). Solo importa el tipo de su paquete, y este resolvedor
    // confunde el paquete `knip` con el archivo del mismo nombre: sin esto, `sin-ciclos` ve un ciclo
    // de `knip.ts` consigo mismo. El archivo sigue en el grafo; no se siguen sus imports.
    doNotFollow: { path: ["node_modules", "^knip\\.ts$"] },
    exclude: { path: ["node_modules", "\\.next", "^drizzle/"] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
