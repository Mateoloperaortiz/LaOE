const base = require("./.dependency-cruiser.cjs");

// Reglas sobre el grafo de ejecución: aquí los `import type` no cuentan (tsPreCompilationDeps: false),
// porque lo que se vigila es qué código carga de verdad un archivo, no qué tipos nombra (ADR-083).

// Importan un ayudante puro de otro módulo por su index.ts, que carga el módulo entero. Se resuelve con
// una entrada pública pura por módulo, en el rediseño de índices del tramo R5. No sumar archivos aquí.
const PURE_EXCEPTIONS = [
  "^src/modules/crm/domain/timeline-pure\\.ts$",
  "^src/modules/forms/domain/pure\\.ts$",
];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "puros-sin-io",
      comment:
        "Un *-pure.ts no alcanza el entorno ni la base, ni de forma transitiva: es lo que lo hace probable sin infraestructura y usable desde el navegador.",
      severity: "error",
      from: { path: "(-|/)pure\\.ts$", pathNot: PURE_EXCEPTIONS },
      to: { path: "^src/(env\\.ts$|db/)", reachable: true },
    },
  ],
  options: { ...base.options, tsPreCompilationDeps: false },
};
