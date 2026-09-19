# ADR-017: Admin kit declarativo

- Estado: Aceptada (enmendada por ADR-080)
- Fecha: 2026-09-02
- Relacionadas: ADR-001, ADR-011

## Contexto

Hay cerca de treinta entidades administrables. Hacer treinta pantallas a mano es el costo que impide "todo en un mismo lugar". Un CMS externo (Payload, Strapi) resolvería las simples pero duplicaría el modelo de las complejas.

## Decisión

`defineResource({ modelo, columnas, filtros, formulario Zod, permisos, acciones })` en `src/shared/admin-kit/` genera listado paginado con búsqueda y filtros, ficha, crear/editar en panel lateral, export CSV y auditoría. Cubre Comité, Término, Etiqueta, Organización, Formulario, Plantilla, Página, Documento, Anuncio y Pipeline. UI a medida solo donde hay flujo: Persona 360, kanban, consola de ocasión, ledger, campañas e importaciones. Paleta de comandos (⌘K) con `pg_trgm`.

## Consecuencias

- El kit se construye en la fase 0 y se mide en la fase 1: si una entidad simple necesita más de una excepción, se pasa a UI a medida.
- Las mutaciones del kit pasan por los mismos comandos de dominio; el kit no toca Prisma directamente.

## Enmienda (2026-09-19, ADR-080)

`defineResource(...)` no existe. Un recurso es un objeto tipado `ResourceDefinition` que cada módulo exporta desde su `admin.ts` y que `src/app/admin/_kit/registry.ts` registra. Detalle en [ADR-080](ADR-080-la-arquitectura-documentada-es-la-del-codigo.md).
