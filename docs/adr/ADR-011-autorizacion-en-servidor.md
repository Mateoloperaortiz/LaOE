# ADR-011: Autorización en servidor

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-010, ADR-017

## Contexto

Una cookie presente no prueba nada: puede estar vencida, revocada o pertenecer a una persona retirada. Los cargos de la OE (líder, junta) cambian cada semestre y no deben confundirse con derechos técnicos.

## Decisión

El proxy solo redirige rutas protegidas cuando no hay cookie y emite la CSP; nunca decide roles. `getActor()` (cacheado por request) valida sesión, estado de membresía y permisos. Cada comando sensible llama `requireAdmin()` o `requireLeader(committeeId)` al inicio; los layouts hacen lo mismo para la UI, pero no sustituyen al dominio. `Permission` (`ADMIN`, `COMMITTEE_LEADER` con comité) es técnico y se concede desde la ficha de la persona con step-up; `Appointment` es el cargo visible con historia. No se puede retirar el último `ADMIN` habilitado.

## Consecuencias

- Layouts y acciones comparten una sola verdad.
- Un líder ve el roster de sus comités (sin correo), propone ocasiones en borrador y usa el modo anfitrión; no aprueba puntos ni publica contenido.
