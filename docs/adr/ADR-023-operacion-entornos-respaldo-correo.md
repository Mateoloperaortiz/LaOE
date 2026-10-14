# ADR-023: Operación: entorno de pruebas, copia externa y correo con desbordamiento

- Estado: Aceptada (enmendada por ADR-038, ADR-039, ADR-050, ADR-115 y ADR-116)
- Fecha: 2026-09-02
- Enmienda: ADR-021 (puntos "Entornos", "Respaldos" y "Presupuesto") y ADR-015 (enrutamiento del correo)

## Contexto

Mateo decidió el 2026-09-02: construir desde cero con un entorno de pruebas permanente; guardar la copia mensual en un bucket de Cloudflare R2; quedarse en Railway Pro después del cutover; y aceptar que habrá días de evento con más de 100 correos, así que el respaldo de correo tiene que ser automático. Hechos verificados en la documentación de Railway: un servicio puede correr por cron (mínimo cada 5 minutos, horario UTC, debe terminar solo; si una ejecución sigue viva, la siguiente se salta), y hay una guía oficial de volcados externos de Postgres con un servicio cron; el Postgres solo está en la red privada, así que GitHub Actions no lo alcanza; los buckets no tienen snapshots. Resend gratis: 3.000 correos al mes y 100 al día. SES: US$0,10 por cada 1.000, con cuenta de AWS, dominio verificado y salida del sandbox.

## Decisión

1. **Entornos.** Dos entornos persistentes en el proyecto. `staging` existe desde la fase 0: web, Postgres y bucket propios, sigue la rama `main`, datos sintéticos, dominio de Railway o `pruebas.oeeafit.com` con `noindex`, correo a consola salvo pruebas explícitas. `production` se crea en la fase 7 y sigue la rama `production`, que se adelanta a mano desde `main` cuando algo está listo. Los entornos de PR quedan apagados. Los ensayos de migración con datos reales se hacen en local, no en `staging`.
2. **Copia externa mensual.** Servicio `backup` en el mismo proyecto, con cron de Railway el día 1 de cada mes (`0 8 1 * *`, 03:00 de Bogotá) e imagen propia con `pg_dump` (`Dockerfile.backup`). Hace el volcado por la red privada, copia los objetos del bucket de medios, cifra todo con `age` (clave pública en el repositorio, clave privada solo con Mateo), lo sube a un bucket privado de Cloudflare R2 (plan gratis, 10 GB), conserva 12 copias y termina. El job `backup-check` del servicio web avisa si la última copia tiene más de 35 días. Antes de cada paso del cutover se ejecuta a mano. La restauración se ensaya en local cada mes.
3. **Correo.** Un solo adaptador `Mailer` con dos transportes. Resend envía lo transaccional (OTP, puntos, recordatorios) mientras el contador del día esté por debajo de 95; desde ahí, o ante un error de cuota de Resend, el mismo mensaje sale por SES sin intervención. Las campañas salen siempre por SES para no gastar el cupo mensual de Resend. `Message.provider` registra por dónde salió cada correo. SES se configura en la fase 0.
4. **Plan y CDN.** Se sigue en Pro después del cutover. Sin Cloudflare delante por ahora: se revisaría solo ante spam en formularios públicos, lentitud medida del portal o cargos de egreso.

## Consecuencias

- Costo: `staging` ≈ US$3 a 4 al mes y `backup` unos centavos, dentro de los US$20 incluidos; R2 y SES cuestan centavos.
- Dos entornos duplican variables; el runbook lista cuáles difieren (dominio, remitente, `JOBS_ENABLED`, claves).
- El desbordamiento a SES es invisible para la persona; el remitente es el mismo `oeeafit.com` en ambos.
- Una copia fuera de Railway protege contra la pérdida de la cuenta o del proyecto, no solo contra errores de datos.

## Enmienda (2026-09-05, ADR-038)

