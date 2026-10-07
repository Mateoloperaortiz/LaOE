# ADR-115: Reglas de campañas de correo y tareas de GH del cuarto ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-07
- Relacionadas: ADR-012, ADR-023, ADR-038, ADR-079, ADR-109
- Enmienda: ADR-038 (regla 8: el lote de una campaña y su cancelación)

## Contexto

El cuarto ciclo del refactor progresivo ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)) es de campañas de correo y tareas de GH. Sus defectos están en el [ledger](../20-deuda-tecnica.md), leídos en el código, y acá sí había zonas sin red: el ciclo empezó por pruebas de caracterización (DT-077) y cada defecto se reprodujo con una prueba en rojo antes de corregirlo. Esta ADR reúne las reglas que cambian en el ciclo: cada ticket suma la suya.

**El lote de una campaña (DT-067, DT-112).** Según [ADR-038](ADR-038-comunicaciones-y-pwa-fase-6.md) regla 8, el tick de campañas tomaba hasta `campaigns.perMinute` destinatarios pendientes con `FOR UPDATE SKIP LOCKED` y, dentro de esa misma transacción, enviaba cada correo, marcaba a su destinatario y al final recontaba. De ahí salían tres cosas:

- Los correos salían antes del commit. Si la transacción se revertía (el registro de un mensaje que falla, un `statement_timeout`, el proceso que muere), los destinatarios volvían a `PENDING` con el correo ya entregado y el tick siguiente se lo repetía a todo el lote. Se reprodujo: en un lote de cinco en el que falla el registro del tercer correo, los dos primeros recibieron dos correos cada uno.
- La transacción quedaba abierta mientras el proveedor respondía, con una conexión del pool y los candados de sus destinatarios, y el tick corre en el mismo proceso que la web.
- Cada lote recontaba sin ver lo que otro lote todavía no había confirmado. Dos a la vez dejaban la campaña `SENDING` para siempre y con los contadores a medias, y ningún tick posterior lo corregía, porque sin pendientes el lote salía antes de recontar.

**Cancelar con un lote en curso (DT-068).** La cancelación tomaba la fila de la campaña con `FOR UPDATE` y después esperaba a los destinatarios que el lote tenía tomados. El lote, por su lado, registraba cada `message` por otra conexión, y esa inserción pedía la fila de la campaña por su llave foránea: quedaba esperando a la cancelación desde Node, donde Postgres no ve ningún ciclo ni aborta a nadie. Los dos se quedaban quietos hasta que el `statement_timeout` (60 segundos por omisión) cancelaba la sentencia de la cancelación, que fallaba con un error que no es de dominio mientras la campaña seguía enviando. Se reprodujo siempre que la cancelación llegaba con un envío en curso.

## Decisión

1. **El lote reclama, envía sin transacción abierta y marca a cada destinatario en la suya.** `processCampaignBatch` recorre las campañas `SENDING`, de la más antigua a la más nueva, y en una transacción corta por campaña reclama destinatarios libres hasta completar `campaigns.perMinute`: escribe la hora del lote en `campaign_recipient.claimed_at`, una columna nueva y anulable.
   - Libre es `PENDING` sin reclamo, o con un reclamo de 15 minutos o más. Reclamar no cambia el estado: `PENDING` con reclamo vigente quiere decir «un lote lo tiene».
   - Después envía uno por uno, sin transacción abierta ni conexión retenida, y el resultado de cada correo (`SENT` o `FAILED`, con su mensaje y su hora) queda en una transacción propia.
   - Antes de cada envío comprueba que el destinatario siga pendiente, que el reclamo siga siendo el de ese lote y que la campaña siga `SENDING`. Si no, no envía.
   - Un lote que se cae no deshace lo que ya marcó, y lo que dejó reclamado vuelve a salir cuando vence el reclamo. Si un envío no se puede registrar, el lote se detiene ahí: seguir sería mandar correos que nadie puede anotar.
   - Los 15 minutos son más de lo que el poller espera a un handler (`JOBS_HANDLER_TIMEOUT_MS`, 10 minutos por omisión, [ADR-079](ADR-079-limites-de-espera-y-esquema-verificado-desde-el-esquema.md)), pero el reclamo no detiene al lote: al vencer ese límite el poller solo deja de esperarlo y el handler sigue su curso. Si un lote sigue enviando cuando vence su reclamo, otro reclama lo que le faltaba, y es la comprobación previa a cada envío la que impide que el lote viejo mande algo de eso. Queda fuera de esa comprobación el correo que el lote viejo tenía en vuelo en ese instante: todavía no tiene registro, el lote nuevo también lo envía y su destinatario lo recibe dos veces.

