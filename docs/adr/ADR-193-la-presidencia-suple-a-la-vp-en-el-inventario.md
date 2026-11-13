# ADR-193: La Presidencia suple a la VP en el inventario

- Estado: Propuesta
- Fecha: 2026-11-13
- Enmienda: [ADR-150](ADR-150-inventario-reservas-y-operacion-logistica.md) regla 2 (quién administra el inventario)
- Relacionadas: ADR-058, ADR-060, ADR-157, ADR-191

## Contexto

El Reglamento Interno, art. 54, dice: «La Vicepresidencia Administrativa es quien aprueba el préstamo de los activos. En su ausencia, la Presidencia será quien lo autorice».

Hasta ahora, en la casa solo administraba el inventario quien tiene el nombramiento de VP Administrativa en el término vigente, con membresía operativa (ADR-150 regla 2). Si el cargo queda vacante o la VP sale en licencia, las reservas ya habilitadas siguen corriendo. Pero nadie puede habilitar a una dirección logística nueva, cambiar los materiales ni gestionar las novedades. Mateo pidió agregar la suplencia el 2026-11-13, después de leer los PDF de la normativa vigente (reforma del 8 de mayo de 2026, la misma de ADR-157).

## Decisión

1. **Quién administra.**
   - La VP Administrativa del término vigente, con membresía operativa. Esto no cambia.
   - La Presidencia del término vigente, con membresía operativa, solo cuando el término no tiene ninguna VP Administrativa con membresía operativa.
2. **Qué cuenta como ausencia.** El cargo vacante, o una VP cuya membresía no es operativa: licencia, salida o datos anonimizados. Una ausencia corta, sin licencia, no pasa el rol. Las reservas ya habilitadas no necesitan a la VP cada día, y el CML sigue entregando y recibiendo.
3. **Qué hace la Presidencia mientras suple.** Lo mismo que la VP en el inventario:
   - materiales y etiquetas;
   - registrar y retirar direcciones logísticas y sus permisos para reservar;
   - préstamos y novedades;
   - entregar y recibir como el CML.

   El art. 54 habla de aprobar préstamos. Registrar direcciones logísticas va incluido porque el permiso para reservar cuelga del cargo: sin eso, una dirección elegida mientras falta la VP no podría reservar. Va en la línea del Reglamento, que pone a la Junta a asumir las funciones de un cargo de la Junta que queda sin titular mientras se elige (art. 61 par. 1).
4. **Se ve.** La Operación del inventario le dice a la Presidencia que está supliendo a la VP y por qué.
5. **El rol vuelve solo.** En cuanto haya una VP Administrativa activa en el término, la Presidencia deja de administrar el inventario. Lo que hizo mientras suplía queda en la auditoría con su nombre.
6. **No se presta ADMIN.** Igual que con la VP, el rol sale de los nombramientos del término y no concede ADMIN.

## Consecuencias

- Una sola regla, `inventoryManagerRoleInTerm` en `people`, decide quién administra para el dominio del inventario, para la Operación y para registrar direcciones logísticas.
- Con VP y Presidencia vacantes a la vez, nadie administra; ADMIN puede seguir registrando cargos logísticos, como hoy.
- Si la VP vuelve a una membresía operativa, retoma el inventario sin ningún paso manual.
