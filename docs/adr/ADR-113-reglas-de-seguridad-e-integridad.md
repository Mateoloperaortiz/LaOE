# ADR-113: Reglas de seguridad e integridad del segundo ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-07
- Relacionadas: ADR-011, ADR-109
- Enmienda: ADR-051 (regla 4)

## Contexto

El segundo ciclo del refactor progresivo ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)) es de seguridad e integridad. La revisión del 2026-10-07 leyó completos los caminos de ingreso, tokens, subidas y entrada pública, y dejó defectos concretos en el [ledger](../20-deuda-tecnica.md), leídos en el código y sin ejecutar. Cada uno se reprodujo con una prueba en rojo antes de corregirlo. Esta ADR reúne las reglas que cambian en el ciclo: cada ticket suma la suya.

**Enlaces de acceso (DT-055).** [ADR-051](ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md) regla 4 dijo quién emite un enlace de acceso: ADMIN y BOARD, con step-up, sobre una membresía elegible y nunca para sí mismos. Aceptó como amenaza que quien emite ve el enlace y puede entrar como esa persona. No dijo nada de los permisos del destinatario. Una persona de la junta sin ADMIN podía emitir un enlace de recuperación para la cuenta de un ADMIN, abrirlo ella misma, fijar una contraseña y quedar con su sesión: la amenaza aceptada era entrar como un par, no subir de privilegio. `issueAccessGrant` solo comprobaba que el destinatario no fuera quien emite y que pudiera entrar.

## Decisión

1. **Un enlace de acceso no le da a quien lo emite permisos que no tiene.** Si el destinatario tiene algún permiso técnico que quien emite no tiene, solo ADMIN emite. Se compara permiso por permiso (`ADMIN`, `BOARD` y `COMMITTEE_LEADER` con su comité): la junta emite para un miembro sin permisos y para quien tiene los mismos que ella, y no para un ADMIN ni para quien lidera un comité que ella no lidera. De quien emite cuentan los permisos que hoy operan, así que en licencia no cuenta ninguno, igual que en `resolveActor`; del destinatario cuentan todos los guardados, aunque esté en licencia, porque vuelven a operar con él. La comprobación vive en `issueAccessGrant`, que relee los permisos de los dos en la transacción: no depende de la action ni de la sesión de quien llama. Responde T-3206, sin enlace, auditoría ni evento. El arranque sin emisor de ADR-051 regla 16 no cambia: es el camino de vuelta de un ADMIN. El resto de la regla 4 tampoco: step-up, nunca para sí mismo, membresía elegible y un solo enlace vivo por persona.

## Consecuencias

- Sin migración y sin cambios en rutas, eventos de dominio ni API pública. Un texto nuevo, T-3206. La action no cambia: ya pinta el error de dominio en el panel de emisión.
- Cambia un flujo: la junta sin ADMIN ya no recupera el acceso de un ADMIN ni el de quien lidera un comité que ella no lidera. Lo hace un ADMIN, y si ningún ADMIN puede entrar, `npm run bootstrap:access`. La jornada de activación no cambia para los miembros sin permisos.
- Quién emite (ADMIN o BOARD, con step-up) lo sigue exigiendo la action de `/admin/personas`. El comando garantiza que emitir no suba de privilegio: llamado por alguien sin permisos, solo emite para alguien sin permisos.
- **Queda abierto.** La regla mira los permisos al emitir. Un enlace emitido antes de que al destinatario le concedan un permiso sigue sirviendo hasta que vence, 60 minutos después: conceder un permiso no consume los enlaces vivos de esa persona. Las capacidades que da un cargo ([ADR-058](ADR-058-direccion-del-comite-por-areas.md)) no son permisos técnicos y no entran en la comparación.
- Pruebas: `tests/integration/access-grant.test.ts` (junta sin ADMIN hacia un ADMIN, hacia quien lidera otro comité y sin permisos hacia la junta; la junta hacia un miembro y hacia sus pares; ADMIN hacia cualquiera; la licencia de quien emite y la del destinatario) y `tests/integration/bootstrap-access.test.ts` (el arranque emite para un ADMIN).
