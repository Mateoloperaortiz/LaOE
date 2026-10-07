# ADR-111: Una excusa aceptada libera el premio reservado y cierra el reto presencial pendiente

- Estado: Aceptada
- Fecha: 2026-10-07
- Relacionadas: ADR-014, ADR-031, ADR-060, ADR-067, ADR-109
- Enmienda: ADR-060 (regla 5), ADR-067 (regla 3)

## Contexto

[ADR-060](ADR-060-alineacion-con-la-normativa-2026.md) regla 5 hizo de la excusa una solicitud: aprobarla escribe un check-in `EXCUSED`, sin puntos, en la misma transacción. [ADR-067](ADR-067-retos-boosters-y-coleccion.md) regla 3 dijo qué pasa con el premio de una asistencia pendiente cuando se aprueba, se rechaza o se anula. Ninguna de las dos dijo qué pasa con ese premio cuando la asistencia pendiente se excusa, y el código no hacía nada.

El defecto es la fila DT-001 del [ledger](../20-deuda-tecnica.md) ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)). Una asistencia `PENDING` con un booster apuntado a su ocasión deja un premio `RESERVED`. Al aprobar la excusa, la asistencia quedaba `EXCUSED` y la reserva seguía viva: el booster quedaba retenido y el cierre de puntos del semestre respondía T-2562, porque `closeTermPointsAs` no cierra con premios reservados (ADR-067 regla 13). Con un reto presencial vinculado a la ocasión quedaba además la entrega `PENDING`. `EXCUSED` es un estado final de la asistencia: ninguna decisión posterior podía soltar lo que había quedado reservado.

## Decisión

1. **Con el premio, la excusa hace lo mismo que un rechazo.** Aprobar una excusa sobre una asistencia que ya existía pasa por los dos ganchos de un rechazo, en su orden de siempre (primero el booster de la ocasión, después el reto presencial) y en la misma transacción que decide la solicitud.
2. **El premio reservado se libera.** El `reward` de la asistencia pasa de `RESERVED` a `RELEASED` y el booster apuntado a la ocasión vuelve a quedar disponible y sin destino. No hay puntos que revertir: una asistencia pendiente no acreditó nada.
3. **El reto presencial pendiente se cierra como rechazado.** La participación `PENDING` del reto presencial vinculado a la ocasión pasa a `REJECTED` con el motivo automático de una asistencia no aprobada (T-2579), su reserva se libera y sale `challenge.rejected`, igual que cuando GH rechaza la asistencia.
4. **El motivo que queda registrado es el estado, no la excusa.** La liberación del premio se audita (`reward.released`) con el motivo «Excusado», el estado de la asistencia en T-597; la entrega presencial queda con T-2579. El texto de la excusa (la causal del Anexo 1 y la nota de la persona) no se copia al premio ni a la participación: puede ser una causal médica y se queda donde ya vivía, en la asistencia y en su auditoría ([ADR-014](ADR-014-privacidad-por-diseno.md)).
5. **La excusa conserva su rastro.** `checkin.excused` se sigue auditando con el estado anterior y el motivo de la excusa, y el evento `checkin.excused` sigue saliendo y alimenta la línea de tiempo de la persona.
6. **Solo se toca lo que seguía vivo.** Sin asistencia previa, la excusa crea el check-in `EXCUSED` y no hay premio que tocar. Una asistencia rechazada o anulada ya soltó o revirtió el suyo: excusarla después no vuelve a liberar nada. Una asistencia aprobada no se excusa.
7. **La configuración de gamificación es obligatoria en el comando.** `excuseCheckIn` la exige como argumento y `decideRequestAs` la lee antes de abrir la transacción, como hacen los comandos de `participation`. Con ella opcional, un llamador que la olvidara volvería a dejar la reserva viva.

## Consecuencias

- El cierre de puntos ya no se bloquea por una asistencia excusada: tras la excusa no quedan entregas pendientes ni premios reservados de esa asistencia.
- El booster liberado vuelve a quedar disponible para su dueño, sin destino, como tras cualquier rechazo.
- **Queda abierto (DT-081).** La persona con reto presencial recibe hoy el aviso de entrega rechazada («Tu reto no fue aprobado», T-2568, con el motivo T-2579) aunque su excusa fue aceptada: es el aviso del rechazo, reutilizado. Un texto propio para la entrega que se cierra por excusa es una fila nueva de [14-copy-y-textos](../14-copy-y-textos.md) y no se inventa acá.
- **Queda abierto (DT-082).** La excusa sigue sin tomar el lock del término (`lockOpenTermPoints`), igual que antes de esta ADR: se puede aprobar con los puntos del término ya cerrados, y aprobar y excusar la misma asistencia pendiente compiten sin bloquear la fila. Va con DT-008, que junta los cinco caminos de una asistencia.
- `excuseCheckIn` cambia de firma dentro del dominio (un tercer argumento obligatorio); su único llamador es `crm`. Sin migración, sin textos nuevos y sin cambios en rutas, eventos de dominio ni API pública.
- Pruebas: `tests/integration/requests-excuse-rewards.test.ts` (libera la reserva y el booster, deja cerrar el semestre, audita la liberación sin el motivo de la persona, conserva la auditoría y la línea de tiempo de la excusa, no vuelve a tocar una asistencia ya rechazada, y cierra la entrega del reto presencial).
