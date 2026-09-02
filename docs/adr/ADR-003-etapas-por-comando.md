# ADR-003: Etapas explícitas por comando

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-002, ADR-012

## Contexto

Si la etapa de una persona fuera un campo editable, la línea de tiempo tendría huecos y las transiciones inválidas (egresado con comités activos, postulante con puntos) aparecerían por error humano.

## Decisión

`Person.stage` toma los valores `PROSPECT`, `APPLICANT`, `MEMBER` y `ALUMNI` y cambia solo por comandos de dominio: `admitir`, `darDeAlta`, `darDeBaja`, `reactivar`, `marcarEgresado`. Cada comando valida la transición, exige motivo cuando corresponde, escribe `AuditLog` e `Interaction` y publica `stage.changed` en el outbox. El admin kit no expone el campo para edición directa.

## Consecuencias

- La línea de tiempo es completa por construcción.
- Las transiciones inválidas fallan antes de abrir la transacción.
- "Dar de alta" y "Dar de baja" son las únicas puertas hacia y desde la membresía.
