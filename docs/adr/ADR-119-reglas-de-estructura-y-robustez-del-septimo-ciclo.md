# ADR-119: Reglas de estructura y robustez del séptimo ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-09
- Relacionadas: ADR-006, ADR-012, ADR-035, ADR-060, ADR-067, ADR-109, ADR-111, ADR-114, ADR-116
- Enmienda: ADR-035 (regla 6: en una ocasión cancelada ninguna asistencia nace ni vuelve a quedar aprobada), ADR-116 (regla 2: el orden de candados gana la ocasión, entre el término y la persona)

## Contexto

El séptimo ciclo del refactor progresivo ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)) es de estructura, con cinco restos de seguridad y robustez. Los tickets de estructura no cambian conducta: una matriz de caracterización en verde fija lo que el código hace antes de tocarlo, y lo que esta ADR decide cambiar se nombra con su prueba. Los defectos que el ciclo trae se reprodujeron con una prueba en rojo antes de corregirlos. Esta ADR reúne las reglas que cambian en el ciclo: cada ticket suma la suya.

**Una asistencia viva en una ocasión cancelada (DT-161).** [ADR-116](ADR-116-reglas-de-correccion-privacidad-y-permisos.md) regla 1 hizo que toda transición de una asistencia que ya existe tome su fila, y su regla 2 fijó el orden de candados. La ocasión quedó fuera: el registro propio y el del organizador la leían sin candado, y decidir no miraba su estado. La cancelación toma la ocasión `for update`, la marca cancelada y después toma las asistencias que existen, así que no puede ver la que todavía no se insertó. Reproducido con pruebas (`tests/integration/participation-checkin-cancelled-occasion.test.ts`):

- Registrarse mientras la ocasión se cancela: el registro leía la ocasión abierta, esperaba a la cancelación en la clave foránea y después insertaba. La asistencia nacía aprobada, con sus puntos, en una ocasión cancelada. Igual con el registro del organizador.
- Un rechazo de una ocasión ya cancelada se reaprobaba y acreditaba: `REJECTED → APPROVED` vale según [ADR-035](ADR-035-participacion-y-gh-points-fase-3.md) regla 6, la cancelación no toca los rechazos y decidir no preguntaba por la ocasión. Sin concurrencia, desde la consola.
- Reaprobar un rechazo mientras la ocasión se cancela esperaba la fila de la asistencia, que la cancelación tiene tomada, y la aprobaba apenas la soltaba.

## Decisión

1. **Crear y decidir una asistencia leen el estado de la ocasión con su fila tomada.** `lockOccasion` (`src/modules/participation/domain/check-ins.ts`) lee la ocasión con `for share` después del candado del término y antes de tomar o insertar asistencias. La usan el registro propio, el del organizador, la decisión por `id` y el lote, que toma sus ocasiones en orden de `id`. Abrir, cerrar y cancelar ya tomaban la fila `for update` (`transition`, en `occasions.ts`), así que los dos órdenes posibles quedan bien: la cancelación que va en curso se espera y se encuentra hecha, y la que llega después espera a que la asistencia confirme y la anula con las demás. Con la ocasión tomada:
   - El registro propio responde lo de siempre para una ocasión que no está abierta (`CANCELLED`, `CLOSED` o `DRAFT`) y el del organizador, T-620 o T-578.
   - Decidir rechaza con T-578 («la ocasión está cancelada») la decisión que dejaría aprobada una asistencia de una ocasión cancelada. Va después de validar la transición: T-676 sigue respondiendo primero.
   - Rechazar y anular en una ocasión cancelada siguen valiendo. Solo cierran, y son la salida para una asistencia que haya quedado viva antes de esta regla.
   - Una ocasión cerrada sigue admitiendo decisiones: aprobar las pendientes después del evento es el flujo normal.

   La primera lectura, sin candado, se conserva: con ella se responde en el orden de siempre (ocasión, estado, término) y se sabe qué término tomar. Si entre las dos lecturas la ocasión cambió de término, que solo le pasa a un borrador, responde T-260 como `transition`. El candado es `for share` y no `for key share`: también excluye una escritura de la ocasión que no pase por `transition`. El orden de candados de ADR-116 regla 2 gana un lugar: término → **ocasión** (compartido; abrir, cerrar y cancelar la toman exclusiva) → persona → asistencias → recálculo → premio → reto presencial.

   La excusa no toma la ocasión. Su asistencia no queda viva: no tiene crédito ni premio y la cancelación no toca las excusadas, así que excusar a la vez que se cancela deja lo mismo que excusar justo antes.

## Consecuencias

- Cada registro y cada decisión toman una fila más, compartida. No se frenan entre sí: los 500 registros simultáneos de `participation-checkin.test.ts` siguen pasando. Sí esperan a quien edita la ocasión abierta (el título, el lugar o el código rotativo), y al revés, lo que dura una transacción.
- El registro que llega mientras la ocasión se cierra responde `CLOSED` en vez de nacer en una ocasión cerrada: es la misma lectura.
- La regla no limpia lo que ya exista. Si en producción quedó alguna asistencia viva en una ocasión cancelada, se anula desde la consola, que lo sigue admitiendo; no se buscó si las hay (DT-268).
