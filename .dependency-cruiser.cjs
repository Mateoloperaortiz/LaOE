/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
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
      name: "shared-sin-negocio",
      comment: "src/shared no conoce los módulos: lo que necesite lo recibe por parámetros.",
      severity: "error",
      from: { path: "^src/shared/" },
      to: { path: "^src/modules/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
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
