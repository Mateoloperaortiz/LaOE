# ADR-003: Etapas explícitas por comando

- Estado: Aceptada (enmendada por ADR-039)
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

## Enmienda (2026-09-06, ADR-039)

Excepción limitada al primer ADMIN de ADR-039: el bootstrap privado crea persona en etapa MEMBER y membresía ACTIVE en una transacción auditada, sin ejecutar un alta ordinaria ni un envío de bienvenida. No habilita nuevas rutas públicas ni modifica el alta normal de los miembros. Ver [ADR-039](ADR-039-arranque-limpio-fase-7.md).


## Enmienda (2026-09-08, ADR-046)

La [ADR-046](ADR-046-integracion-roster-y-acceso-en-licencia.md) amplía los datos personales opcionales del roster y permite consulta de Mi OE en licencia. ON_LEAVE conserva bloqueadas la participación, las nuevas credenciales y las funciones de cargos, con permisos almacenados intactos. El roster inicial preserva historia y deja conflictos y graduados pendientes; su aplicación conserva el requisito de política activa y autorizaciones respaldadas.
