# ADR-023: Operación: entorno de pruebas, copia externa y correo con desbordamiento

- Estado: Aceptada (enmendada por ADR-038, ADR-039)
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
