# ADR-002: La persona es el eje; la membresía es un ciclo de vida con historia

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-003, ADR-005, ADR-014

## Contexto

GHPOINTS modela `Member` como raíz: una persona existe solo si es integrante. Postulantes, egresados y contactos externos no tienen lugar, y por eso el roster vive en Excel y las postulaciones en Forms. Un CRM necesita a la persona antes y después de ser integrante.

## Decisión

`Person` es la entidad raíz, con `kind` (`STUDENT` o `EXTERNAL`) y `stage`. `Membership` (cero o una por persona) guarda el estado de integrante (`ACTIVE`, `ON_LEAVE`, `HONORARY`, `INACTIVE`), `firstTermId`, `endedAt` y `endReason`; su historial vive en `MembershipEvent`. Nadie se crea al iniciar sesión ni desde un formulario sin una acción declarada: el roster entra por importación o por "Dar de alta". Los contactos externos nunca tienen membresía ni acceso.

## Consecuencias

- Directorio, ledger, check-ins, formularios y comunicaciones apuntan a `personId`.
- Una persona que sale no se borra: cambia de etapa y conserva su historia (con la retención de ADR-014).
- La importación del roster debe traer el semestre de ingreso para fijar `firstTermId`.