2. **Cada correo de campaña se registra con una clave por campaña y persona, y quien ya la tiene no recibe otro.** `sendCampaignEmail` guarda el `message` con `dedupeKey` `campaign:<id>`, sobre el índice único por persona y clave que ya usaba el bus (ADR-038 regla 2).
   - Antes de enviar busca ese registro. Si existe no envía y responde con él, sea de un envío o de un rechazo: el destinatario queda con el estado, el mensaje y la hora de ese registro. Así se recupera el destinatario cuyo correo quedó registrado y sin marcar.
   - Si dos lotes llegan a registrar el mismo correo, queda una sola fila y los dos marcan con ella.
   - El resultado del tick cuenta solo lo que ese lote envió, no lo que recuperó.

3. **Todo lo que escribe sobre una campaña toma primero su fila.** El reclamo, la marca de cada destinatario y el recuento empiezan su transacción con `FOR UPDATE` sobre la fila de la campaña, el mismo candado con el que ya empezaban la cancelación, la edición y la programación; los destinatarios se tocan después.
   - Con un solo orden no hay ciclo de espera entre el lote y un comando del admin.
   - Los contadores se cuentan y se escriben bajo ese candado: dos lotes a la vez recuentan uno después del otro, y el que marca al último pendiente cierra la campaña.
   - `startCampaign` conserva su advisory lock `campaign:<id>`, que toma antes de la fila y que nadie más toma.
4. **Cancelar no espera al lote, y lo que el proveedor ya respondió manda sobre la cancelación.** `cancelCampaign` toma la fila de la campaña, deja `SKIPPED · CANCELLED` todo lo `PENDING`, lo tenga reclamado un lote o no, y pasa la campaña a `CANCELLED`. No espera a nadie: el lote no retiene candados mientras envía (regla 1) y los dos toman la fila en el mismo orden (regla 3).
   - El lote ve la cancelación en la comprobación previa a su siguiente envío y no manda lo que le quedaba, que ya quedó omitido por cancelación.
   - El correo que iba en vuelo cuando se canceló sí salió. Cuando el proveedor responde, su destinatario pasa de omitido a `SENT`, o a `FAILED` si lo rechazó, con su mensaje, y los contadores de la campaña se recuentan aunque ya esté cancelada, sin tocarle el estado ni `finishedAt`. Así `sentCount` coincide con lo que recibió el transporte.
   - Lo que no llegó a intentarse nunca pisa una cancelación: un destinatario al que le faltan sus datos o su plantilla solo queda `FAILED` si sigue pendiente.

## Consecuencias

- La entrega sigue siendo «al menos una vez», con la ventana reducida a un correo. Antes se repetía el lote entero; ahora puede repetirse un correo, una vez, por dos caminos (DT-113):
  - El que el proveedor aceptó y cuyo registro no llegó a guardarse, porque el proceso murió o la base no respondió en ese instante. Sale otra vez cuando vence el reclamo.
  - El que un lote tenía en vuelo cuando venció su reclamo, si a los 15 minutos seguía vivo: el lote que lo releva también lo envía, y de los dos envíos queda un solo registro (regla 2). Un lote de 200, el tope de `campaigns.perMinute`, pasa de 15 minutos si cada correo tarda más de unos 4,5 segundos.
- Cerrar esas ventanas sin perder correos pide una clave de idempotencia del lado del proveedor, que SES no ofrece. La otra salida es registrar la intención antes de enviar, que cambia el correo repetido por uno que puede no salir: es la decisión abierta 13 de [decisiones-abiertas.md](../decisiones-abiertas.md), y mientras no se decida vale lo que dice la regla 1.
- Tras una interrupción, lo que el lote tenía reclamado espera hasta 15 minutos. La campaña sigue mientras tanto con los demás destinatarios.
- Un rechazo del proveedor deja su registro con la clave, así que nadie lo reintenta, como antes. Cuando DT-066 decida reintentar los rechazos por cuota, ese intento no puede dejar un registro con la clave, o tiene que poder reemplazarlo.
- Una campaña cancelada puede mover sus contadores una vez más después de cancelada, cuando responde el proveedor por el correo que iba en vuelo: a lo sumo uno por lote en curso. Si el proceso muere justo ahí, ese destinatario queda omitido aunque su correo salió y está en `message`.
- Migración aditiva `0047_campana_reclamo_del_lote`: una columna anulable, sin backfill. Una campaña que esté `SENDING` al desplegar sigue su curso: sus pendientes no tienen reclamo, sus mensajes viejos no tienen clave y sus destinatarios ya enviados están marcados.
- El lote hace dos lecturas más por correo (el reclamo y el registro) y una transacción corta por destinatario. Con el tope de 200 por minuto de `campaigns.perMinute` son cientos de sentencias cortas por minuto, a cambio de no tener ninguna transacción abierta mientras responde el proveedor.
- Las pruebas están en `tests/integration/campaigns-characterization.test.ts`: los defectos reproducidos, ya como pruebas corrientes, y las del reclamo, su vencimiento, el lote que sigue vivo cuando vence su reclamo, el destinatario recuperado (con su correo enviado o rechazado), la transacción que no queda abierta y la cancelación con un correo en vuelo y repetida a la par del lote.