`sendCampaignEmail` usa el transporte de desbordamiento (SES) si existe y el primario si no (consola en local), registra `message` con `kind CAMPAIGN` y `campaignId`, y todo correo de campaña lleva las cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post: List-Unsubscribe=One-Click` hacia `/api/baja/[token]`; `MailMessage` gana `headers` y los dos transportes lo pasan. Ver [ADR-038](ADR-038-comunicaciones-y-pwa-fase-6.md).

## Enmienda (2026-09-06, ADR-039)

En la fase 7 solo se usan `staging` (sintético) y `production` (arranque limpio); no existe entorno de ensayo con datos reales. Correo transaccional y campañas por Resend; `AWS_REGION` ausente deja SES aplazado. El transporte reintenta ráfagas 429 hasta tres veces (cuatro llamadas en total), con esperas base de 1/2/4 segundos y respetando un Retry-After mayor, sin un tope adicional de 30 segundos; no reintenta cuotas diarias o mensuales. El servicio `backup` usa `docker/backup/Dockerfile` y `scripts/backup.sh`, cron `0 8 1 * *`, dump, objetos y manifiesto cifrados hacia R2. Retiene 12 copias completas en total, manuales y programadas; verifica subida antes de podar y actualiza `backup.lastRunAt` al final. Cloudflare ya está delante: se conservan proxy, SSL Full y DNSSEC. La fase 0 B no se considera completada hasta probar staging y restaurar una copia externa. Ver [ADR-039](ADR-039-arranque-limpio-fase-7.md).

### Precisión operativa de ADR-039 · 2026-09-06

La corrida manual del servicio backup se inicia en Railway desde Casa Digital → production → backup → Cron Runs → Run now. `railway redeploy` prepara el deployment de cron y no inicia la copia. Cron mensual, cifrado, verificación de subida y retención de 12 copias totales conservan lo aprobado; resultado y restauración se acreditan por corrida en [15-runbook.md](../15-runbook.md).

## Enmienda (2026-09-10, ADR-050)

El correo transaccional del código de acceso usa el envoltorio común de ADR-038 con un pie transaccional propio, sin el pie legal de campañas ni lenguaje de lista de correo, y declara que es automático con `Auto-Submitted` y `X-Auto-Response-Suppress`. El transporte y el desbordamiento no cambian. Ver [ADR-050](ADR-050-correo-transaccional-del-codigo.md).

## Enmienda (2026-10-07, ADR-115)

La regla 3 mandaba las campañas siempre por SES, y desde ADR-039 salen por Resend sin contar su cupo. Ahora, cuando una campaña sale por Resend, el lote no pasa de `RESEND_DAILY_LIMIT` menos un margen reservado para lo transaccional (`campaigns.transactionalReserve`, un tercio del cupo si nadie lo fija), contando lo que Resend aceptó hoy en Colombia, transaccional y de campaña: lo que no cabe sigue pendiente para el otro día. Un rechazo por cuota de Resend a un correo de campaña no lo deja fallido: su destinatario sigue pendiente y ningún lote sale hasta el otro día. El contador del día cuenta por la hora de envío (`sentAt`). El enrutamiento de lo transaccional y el desbordamiento no cambian. Ver [ADR-115](ADR-115-reglas-de-campanas-y-tareas-de-gh.md), reglas 5 y 6.

## Enmienda (2026-10-08, ADR-116)

La regla 3 describe un solo adaptador con dos transportes, sin reglas de negocio. El mensaje que reciben gana un campo opcional, la clave de idempotencia del proveedor: Resend la recibe en el encabezado `Idempotency-Key` y durante 24 horas no entrega dos veces el correo que la repita con el mismo contenido; SES no tiene nada equivalente y la ignora, igual que la consola. El adaptador solo la transporta: la arma `comms` con el entorno, la clave del registro y la persona ([ADR-116](ADR-116-reglas-de-correccion-privacidad-y-permisos.md) regla 18). El desbordamiento a SES sigue como estaba, y el correo que desborda sale sin esa protección.
