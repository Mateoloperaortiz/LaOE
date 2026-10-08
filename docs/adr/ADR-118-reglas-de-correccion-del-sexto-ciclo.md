# ADR-118: Reglas de corrección del sexto ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-08
- Relacionadas: ADR-012, ADR-021, ADR-034, ADR-079, ADR-109, ADR-113, ADR-116
- Enmienda: ADR-012 (el intento se cuenta al tomar la fila, y el dead letter llega tras cinco intentos, hayan fallado o no hayan terminado) y ADR-079 (regla 6: si la base corta la conexión del poller, el intento ya está contado y espera su backoff)

## Contexto

El sexto ciclo del refactor progresivo ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)) es de corrección: la entrega de eventos, la membresía, el crm, lo que corre en el navegador y los errores que nadie ve. Sus defectos salen de la segunda ola de la auditoría de huecos (origen `H08` en el [ledger](../20-deuda-tecnica.md)): leídos en el código y, los de severidad media, confirmados por un segundo lector, pero sin ejecutar, así que cada uno se reprodujo con una prueba en rojo antes de corregirlo. Esta ADR reúne las reglas que cambian en el ciclo: cada ticket suma la suya.

**El intento que nadie contaba (DT-212).** `processOne` (`src/jobs/poller.ts`) tomaba la fila del outbox con `FOR UPDATE SKIP LOCKED`, corría los handlers con esa transacción abierta y recién al final escribía `attempts`, en la misma transacción. Si el proceso moría con el evento tomado, PostgreSQL deshacía la transacción: la fila quedaba con `attempts` sin tocar y con el `nextAttemptAt` más viejo de la cola, así que el arranque siguiente la tomaba de primera. Un evento capaz de tumbar el proceso lo tumbaba en cada arranque y nunca llegaba a dead letter; Railway deja de levantar el servicio al quinto reinicio (`.railway/railway.ts`), y el poller corre en el mismo proceso que atiende la casa. [ADR-079](ADR-079-limites-de-espera-y-esquema-verificado-desde-el-esquema.md) regla 6 describía la misma clase de fallo («la fila quedaría libre sin contar el intento y se reintentaría de inmediato y sin backoff») y cerraba una sola de sus causas. Reproducido en rojo con un handler que cierra la conexión del poller con `pg_terminate_backend`, que para la fila es lo mismo que la muerte del proceso: `attempts` seguía en 0.

## Decisión

1. **El intento se cuenta al tomar la fila, y la toma se confirma antes de correr nada.** El poller entrega un evento en dos pasos:
   - **La toma** (`take`, `src/jobs/poller.ts`): una transacción corta elige la fila vencida más vieja con `FOR UPDATE SKIP LOCKED`, le suma el intento, corre su `nextAttemptAt` lo que esperaría un fallo de ese intento (1 min, 5 min, 30 min, 2 h, 12 h) y confirma. Si el proceso muere después, el intento ya está contado y la fila no vuelve de primera.
   - **La entrega**: otra transacción vuelve a bloquear la fila con `FOR UPDATE` y la sostiene mientras corren los handlers, igual que antes. Al final anota el resultado: procesada, o el error con su espera, o dead letter.
   - **Una fila que llega a la toma con sus cinco intentos gastados va a dead letter sin correr.** Un fallo anotado la habría dejado en dead letter, así que ninguno de sus intentos terminó. Su `lastError` lo dice, conserva el error anterior si lo había, y desde `/admin/sistema/jobs` se puede reintentar como cualquier otra.
   - **La exclusión entre dos pollers no cambia.** Mientras corren los handlers la fila sigue bloqueada, y quien la busca con `SKIP LOCKED` la salta aunque su espera venza. Por eso la espera de la toma es el backoff del intento y no el límite del handler: no reserva la fila, dice cuándo se vuelve a intentar si nadie termina. `/admin/sistema/jobs` la sigue mostrando entre los pendientes, ya con el intento contado.
   - **Convivencia en un despliegue.** El contenedor anterior conserva su poller hasta 300 s ([runbook](../15-runbook.md), «carrera de contenedores»). Una fila tomada por el poller nuevo no la toma el anterior: no está vencida y además está bloqueada. Una fila tomada por el anterior no la toma el nuevo: el anterior la sostiene con su `FOR UPDATE` y la toma la salta. Una fila que el nuevo dejó a medias y que el anterior encuentra vencida sigue la cuenta donde iba, porque el anterior suma uno al `attempts` que lee; si ya tenía los cinco, el anterior la corre una vez más antes de mandarla a dead letter. Lo mismo vale si se devuelve un despliegue.

## Consecuencias

- Un evento que tumba el proceso lo tumba como mucho cinco veces, espaciadas por el backoff, y después queda en dead letter a la vista. Antes lo tumbaba en cada arranque. El quinto intento que no termina espera sus 12 horas como pendiente antes de pasar a dead letter, porque la toma solo mira filas vencidas.
- Que cinco intentos sin terminar coincidan con los cinco reinicios que Railway tolera no se comprobó contra Railway: queda anotado en el ledger (DT-239).
- Cada evento cuesta dos transacciones cortas en vez de una. El poller sigue siendo serial y sigue sosteniendo una transacción mientras trabaja: reservar la fila sin transacción y llevar una fila por par evento-handler siguen en DT-016.
- ADR-079 regla 6 sigue vigente (la base espera más que el poller), pero lo que evita ya no es un reintento inmediato: si la base corta la conexión de la entrega, el intento está contado y la fila espera su backoff.
- La prueba de la muerte del proceso mostró algo que no es de este ticket: una conexión prestada del pool no tiene quién oiga su `error`, y cerrarla desde la base deja una excepción sin atrapar en el proceso (DT-238).
- Pruebas: `tests/integration/outbox.test.ts` (caracterización del poller antes del cambio, la toma con el intento contado y la muerte del proceso hasta el dead letter).
- No cambia el esquema, ningún texto ni ninguna pantalla.
