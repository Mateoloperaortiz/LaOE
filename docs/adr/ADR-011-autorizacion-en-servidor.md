# ADR-011: Autorización en servidor

- Estado: Aceptada (enmendada por ADR-051 y ADR-058)
- Fecha: 2026-09-02
- Relacionadas: ADR-010, ADR-017

## Contexto

Una cookie presente no prueba nada: puede estar vencida, revocada o pertenecer a una persona retirada. Los cargos de la OE (líder, junta) cambian cada semestre y no deben confundirse con derechos técnicos.

## Decisión

El proxy solo redirige rutas protegidas cuando no hay cookie y emite la CSP; nunca decide roles. `getActor()` (cacheado por request) valida sesión, estado de membresía y permisos. Cada comando sensible llama `requireAdmin()` o `requireLeader(committeeId)` al inicio; los layouts hacen lo mismo para la UI, pero no sustituyen al dominio. `Permission` (`ADMIN`, `COMMITTEE_LEADER` con comité) es técnico y se concede desde la ficha de la persona con step-up; `Appointment` es el cargo visible con historia. No se puede retirar el último `ADMIN` habilitado.

## Consecuencias

- Layouts y acciones comparten una sola verdad.
- Un líder ve el roster de sus comités (sin correo), propone ocasiones en borrador y usa el modo anfitrión; no aprueba puntos ni publica contenido.

## Enmienda (2026-09-10, ADR-051)

El step-up deja de equivaler a "un OTP verificado hace menos de 15 minutos" y pasa a ser "una credencial propia verificada hace menos de 15 minutos": la contraseña del actor estampa la misma marca de sesión que estampaba el código. La ventana de 15 minutos, los guards y la lista de acciones que lo exigen no cambian. Ver [ADR-051](ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md).

## Enmienda (2026-09-12, ADR-058)

Los cargos de la OE siguen sin ser permisos técnicos, pero un cargo de dirección del comité (`committee_role.isLeadership`, con las capacidades que declara el catálogo) sí habilita, por datos y solo sobre su comité, lo de su área: Personas, Actividades, Comunicación, Aliados o Finanzas según el cargo. El guard no vive en `identity` sino en `src/app/admin/comites/_kit/capacidades.ts`, y las guardas finas en el dominio de `people`. `COMMITTEE_LEADER` queda como excepción con todas las capacidades del comité. Ver [ADR-058](ADR-058-direccion-del-comite-por-areas.md).
