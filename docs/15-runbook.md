# Runbook de lanzamiento y operación

Regla vigente: [ADR-039](adr/ADR-039-arranque-limpio-fase-7.md). Preparado el 2026-09-06. **Los pasos operativos se consideran pendientes** hasta que una fila de evidencia registre su ejecución. Este documento no acredita que Railway, dominio, correo, push o respaldos estén configurados.

## Entornos, variables y promoción

Raíz del repo: `/Users/mateo/Documents/GitHub/LaOE/casa-digital`. Repo anterior: `/Users/mateo/Documents/GitHub/GHPOINTS`.

Proyecto nuevo `casa-digital`, región `us-east4-eqdc4a`. Solo `staging` y `production`; `web` y `Postgres` con una réplica y límites de 1 vCPU/1 GB. Dominio `oeeafit.com:8080` declarado únicamente en producción desde el cutover verificado del 2026-09-08. `db:release` aplica migraciones y verifica esquema sin cargar `.env` local; `db:migrate` sí admite `.env` para uso local; nunca usar seed o migradores GHPOINTS en producción.

| Variable / recurso | Staging | Producción |
| --- | --- | --- |
| Rama | `main` | `production`, promovida manualmente |
| `NODE_ENV`, `TZ`, `APP_TIMEZONE`, `PORT` | `production`, `UTC`, `America/Bogota`, `8080` | Igual |
| `RAILPACK_NODE_VERSION`, healthcheck | `24`, `/api/health`, 300 s | Igual |
| `APP_URL` | Dominio de Railway | `https://oeeafit.com` desde el primer arranque |
| `JOBS_ENABLED`, `PUBLIC_INDEXING` | `true`, `false` | `true`, `true` |
| `MAILER`, `EMAIL_FROM` | `console`, `OE EAFIT <noreply@oeeafit.com>` | `resend`, mismo remitente |
| `RESEND_API_KEY` | Ausente | Clave nueva de casa-digital |
| `AWS_*`, `OTP_FIXED_CODE` | Ausentes | Ausentes |
| `DATABASE_URL`, `S3_*` | Referencias a Postgres/bucket de staging | Referencias a Postgres/bucket de production |
| `S3_FORCE_PATH_STYLE` | `false` | `false` |
| `SESSION_SECRET`, `VAPID_*` | Propios de staging | Propios de production |
| `VAPID_SUBJECT` | `https://oeeafit.com` (URL de contacto Web Push) | `https://oeeafit.com` (URL de contacto Web Push) |
| `backup` | No existe | Cron mensual, referencias DB/bucket y secretos R2/age |

Los comandos desplegados anteponen `NPM_CONFIG_PRODUCTION=` a `npm run start` y a `npm run db:release`. Railpack deja esa clave obsoleta en la imagen y npm la advierte en cada invocación; la línea llega a los registros de Railway con severidad de error y ensucia cualquier filtro por severidad. Vaciarla dentro del comando la deja en `null` y no toca la instalación del build, que sigue necesitando las dependencias de desarrollo; declararla como variable del servicio sí la cambiaría, porque las variables también rigen el build. El valor vive en `.railway/railway.ts` y se aplica por entorno con `update-service` (solo `startCommand` y `preDeployCommand`). Un `redeploy` reutiliza la configuración del despliegue anterior: el comando nuevo solo entra en un despliegue nuevo, por push o promoción.

Antes de crear recursos, comprobar tope duro US$20 y alerta US$15. No aumentar automáticamente. Usar `.railway/railway.ts` desde un checkout privado completo y generar el plan con el bloque de alcance siguiente; aplicar solo el plan revisado del proyecto/entorno confirmado. El IaC declara `Postgres-PITR` en staging y `Postgres-PITR-production` en producción. Los nombres de buckets son únicos a nivel del proyecto: usar el mismo en ambos entornos puede hacer que un apply proponga borrar el archivo del segundo. Omitir el bucket también expone el archivo a su eliminación. Antes de cada apply, exigir cero borrados de recursos/archivos; si el plan elimina ese bucket, detenerse y corregir su adopción. El SDK 3.11 no ofrece una propiedad PITR ni una exclusión de recursos; no precrear el bucket vacío porque el comando de habilitación usa una plantilla y no garantiza reutilizarlo. Aprovisionar secretos y referencias en el orden que permita un primer arranque válido; `preserve()` conserva valores, no los inventa.

Railway CLI 5.46 no acepta proyecto/entorno como flags de `config plan`. En el checkout privado completo, sustituir los campos entre corchetes angulares y ejecutar:

```sh
railway link --project <project-id> --environment <entorno>
railway status --json
```

Comprobar en el resultado que los IDs de proyecto y entorno coincidan con el destino esperado. Solo entonces, desde el mismo checkout:

```sh
railway config plan --out <archivo-privado>
```

El plan abarca el entorno completo. Inspeccionarlo y aplicar únicamente ese archivo revisado; no regenerar otro plan implícitamente durante el apply ni reutilizar el enlace de otro checkout. Conservar planes y salidas con secretos fuera del repo.

Cada tramo de código cierra con `npm run check`, `npm run test:e2e` cuando corresponda, commit convencional y push. No ejecutar check/build con `next dev` usando el mismo `.next`. El e2e en modo CI corre contra build y `next start`; `NODE_ENV=test` se usa únicamente en ese entorno de pruebas para su OTP fijo. Producción sigue rechazando OTP fijo. La CSP activa `upgrade-insecure-requests` cuando `APP_URL` usa HTTPS; se conserva en los dominios publicados. Promoción: sustituir `<SHA_VALIDADO>` por el SHA exacto comprobado en CI, staging y su healthcheck, y ejecutar `git -c 'credential.helper=!gh auth git-credential' push origin <SHA_VALIDADO>:production`. El SHA tiene que estar en el checkout: el merge de un PR se crea en GitHub, así que antes hay que correr `git fetch origin main`; si no, el push falla con «non-commit object». Registrar SHA promovido y comprobar después el SHA del healthcheck de producción; un avance concurrente de main no cambia el candidato elegido. La promoción no se ejecuta dentro de la ventana del dominio.

## CI y comprobación del despliegue (ADR-053, ADR-054 y ADR-055)

Publicar cambios en una rama de trabajo y abrir un PR. Las ramas `main` y `production` exigen el check `CI` de GitHub Actions; un resultado pendiente, fallido o cancelado bloquea el avance. El check final exige las familias completas y verifica el inventario E2E y el outbox. Los resultados y tiempos quedan en `ci-result` y en los artefactos `ci-*` de la ejecución.

Si ningún job arranca y la anotación del run dice «The job was not started because recent account payments have failed or your spending limit needs to be increased», no falló el código: es la facturación de GitHub Actions de la cuenta. El check `CI` figura fallido sin haber corrido y los jobs pesados quedan omitidos. Cargar crédito o subir el límite de gasto en «Billing & plans» y relanzar solo lo fallido con `gh run rerun <ID_RUN> --failed`; los jobs omitidos vuelven a correr. Ocurrió el 2026-09-12 con los PR 15, 19 y 20: con el crédito cargado, los tres relanzamientos corrieron completos.

Tras el despliegue, `Smoke de Railway` comprueba por HTTP la salud y el SHA, HTTPS/CSP/indexación, robots, sitemap, manifest y calendario público. Su workflow separado evita esperar el deployment dentro del CI previo. Si se necesita repetirlo, ejecutar `gh workflow run smoke.yml --ref main -f deployment_id=<ID_GITHUB_DEPLOYMENT>` con el ID del deployment exitoso del entorno; el ID de GitHub es numérico y difiere del UUID de Railway. El modo manual valida el emisor, entorno e ID y usa las expectativas versionadas del entorno. También se conserva el comando local de smoke para diagnóstico.

La lista `scripts/ci/documentation-paths.json` permite validar documentación conocida sin ejecutar la suite completa. El clasificador analiza todo el rango; un archivo desconocido, copy, código, migraciones, dependencias, tests o configuración ejecutan todo. La misma lista excluye esos cambios documentales del autodeploy de web. Un `SKIPPED` de Railway por documentación conserva el último SHA realmente desplegado: no esperar que `/api/health` cambie al SHA del commit documental. Para promover código, seguir usando el SHA exacto aprobado en staging; la promoción conserva CI completo y smoke de producción.

Los E2E corren en cinco runners y la integración en dos, cada uno con una partición por archivo calculada desde `scripts/ci/e2e-durations.json` y `scripts/ci/integration-durations.json` (ADR-054 y ADR-055). El check `CI` exige que cada runner ejecute exactamente su partición y que la unión sea el inventario; un spec nuevo sin duración conocida entra con la mediana y nunca queda por fuera. Cuando la suite cambie de forma apreciable, refrescar las duraciones desde un `ci-result` completo y aprobado y publicar el JSON con el cambio:

```sh
gh run download <ID_RUN_MAIN> --name ci-result --dir ci-results
node scripts/ci/run.mjs e2e-durations ci-results/ci-result.json
gh run download <ID_RUN_MAIN> --pattern 'ci-integration-*' --dir ci-results --merge
node scripts/ci/run.mjs integration-durations ci-results/integration-1.json <ID_RUN_MAIN> <SHA>
```

Los informes de integración de una corrida vienen partidos (`integration-1.json`, `integration-2.json`); el comando acepta uno y suma los archivos que trae, así que para refrescar las duraciones completas conviene pasarlos uno por uno o generar el JSON desde una corrida local de la suite entera. Cuando cambie la lista documental, aplicar la misma lista a los watch patterns de `web` en staging y producción con `update-service` (solo `watchPatterns`, sin cambios escalonados) y releer la configuración.

Promoción (ADR-054): el push a `production` de un SHA con CI completo aprobado en `main` entra en modo `promotion`: el clasificador descarga el `ci-result` de esa ejecución con el token del workflow, lo verifica (SHA, ejecución, `mode: full`, resultado y las tres familias) y el check `CI` queda en verde en cerca de un minuto con los jobs pesados omitidos; el resumen y `ci-result.json` nombran la ejecución reutilizada. Railway sigue esperando ese check y el smoke posterior comprueba el SHA servido. Sin evidencia, con el artefacto vencido a los 14 días o ante cualquier incoherencia, la promoción ejecuta la suite completa: no hay que intervenir, solo esperar. Seguir promoviendo el SHA exacto validado en staging.

La evidencia de activación y las mediciones están en [la implementación del 2026-09-11](ci-cd-2026-09-11.md). Las reglas, el rollout y el comportamiento de la documentación se acreditan allí, no por la existencia de este procedimiento.

## Migraciones que encolan trabajo

Railway corre el pre-deploy (`db:release`) mientras el contenedor anterior sigue atendiendo. Ese contenedor conserva su poller del outbox hasta que el nuevo pasa el healthcheck, que en `web` tiene un timeout de hasta 300 s. Por eso, un job que una migración deja listo para correr lo puede tomar el código anterior. Pasó con `0033` el 2026-09-16: entre 4 y 6 segundos después de la migración, los contenedores viejos de staging y producción recalcularon la permanencia con el código previo, sin la equivalencia nueva, y hubo que volver a encolar el recálculo.

**Regla:** toda migración que inserte en `outbox` difiere el job **diez minutos**, más del doble del timeout del healthcheck. El poller solo toma filas con `next_attempt_at` vencido, así que el job lo procesa el código nuevo:

```sql
INSERT INTO "outbox" ("id", "event_type", "payload", "dedupe_key", "next_attempt_at")
SELECT 'migration00NN_' || <id>, '<evento>', jsonb_build_object(<campos>), '<clave>', now() + interval '10 minutes'
FROM <tabla> WHERE <condición>
ON CONFLICT DO NOTHING;
```

- **Comprobación:** pasado el plazo, buscar el job en los logs del despliegue **nuevo**. Si aparece en los logs del anterior, lo procesó el código viejo y hay que reencolarlo.
- **Job pendiente con la misma `dedupe_key`:** si ya había uno, `ON CONFLICT DO NOTHING` conserva ese y la migración no encola el suyo, así que el pendiente puede tomarlo el contenedor anterior. Revisar los logs después del despliegue y reencolar si hace falta.
- **Despliegue fallido:** si el despliegue falla después del pre-deploy, Railway mantiene el contenedor anterior y ese código toma el job al vencer el plazo. La migración ya no vuelve a correr, así que al corregir y desplegar hay que reencolar el job a mano o con la acción de la app que lo dispara. Para `permanence.recompute` alcanza con guardar un criterio de la tabla en Reglas.
- `0032` y `0033` son anteriores a esta regla y encolan sin diferir.

## T2 y T3: staging y claves

1. Confirmar acceso de Railway al repo privado, presupuesto y proyecto/entorno de destino. En un entorno nuevo, aprovisionar primero Postgres con su región/límites, habilitar PITR y comprobar el bucket que crea Railway. Asignarle el nombre correspondiente al entorno (`Postgres-PITR` en staging, `Postgres-PITR-production` en producción) conservando ID/contenido; comprobar referencias WAL y sonda PITR tras cualquier rename. Solo después aplicar el IaC completo que adopta ese bucket por nombre, y generar el dominio web de Railway; completar `APP_URL`.
2. Configurar secretos de staging y claves VAPID propias. `OTP_FIXED_CODE` debe estar ausente en el servicio; se lee el OTP real de consola en los logs para la cuenta sintética.
3. Aplicar CORS con `railway run --no-local -p <project-id> -s web -e staging -- node --import tsx scripts/storage-init.ts`. No agregar `--env-file`; evitar que `.env` local sobreescriba el entorno remoto.
4. Abrir túnel al Postgres correcto y sembrar únicamente staging con datos sintéticos. `railway run --no-local -p <project-id> -s web -e staging` ejecuta un proceso **local** con variables remotas; las direcciones privadas no son accesibles desde la estación. Reemplazar `DATABASE_URL` por la URL local que imprime el túnel. `NODE_ENV=development` solo se usa en el proceso local del seed sintético, nunca para bootstrap ni para la app desplegada.
5. Verificar `npm run smoke -- --base <URL staging> --expected-sha <SHA> --indexing false --bucket-origin <origen del bucket staging>`, OTP, admin, server actions y portada subida desde el navegador. Confirmar que la redirección prefirmada use el host virtual del bucket y que CORS/CSP no la bloqueen.
6. Activar y verificar respaldos diario/semanal/mensual y PITR. Registrar comandos reales y recurso exacto; no asumir que una configuración de otro Postgres se heredó.
7. Crear clave Resend nueva para el dominio ya verificado, claves VAPID de producción, bucket R2 privado `oe-respaldos` y credenciales restringidas a ese bucket. Estado al 2026-09-06, aproximadamente 21:50 UTC: Mateo activó R2 y se verificó en Chrome. Bucket `oe-respaldos` creado con clase Standard en Eastern North America y acceso público Disabled; token de cuenta `casa-digital-backup` Active, Object Read & Write restringido a ese bucket. `R2_*` cargadas y releídas en backup de production junto con `AGE_RECIPIENT`; la restauración externa de staging quedó comprobada a las 22:06:04 UTC; la primera copia de producción terminó y quedó restaurada con app local verificada a las 22:37:50.665 UTC. La privada age ya está guardada en 1Password y se verificó por descarga/SHA; publicar únicamente el destinatario público.
8. Crear rama `production` desde el candidato validado y protegerla como `main`. SES queda fuera; `AWS_REGION` ausente. Resend permite tres reintentos (máximo cuatro llamadas), con esperas base de 1/2/4 segundos y respetando un Retry-After mayor, sin un tope adicional de 30 segundos. Un Retry-After de 60 segundos se espera completo; cuotas diaria y mensual no se reintentan.

Túnel con alcance explícito: `railway connect Postgres --project <project-id> --environment <entorno> --tunnel-only -P 15439`. Verificar los IDs del destino; el comando no depende del último enlace local. El argumento posicional del CLI debe ser el nombre `Postgres`, no su UUID. La clave SSH `/Users/mateo/.ssh/id_ed25519` está registrada en Railway como `casa-digital-mateo`; la privada queda fuera del repo. La salida del túnel contiene contraseña: guardarla solo en un archivo privado y registrar aquí únicamente la URL redactada. Si el cliente rechaza TLS del túnel, resolver y documentar la configuración comprobada; no copiar una URL de otro entorno ni imprimir secretos en el registro.

## T4: producción limpia y primer acceso

1. El cierre inicial de T4 se verificó en 853d622 con CI, smoke 6/6 y UI real; registró PITR, snapshots, 69 tablas, 71 índices y pg_trgm. Las versiones posteriores se documentan en los registros de Normativa y de publicación del dominio al final de este runbook. El arranque inicial se verificó vacío; después del bootstrap hay una persona, una membresía ACTIVE y un ADMIN global, sin consentimientos, comités ni medios; política pendiente. El acceso real ya está comprobado. Para futuros applies, releer el plan y conservar Postgres, su volumen y `Postgres-PITR-production`. Railway CLI 5.46 necesita un checkout con `.railway` o `HEAD:.railway` aunque `--file` sea absoluto: usar un checkout privado completo; un directorio vacío falló antes de mutar.
2. El dominio temporal `web-production-345d59.up.railway.app`, ID `4f768441-22b2-476b-b6ca-1692c8cd1e64`, puerto 8080, se usó para smoke 6/6 y UI real de 853d622 y luego se eliminó. Readback de dominios custom/service vacío, URL 404 y health interno por SSH a localhost:8080 en 200. Producción quedó sin dominio público; `APP_URL=https://oeeafit.com` y CORS solo para ese apex permanecen. No agregar oeeafit.com al IaC antes de T6.
3. Mateo proporcionó fuera del repo un JSON privado con esta estructura; los textos entre corchetes son campos a completar, no datos válidos. Estado al 2026-09-06: identidad, código del término y fechas exactas recibidos por vía privada, validados y usados en el bootstrap. El archivo bootstrap-admin.json permanece privado; no copiar identidad ni fechas reales al repo:

```json
{
  "firstName": "[nombres reales]",
  "lastName": "[apellidos reales]",
  "email": "[correo institucional real]",
  "firstTerm": {
    "code": "[AAAA-1 o AAAA-2 real de ingreso]",
    "startsOn": "[fecha real AAAA-MM-DD]",
    "endsOn": "[fecha real AAAA-MM-DD]"
  }
}
```

4. Bootstrap ya ejecutado y reejecución idempotente comprobada el 2026-09-06. Comando usado por túnel al Postgres de production (desde [ADR-081](adr/ADR-081-el-catalogo-de-textos-no-viaja-entero-al-navegador.md) se invoca como `npm run bootstrap:admin -- --input <ruta privada>`, que agrega `--conditions=react-server`; la forma literal ya no carga): `node --import tsx scripts/bootstrap-admin.ts --input <ruta privada>` dentro de `railway run --no-local -p <project-id> -s web -e production -- env DATABASE_URL=<URL del túnel> …`, con sus variables remotas y `DATABASE_URL` apuntando al túnel. No cargar `.env` local, no alterar `NODE_ENV`, no poner datos personales en comandos del repo. El bootstrap crea término de ingreso si falta, persona, membresía ACTIVE y ADMIN en una transacción auditada; no crea comités, consentimiento, bienvenida ni importación. Repetir el mismo ADMIN no modifica nada; otro ADMIN existente bloquea una nueva concesión.
5. Acceso real comprobado el 2026-09-06: Mateo recibió el OTP de Resend y abrió Mi OE y Administración en Chrome, con una sesión y cero consentimientos del bootstrap. Política pendiente debe permitir acceso y check-in, y bloquear nuevas autorizaciones y los flujos que las crean. Mantener las revocaciones disponibles.
6. Las copias anterior y posterior al bootstrap ya fueron restauradas con app local verificada; la segunda incluye la cuenta ADMIN, sesión y mensaje de acceso, sin consentimientos. Para copias posteriores, ejecutar manualmente desde Cron Runs → Run now y comprobar archivo y marca (sección siguiente). El dominio temporal ya se retiró y producción quedó sin dominio público antes de T6. Configurar el término actual y su calendario desde el admin con datos reales, no inferidos del término de ingreso.

La política y el roster se cargan desde la app. El nuevo control **Política de datos** (`/admin/sistema/politica`) quedó desplegado y verificado en producción con 853d622. La página y versión reales siguen pendientes; con el dominio final activo, el procedimiento es:

1. Con ADMIN, editar la página `privacidad` desde **Páginas** y guardarla con audiencia PUBLIC, estado PUBLISHED y cuerpo completo.
2. Abrir `/privacidad` y revisar el texto publicado.
3. Entrar en **Política de datos**, escribir la versión real y guardar con step-up. La activación rechaza una página sin publicar o vacía y registra `config.updated`; no habilitar con un valor inventado.
4. Confirmar la versión activa y entonces importar el roster real mediante el asistente. Si hace falta detener nuevas aceptaciones, guardar `pendiente` en el mismo control: el bloqueo es inmediato y conserva el texto publicado y los consentimientos anteriores.

La Server Action consulta las APIs públicas de content/system; system no depende de content. La versión sigue siendo el interruptor técnico: no se crea un consentimiento con `pendiente` ni se cambian versiones históricas. Los demás permisos se conceden mediante el admin y su step-up normal.

## Backup y restauración

Servicio `backup` solo en producción, imagen `docker/backup/Dockerfile` con PostgreSQL 18, Bash, age, rclone y zstd. Cron UTC `0 8 1 * *` (03:00 de Bogotá del día 1). Variables: referencias `DATABASE_URL` y `S3_*`, más `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `AGE_RECIPIENT`, `TZ=UTC`. La privada age nunca se carga en Railway. Estado al 2026-09-06: privada en `/Users/mateo/.codex/private/casa-digital/backup.agekey` y en 1Password, cuenta Mateo Lopera, bóveda Personal, documento `Casa Digital · clave de recuperación age`, adjunto `backup.agekey` de 184 bytes. Descarga verificada con SHA idéntico al original; evidencia privada `evidence/2026-09-06/age-vault.json`. El destinatario público `AGE_RECIPIENT` y `R2_*` están configurados y fueron releídos en backup de producción; el servicio ya está desplegado y su primera copia de producción terminó y se restauró correctamente, incluida la apertura de la app local. La restauración externa de staging ya se comprobó con DB, objetos y app aislada. Los archivos operativos `production.json`, `r2.json` (modo 600) y el token R2 permanecen privados fuera del repo porque contienen secretos; nunca copiar su contenido al repo o al runbook.

El bucket R2 debe existir antes de ejecutar el respaldo. `scripts/backup.sh` configura `RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true` para que rclone use el bucket existente con el token Object Read & Write restringido; evita el intento CreateBucket que produjo 403, sin ampliar los permisos del token. Esta opción está documentada por [rclone para Cloudflare R2](https://rclone.org/s3/#cloudflare-r2).

Corrida manual comprobada en la interfaz Railway: **proyecto Casa Digital → production → backup → Cron Runs → Run now**. Confirmar proyecto, entorno y servicio; hacer un solo clic y observar la corrida hasta su terminación. Registrar el deployment exacto, el archivo y `backup.lastRunAt`.

`railway redeploy` solo prepara un deployment del servicio cron; no ejecuta su corrida. No usarlo como prueba de que se hizo una copia.

Un lock asesor PostgreSQL `(7043, 39)` excluye corridas solapadas de cron, manuales y despliegues durante toda la copia. Si otra copia mantiene el lock, la nueva corrida falla sin esperar indefinidamente ni tocar copias completas o `backup.lastRunAt`; se libera al terminar o fallar.

Esperar terminación exitosa y revisar logs del deployment exacto. La copia final `casa-digital/YYYYMMDDTHHMMSSZ-<16hex>.tar.zst.age` incluye `database.dump`, `media/` y `manifest.json`. `backupRevision` en el manifiesto es el SHA de la imagen de backup (o `unknown`), no el SHA del web. Se sube como `.uploading`, se descarga para comparar SHA256 y solo entonces se publica el nombre final. Secuencia: dump/copia → compresión/cifrado → subida y comprobación remota → retención → escritura de `backup.lastRunAt`. Un fallo antes de la comprobación no elimina copias ni actualiza la marca.

Retención: **12 copias completas totales**, incluidas las manuales y las mensuales, bajo `casa-digital/`. No se interpreta como 12 meses ni como 12 por tipo. El archivo GHPOINTS se guarda en `ghpoints/`, fuera de esta poda.

Restauración obligatoria antes del lanzamiento y después cada mes:

1. Descargar una copia real de R2 y usar `set -o pipefail` con `age -d -i <privada> <archivo> | zstd -d | tar -C <directorio privado> -xf -` para detectar fallos del descifrado o la extracción.
2. Leer el manifiesto y comprobar dump/objetos incluidos. Restaurar `database.dump` en una base PostgreSQL 18 local nueva con `pg_restore --no-owner --no-acl --exit-on-error`; nunca sobrescribir la base desplegada para probar.
3. Restaurar `media/` en un bucket local o de prueba y configurar la app contra ambos recursos restaurados. `MAILER=console`, claves VAPID ausentes y `JOBS_ENABLED=false` durante esta inspección.
4. Verificar conteos, abrir la app y recuperar al menos un objeto cuando la copia contenga medios. Antes del lanzamiento debe demostrarse también recuperación de un objeto sintético en la prueba completa de backup de T1/T5; una copia vacía de producción no reemplaza esa prueba. No cargar medios de prueba a producción para satisfacerla.
5. Registrar copia, checksum/manifiesto, fecha, resultado de descifrado y recuperación. No registrar la privada age ni datos personales.

## T5 y T6: ensayo y dominio

En **staging**, con el mismo candidato de producción y solo datos sintéticos: smoke, check-in, subida de medios, OTP de consola, controles de política, PWA instalada y push real en iPhone. Dejar correr una noche de jobs que incluya cierre horario y tareas de permanencia; comprobar logs, outbox y mensajes. No existe entorno `ensayo` ni importación de GHPOINTS. La automatización `verificar-noche-de-jobs-en-staging` tiene una única ejecución programada para el 2026-09-07 a las 07:00 de Bogotá: revisará en solo lectura los resultados de la noche de staging. Su creación no acredita esa validación ni sustituye el monitoreo de producción de siete días de T8.

Smoke exige HTTPS, salvo loopback para pruebas. En el dominio temporal de producción, agregar `--canonical-base https://oeeafit.com` a `npm run smoke -- --base <URL> --expected-sha <SHA> --indexing <true|false> --bucket-origin <origen del bucket>`; `--indexing true` corresponde a producción.

La ventana del dominio empieza con código desplegado, health/backup comprobados e inputs/credenciales listos. No se construye ni despliega código dentro de ella:

1. Crear y verificar un respaldo completo de GHPOINTS antes de mover el dominio, con dump, objetos y manifiesto cifrados. Registrar proyecto y evidencia recuperable; no migrarlo.
2. Retirar oeeafit.com del servicio GHPOINTS y agregarlo al web de production en puerto 8080, con proyecto/servicio/entorno explícitos.
3. En Cloudflare cambiar destino del CNAME y TXT de verificación que requiera Railway. Conservar proxy activo, SSL Full, DNSSEC, NS/DS y regla www. No limpiar otras integraciones todavía.
4. Esperar dominio verificado y certificado operativo; purgar caché. Correr `npm run smoke -- --base https://oeeafit.com --expected-sha <SHA> --indexing true --bucket-origin <origen del bucket production>`, comprobar www → apex, OTP, admin, cabeceras y medios. PWA/push se comprueban desde el origen final. Si falla antes de retirar GHPOINTS, corregir el destino con los valores anotados; no prometer una reversión de datos.
5. Tras verificar, reconciliar el dominio en `.railway/railway.ts` y generar el plan desde checkout privado con link explícito y readback de IDs, siguiendo el bloque de alcance anterior; comprobar que no haya diferencias inesperadas. Commit/push y promoción del cambio declarativo se ejecutan **después** de la ventana.

## T7: archivo y retiro de GHPOINTS

No hay espera de 48 horas. Ejecutar solo después de verificar producción y con el proyecto GHPOINTS identificado explícitamente:

1. Abrir túnel al Postgres viejo, generar dump final completo y listar/copiar los objetos existentes, incluidos los que no tengan fila asociada y deban conservarse. No importar ese dump ni esos objetos a casa-digital.
2. Cifrar dump, objetos y manifiesto con age. Guardar en `oe-respaldos/ghpoints/` y una copia privada con Mateo. Descargar/descifrar el archivo y comprobar restauración local antes de borrar nada.
3. Registrar por separado la fecha y hora de creación del respaldo. El plazo de conservación empieza al eliminar el proyecto GHPOINTS; todavía no calcular ni asignar vencimiento.
4. Eliminar el proyecto viejo desde el panel después de verificar identidad y copia recuperable. El borrado incluye Postgres, PITR y buckets del proyecto; comprobar y registrar la eliminación del proyecto con su fecha y hora. Solo entonces calcular el vencimiento del archivo: **90 días desde la eliminación verificada del proyecto GHPOINTS**, nunca desde la creación del respaldo ni desde otra acción del retiro.
5. Revocar claves exclusivas de GHPOINTS: Resend, LLM, Clerk, registro Entra, webhook Teams si existe, IMPORT_SECRET, secretos de Actions y acceso Railway al repo viejo. No revocar la GitHub App global ni credenciales compartidas con LaOE. Retirar DNS exclusivos de Clerk después de confirmar su propiedad, sin tocar correo, NS o DNSSEC.
6. Archivar el repositorio GHPOINTS y comprobar que oeeafit.com y la app nueva siguen respondiendo. Registrar cada acción; no sustituir evidencia por una lista marcada de antemano.

## T8: monitoreo y registro

Durante 7 días desde T6: salud/smoke, logs del web, outbox y dead letters, mensajes fallidos (incluidos OTP y cuotas Resend), métricas HTTP y uso contra el presupuesto. Evitar campañas durante la primera semana para reservar capacidad de OTP. Correcciones por main → CI → staging → promoción a production. Al cerrar: README y roadmap con fechas reales, contenido que quedó pendiente y comprobación de que el proyecto GHPOINTS ya no existe.

| Fecha y hora | Tramo | Entorno / recurso / SHA | Acción ejecutada | Resultado y evidencia |
| --- | --- | --- | --- | --- |
| 2026-09-06 | T2 parcial | Workspace `67442423-94f5-407c-87eb-ded16c00db6a` | Tope US$20 y alerta US$15 ajustados y confirmados por la ejecución coordinadora | Configuración verificada; no implica recursos desplegados |
| 2026-09-06 | T2 parcial | Proyecto `000919ed-7a92-44d3-9987-5d749b245bba` | Proyecto casa-digital creado; production `6020f730-c245-4f01-bc4e-66c0223a436c`, staging `41f59e9b-3988-4d5a-9e98-4c9ccf8285eb` | Proyecto vacío, sin servicios todavía al registrar esta fila; T2 no completado |
| 2026-09-06 14:46 America/Bogota | T0 | Repositorio local | `npm run check` completo | Exit 0: 164 unitarias, integración y build en verde; T0 listo, T1 pendiente de e2e |
| 2026-09-06 | T3 parcial | Cloudflare R2, sesión Chrome | Acceso a cuenta y pantalla de activación | Formulario obligatorio de facturación pendiente de Mateo; bucket no creado |
| 2026-09-06 14:48 America/Bogota | T2 parcial | Staging `41f59e9b-3988-4d5a-9e98-4c9ccf8285eb` | IaC aplicado; secretos propios de staging cargados antes del despliegue | Web en `WAITING` por `checkSuites`; todavía no se acredita arranque o smoke |
| 2026-09-06 14:48 America/Bogota | T2 parcial | Servicio Postgres `552a0ebc-7194-474f-8bea-6d32f72065f9`; bucket `9c34e29a-4df0-48c1-8ee6-3e4a6c51406f` | Recursos de staging creados mediante IaC | Postgres `SUCCESS`; bucket creado. CORS, seed, PITR/respaldos y prueba de medios siguen pendientes |
| 2026-09-06 14:48 America/Bogota | T2 parcial | Railway GitHub App / repo LaOE | Conexión al repositorio confirmada por deployment creado mediante IaC | No hace falta otra instalación/configuración de la GitHub App; web espera los checks del repo |
| 2026-09-06 14:48 America/Bogota | T3 parcial | [Resend, uso del equipo eafit](https://resend.com/settings/usage) | Plan y límites consultados en dashboard | Free: 100 diarios, 3000 mensuales, 10 solicitudes/s; uso 0 hoy y 43 en el mes. No se creó todavía la nueva API key |
| 2026-09-06 14:55 America/Bogota | T1 local | Repositorio local | `npm run check` final completo | Exit 0: 164 unitarias, 181 de integración y build en verde; CI remoto pendiente |
| 2026-09-06 | T1 local | E2E Playwright | Suite completa y corrección de selectores | 77 casos pasaron y 1 falló por selector; tras corregir 3 selectores, targeted con 4 casos en verde (2 setup + 2 privacidad). No se declara una segunda suite completa |
| 2026-09-06 | T1 local | Harness Docker de backup | Dos corridas completas del harness | En verde con fallos simulados, retención, exclusión de concurrencia y restauración de DB+objeto sintético; no acredita todavía una copia en R2 |
| 2026-09-06 | T3/T4 parcial | Web de producción, sin despliegue | SESSION_SECRET, VAPID y clave nueva Resend creados/cargados | Clave Resend limitada al dominio y solo envío; no se imprimen secretos. Bootstrap/OTP real siguen pendientes |
| 2026-09-06 | T3 parcial | Archivo privado age y variables de backup production | Privada guardada fuera del repo y destinatario público configurado | Privada solo con Mateo; falta copia en 1Password. Backup production aún no desplegado |
| 2026-09-06 | T2 parcial | [Origen staging](https://web-staging-53f6.up.railway.app), bucket `https://media-ugkzcqqc562pimqbxku.t3.storageapi.dev` | CORS staging aplicado y consultado | Origen de staging permitido; queda probar subida real del navegador y CSP del web desplegado |
| 2026-09-06 19:55:11 UTC | T2 parcial | Postgres staging, deploy `6301c117-19d7-4060-b3af-d3d8e6a76a7b` | Corrección de región/límites y migración automática del volumen | `SUCCESS`: PG18, us-east4-eqdc4a, 1 CPU/1000000000 bytes y 1/1 running. Volumen `0a54b097-148c-4f87-934c-555b4fb47821`, instancia `95b0040c-09ce-413d-8a9f-26ed869e305f` READY; capacidad 50000 MB, uso 843.67 MB |
| 2026-09-06 19:55:50–19:56:32 UTC | T2 parcial | Postgres staging, deploy PITR `e706ddf8-f581-4d1d-aa85-2542c88d99be` | PITR habilitado y comprobado mediante configuración/logs | Deploy `SUCCESS`, enabled/bucketWired true; full de 30 MB `20260906-195551F`, WAL 1/2 archivados y anchor emitido. CLI live no disponible entonces sin claves SSH (resuelto en la comprobación posterior); restauración remota aún no probada |
| 2026-09-06 19:56:06 UTC | T2 parcial | Respaldos de volumen Postgres staging | Schedule diario/semanal/mensual aplicado y releído | DAILY `52 1 * * *`, retención 518400 s; WEEKLY `0 9 * * 6`, 2332800 s; MONTHLY `21 4 1 * *`, 7689600 s. Lista de snapshots todavía vacía al comprobar |
| 2026-09-06 | T1/T2 | IaC y `Postgres-PITR` | Bucket declarado/adoptado en ambos entornos; plan de staging revisado | Plan sin adds/deletes/destructive; solo dos campos seguros del web. Apply del coordinador a las 15:04 de Bogotá actualizó defaults del web sin cambiar Postgres. Persisten solo dos diferencias de normalización de defaults (restart ON_FAILURE/sleep false); no repetir apply por ellas. Production no tiene todavía Postgres ni PITR |
| 2026-09-06 | T1 local | Suite e2e final contra build/start, `CI=true` | Ejecución completa definitiva | **78 passed en 58 segundos, sin reintentos**. Selectores y pruebas de cierre esperan navegación/reinicio del formulario; fixtures aisladas evitan carreras |
| 2026-09-06 | T3 parcial | GitHub ruleset `22401532` | Protección de production activada | Reglas de borrado y non-fast-forward equivalentes a main; la rama production se fija al SHA validado en staging, todavía pendiente |
| 2026-09-06 15:05 America/Bogota | T1 local | Repositorio local, validación final | `npm run check` completo tras todos los cambios | Exit 0 confirmado: 164 unitarias, 181 integración y build; e2e definitivo 78/78 en 58 s sin reintentos. CI remoto pendiente |
| 2026-09-06 | T1 CI | SHA `30810644dd56604933d4d56807a61a5982e71c64`, [run 34056998214](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34056998214) | CI remoto completo | `SUCCESS`: 181 integración, 78 e2e en 2,8 minutos sin flaky y job de backup en verde |
| 2026-09-06 | T2 parcial | Postgres staging, túnel local 15439 | `scripts/db-release.ts` y seed sintético aplicados mediante túnel SSH | 62 personas con source SEED, 27 comités y 1 ADMIN sintético; PostgreSQL 18.6 y TLS 1.3. Ningún dato de GHPOINTS o persona real importado |
| 2026-09-06 20:13 UTC | T2 parcial | `railway postgres pitr status` de Postgres staging | Sonda live mediante SSH registrada, solo lectura | Exit 0: enabled/bucketWired/live.available true, 1 backup set, último full 19:56:25Z. WAL mínimo `000000010000000000000001`, máximo `000000010000000000000013`; archiverHealthy true, último archivado 20:13:31.595952Z y maxRestoreTime 20:13:35.129572Z. Restauración remota no probada |
| 2026-09-06 15:17 America/Bogota | T6 inspección previa | Cloudflare oeeafit.com, solo lectura | SSL, DNSSEC, registros DNS y redirección www inspeccionados | SSL Full, DNSSEC activo, apex y www proxied. CNAME apex `dzjxualu.up.railway.app` todavía GHPOINTS; www → oeeafit.com. `curl` verifica HTTPS www → 301 apex. Ningún cambio de destino realizado |
| 2026-09-06 20:15:04 UTC | T2 incidencia | Web deployment `c3f6d46d-c77c-42bc-a8a3-2ea42a5d2c0a` | Instalación npm de Railway observada | `FAILED`: prepare/lefthook requirió .git ausente en el contexto Railpack, git exit 128 → npm exit 1. No llegó a next build, pre-deploy ni arranque. Fix local `prepare=node scripts/install-hooks.mjs`: omite CI/sin .git y conserva errores en un checkout; 3 escenarios temporales, Biome y tests IaC pasaron. Faltan check/CI/deployment nuevos |
| 2026-09-06 | T1 CI | SHA `c3a6532015cebf1da1139435552ef0efc6b41f80`, [run 34057742899](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34057742899) | CI remoto después de corregir la instalación de hooks | Los tres jobs terminaron en `SUCCESS` |
| 2026-09-06 20:31:44 UTC | T2 parcial | Web staging, deployment `15c2b71c-7964-4191-abb7-a67b302d6563`, SHA `c3a6532015cebf1da1139435552ef0efc6b41f80` | Build, pre-deploy y arranque en Railway | `SUCCESS`: log de migraciones aplicadas y esquema verificado a las 20:31:27Z; Next listo 20:31:39Z; outbox poller y scheduler iniciados 20:31:41Z. Corrección de hooks comprobada en el entorno Railpack sin .git |
| 2026-09-06 | T2/T5 parcial | [Web staging](https://web-staging-53f6.up.railway.app), SHA `c3a6532015cebf1da1139435552ef0efc6b41f80` | Smoke remoto del candidato desplegado | Seis grupos en verde: salud/SHA, HTTPS/CSP/noindex, robots, sitemap, manifest e ICS. La prueba real de medios desde el navegador sigue en curso; T2 y T5 no se cierran |
| 2026-09-06 20:39 UTC | T2 parcial | Web staging `15c2b71c-7964-4191-abb7-a67b302d6563` y Postgres `e706ddf8-f581-4d1d-aa85-2542c88d99be` | Estado/configuración/logs consultados, solo lectura | Ambos SUCCESS/online, 1/1 réplicas, 0 crashes y 0 warnings/criticals activos; región us-east4-eqdc4a, 1 CPU y 1000000000 bytes. RAM actual web 0,214 GB y Postgres 0,218 GB. Scheduler/outbox encolan y drenan cada minuto sin fallos hasta 20:39:02Z; hasIssues del panel corresponde al build anterior ya resuelto |
| 2026-09-06 20:39 UTC | T2 presupuesto | Workspace Railway, período 28 de agosto–28 de septiembre | Uso y límites consultados, solo lectura | Uso US$1,457082, estimación Railway US$2,792485, alerta 15/tope 20, isOverLimit false; casa-digital US$0,00370358. Son medidores del momento, no una garantía del costo futuro |
| 2026-09-06 20:43:11 UTC | T2/T5 parcial | Chromium remoto, web staging SHA `c3a6532015cebf1da1139435552ef0efc6b41f80` | QA de sesión y medios desde el navegador | PASSED: login con OTP real de consola de ADMIN sintético y logout; PNG 1400×1400 de 5890980 bytes, POST directo al bucket 200, confirmación 201, job READY y WebP 480×480 servido 200 bajo CSP; sin errores CORS, CSP o mixed content. GET sin firma a `/variants/h2808p47ha1x9hn7jlgvt9nf/w480.webp` devuelve 403, confirmando que el bucket sigue privado mientras la app sirve el objeto con firma (200). Asset `h2808p47ha1x9hn7jlgvt9nf`, archivo `qa-staging-portada-mtqa3kwg.png`; otro asset de la prueba previa también READY. Reporte temporal `/tmp/casa-digital-f7-staging-qa/run-1788727368077/report.json`. El primer script de QA se interrumpió bloqueado en response.json de Playwright; se corrigieron únicamente la lectura de respuestas sin cuerpo y los timeouts del script, sin cambios en la app |
| 2026-09-06 | T5 programación | Automatización `verificar-noche-de-jobs-en-staging` | Revisión única creada para 2026-09-07 07:00 America/Bogota | Consultará la noche de jobs de staging en solo lectura; ejecución y resultado pendientes. No es el monitoreo de producción de 7 días |
| 2026-09-06 20:44 UTC | T3 parcial | Rama remota `production`, SHA `c3a6532015cebf1da1139435552ef0efc6b41f80` | Push y `git ls-remote` de refs/heads/production verificados | Rama creada desde el candidato validado en staging, con ruleset 22401532 ya activo. Web y backup de production todavía sin despliegue; T3 sigue abierto por R2 |
| 2026-09-06 20:49:42 UTC | T4 parcial | Production `6020f730-c245-4f01-bc4e-66c0223a436c`, Postgres lógico `552a0ebc-7194-474f-8bea-6d32f72065f9`, deploy `c520f81d-1baa-4440-9be9-2834a4c32ac8` | Instancia Postgres production aprovisionada y verificada | SUCCESS, 1/1 réplica, 0 crashes/alertas; postgres-ssl:18, us-east4-eqdc4a, 1 CPU/1000000000 bytes. SQL por SSH confirmó PG18.6 y 0 tablas en public. Contraseña propia; staging no se clonó. Volumen exclusivo `f9e209da-3142-4d18-a63e-1125a03f6e01`, instancia `ae68e185-5cdc-4506-a038-571e5a628a63` READY, capacidad 50000 MB |
| 2026-09-06 20:50–20:55 UTC | T4 parcial | Bucket production `7b9feb8a-353e-40ec-b6e0-f4f098309d12`, región iad | PITR habilitado; bucket renombrado a Postgres-PITR-production conservando ID/contenido | Railway actualizó las cinco referencias WAL sin reiniciar PG. Sonda posterior: enabled/bucketWired/live.available/archiverHealthy true, 1 backup set. Full `20260906-204945F`, 30 MB y 1274 archivos, completo a las 20:50:16Z; latestBackupAt 20:50:15Z, WAL 1–4, último archivado 20:52:16Z. No se ejecutó restauración |
| 2026-09-06 | T4 parcial | Snapshots nativos Postgres production | Schedules aplicados y consultados | DAILY `44 15 * * *`, retención 518400 s; WEEKLY `21 15 * * 6`, 2332800 s; MONTHLY `22 10 1 * *`, 7689600 s. Son respaldos nativos, independientes de las 12 copias R2 totales previstas |
| 2026-09-06 20:55 UTC | T1/T4 parcial | IaC y planes de staging/production | Nombre de bucket PITR condicionado por entorno; planes solo lectura | Tests IaC 5/5 y Biome en verde; ambos planes ok true, diagnostics vacíos y cero destrucciones. Staging solo defaults menores del web; production crea media/web y configura backup, sin modificar PG/volumen/PITR. No hubo apply completo; production sigue sin web, migraciones, seed, personas, media, cron de backup desplegado ni cambios DNS |
| 2026-09-06 20:54 UTC | T4 presupuesto | Workspace Railway, período 28 de agosto–28 de septiembre | Uso consultado tras aprovisionar PG production | US$1,461542 acumulado y US$2,800230 estimado; soft 15/hard 20, isOverLimit false. Estimación provisional y límite global del workspace |
| 2026-09-06 20:57:16 UTC | T2/T5 funcional | Web staging SHA `c3a6532015cebf1da1139435552ef0efc6b41f80` | QA funcional remoto con datos sintéticos | PASSED, policyRestored true. Formulario creado en UI: pendiente bloquea; formulario abierto antes del cambio de versión rechaza sin personas/submission/consent/audit/outbox parciales; versión válida registra aceptación exacta. Roster bloqueado/habilitado aplica 1 MEMBER ACTIVE, comité/término y consentimiento IMPORT/MEMBERSHIP. Ocasión y QR nuevos `/a/n8a73kyq6h`, sin legacy_id/alias; miembro con OTP real de consola y dos páginas producen un solo check-in APPROVED SELF_QR y 20 puntos. Política pendiente permite login/check-in y revocación, y bloquea nuevas autorizaciones. Reporte temporal `/tmp/casa-digital-f7-staging-qa/functional-1788728131309/report.json` |
| 2026-09-06 | T2 cierre | Repositorio local tras ajustes de PITR por entorno y Retry-After | Check y e2e finales completos | Check PASS: 164 unitarias, 181 integración y build. E2E compilado: 78/78 en 1,0 minuto sin reintentos. Logs temporales `/tmp/casa-digital-f7-final-check.log` y `/tmp/casa-digital-f7-final-e2e.log`. **T2 listo** con CI/deploy/smoke/QA de c3a65320 y validación local de los ajustes finales; el resultado remoto del commit de cierre queda en [CI](https://github.com/Mateoloperaortiz/LaOE/actions/workflows/ci.yml) |
| 2026-09-06 | T1/T2 CI | SHA `bca5dded`, [run 34059783146](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34059783146) | CI remoto del cierre anterior | Los tres jobs terminaron SUCCESS: 164 unitarias, 181 integración y 78 e2e |
| 2026-09-06 21:11:28 UTC | T2 actualización | Staging deployment `8130a13c-ad8b-4db2-93cd-abdcf957134e`, SHA `bca5dded` | Despliegue y smoke remoto comprobados | SUCCESS; seis grupos del smoke en verde: salud/SHA, HTTPS/CSP/noindex, robots, sitemap, manifest e ICS |
| 2026-09-06, aproximadamente 21:50 UTC | T3 parcial | Cloudflare R2 `oe-respaldos`, verificación en Chrome | Activado por Mateo; bucket y token creados y comprobados | Standard, Eastern North America, acceso público Disabled; token de cuenta casa-digital-backup Active, Object Read & Write restringido a oe-respaldos. r2.json modo 600 y token fuera del repo; no se registra ningún valor secreto |
| 2026-09-06 | T3 parcial | Servicio backup, entorno production | Variables R2_* cargadas y releídas; AGE_RECIPIENT presente | Credenciales restringidas configuradas, sin registrar sus valores; despliegue/primera copia y restauración real todavía en curso |
| 2026-09-06 | T4 inputs | Bootstrap privado del ADMIN real | Estado de la entrada recibido | Identidad y código de término recibidos por vía privada; faltan fechas exactas startsOn/endsOn. No se incorporan datos personales al repo ni se acredita bootstrap ejecutado |
| 2026-09-06 21:52:40 UTC | T4 preparación | Rama production, SHA `bca5dded`, [run 34062365505](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34062365505) | Candidato promovido | CI de la promoción todavía en curso al registrar esta fila; no acredita despliegue web/backup |
| 2026-09-06 | T4 preparación | Instancias web/medios propias de production y servicio backup | Recursos/variables preparados antes de configurar fuente; CORS consultado | Web y backup en US East, 1 CPU/1 GB; CORS permite solo https://oeeafit.com. Dominio temporal web-production-345d59.up.railway.app, ID 4f768441-22b2-476b-b6ca-1692c8cd1e64, target 8080; APP_URL conserva apex. Cero objetos; web/backup todavía sin despliegue |
| 2026-09-06 | T4 esquema | PG production 18.6, TLS 1.3 | Migraciones aplicadas sin seed | 0→69 tablas, 71 índices y extensión pg_trgm; person=0 y política pendiente. No hay bootstrap ni datos de GHPOINTS |
| 2026-09-06 | T4/T5 incidencia R2 | Bucket oe-respaldos, token Object Read & Write | Primer intento real de backup y ajuste de rclone | CreateBucket devolvió 403; no se creó copia completa ni se actualizó backup.lastRunAt. Se añadió RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true para usar el bucket existente con los mismos permisos; pruebas y repetición real en curso |
| 2026-09-06 | Validación intermedia | Repositorio antes del ajuste R2 | npm run check completo | Exit 0: 164 unitarias, 181 integración y build. Se repetirá tras el cambio en scripts/backup.sh; esta fila no acredita sus pruebas finales |
| 2026-09-06 | T4 CI | Rama production, SHA `bca5dded`, [run 34062365505](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34062365505) | Resultado CI de la promoción comprobado | SUCCESS. No se desplegó producción: el ajuste R2 requiere un nuevo candidato validado y un plan regenerado antes de aplicar |
| 2026-09-06 | T4 preparación final | Instancia web production `d68e941c-7ac9-4789-8a42-cbb677e6beac`, bucket lógico `9c34e29a-4df0-48c1-8ee6-3e4a6c51406f` | Aislamiento de medios y variables comprobado | Bucket físico media-7-uwyewipofe3gx5s6, 0 objetos/0 bytes; nombre y credenciales distintos de staging. MAILER resend, NODE_ENV production, sin OTP_FIXED_CODE ni AWS_REGION; secretos solo privados. Web/backup sin fuente ni deployment. Plan anterior: 0 diagnósticos, 13 cambios seguros y 0 destrucciones, nunca aplicado; regenerar tras el commit del ajuste R2 |
| 2026-09-06 | Validación final R2 | Repositorio con RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true | Check, e2e compilado y harness con imagen nueva | npm run check exit 0: 164 unitarias, 181 integración y build. E2E compilado 78/78 en 1,0 minuto sin reintentos. npm run test:backup exit 0 con imagen nueva: fallos, retención total 12, concurrencia y restauración. Validación local completa; commit/CI del nuevo candidato pendientes |
| 2026-09-06 22:06:04 UTC | T5 restauración externa completada | R2 `oe-respaldos/casa-digital/20260906T220213Z-308fa18ebe1d6c2d.tar.zst.age` | Descarga, descifrado, restauración y apertura de la app contra recursos locales aislados | PASS completo. SHA256 `d07896afc542193b622fe6bb64842ccedc64dad8c958da825e58866ef87ee693`; inicio 22:02:13Z y lastRunAt staging 22:02:36.845Z. Imagen `bca5ddedb51a75a2f0c1cbb9ce4b3d238d3aa7eb` con override explícito RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true; no acredita cron production ni imagen ya corregida. PG18.6, 69 tablas/934 filas y 7 objetos/13041817 bytes; hashes idénticos origen→descifrado→Garage. app_config 24 filas en dump y 25 en origen únicamente por la marca escrita después. Portada y health200; `/api/media/kevt7q5iqg530lmw58lxnk7j?w=480` →302 al bucket local→WebP200/480px/hash idéntico, sin errores CORS/CSP. MAILER console, JOBS false y VAPID vacío. Reintentos de restauración usaron el mismo archivo; los recursos aislados y texto plano se retiraron. Reporte privado `/Users/mateo/.codex/private/casa-digital/backup-restore-20260906/qa-backup-staging-1788732342996/report.json`, captura restored-app.png |
| 2026-09-06 | T3 cierre | 1Password, cuenta Mateo Lopera/bóveda Personal | Privada age guardada y descargada para comprobar integridad | Documento Casa Digital · clave de recuperación age, adjunto backup.agekey de 184 bytes; SHA de descarga idéntico al original. Evidencia privada evidence/2026-09-06/age-vault.json. T3 listo: R2/token, Resend, VAPID, privada recuperable y rama production/protección verificados |
| 2026-09-06 22:12:15 UTC | T5 restauración externa definitiva | R2 `oe-respaldos/casa-digital/20260906T221133Z-1041df3c8a6e4417.tar.zst.age` | Ensayo completo con imagen reconstruida f8711a7, sin override externo | PASS; export NO_CHECK_BUCKET incluido en la imagen. SHA256 `1d6298da596da2c5f29ccfb507d66f64a653822b95747c2bfe89b29464bece73`; manifiesto f8711a7, lastRunAt staging 22:11:58.039Z. PG18.6, 69 tablas/944 filas y 7 objetos/13041817 bytes con hashes iguales. Outbox 122 filas en dump/antes y 123 después solo por comms.campaign-tick posterior al dump. App/health/imagen480px abiertos sin CSP/CORS; recursos aislados retirados. Reporte privado backup-restore-20260906/qa-backup-staging-1788732680946/report.json. Dos copias completas en R2 |
| 2026-09-06 22:17:22.920 UTC | T2 release | SHA `f8711a753e7149ca999354e13664e1d36a8cf67b`, staging deploy `2107c77c-9b03-4e47-b16c-148f64193e38` | CI y despliegue staging comprobados | [CI main 34063154129](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34063154129) SUCCESS en tres jobs; deployment SUCCESS 1/1 sin incidencias; smoke 6/6 con SHA y bucket virtual correctos |
| 2026-09-06 | T4 IaC | Plan privado production-f8711a7-20260906T221906Z.plan.json | Apply desde checkout privado completo apply-context-20260906T221906Z | Plan 13 seguros/0 destructivos; aplicado con 10 cambios nativos y sin diagnósticos. Change set `iac-change-set/6020f730-c245-4f01-bc4e-66c0223a436c/41893796e9135807a05b8b44d238525c`. Contexto vacío anterior falló antes de mutar: CLI 5.46 exige .railway o HEAD:.railway aun con --file absoluto |
| 2026-09-06 22:26:26.942 UTC | T4 primer despliegue | Web production deploy `27e5f596-2510-4153-9baa-df2d66ba2c49`, SHA `f8711a753e7149ca999354e13664e1d36a8cf67b` | CI, arranque limpio y smoke production comprobados | [CI production 34063632277](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34063632277) SUCCESS; deployment SUCCESS y smoke 6/6 en https://web-production-345d59.up.railway.app, APP_URL conserva apex. 69 tablas, cero personas/membresías/consentimientos/medios, policy pendiente; sin ADMIN/OTP real todavía |
| 2026-09-06 22:30:50.213 UTC | T4 primera copia | Production backup deploy `eea7ece2-b538-4290-af09-870fefcdae27` | Un clic en Cron Runs → Run now | SUCCESS; log Respaldo verificado: 20260906T223051Z-583be9f99f7c10e2.tar.zst.age, 35239 bytes; lastRunAt 22:30:54.474Z. R2 mantiene las dos copias staging (3 completas en total). railway redeploy solo había preparado deployment y no ejecutó el cron; restauración de esta copia de production en curso |
| 2026-09-06 22:37:50.665 UTC | T4 respaldo/restauración completados | R2 `oe-respaldos/casa-digital/20260906T223051Z-583be9f99f7c10e2.tar.zst.age` | Primera copia de production descargada, descifrada, restaurada y abierta en recursos locales aislados | PASS; revisión visual PASS 22:39:26.773Z. Archivo 35239 bytes, SHA256 `6327385bfcf4c2165858e069ac21f2aa4bf092d63cbab2ffe181549ff29c7294`, backupRevision `f8711a753e7149ca999354e13664e1d36a8cf67b`. PG18.6, 69 tablas/41 filas: app_config23, committee_role7, event4, page3 y outbox4; cero personas/membresías/consentimientos/medios/objetos, política pendiente. Filas originales comprobadas; el origen solo añade la marca lastRunAt posterior al dump y 7 ticks de outbox posteriores. Portada/login abiertos y health200; bucket local vacío, la recuperación de objetos está probada con los 7 de staging. MAILER console, JOBS false y VAPID ausente; recursos aislados/texto plano retirados. Sin escrituras remotas, lastRunAt conserva 22:30:54.474Z. Reporte privado `/Users/mateo/.codex/private/casa-digital/backup-restore-20260906/qa-restore-production-1788734242093/report.json`, captura restored-app.png |
| 2026-09-06 | Cierre documental T3/T4 parcial | Repositorio, actualización de evidencia operativa | npm run check completo | Exit 0: 164 unitarias, 181 integración y build. Log privado evidence/2026-09-06/production-docs-check.log. Cambios solo documentales; el candidato f8711a7 conserva 78/78 e2e y CI en verde, sin repetir e2e para este cierre |
| 2026-09-06 23:13:03–23:13:15 UTC | T4 bootstrap real | Production, inputs solo en bootstrap-admin.json privado | Bootstrap inicial y reejecución comprobados | PASS. Antes: cero personas/membresías/permisos/términos/consentimientos/comités/campañas/mensajes/importaciones/medios/auditoría. created a las 23:13:08.992Z; después una persona, una membresía ACTIVE, un ADMIN global, un término y cuatro auditorías (term.created, person.created, membership.created, permission.granted), demás conteos en cero. Segundo resultado already-exists; huella idéntica de persona/membresía/permiso/término/auditoría. Policy pendiente. Identidad y fechas solo privadas; evidencia evidence/2026-09-06/bootstrap-production.json |
| 2026-09-06 23:15:27 UTC | T4 primer acceso real | Chrome, dominio temporal production | OTP real de Resend recibido y utilizado por Mateo; Mi OE y /admin comprobados | Una persona/membresía ACTIVE/ADMIN, una sesión, cero consentimientos/comités/campañas. Roster muestra aviso de política pendiente. Mensaje Resend SENT, id e39695d5-4ed6-4c4d-8223-7664bf4bd161, sentAt 23:13:39.130Z. No se registra OTP ni asunto del mensaje. Evidencia privada first-admin-access.json |
| 2026-09-06 | T4 incidencia de tablero | Estado visible del respaldo en Administración | Aviso desactualizado detectado durante primer acceso | El tablero consulta backup.status calculado por el job diario y todavía no refleja backup.lastRunAt reciente. Las copias anteriores sí están comprobadas. Corrección verificada localmente: getBackupStatus() lee lastRunAt reciente; checkBackup() sigue auditado. Check y e2e en verde en la fila posterior; CI, staging y promoción de esa corrección pendientes |
| 2026-09-06 23:20:03 UTC | T4 respaldo posterior al ADMIN restaurado | R2 `oe-respaldos/casa-digital/20260906T231801Z-4287290262f7fac2.tar.zst.age` | Descarga, descifrado, restauración y apertura de app local | PASS. Archivo 39570 bytes, SHA256 `724f07a8a97a31c17adabd9bf386cb13eae5c2fc457d7427f607ed9ff509ac93`; backupRevision f8711a7, lastRunAt 23:18:04.503Z. R2 conserva 4 copias completas. 69 tablas/106 filas: una persona, membresía ACTIVE, ADMIN global y término real, cuatro auditorías, una sesión y un mensaje Resend SENT; cero consentimientos/medios. Identidad y datos comparados solo privadamente. DB/app/login/health locales200; bucket vacío, recuperación de 7 objetos ya probada en staging. MAILER console, JOBS false, VAPID ausente y recursos propios retirados. Reporte privado backup-restore-20260906/qa-restore-production-post-bootstrap-1788736776955/report.json |
| 2026-09-06 | Validación local del indicador de respaldo | getBackupStatus() / checkBackup() | Check y e2e compilado completos | Ambos exit 0: 168 unitarias, 181 integración y build; 78/78 e2e en 1,0 minuto sin reintentos. getBackupStatus() lee backup.lastRunAt fresco sin esperar backup.status diario; checkBackup() conserva auditoría. Logs temporales /tmp/casa-digital-f7-admin-backup-check.log y /tmp/casa-digital-f7-admin-backup-e2e.log. CI y despliegue del nuevo candidato pendientes; T4 no completado |
| 2026-09-06 | T4 control de política, preparación | /admin/sistema/politica, navegación Política de datos | Procedimiento y enmienda ADR-039 documentados | ADMIN + step-up; publicar/revisar privacidad antes de activar versión, auditar config.updated y permitir volver a pendiente sin borrar consentimientos. Código, pruebas y despliegue pendientes de cierre; no acredita política real publicada ni autorización activa |
| 2026-09-06 23:33:27.609 UTC | T2 actualización | Staging deploy `38ee9450-b077-4bd2-adcd-9c5fa240b0fc`, SHA `3fee14a` | CI/despliegue y smoke del indicador de respaldo comprobados | [CI 34066788871](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34066788871) SUCCESS; deployment SUCCESS y smoke 6/6 a las 23:34:34.239Z. Producción conserva f8711a7; esta evidencia precede al nuevo control de política |
| 2026-09-06 | Control de política, cierre local | /admin/sistema/politica | Check y e2e compilado completos | npm run check exit 0: 181 unitarias, 183 integración y build. CI=true npm run test:e2e exit 0: 81/81 en 1,1 minutos sin reintentos. Logs privados evidence/2026-09-06/policy-check.log y policy-e2e.log. Control implementado y probado localmente; despliegue y contenido real pendientes, T4/T5 no completados |
| 2026-09-06 23:45:36 UTC | T4 presupuesto | Workspace, período 28 de agosto–28 de septiembre | Uso y límites consultados | US$1,511 acumulado, estimación temprana US$2,888; alerta 15/tope 20, web production 190 MB. Medición puntual y proyección inicial; no garantiza gasto futuro. Evidencia privada post-bootstrap-usage.json |
| 2026-09-06 23:51:18 UTC | T2 candidato | Staging deployment `44e06e79-52dc-4056-ab50-a1b5fa379abe`, SHA `853d622` | CI/despliegue y smoke comprobados | [CI 34067617644](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34067617644) SUCCESS con 81 e2e; deployment SUCCESS y smoke 6/6 a las 23:52:17Z |
| 2026-09-06 23:54:18 UTC | T2 UI de política | Chrome, staging 853d622 | OTP de consola y ADMIN sintético; control revisado | Política de datos visible con versión prueba-v1; ninguna escritura de contenido/versión durante la revisión. Evidencia privada policy-staging-ui.json |
| 2026-09-06 23:52:57 UTC | T4 promoción en curso | Rama production 853d622, deployment `8112f80b-823a-4696-a0ed-43353dd21ab8` | Candidato exacto promovido | [CI 34068111556](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34068111556) en curso y deployment WAITING al registrar; no se acredita servicio nuevo operativo, UI de producción ni retiro del temporal |
| 2026-09-07 00:02:19 UTC (2026-09-06 Bogotá) | T4 candidato final | Production deploy `8112f80b-823a-4696-a0ed-43353dd21ab8`, SHA `853d62283264aa4e8a31d8ef03c9b0d8abaf1512` | CI/despliegue y smoke comprobados | [CI production 34068111556](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34068111556) SUCCESS, 81/81 e2e; deployment SUCCESS y smoke temporal 6/6 PASS a las 00:03:10Z |
| 2026-09-07 00:04:43 UTC (2026-09-06 Bogotá) | T4 UI real final | Chrome, production 853d622 | Sesión ADMIN y controles comprobados | Acceso conservado; tablero muestra última copia del 6 de septiembre de 2026 y ningún trabajo con error. Política de datos visible con versión pendiente y aviso del roster; sin escrituras de política/contenido. Evidencia privada production-ui-final.json |
| 2026-09-07 00:05:37 UTC (2026-09-06 Bogotá) | T4 dominio temporal retirado | Dominio `4f768441-22b2-476b-b6ca-1692c8cd1e64` | Eliminado con CLI y --project/--environment/--service/--yes; readback y salud interna comprobados | Dominios custom/service vacíos; URL temporal 404. Health por SSH a localhost:8080 a las 00:05:12.977Z: 200, status ok, commit 853d622. Web/Postgres/backup SUCCESS; backup mantiene eea7ece2/f8711a7 sin corridas nuevas. Evidencia privada temporary-domain-removed.json. T4 listo, producción sin dominio público |
| 2026-09-06 America/Bogota | T4 cierre | Repositorio, documentación operativa final | npm run check completo | Exit 0: 181 unitarias, 183 integración y build; log privado evidence/2026-09-06/t4-close-check.log. Sin cambios nuevos de código; candidato 853d622 con 81/81 e2e locales y CI main/production comprobados |
| — | T5–T8 restantes | — | Pendiente de ejecución | T5 conserva PWA/push en iPhone y noche de jobs; T6–T8 todavía sin iniciar: dominio final, respaldo/retiro GHPOINTS y monitoreo de producción de 7 días. T0–T4 listos. Política real y roster posteriores pendientes; DNS y GHPOINTS intactos. Herramientas de archivo GHPOINTS preparadas solo offline, sin respaldo ejecutado, eliminación ni fecha de vencimiento asignada |

## Billeteras opcionales (fase 8, ADR-040)

Estos pasos habilitan cada plataforma después de validar el código; no alteran los hitos, el dominio ni la evidencia histórica de F7. Ver [ADR-040](adr/ADR-040-carnet-en-billeteras-fase-8.md), [10-verificacion.md](10-verificacion.md) y las casillas separadas de activación del [roadmap](09-roadmap.md).

1. Completar política/avisos y cuenta del proveedor. Apple: aprobación de gasto/titular, Pass Type ID, Team ID y certificado de firma vigente con clave privada; Google: emisor, proyecto con Wallet API, cuenta de servicio autorizada y usuarios de prueba/publicación. Mantener ambas apagadas si faltan sus credenciales.
2. Cargar secretos privadamente por entorno como base64 de una línea. Apple usa `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `APPLE_PASS_CERT_BASE64`, `APPLE_PASS_KEY_BASE64` y contraseña opcional `APPLE_PASS_KEY_PASSPHRASE`. Google usa `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SA_EMAIL`, `GOOGLE_WALLET_SA_KEY_BASE64` y `GOOGLE_WALLET_CLASS_SUFFIX`; staging debe tener sufijo propio (`carnet-oe-staging`) y producción `carnet-oe`; el sufijo por sí solo no habilita Google. Apple usa Pass Type ID distinto por entorno, con su certificado correspondiente. No copiar las credenciales de juguete del repositorio a Railway.
3. Adoptar/preservar las variables opcionales en `.railway/railway.ts` y revisar el plan de IaC del entorno exacto: sin borrado de secretos, bases, buckets ni recursos de otros entornos. El pre-deploy aplica/verifica migración 0009 sin seed. Promover el SHA ya validado con el flujo vigente, después de la ventana de dominio si coincide.
4. Verificar health/SHA, disponibilidad esperada de badges y archivos públicos, `.pkpass` desde el build, redirección de Google y registro local coherente. Validar en dispositivos el guardado, QR/check-in, revocación y reemisión. Staging solo usa personas sintéticas. Las cuentas demo de Google no acreditan publicación general.
5. Revisar outbox y jobs: cambio de comité/nombre, pase actualizado después de rotar, baja y limpieza tras anonimizar. Comprobar el tick diario de las 00:05 de Bogotá y recorrido de más de un lote en pruebas. Registrar latencia observada, errores y estado final, sin prometer un plazo mientras haya fallos del proveedor.
6. Si se retiran credenciales, se deshabilita emitir; la gestión local/revocación y las referencias de limpieza permanecen. Restaurar el grupo completo y reintentar/conciliar pendientes. No borrar filas locales para ocultar un fallo de supresión remota y no registrar éxito sin respuesta exitosa o 404. Guardar responsable/fecha de renovación del certificado Apple y controlar errores de firma antes de su vencimiento.

Evidencia requerida para cerrar cada activación: entorno, SHA, fecha, proveedor, dispositivo/navegador, guardado correcto, check-in, revocación del QR anterior y estado del pase actualizado o expirado. Los `.pkpass`, claves, token `oe2`, QR y enlace JWT de guardado son privados; conservarlos solo en el scratchpad operativo necesario. La activación está pendiente hasta registrar esa evidencia.

El detalle de variables, estados, renovación y matriz de aceptación por plataforma está en [16-billeteras.md](16-billeteras.md). Tras cambiar variables se reinicia/despliega el proceso para renovar la configuración cacheada; no se cambia el issuer/sufijo de Google con pases emitidos como si fuera una rotación de clave.

## Normativa completa de 2026 (ADR-042)

Cierre histórico de N-T3, 2026-09-08 a las 13:34 UTC: producción ejecutaba `e411a495d2db08c2af81db602f59c4c7aecf2bd0` y contiene ambos originales publicados como MEMBERS, versión `2026-05-08`, con integridad, búsqueda, privacidad e idempotencia verificadas. Wallet y Wordle están incluidos en el código promovido; los proveedores Wallet de producción siguen sin activar. En ese cierre los dominios custom/service estaban vacíos; el dominio final se publicó después, según el registro siguiente. El smoke de N-T3 se realizó por Railway SSH a loopback y no acredita TLS ni el dominio apex. Las evidencias fechadas de F7 conservan su alcance histórico y sus pendientes de lanzamiento.

1. Mantener originales, JSON v2 revisados, perfiles del extractor, manifiesto y organigrama fuera del repositorio. El manifiesto declara PDF/JSON, título, versión `2026-05-08`, audiencia `MEMBERS` y cada imagen por placeholder, archivo y SHA-256. La revisión del cuerpo exige 60 artículos/5 capítulos/3 secciones en estatutos y 74/12/4 en reglamento; el Anexo 1 ocupa las páginas 39–43. Los índices originales no son fuente de títulos ni numeración.
2. Ejecutar `npm run check` y los e2e de Normativa; CI incluye las pruebas sintéticas del extractor. Subir el candidato a `main`, comprobar CI, staging y carga sintética. Promover el mismo SHA a `production` siguiendo el procedimiento vigente. La versión incluye Wallet y Wordle existentes, sin activar proveedores nuevos ni cambiar reglas de permanencia o elecciones. Conservar producción sin dominio público.
3. Usar variables del servicio web y un túnel privado al Postgres del entorno elegido, con `railway run --no-local`, sin cargar `.env` local. Verificar proyecto/entorno y ADMIN existente habilitado. Ejecutar una sola importación operativa a la vez. `npm run normativa:import -- --input <manifiesto privado>` simula y verifica el lote completo sin escribir.
4. Agregar `--apply --actor-id <ADMIN>` para cargar borradores. Revisar desde `/admin/documentos/[id]` o por lectura privada autorizada: huella del corpus completo, conteos, páginas, anclas, tabla e imagen; PDF descargado con hash idéntico, imagen PRIVATE/READY, objetos sin firma denegados. La vista previa no marca onboarding ni habilita lectura de borradores a miembros.
5. Solo después del cotejo repetir con `--apply --publish --actor-id <ADMIN>`. Este modo exige cargas previas idénticas y no reemplaza contenido. Comprobar estados PUBLISHED, audiencia MEMBERS, búsqueda de artículos y secciones, originales e imagen por enlaces privados. Repetir la simulación y publicación para comprobar `unchanged`, sin duplicar documentos.
6. Ante una carga incorrecta, despublicar el documento afectado desde Documentos; conservar el PDF y corregir el JSON en borrador. Repetir revisión antes de publicar. Registrar SHA desplegado, CI/deployment, IDs, hashes y resultado de lectura; los cuerpos, identidades y credenciales quedan únicamente en evidencia privada.

| Fecha | Tramo | Evidencia | Resultado |
|---|---|---|---|
| 2026-09-08 | N-T1/T2 | Check completo y 10 e2e compiladas sin reintentos; 11 pruebas sintéticas del extractor; cotejo privado `normativa-2026/qa.json` | PASS local: 134 artículos, siete secciones, 17 capítulos; sin duplicados/omisiones en el cotejo. Organigrama original del artículo 4, tabla del artículo 36 y cinco páginas del anexo comprobados. N-T3 pendiente de CI/staging/producción. |
| 2026-09-08 | N-T3 candidato | SHA `e411a495d2db08c2af81db602f59c4c7aecf2bd0`; [CI main 34228257941](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34228257941); evidencia privada `normativa-2026/check-close.log` | CI SUCCESS con 103 e2e. Check de cierre PASS: 290 pruebas unitarias, 253 de integración, 11 del extractor Python y build. |
| 2026-09-08 | N-T3 staging | Deployment `06eaf540-622f-4091-ac16-2f8d0a9168da`, SHA `e411a495d2db08c2af81db602f59c4c7aecf2bd0`; documento sintético `fjsx7b8b74jwua3ve28zzgzi`; evidencia privada `normativa-2026/staging-*-verified.json` y `normativa-2026/staging-audit-readback.json` | Deployment SUCCESS y smoke 6/6 PASS. Carga DRAFT de tres artículos y dos secciones verificada a las 13:05:02 UTC; PUBLISHED a las 13:17:06 UTC e integridad, publicación y búsquedas verificadas a las 13:17:27 UTC. Acceso privado comprobado; repetición `unchanged`, sin duplicados y con exactamente tres eventos de auditoría. |
| 2026-09-08 | N-T3 UI staging | CUA, vista previa ADMIN y Mi OE; evidencia privada `normativa-2026/staging-ui-verified.json` | PASS: sección Anexo, navegación por ancla, tabla de cuatro filas e imagen comprobadas. Esta carga y la revisión de interfaz usan contenido sintético. |
| 2026-09-08 | N-T3 promoción en curso | [CI production 34231174981](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34231174981); deployment `be43f531-d551-49dd-8c64-da9dc414f2ba` | Al registrar, CI ejecuta e2e y deployment WAITING. No se acredita todavía despliegue operativo del candidato ni carga y publicación de los originales en producción; N-T3 sigue abierto. |
| 2026-09-08 13:30 UTC | N-T3 producción | [CI production 34231174981](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34231174981); deployment `be43f531-d551-49dd-8c64-da9dc414f2ba`, SHA `e411a495d2db08c2af81db602f59c4c7aecf2bd0`; evidencia privada `normativa-2026/production-deployment.json` y `production-smoke.json` | CI SUCCESS con 103 e2e en 4,5 minutos; deployment SUCCESS a las 13:30:18.862 UTC. Smoke 6/6 PASS a las 13:30:50.214 UTC por Railway SSH loopback. Dominios custom/service vacíos; TLS y dominio apex quedan fuera del alcance de esta verificación. |
| 2026-09-08 13:31:47.284 UTC | N-T3 borradores reales | Evidencia privada `normativa-2026/production-draft-verified.json`; documentos e imagen identificados abajo | DRAFT verificado: estatutos 60 artículos/3 secciones/5 capítulos; reglamento 74/4/12. Huellas del contenido y PDF original idénticas; organigrama PRIVATE/READY con bytes originales, tabla de art-36 con dos encabezados y cuatro filas, Anexo 1 en pp. 39–43. PDFs e imagen firmados HTTP 200 y sin firma 403; el miembro recibe 404 al pedir el PDF de un borrador. |
| 2026-09-08 13:32:36.745 UTC | N-T3 publicación real | Evidencia privada `normativa-2026/production-published-verified.json` | Ambos documentos PUBLISHED/MEMBERS, versión `2026-05-08`, con el mismo contenido revisado. Estatutos publicados a las 13:32:18.942 UTC y reglamento a las 13:32:20.117 UTC. PDF para miembro autorizado responde 302 hacia el original firmado, descargado con HTTP 200 y SHA idéntico. Búsquedas de almuerzo, excusa, convenciones y organigrama PASS. |
| 2026-09-08 13:32:59.249 UTC | N-T3 privacidad HTTP | Evidencia privada `normativa-2026/production-route-privacy.json`; Railway SSH loopback | Acceso anónimo denegado en lista/lectores de normativa, vista previa ADMIN, PDFs e imagen. La publicación conserva la audiencia MEMBERS y el acceso a objetos sin firma sigue denegado. |
| 2026-09-08 13:34:09 UTC | N-T3 cierre | Evidencia privada `normativa-2026/production-repeat-publish.log` y `production-audit-readback.json` | Simulación y repetición de `--apply --publish`: `unchanged` para ambos documentos, sin duplicación ni reemplazo. Auditoría exacta de tres eventos por documento: uploaded, articles-replaced y published; seis en total. N-T3 completo; originales, identidades y credenciales permanecen fuera del repositorio. |

Huellas verificadas en producción, iguales antes y después de publicar. La huella de contenido usa los IDs de medios resueltos; la portable identifica el corpus independientemente del entorno.

| Documento | ID | PDF SHA-256 | Contenido SHA-256 | Portable SHA-256 |
|---|---|---|---|---|
| Estatutos | `jyutd29w45bmg8kq6hat513d` | `58123226bbcbbd5f6c0c4079ebcc70f66aa50857c799be45f67ffc7bf700d0ae` | `c452c9db471af1b8735a2b8400794fe5f6eb73d68cc58e30cabd3b325b3d44e8` | `52358a5533b25d1917bc693c115bbb51c9ebb7f5e609e9d2f670d3265cc1b59c` |
| Reglamento | `ztibrokdv74r86kelyql9hbt` | `43a5ee057e9fe6f8d95a337bad40e3c83cf01b8f858c29100680c44fed7d3429` | `89dddf39b58e9f1271b589c0e4f06edfd27b682feba511079ac38d422205cb14` | `aada7032f783290dd7518cf547127532e8e63cf006ceb84b6fcd89947ba3dac3` |

Organigrama original: medio `td2afi3742omqc0wzse45vrv`, 1242 × 661, PRIVATE/READY, SHA-256 `eefc21bb9f349eeefa103163c350d5398d359486fa725a86eab69a8205c5d177`.


## Publicación del dominio y retiro de GHPOINTS (2026-09-08)

Operación solicitada por Mateo: commit/push de la experiencia nueva, promoción a producción y eliminación de `gallant-patience` para conservar solo `casa-digital`. No se cargaron datos GHPOINTS en la app nueva. Tiempos de esta sección en UTC.

| Tramo | Evidencia | Resultado |
|---|---|---|
| Candidato de experiencia | `5a305ca46424a7c52539513f7a0dcc408c05f4ec`; [CI main 34251744011](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34251744011) | Commit/push de Administración, portal y Mi OE; check local PASS (312 unitarias, 257 integración, 11 extractor y build), CI SUCCESS con 174 e2e. |
| Staging | Deployment `32ab7b33-555f-4b8c-8c99-95b8c427d3dc`, SUCCESS a las 16:47:39.990; smoke a las 16:48:34.540 | SHA exacto `5a305ca`, smoke 6/6; portal, Mi OE y admin revisados en navegador con sesión sintética. |
| Producción | [CI production 34253349727](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34253349727); deployment `095ba4f0-b246-4a52-8119-3904f5643fe3`, SUCCESS a las 17:08:44.133 | Mismo SHA `5a305ca`; CI SUCCESS con 174 e2e. Smoke público 6/6 y portada nueva comprobados después del despliegue. |
| Dominio final | Custom domain `96034fcc-6dd4-4f28-a66a-302c7a13f232`, creado a las 16:51:20.752, proyecto `000919ed-7a92-44d3-9987-5d749b245bba`, entorno production, servicio web, puerto 8080 | CNAME apex `16kda74o.up.railway.app` y TXT `_railway-verify` actualizados. Railway ACTIVE, verificación true y certificado VALID/COMPLETE; HTTPS 200, www redirige al apex y `/ingresar` responde 200. Cloudflare conserva proxy, SSL Full y los otros seis registros DNS. |
| Congelación de GHPOINTS | Web detenido; lectura privada a las 16:35:41 sin deployments web activos ni otros clientes de base de datos | Cota superior de última escritura: verificación de congelación, no fecha exacta de una fila. Dump posterior; inventario fuente idéntico al finalizar. |
| Respaldo final | `ghpoints-archive/20260908T164154Z/report.json`; creado 16:41:54.323, restaurado 16:42:54.307, terminado 16:42:59.472 | PostgreSQL 18: bases `postgres` y `railway`, 34 tablas public y 3 prisma_contract; todos los datos, columnas, constraints, índices y secuencias cotejados. Bucket inventariado con cero objetos. Descarga R2 y SHA del cifrado verificados. |
| Retiro | `projectDelete=true` para `7c32a607-29e6-4abe-af3a-e95339915bac`; listado posterior a las 16:57:35.996302 | Único proyecto accesible: `casa-digital`. El archivo lógico final permite recuperar el estado; no conserva el historial PITR eliminado junto al proyecto. |
| Cierre de configuración | Dominio declarado en `.railway/railway.ts`; planes privados `infra-before.json` y `infra-after.json` | La adopción del dominio no añade diferencias al plan. Persisten dos diferencias previas: variable Wallet ausente y explicitación de restart/sleep; no se ejecutó apply ni se alteraron esos recursos. |
| Verificador público | `scripts/lib/smoke.ts` interpreta los grupos `User-agent: *` de robots.txt | Los bloqueos de bots concretos que agrega Cloudflare no bloquean por error el smoke público. Cuatro regresiones nuevas cubren grupos compartidos, comentarios, precedencia y grupo general ausente. Check de cierre PASS: 316 unitarias, 257 integración, 11 extractor y build. |

El dominio se movió usando la versión de producción anterior, `e411a49`, ya saludable y comprobada con smoke público 6/6; el nuevo despliegue arrancó después de finalizar la ventana del dominio. La promoción de `5a305ca` se solicitó antes de la ventana, mientras CI seguía ejecutándose. No hubo cambios de código durante la ventana. El commit de cierre conserva la declaración del dominio y el ajuste del verificador para las siguientes promociones.

Archivo cifrado final en R2: bucket privado `oe-respaldos`, key `ghpoints/20260908T164154Z/ghpoints-20260908T164154Z-final.tar.zst.age`, 184588 bytes, SHA-256 `d9e04b446b7dbe7d013f070487ba6a64b77294f854415acd770ca027eecc1b40`. Retener hasta **2026-12-07 16:57:35.996302 UTC**, 90 días desde la eliminación verificada. La clave age sigue fuera del repo. La restauración normaliza huecos físicos de `ordinal_position` producidos por columnas eliminadas y coteja el orden relativo y todos los atributos de las columnas; los datos y el esquema restaurados coincidieron. Archivos privados de trabajo con texto plano y credenciales, contenedores y túnel temporal eliminados al terminar el respaldo.

Evidencia privada de operación: `/Users/mateo/.codex/private/casa-digital/release-20260908/`; respaldo y reporte en `/Users/mateo/.codex/private/casa-digital/ghpoints-archive/20260908T164154Z/`. No contiene material que deba copiarse al repositorio. La fecha de retención quedó registrada; no se creó una tarea automática de eliminación.

Pendientes conservados: OTP real sobre el dominio final (el acceso real anterior está registrado en T4), aceptación iPhone, validación nocturna y semana de monitoreo, integraciones exclusivas/archivo del repo GHPOINTS. Lectura de producción a las 16:42:21: política `pendiente`, página de privacidad DRAFT sin cuerpo, una persona y cero comités; falta el contenido real para la presentación. Los proveedores Wallet de producción continúan sin activar. Estos pendientes no impiden acreditar la publicación del dominio y la eliminación del proyecto, pero mantienen abierta la fase 7.

## Primer integrante y partidos Athletic (2026-09-08)

Carga operativa solicitada y verificada en `casa-digital` / `production`, con el mismo despliegue `095ba4f0-b246-4a52-8119-3904f5643fe3`. Se reutilizaron los comandos de dominio dentro de una transacción con lock y actor del primer ADMIN. No se ejecutaron seeds, migraciones, altas adicionales ni concesiones de permisos.

- Conservados el único usuario, su membresía ACTIVE, el ingreso 2026-1 y el permiso ADMIN global.
- Creado 2026-2 del 1 de julio al 31 de diciembre, con valores predeterminados del término; GEMIS activo, logo `gemis` y publicación DRAFT. Una sola pertenencia actual con cargo FINANCIERO; no se completó historia de comité en 2026-1.
- Cinco ocasiones ACTIVITY / ATHLETIC_MATCH generales, 10 puntos, aprobación AUTO y código rotativo obligatorio. Ventana desde 30 minutos antes hasta 180 minutos después del inicio, zona America/Bogota, sin hora de finalización. Placa cubierta para voleibol/básquetbol y cancha de grama sintética para fútbol.

| Partido | Inicio en Bogotá | Estado | publicId | Consola |
| --- | --- | --- | --- | --- |
| Voleibol vs. AIESEC | 2026-09-07 15:00 | CLOSED | `e6r2uhq3mm` | `/admin/ocasiones/kfzrq5hghii9xqcdovjgaj45` |
| Básquetbol vs. GPG | 2026-09-09 14:30 | OPEN | `x7pv3fjb7e` | `/admin/ocasiones/z5byjcof2475ids2zpwikpjf` |
| Básquetbol vs. Partners | 2026-09-10 11:00 | OPEN | `anubcwumrk` | `/admin/ocasiones/hc8e6k5xiniq4c6mnr4p2i32` |
| Fútbol masculino vs. Supernovas | 2026-09-10 11:00 | OPEN | `furqxp5xd4` | `/admin/ocasiones/ge0otzafjuy9p9bv9dejfena` |
| Fútbol femenino vs. Krepres | 2026-09-11 10:00 | OPEN | `u478cfpdv4` | `/admin/ocasiones/qyzwc1gewe7ou07rsewz395y` |

Cada enlace de asistencia es `/a/<publicId>`. Los dos partidos simultáneos conservan registros separados. El lunes permanece en Administración y en la lectura del calendario personal; la agenda de próximos muestra los otros cuatro.

| Verificación | Resultado |
| --- | --- |
| Integración sintética | 19/19 PASS en cuatro archivos (`participation-checkin`, `participation-occasions`, `people-membership`, `agenda`), 6,10 s. Cubre código ausente/incorrecto/válido, ventana, 10 puntos y duplicados, incluidos 500 check-ins concurrentes. |
| Simulación / aplicación | Simulación PASS a las 17:39:07 UTC; aplicación iniciada a las 17:39:36 UTC, PASS. 14 auditorías atribuidas al actor: término, comité, pertenencia, cinco creaciones, cinco aperturas y un cierre. |
| Repetición | PASS a las 17:40:12 UTC; cero cambios y misma auditoría. SHA-256 de la proyección comparada `3a513f7c2d2c3f5679163a4703c476e82ecc1b43e6e7b9fc7c81075d6f0afc6d`. |
| Sesión y vistas reales | Acceso autenticado a Mi OE y Administración; ficha con ingreso 2026-1, ACTIVE/ADMIN y GEMIS–Financiero; carnet con cargo y 2026-2; cuatro partidos próximos con sus horarios/lugares; consola con QR y código rotativo; enlace del lunes muestra registro cerrado. Se usó una sesión existente, sin solicitar un OTP nuevo. |
| Efectos y conteos | PASS a las 17:41:49 UTC: eventos de pertenencia, cierre, score y permanencia procesados al primer intento, sin dead letters; una persona, cero check-ins, entradas de puntos y consentimientos. La carga no acredita asistencia retroactiva. |

Evidencia privada: `/Users/mateo/.codex/private/casa-digital/perfil-athletic-20260908/`, con simulación, aplicación, repetición, identificadores y `verification.json`. Datos personales y archivos operativos fuera del repositorio. La política sigue pendiente; esto completa únicamente el primer integrante y estos partidos, sin cerrar el resto del roster, OTP nuevo del dominio final ni los otros pendientes de fase 7.

## Activación de Apple Wallet en producción · 2026-09-08

Activación solicitada por Mateo para disponer del botón en su iPhone. Se cargaron privadamente las cuatro variables Apple en el servicio `web` de `production`; la relectura confirmó coincidencia y conservación de las demás variables. Se usó el certificado de producción ya emitido, distinto del de staging y vigente hasta el 2027-10-07 a las 13:31:40 UTC. `wallet:check` y la firma local de un pase sintético sin credencial válida verificaron configuración, clave, cadena Apple, manifiesto y CMS; no emitieron un carnet de una persona.

Redespliegue `41ae3f2c-1a3d-4e47-9c42-5ed37bf5a1d8` **SUCCESS**, con el mismo SHA `5a305ca46424a7c52539513f7a0dcc408c05f4ec`. Healthcheck Railway correcto a las 18:13:25 UTC; comprobación pública a las 18:13:32 UTC: `/api/health` 200/`ok` con ese SHA, `/api/wallet/apple` sin sesión 302 al ingreso con `no-store`, badge SVG 200 con hash esperado y Google 404 con `no-store`. Smoke público 6/6 correcto usando el origen efectivo del bucket. La primera invocación del smoke usó por error el endpoint S3 como origen esperado; corregir el argumento resolvió esa comprobación sin cambios de servidor.

Apple queda habilitado en producción; Google continúa sin activar. El navegador de comprobación pidió ingreso, por lo que estos resultados no acreditan observación del botón en una sesión autenticada ni guardado nativo en producción; se solicitó al usuario recargar y guardar desde su iPhone. La aceptación física previa corresponde a staging. Los pendientes de política, titular/licencia y aceptación integral de fase 8 conservan su alcance.

Evidencia privada: `/Users/mateo/.codex/private/casa-digital/wallet/production-activation-20260908/`, con `configuration-receipt.json`, `signature-check.json`, `http-verification.json`, `smoke.log` y `smoke-result.json`. No contiene valores de credenciales en los recibos. Operación de configuración, sin cambio del código desplegado ni promoción de otra revisión.


## Activación de Google Wallet en producción · 2026-09-11

Activación solicitada por Mateo para disponer del botón «Añadir a Google Wallet» en el carnet de producción. Se cargaron privadamente las cuatro variables Google en el servicio `web` de `production` en una sola solicitud: emisor, correo y clave de la cuenta de servicio y `GOOGLE_WALLET_CLASS_SUFFIX=carnet-oe`, el sufijo que IaC ya declaraba para producción. La relectura confirmó los cuatro valores idénticos a los enviados y las 28 variables existentes sin cambios. La cuenta de servicio es la propia de producción, distinta de la de staging, sobre el mismo emisor demo: la separación entre entornos es el sufijo de clase, como fija ADR-040.

Antes de cargar, `wallet:check` con entorno aislado pasó con la configuración Google completa, PEM/IDs válidos y `APP_URL` HTTPS, y una sonda de solo lectura con esa credencial obtuvo OAuth 200, `GET issuer` 200 con el id esperado y `GET genericClass` 404 para `<issuer>.carnet-oe`: la clase de producción todavía no existe y la app la crea en la primera emisión. No se creó ni modificó ningún recurso en Google.

La carga fue aceptada a las 21:14:53 UTC y disparó el despliegue `dfc653b2-373b-4c90-93e5-f879de880f89`, **SUCCESS** a las 21:16:51 UTC con el mismo SHA `6878340ca36608a0e7ecd3df93f89b54a5c7071b` que ya corría. Comprobación pública a las 21:17:09 UTC: `/api/health` 200/`ok` con ese SHA; `/api/wallet/google` sin sesión pasó de 404 a 302 hacia `/ingresar?next=%2Fapi%2Fwallet%2Fgoogle` con `no-store`; `/api/wallet/apple` conservó 302 con `no-store`; los badges Google y Apple respondieron 200 con los hashes registrados en [16-billeteras.md](16-billeteras.md) y `/wallet/google-logo.png` 200 como `image/png`. Smoke público 6/6 con el origen virtual del bucket.

Google queda habilitado en producción junto a Apple. El emisor sigue en modo demo: solo las cuentas registradas como testers en la consola del emisor pueden guardar el pase y el diálogo muestra la marca de prueba; la publicación general se solicitó desde esa consola y Google la aprobó el mismo día a las 18:22 de Bogotá, con lo que el emisor salió del modo demo; detalle en la guía de billeteras. Estos resultados no acreditan la visibilidad del badge con sesión ni el guardado nativo; se solicitó al usuario abrir el carnet desde su celular y guardar el pase. Publicación, cambio real de semestre, anonimización Google, política y titular/licencia conservan su alcance.

**Guardado nativo verificado el mismo día.** Con su sesión propia en producción, Mateo emitió el pase desde el badge del carnet y lo guardó en Google Wallet de su Android; una foto del pase abierto en la app mostró la organización con el prefijo de prueba del emisor demo, el término 2026-2, su nombre, el QR y el pie «Carnet OE 2026-2». El log HTTP de Railway registra la primera emisión a las 21:26:13 UTC, 302 en 2075 ms, y una sonda de solo lectura posterior devolvió 200 para la clase `<issuer>.carnet-oe`, que antes no existía. Hasta las 21:43 UTC siguieron once respuestas 302 más de la ruta Google: nueve reemisiones idempotentes del mismo objeto, de 362 a 785 ms, y una redirección de 4 ms compatible con una apertura sin sesión; además cuatro descargas del pase Apple con 200. La foto no se conserva porque el QR es una credencial `oe2` vigente. Quedan pendientes el escaneo por anfitrión en producción y la publicación general del emisor.

Evidencia privada: `/Users/mateo/.codex/private/casa-digital/wallet/production-activation-google-20260911/`, con `activate-google-production.mjs`, `google-probe.json`, `google-probe-after-native-save.json`, `configuration-receipt.json`, `http-verification.json`, `apply-production.log`, `smoke.log`, `smoke-result.json` y `native-save-observation.json`. No contiene valores de credenciales, imágenes ni QR. Operación de configuración, sin cambio del código desplegado ni promoción de otra revisión.

## Alta individual de integrante existente (2026-09-08)

Excepción individual autorizada por el ADMIN y documentada en [ADR-045](adr/ADR-045-alta-individual-de-integrante-existente.md). Operación privada de datos en `casa-digital / production`, sin APIs, migraciones, despliegue ni cambios de variables. El servicio web conservó el deployment `41ae3f2c-1a3d-4e47-9c42-5ed37bf5a1d8` (SUCCESS), SHA `5a305ca46424a7c52539513f7a0dcc408c05f4ec`.

- **Preparación:** manifiesto individual y scripts fuera del repositorio; directorio 0700 y archivos 0600. Se comprobaron identidad del entorno, ADMIN autorizante, datos existentes y logos. El índice `alta-individual-20260908.json` del directorio privado de operaciones conserva las rutas, identificadores e informes; no se reproducen datos personales aquí.
- **Ensayo sintético:** base local exclusiva, migrada y eliminada al terminar. Diez verificaciones PASS: guard de política pendiente, simulación con rollback íntegro, transacción de persona/historial, reanudación antes del permiso, representación de las 19 pertenencias, repetición con IDs estables, conflicto rechazado, sesión sintética ADMIN/junta y revocación, guard conservado y procesamiento del outbox sin participación ni comunicaciones.
- **Simulación en producción:** iniciada a las 18:53:10 UTC, ejecutó las mutaciones dentro de una transacción revertida; comparación anterior/posterior idéntica, incluidas auditoría y outbox. Existían una persona, dos términos de 2026 y un comité.
- **Carga:** iniciada a las 18:53:45 UTC. Creó seis términos de 2023–2025 con fechas convencionales, cuatro comités activos con logo existente y ficha DRAFT, una persona MEMBER/ACTIVE con ingreso 2023-1, 19 pertenencias MIEMBRO y dos cargos VP_GH para 2026. Las entradas conservan `joinedAt = null`; las dos salidas informadas usan el límite exclusivo del siguiente semestre en America/Bogota. ADMIN se concedió después mediante `grantPermissionAs`. Auditoría atribuida al ADMIN autorizante: **33 entradas**.
- **Repetición:** iniciada a las 18:55:15 UTC; **cero cambios**, mismos IDs de persona, membresía, pertenencias, cargos, permiso y eventos. Sin nuevas auditorías ni eventos de esta operación. Se excluye del cálculo de idempotencia el total global del outbox, que también recibe jobs programados ajenos a la carga.
- **Verificación de producción:** dos personas y dos ADMIN globales; únicamente dos comités vigentes para la persona incorporada. Ficha administrativa revisada con la sesión existente del ADMIN: ingreso, datos opcionales vacíos, historial completo, salidas y cargos correctos. El integrante puede iniciar sesión con su correo; no se creó una sesión en su nombre ni se solicitó su OTP.
- **Efectos comprobados:** los **14 eventos de actualización y ocho recálculos derivados** se procesaron sin errores. Cero asistencias, entradas de puntos o consentimientos; los tres mensajes preexistentes se conservaron y la nueva persona no recibió ninguno. Política `pendiente` y página de privacidad sin cambios. Datos previos del primer integrante, comités y agenda conservados.

La evidencia privada incluye manifiesto, código operativo, simulación, carga, repetición, verificación de lecturas y revisión de la ficha. La publicación de la política, el roster general y los pendientes de lanzamiento permanecen abiertos. La conexión operativa quedó cerrada a las 19:02:34 UTC; se comprobó el puerto cerrado y se eliminó su archivo temporal con credenciales.


## Integración del roster y consulta en licencia (2026-09-08)

Implementación de [ADR-046](adr/ADR-046-integracion-roster-y-acceso-en-licencia.md): cuatro campos opcionales privados, importación parcial sin borrar vacíos y consulta de Mi OE en licencia con capacidades operativas suspendidas. Migración aditiva `0012_rapid_psylocke`: tipo de documento, número e ID EPIK de texto y nacimiento SQL `date`, todos nullable.

| Verificación | Evidencia y resultado |
| --- | --- |
| Local | `npm run check` PASS: 335 unitarias, 266 integración, 11 extractor y build. Los 29 e2e de roster, personas, solicitudes/licencia, ajustes y carnet pasaron con datos sintéticos. Check de cierre nuevamente PASS; solo corrigió documentación y comentarios, sin cambios de lógica posteriores al candidato. |
| CI | [Main 34277569936](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34277569936) y [production 34279813835](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34279813835), ambos SUCCESS, 174 e2e cada uno. |
| Staging | SHA `2a0cf6b31996b9f544f677546f3585da084493f4`, deployment `9c04e035-bd9f-44c0-bc0d-85f38f19dfe0` SUCCESS. Smoke 6/6 a las 21:16:20 UTC. Sonda sintética de nueve comprobaciones: lectura/mapeo, fecha/ceros, persistencia y actualización parcial, consentimiento según política existente, licencia/guards y datos propios; rollback y relectura sin residuos, archivo temporal retirado. La sonda no acredita upload/apply completo, OTP/sesión ni Wallet en remoto; esas rutas tienen cobertura local/CI. |
| Producción | Mismo SHA, deployment `cbe18f1f-2052-4584-aa1f-87d2853b8436` SUCCESS. Smoke público 6/6 a las 21:38:00 UTC. Sonda READ ONLY a las 21:39:06 confirmó las cuatro columnas nullable, tipos text/date y CHECK validado; cinco hashes coinciden con las proyecciones previas de personas/membresías, vínculos actuales/cargos, permisos y política. Conserva dos personas, dos ADMIN, dos cargos y 20 vínculos históricos; los cuatro campos nuevos siguen vacíos. Cero consentimientos, ImportJob, eventos pendientes y deadletters. |
| Respaldo | `20260908T204736Z-9206a6d16945af8a.tar.zst.age`, creado y verificado antes de la operación, con retención de 12 copias completas. |
| Catálogo | Aplicación a las 21:40:14 UTC: 16 comités ACTIVE/DRAFT con logos existentes y seis términos históricos necesarios. Conservados los cinco comités y ocho términos previos; resultado: 21 comités y 14 términos. Lectura posterior confirmó 22 auditorías atribuidas al actor y los IDs creados. Repetición a las 21:40:39: cero creaciones. No se emitieron eventos desde los comandos de catálogo. |
| CSV final | Validación a las 21:40:50 con seis hashes de lógica iguales a producción: 453 filas válidas, cero errores, 452 NEW y una CHANGED; ningún semestre ni cargo faltante. El cargo vigente se conserva. Hay 453 avisos no bloqueantes de nombres en mayúsculas. La comparación se ejecutó localmente con snapshot READ ONLY de producción; no se transmitió el CSV ni se creó una vista previa en el asistente. |

La preparación privada concilia las 492 filas originales: 453 incluidas y 39 excluidas (15 sin obligatorios, ocho correos inválidos/no institucionales, ocho filas de cuatro pares en conflicto, cuatro graduados, tres copias equivalentes unificadas y una diferencia de identidad con producción). La copia conserva únicamente A–L; M/N y Sheet1 están físicamente excluidos y el original permanece intacto. Se recuperaron dos celulares del XML y se documentaron las incidencias opcionales de las personas incluidas. No se resolvieron identidades por coincidencia de correo ni se inventaron fechas de graduación.

La aplicación de personas continúa bloqueada por política `pendiente` y página DRAFT vacía, conservadas sin cambios. Antes de aplicar: publicar el texto aprobado, activar su versión y disponer del respaldo de las autorizaciones de membresía. Tomar un respaldo reciente en esa ventana, subir únicamente el CSV final al asistente, elegir 2026-2, revisar el mapeo y la comparación actualizada sin errores y confirmar con un código reciente. Verificar altas, actualización, pertenencias de 2026-2, consentimiento MEMBERSHIP/IMPORT, auditoría y procesamiento de eventos; repetir sin duplicar personas ni pertenencias. La importación no envía bienvenida.

Evidencia privada en `/Users/mateo/.codex/private/casa-digital/roster-release-20260908/` y `/Users/mateo/.codex/private/casa-digital/roster-20260908/`: recibos de despliegue, CI, smoke, sonda y preservación, aplicaciones del catálogo, validación, CSV, guía de entrega y pendientes. No se incorpora ningún dato personal a Git. Las cifras previstas no acreditan una carga aplicada ni autorizaciones obtenidas.

## Habilitación de la política de datos (ADR-047, 2026-09-08)

Estado al escribir esta sección: borrador entregado en [17-politica-de-datos.md](17-politica-de-datos.md), página `privacidad` en DRAFT y vacía, `privacy.policyVersion` en `pendiente`. **No se ejecutó ningún paso de los que siguen.**

Requisitos previos, todos de la junta: responsable del tratamiento y su vínculo con EAFIT, domicilio, buzón real de atención al titular, fecha de aprobación (que es la versión, `AAAA-MM-DD`), decisión sobre integrantes menores de edad y constancia escrita de que la admisión a la OE incluye la aceptación del tratamiento, con la ubicación de esa evidencia.

Orden de ejecución, un paso por vez y con su evidencia. Desde [ADR-048](adr/ADR-048-autorizacion-en-el-primer-ingreso.md) el despliegue del código va **antes** que la carga, porque cambia lo que la importación escribe:

0. **Desplegar ADR-048** (CI en `main`, promoción a `production`): la importación deja de registrar consentimientos y aparece la pantalla `/autorizacion`. Ojo: desde ese momento, quien no tenga autorización viva no entra a Mi OE. `/admin` no está detrás del guard, así que el ADMIN puede publicar la política aunque él mismo todavía no haya aceptado; después entra a `/app`, acepta y sigue.
1. **Ensayo en staging.** Publicar la página con el texto aprobado, activar una versión de ensayo, comprobar que desaparecen T-1178/T-1179 y aplicar un CSV **sintético** con el asistente; repetirlo para ver que no duplica. Es el primer upload/apply completo del asistente contra un entorno remoto.
2. **Respaldo previo en producción.** Casa Digital → production → backup → Cron Runs → Run now; anotar deployment, archivo y `backup.lastRunAt`.
3. **Publicar.** `/admin/paginas` → `privacidad`: cuerpo aprobado, `PUBLISHED`, `PUBLIC`. Revisar `/privacidad` en el dominio final; si muestra "en preparación", el cuerpo quedó vacío.
4. **Activar.** `/admin/sistema/politica` con ADMIN y step-up: guardar la versión aprobada. La acción rechaza una página sin publicar, no pública o vacía; la escritura queda auditada como `config.updated`.
5. **Comprobar la habilitación.** `/app/ajustes` sin aviso y con "Autorizar" activo, `/admin/personas/importar` sin banner.
6. **Aplicar el lote.** Respaldo reciente, subir solo el CSV final A–L, término 2026-2, revisar mapeo y vista previa (452 nuevas, 1 con cambios, cero errores, 453 avisos de mayúsculas) y **revisar la propuesta de permiso de líder de cada `General` antes de confirmar**: viene marcada y concede permisos reales. Confirmar con código nuevo.
7. **Verificar y registrar.** Conteos de personas, membresías y pertenencias de 2026-2; **cero consentimientos creados por la carga** y la primera autorización propia registrada al entrar; `ImportJob` con su resumen; outbox drenado sin deadletters; repetición sin duplicados; sesión real de una persona importada. Registrar aquí las cifras y las referencias, sin datos personales.

Si algo sale mal, guardar `pendiente` en el mismo control: bloquea de inmediato altas, importaciones y autorizaciones nuevas, sin borrar el texto publicado ni los consentimientos ya registrados.

## Política publicada y roster aplicado (2026-09-09)

Operación autorizada expresamente por Mateo: publicar y activar la política de datos y ejecutar la carga. Esta sección actualiza los estados pendientes de las secciones anteriores; las cifras de preparación no describían todavía una importación aplicada.

- **Código previo:** `242a08a60e13c6a1e005367d127bda8f0b4d55c1`, deployment productivo `f78eb5dc-b035-4ed3-8ac2-54312b0d9d83`, ya verificado en staging y producción. La operación de datos no cambió código, variables ni infraestructura.
- **Ensayo remoto:** en staging se publicó el texto aprobado y se activó `ensayo-2026-09-09`. El asistente importó dos identidades sintéticas sin permisos ni consentimientos nuevos. Conservó documento e ID con ceros iniciales y nacimiento; la repetición dio dos sin cambios. Una identidad importada entró por OTP, pasó por `/autorizacion`, registró un único MEMBERSHIP/SELF con la versión de ensayo y abrió Mi OE. Sesiones sintéticas cerradas al terminar; las dos identidades quedan como datos de prueba en staging.
- **Respaldo:** corrida manual del servicio backup, deployment `eea7ece2-b538-4290-af09-870fefcdae27`; archivo verificado `20260909T171526Z-15664878d5ff3103.tar.zst.age`, retención de 12 copias completas. `backup.lastRunAt = 2026-09-09T17:15:30.737Z`.
- **Publicación:** página `privacidad` PUBLIC/PUBLISHED; texto idéntico a la sección aprobada de `17-politica-de-datos.md`, normalizando finales de línea del formulario. Revisada en `https://oeeafit.com/privacidad`. Versión `2026-09-08` activada a las 17:26:13 UTC mediante el control administrativo y un OTP reciente, con auditoría.
- **Archivo:** se encontró una vista previa creada el 8 de septiembre que todavía no estaba aplicada. Su objeto privado se comparó por SHA-256 con el CSV final validado: idéntico. Se reutilizó esa vista previa y se volvió a validar el mapeo de las doce columnas A–L contra producción: 452 NEW, una CHANGED, cero errores, 453 avisos no bloqueantes por mayúsculas y cero propuestas de permisos de líder.
- **Aplicación:** `ImportJob ekl3el7jh12bdhh6pnwoloxm`, APPLIED a las **17:26:32.371 UTC**: 452 altas, una actualización, cero omitidas. Producción quedó con **454 personas y 454 membresías**, y 543 pertenencias vigentes de 2026-2. Los estados de las 453 filas cargadas son 391 ACTIVE, 44 ON_LEAVE y 18 HONORARY.
- **Verificación:** lectura transaccional READ ONLY contrastó cada una de las 453 filas con la vista previa validada: campos personales, fecha, semestre de ingreso, estado, prueba y comités/cargos. Conservó IDs de personas existentes, historial previo, permisos, cargos y catálogo. Auditoría: 453 entradas `person.imported` atribuidas al ADMIN autorizante. Cero consentimientos y correos creados por el lote; cada persona debe dar su autorización al ingresar.
- **Repetición:** el mismo CSV volvió a pasar por el asistente: cero nuevas, cero cambios, 453 sin cambios y cero errores. La vista previa `ruat5sys9kpyh91a7z65pyjc` quedó DISCARDED; no se aplicó otra carga ni se duplicaron personas.
- **Cierre:** a las 17:30:25 UTC, cero eventos pendientes y deadletters; sin errores de aplicación en los logs revisados. Salud HTTP 200 a las 17:30:43 UTC, mismo SHA y latencia DB de 1 ms. Se comprobó el total también en la lista administrativa.
- **Correo de reautenticación:** la app registró envío Resend SENT y el proveedor confirmó `delivered` para el mensaje de esta operación. Mateo informó que no aparecía en su bandeja de EAFIT. Se completó la reautenticación con el código recuperado del registro del envío en la conexión autorizada de Resend; no se modificaron retos, sesiones ni controles directamente en la base. La entrega al servidor no prueba ubicación en la bandeja del destinatario. No se solicitaron códigos ni se abrieron sesiones de otras personas reales.

Evidencia privada en `/Users/mateo/.codex/private/casa-digital/roster-load-20260909/`: snapshots antes/preparación/aplicación/cierre, comparación del archivo, verificación de las 453 filas y recibos del ensayo. Incluye datos personales y permanece fuera de Git. Las 39 filas excluidas del archivo original siguen pendientes de revisión según el informe privado de preparación; no forman parte del lote aplicado.

### Corrección individual posterior a la carga (2026-09-09)

El ADMIN autorizante pidió quedar Activo sin periodo de prueba y como Financiero de GEMIS para 2026-2. Conservaba tanto ACTIVE como ADMIN global y FINANCIERO; el lote había añadido la condición de prueba. Se aplicó un CSV privado de actualización parcial, de una fila y cuatro columnas, por el mismo asistente y con reautenticación vigente: `ImportJob se1pfhn4wj5tagw1wn9nw0et`, cero altas, una actualización, cero errores y ninguna propuesta de permisos. Relectura de la ficha: Activo, ADMIN, GEMIS · Financiero y sin condición de prueba. El archivo original de la carga masiva se conserva como evidencia histórica; una futura carga debe incorporar esta corrección posterior. Archivo y recibo en `/Users/mateo/.codex/private/casa-digital/correccion-membresia-20260909/`.

## Diagnóstico de entrega del código de acceso (2026-09-10)

Ninguna persona del roster recibía su código desde la carga del 9 de septiembre. Mateo confirmó que
tampoco aparecía en Correo no deseado, y autorizó expresamente los envíos de prueba.

- **Aplicación y proveedor descartados.** Producción corre `242a08a` (deployment `d4a68b18`) con
  `MAILER=resend`, `EMAIL_FROM="OE EAFIT <noreply@oeeafit.com>"` y sin desbordamiento SES. En los dos
  despliegues productivos del 9 de septiembre no hay una sola línea `correo no enviado`, que es lo que
  `sendTransactionalEmail` registra cuando el transporte falla: Resend acepta todos los mensajes. Las
  únicas líneas de OTP son tres `otp: correo fuera del roster` de personas que no están en el lote.
- **Envíos de prueba**, 2026-09-10, reproduciendo el mensaje exacto de `requestOtp` por la API de
  Resend con la clave de producción, los tres aceptados con 200:

  | Hora (UTC) | Destinatario | ID del proveedor |
  | --- | --- | --- |
  | 13:50:45 | mail-tester | `ac2c7eb4-0b85-422e-af82-d245906419e7` |
  | 13:50:46 | Gmail personal | `b0592d82-bd42-441a-8176-da19b50a904e` |
  | 13:50:47 | `mloperao1@eafit.edu.co` | `734d96ef-9f71-46e8-8bbf-3438ad1f0914` |

- **Autenticación correcta.** mail-tester: **9,1/10**. SPF `pass` (`send.oeeafit.com`, mecanismo
  `include:amazonses.com`, IP `54.240.48.54`), DKIM `pass` y alineado (`header.d=oeeafit.com`, selector
  `resend`), DMARC `pass` con `p=quarantine dis=none`. IP en la lista blanca de Mailspike y sin
  entradas en listas de bloqueo. El único descuento apreciable es `FROM_FMBLA_NEWDOM14`.
- **Destinatario y señales negativas.** `eafit.edu.co` resuelve a
  `eafit-edu-co.mail.protection.outlook.com` (Microsoft 365) y publica DMARC `p=reject` con reportes a
  `seguridadinformatica@eafit.edu.co`. `oeeafit.com` se registró el **2026-08-27**, así que todavía
  figura como dominio de registro reciente, y su nombre se parece al de la Universidad: las dos
  señales que activan la protección antisuplantación de Defender.
- **Confirmado: los retiene Check Point.** El reporte «Quarantined and Spam/Junk Email Report» de
  `no-reply@checkpoint.com` del 9 de septiembre lista en *Quarantined Emails* dos mensajes de
  `noreply@oeeafit.com`: «Tu código para entrar a Mi OE: 790759» (09/09 05:19 PM GMT) y «… 815605»
  (09/09 07:17 PM GMT), con acción *Request to Release*. EAFIT tiene Check Point (Harmony Email &
  Collaboration) por encima de Microsoft 365, y es esa capa —no Defender ni la carpeta de Correo no
  deseado— la que retiene el correo. Por eso no aparecía en ninguna carpeta: la única señal es ese
  digest diario, que llega cuando el código ya venció.
- **Control fuera de EAFIT.** El envío gemelo de las 13:50 UTC llegó a **Recibidos** en Gmail, con el
  mismo remitente, contenido e infraestructura y en el mismo minuto que el que EAFIT puso en
  cuarentena. Queda descartado cualquier problema del mensaje o del dominio.
- **Liberar uno por uno no sirve.** El código vive diez minutos y el reporte de cuarentena llega una
  vez al día. La corrección de fondo es una **regla de permitidos en la consola de Check Point** para
  `noreply@oeeafit.com` y `oeeafit.com`, más la excepción antisuplantación frente a `eafit.edu.co`;
  solo puede aplicarla TI de EAFIT. La solicitud va a `seguridadinformatica@eafit.edu.co`.
- **No se cambió DNS.** La hipótesis previa de bajar DMARC a `p=none` quedó descartada: DMARC pasa, así
  que relajar la política no habría mejorado la entrega y sí habría debilitado la protección del
  dominio contra suplantación.
- **Correcciones propias** (ADR-050, pendientes de promoción): el asunto deja de llevar el código, el
  mensaje usa el envoltorio común con pie transaccional y cabeceras de correo automático, y el envío
  queda registrado. Bajan las señales de correo masivo, pero no reemplazan la entrada de permitidos.
  **La promoción espera a que llegue un código real:** mientras tanto, leer el código del asunto en el
  registro del proveedor es la única forma de completar el step-up en producción.

## Emisión de enlaces de acceso y jornada de activación (ADR-051)

Desde [ADR-051](adr/ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md) la credencial es una contraseña propia, y la primera —o la recuperación— llega por un enlace de un solo uso que emite la junta fuera del correo. Este procedimiento es la parte que el código no puede hacer solo.

### Antes de emitir: verificar quién pide

El sistema comprueba que quien emite sea ADMIN o BOARD y que tenga step-up reciente, y que el enlace no le dé permisos que no tiene: para una persona con ADMIN, o que lidera un comité que quien emite no lidera, solo emite un ADMIN ([ADR-113](adr/ADR-113-reglas-de-seguridad-e-integridad.md)). **No puede comprobar que quien recibe el enlace sea la persona correcta**: eso lo hace quien emite, y es la parte que se puede engañar.

- Emitir **en persona**, o por un canal que ya se conozca de esa persona (su chat de siempre, no un número nuevo).
- **Nunca emitir porque llegó un mensaje pidiéndolo.** Un mensaje que pide un enlace de acceso es la forma exacta que toma la ingeniería social; devolver la llamada o buscar a la persona en la reunión cuesta un minuto.
- Ante la duda, no emitir y avisarle a otra persona de la junta.

Quien emite ve el enlace, así que durante esos 60 minutos puede entrar como esa persona. Está registrado quién emitió y para quién, la persona recibe un push cuando se emite, y usar el enlace cierra las sesiones anteriores. Es una amenaza aceptada, no resuelta: por eso la lista de quien puede emitir se mantiene corta.

### Quién llega a cada superficie

La ficha de la persona (`/admin/personas/<id>`) exige ADMIN, así que la junta sin ADMIN emite desde la **jornada de activación** (`/admin/personas/activacion`), que sí admite ADMIN y BOARD y aparece en su navegación. Las dos superficies hacen lo mismo y las dos piden step-up.

### Emitir de a uno

1. Buscar a la persona en `/admin/personas` y abrir su ficha.
2. En la pestaña **Comunicaciones**, **Emitir enlace de acceso**, eligiendo si es la primera contraseña o una recuperación. Pide step-up: la contraseña propia de quien emite.
3. Copiar el enlace **en ese momento**: no se vuelve a mostrar. Vence en una hora y sirve una sola vez.
4. Entregarlo por el canal verificado y confirmar con la persona que entró.

Emitir otro enlace para la misma persona invalida el anterior, así que si hay dudas de que el primero llegó bien, se emite uno nuevo y listo.

### Jornada de activación (asamblea o reunión de comité)

Para arrancar a mucha gente de una sola vez, con identificación presencial:

1. Abrir `/admin/personas/activacion` desde un equipo con pantalla visible.
2. Filtrar por comité y elegir a la persona que está enfrente.
3. Mostrarle el QR; ella lo escanea con la cámara del celular y elige su contraseña ahí mismo.
4. Confirmar que entró y pasar a la siguiente.

Se muestra **un QR a la vez**, a propósito: una hoja impresa con decenas de enlaces sería una pila de secretos con una hora de vida cada uno. Si alguien ya tiene contraseña, la pantalla lo dice y no hay que emitirle nada.

Conviene hacerlo por comité, con el líder presente para reconocer a su gente, y dejar registrado cuántas personas quedaron activadas en cada sesión.

### Arranque del acceso cuando nadie puede entrar

`npm run bootstrap:access -- --email <correo institucional>` emite un enlace de activación sin sesión y lo imprime una sola vez. Es la excepción de arranque de [ADR-051](adr/ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md), regla 16, con la misma disciplina que el bootstrap del primer ADMIN.

Cuándo se usa:

- **La primera contraseña en producción.** Después de promover, `/ingresar` pide contraseña y nadie tiene una; el código del OTP no llega y ya no viaja en el asunto. Sin este script no habría entrada.
- **Si la junta entera pierde el acceso** con el correo todavía retenido. La junta emite enlaces a los miembros, pero nadie puede emitirle a la junta.

Cómo se corre:

1. Apuntar `DATABASE_URL` al Postgres del entorno confirmado y `APP_URL` a su origen público. Sin `--env-file`: las variables las pone el operador, igual que en el bootstrap del primer ADMIN.
2. Correr el comando con el correo institucional de la persona. Agregar `--kind RECOVERY` si ya tenía contraseña.
3. Copiar el enlace de la salida estándar: vence en una hora, sirve una sola vez y no se vuelve a mostrar. El log registra solo la persona y el vencimiento, nunca el enlace.
4. Abrirlo, elegir la contraseña y comprobar el ingreso.

Cada emisión queda en la auditoría como del sistema, sin emisor. **Correrlo es una decisión operativa, no rutina**: quien lo corre tiene acceso a la base, así que el control real es quién puede llegar a ese Postgres, no el script.

## Despliegue del acceso con contraseña · 2026-09-11

`0da910c` promovido a `production` como avance directo desde `7f95c8b`, después de CI en verde y del mismo SHA validado en staging con smoke 6/6. El `preDeploy` aplicó la migración `0013` y verificó el esquema con 81 índices. Smoke de producción 6/6 con `--indexing true` y bucket `media-7-uwyewipofe3gx5s6`.

**El smoke exige el host virtual del bucket del entorno**, no el `S3_ENDPOINT` y no el de otro entorno: con el bucket equivocado falla en «connect-src no incluye el bucket» aunque todo lo demás esté bien.

Orden del arranque, que no se puede alterar porque cada paso habilita el siguiente:

1. **`npm run bootstrap:access -- --email <ADMIN>`** con `DATABASE_URL` al Postgres de producción y `APP_URL=https://oeeafit.com`. Entre el despliegue y este paso nadie puede entrar, así que conviene que sea inmediato.
2. Abrir el enlace y elegir la contraseña. Eso abre sesión y deja el step-up fresco.
3. Publicar la política, que son **dos operaciones distintas y las dos hacen falta**: reemplazar el cuerpo de la página `privacidad` desde `/admin/paginas` con el texto de [17-politica-de-datos.md](17-politica-de-datos.md), y guardar la versión desde `/admin/sistema/politica`. Guardar la versión **no** cambia el cuerpo. En el despliegue del 11 de septiembre quedó hecha solo la segunda, y la página siguió afirmando que no hay contraseñas durante horas, con contraseñas ya vivas. Hasta este paso el texto publicado es falso, así que va inmediatamente después de la primera contraseña.
4. Comprobar el step-up con contraseña y emitir un enlace de prueba desde la jornada.
5. Empezar la campaña por comité. La jornada arranca en 0 de 453.

## Carga histórica de GH Points · 2026-09-14

Carga completa autorizada por Mateo después de resolver identidades, altas, fechas y cumplimiento de las evidencias. [ADR-062](adr/ADR-062-importacion-de-asistencias-y-evidencias-gh.md) y [procedimiento del importador](importacion-ghpoints.md). Los nombres, correos, originales y resultados individuales se conservan fuera de Git.

Se publicó el soporte del importador antes de cargar para que los créditos históricos no enviaran avisos push. [PR 24](https://github.com/Mateoloperaortiz/LaOE/pull/24), SHA `bfaec140b268e45abcf49be731b2b9383060edf9`: [CI de main 34893149019](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34893149019) y [control de promoción 34894145593](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34894145593) SUCCESS. Comprobación local completa: 537 pruebas unitarias, 359 de integración, 11 de Python, lint, tipos, dependencias, código muerto y build; CI acreditó 174 casos E2E únicos. No requirió migración de esquema.

Railway staging `fe157770-026e-418c-8060-2a56afba8060` y production `73dad908-2f19-402a-ad75-b6bbcf887205`, ambos SUCCESS con ese SHA. Smoke público 6/6 en ambos entornos, con el bucket e indexación propios de cada uno. La consulta previa confirmó `APP_URL=https://oeeafit.com`, término 2026-2 abierto, ADMIN habilitado y soporte de importación silenciosa desplegado.

La vista previa viva confirmó 222 asistencias y 3.650 puntos, sin retenciones; hash revisado `cb9d99c37116a2f71aebc1807e823bdc6285a2dff3f7ff8664f6644e3d5d587f`. Se ejecutó una única carga con `--apply`, ADMIN y ese hash, sin `--skip-blocked`. Importación `dmfimk1u3x3ab2yrq8bitr4x`, estado `APPLIED`, aplicada el **2026-09-14 a las 20:45:51.607 UTC** (15:45:51 Bogotá).

Verificación de solo lectura final a las 20:47:10 UTC:

- 222 check-ins `APPROVED`/`IMPORT`, cada uno con un único crédito `CHECKIN` correcto y sin reversión: 3.650 GH Points para 117 personas.
- 17 actividades: 13 creadas y 4 reutilizadas, con todos los metadatos y horarios originales intactos.
- 97 evaluaciones válidas de apoyo y decoración; 41 cumplimientos de decoración de nuevos. Los 117 snapshots existen; los tres rubros contrastados coinciden con la proyección, y los dos miembros en licencia conservan su estado y exención.
- 222 auditorías de asistencia enlazadas con archivo y fila original. Los 21 archivos fuente y el manifiesto en el bucket privado coinciden por contenido y SHA-256 con el paquete revisado.
- Cola del término vacía, sin eventos fallidos ni avisos históricos de puntos. Reconsulta del mismo manifiesto: 222 asistencias existentes, cero por añadir, cero retenidas, 17 actividades reutilizadas y las nueve reglas ya existentes.

Paquete y comprobante privados: `~/Documents/OE-operacion/gh-points-20260914/`, en la máquina de Mateo y fuera del árbol de repositorios (hasta el 2026-09-19 estuvo en `LaOE/outputs/`, junto al repo). `COMPROBANTE_PRODUCCION.md` y `estado_produccion.json` registran el estado posterior; el Excel, los CSV y el plan revisado permanecen como evidencia de la propuesta previa. Las evidencias del bucket se conservan con sus claves deterministas.


## Carga parcial de asambleas · 2026-09-14

GH autorizó explícitamente cargar 400 asistencias conciliadas y excluir las diez reservadas de cuatro personas. [ADR-063](adr/ADR-063-importacion-de-asambleas.md). Solo se procesaron las cinco hojas de fecha; la primera hoja consolidada quedó excluida. El original completo permanece como evidencia privada. La selección parcial mantiene los identificadores del lote completo: no se usó un filtro de elegibilidad que pudiera incorporar automáticamente una de las diez filas mientras el equipo creaba membresías.

[PR 26](https://github.com/Mateoloperaortiz/LaOE/pull/26), SHA `af58b9990bcc3f72cbdadfa9a5778fa6a622bb75`. [CI completo de main](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34898785010) y [control de promoción](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34899561751) aprobados. Comprobación local completa: 541 unitarias, 360 de integración, 11 de Python, tipos, lint, dependencias, código muerto y build. El CI acredita los 174 E2E únicos. No hubo migración de esquema.

Railway staging `ad22828a-be73-4025-8018-bbc04d32e780` y production `87670b25-d86b-4b3d-b699-fe2c535af66c`, ambos SUCCESS con el mismo SHA. Smoke 6/6 en cada entorno con su bucket e indexación. Consulta previa de producción: APP_URL correcto, versión desplegada, término 2026-2 abierto y ADMIN habilitado. Vista previa del manifiesto parcial: cinco creaciones, 400 altas, cero retenciones y cero puntos. Hash revisado `6f7a62935bb5150517668a2a0f2573aaa7af4c220e79c5bc707edd16164ff2fb`; una única aplicación con ADMIN, ese hash y sin `--skip-blocked`.

Importación `czwh3bv146xic194kjo8sjp4`, APPLIED en `2026-09-14T21:38:20.431Z`. Verificación posterior `2026-09-14T21:39:40.924Z`:

- 400 check-ins APPROVED/IMPORT de 217 personas, distribuidos 95/54/82/80/89 en las cinco ordinarias. Ninguna de las diez filas excluidas existe como check-in de esta carga.
- Cero puntos y cero movimientos de ledger asociados a las asambleas. Las 222 asistencias, 250 movimientos y 22 ocasiones anteriores permanecen intactos; las nueve reglas de permanencia se conservaron.
- 217 snapshots contrastados: 48 personas evaluables alcanzan 10%, nueve conservan la exención y los conteos de ordinarias coinciden con las asistencias. Cero diferencias en los otros rubros de permanencia.
- 400 auditorías de asistencia enlazan archivo, hoja y fila; cinco auditorías de ocasión guardan fecha y tipo ordinario. Original y manifiesto aplicado verificados por contenido y SHA-256 en el bucket privado.
- Reconsulta del parcial: 400 existentes, cero altas, cero retenciones; cinco ocasiones reutilizadas. Reconsulta de solo lectura del manifiesto completo: 400 existentes y exactamente los diez registros reservados restantes. Sin cola pendiente, eventos fallidos ni avisos históricos de puntos.

Paquete y recibos privados en `~/Documents/OE-operacion/asambleas-20260914/`, en la máquina de Mateo y fuera del árbol de repositorios (hasta el 2026-09-19 estuvo en `LaOE/outputs/`). `COMPROBANTE_PRODUCCION.md` y `estado_produccion.json` registran el resultado posterior. El Excel, los CSV y las vistas previas originales se conservan como propuesta previa; `manifiesto_carga_parcial.json` contiene la selección aplicada. Antes de cargar las diez restantes, confirmar identidades/membresías y revisar otra vista previa del lote con los mismos IDs; no inferir autorización de que una membresía ya exista.

## Gestión de macroeventos · producción, 2026-09-14

[ADR-064](adr/ADR-064-gestion-de-macroeventos.md) implementada mediante [PR 28](https://github.com/Mateoloperaortiz/LaOE/pull/28). Candidato `9d0671f063715bcebbae5e406e189230e78ac91e` promovido por avance directo de `production` después de verificar el mismo SHA en staging.

- CI [PR 34909307870](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34909307870) y [main 34909839470](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34909839470): SUCCESS, 542 unitarias, 365 de integración y 176 casos E2E (174 escenarios, sin fallos de outbox). [Promoción 34910489916](https://github.com/Mateoloperaortiz/LaOE/actions/runs/34910489916): SUCCESS, reutilizando el resultado completo del mismo SHA de main.
- Railway staging `bf5bf5fe-1279-45f7-94e8-6a7b6d84ee5a` y producción `39ae0133-3a16-4868-ab6d-55e597ec2cac`: SUCCESS. Smoke público 6/6 en ambos, con la indexación y bucket propios de cada entorno.
- Migración `0028` aplicada: nuevo catálogo de Relaciones Públicas, Publicidad conservada para historia e índice `work_group_macroevent_term_unique` presente. El verificador de release exige ahora 94 índices.
- Relectura de producción: tres identidades de macroevento, once roles en catálogo histórico, cero ediciones y cero GT, igual que antes de la publicación. No se cargaron nombres, fechas ni nombramientos. La UI muestra Inventiva 6, EnFemenino 7 y Días EAFIT 9, con Agenda Académica y Seguridad/Carnival/The Games en las fichas correspondientes.
- Revisión de escritorio y móvil aprobada; los responsables y la edición del GT se guardan de manera atómica, cada acción vuelve a comprobar ADMIN, y la evaluación conserva el recálculo y la auditoría existentes.

Recibos privados en `/Users/mateo/.codex/private/casa-digital/macroeventos-20260914/`: resultados de CI, logs de comprobación y `production-verification.json`. Para comenzar a registrar mesas hace falta la edición con fecha real; los integrantes del GT pueden organizarse por semestre sin inventar una edición.


## Áreas de GT y GAP · producción, 2026-09-14

[PR 30](https://github.com/Mateoloperaortiz/LaOE/pull/30) integrado y publicado con SHA `275393a63339aee239ed908c567102afd31381f5`. La entrega agrega GT y GAP por macroevento y semestre, áreas múltiples en una sola pertenencia, acreditación explícita al registrar y participación visible en Persona 360, inicio de Mi OE y directorio. [ADR-065](adr/ADR-065-areas-y-participacion-gt-gap.md) registra las reglas.

Comprobaciones: `npm run check` completo, 542 unitarias, 369 de integración, 11 del extractor y build; E2E remoto con 176 casos únicos (174 escenarios). CI de PR `34918346187`, main `34918797352` y promoción `34919404964`: success. Revisión visual independiente en 1280 y 390 px: ship, sin correcciones materiales; documentación coherente con el sistema existente.

Railway staging `238d5bc7-c3d4-4e7b-88a7-db3a9a7bdd5f` y producción `1bc42571-965c-420c-a549-27fceca8fca9`: SUCCESS; smoke 6/6 en ambos. Consulta productiva de solo lectura confirma la columna `areas` no nula, índice `work_group_gap_macroevent_term_unique`, cero duplicados y 97 pertenencias previas con áreas vacías. Esta entrega no registra integrantes GT/GAP reales. Las pestañas y la vista GAP se comprobaron en producción.

Operación: desde Macroeventos, seleccioná evento y semestre, abrí GT o GAP y prepará el grupo si todavía no existe. Elegí la persona y al menos un área. La evaluación queda pendiente; usá «Registrar y acreditar cumplimiento» únicamente para trabajo ya verificado. La acreditación queda a nombre del ADMIN que la realiza. Editar áreas conserva el desempeño; reincorporar a alguien retirado vuelve a pendiente. Los evaluadores GH conservan su bandeja y permisos habituales.

Permanencia conserva GT 4/6/8 por macroeventos distintos acreditados para antiguos, GAP con máximo 5% y GAP OE separado. Varias áreas de un macroevento no multiplican el porcentaje. Los registros históricos sin áreas se completan mediante «Editar áreas», conservando su evaluación.

Evidencia privada local: `/Users/mateo/.codex/private/casa-digital/gt-gap-20260914/` (resultados CI, smoke, consulta productiva, revisión y recibo de publicación). El ajuste de la prueba de sanciones al día de Bogotá solo corrige el reloj de la prueba; no altera las reglas de sanciones.

## Activación de retos, boosters y colección (ADR-067)

Procedimiento por entorno para [ADR-067](adr/ADR-067-retos-boosters-y-coleccion.md). La entrega llega apagada: `gamification.enabled` en falso, así que nada cambia para los miembros hasta el último paso.

1. **Despliegue.** `db:release` aplica las migraciones `0030_gamificacion`, `0031_booster_pedido` y `0032_gamificacion_correcciones` (aditivas: enums, tablas de retos, boosters, insignias y corridas de conciliación, `point_entry.reward_id` y `reward.requested_personal_percent`) y verifica los `REQUIRED_INDEXES` nuevos (`achievement_person_badge_unique`, `achievement_featured_unique`, `booster_item_source_achievement_unique`, los únicos parciales de participación y el dedupe del outbox). La 0032 repara datos y reencola imágenes anteriores sin cambiar el esquema ni activar la bandera. La conciliación viaja por el outbox y el poller existente.
2. **Staging con datos sintéticos.** `npm run db:seed` siembra la bandera activa, un reto publicado por formato (trivia de tres preguntas, misión con evidencia y presencial sobre una ocasión sintética), una campaña +50 % y un Impulso para el miembro demo. En `/admin/gamificacion`: **Simular** la conciliación y revisar las cifras de la corrida terminada; luego **Aplicar** (exige step-up) y confirmar que la insignia histórica aparece en `/app/gh-points/coleccion` sin booster ni aviso. Recorrer los tres formatos como miembro y la bandeja `/admin/gamificacion/revision`. Revisar `/admin/sistema/jobs`: los `gamification.*` terminan procesados, sin dead letters.
3. **Producción.** Con la bandera apagada: conciliación (Simular → revisar muestra y conteos → Aplicar con step-up). GH deja sus borradores en `/admin/gamificacion/retos` — nada de retos inventados — y revisa `/admin/gamificacion/limites` (topes diario y semanal, premios por defecto, umbral de trivia). Cuando GH decida, activa «Retos activos para los miembros».
4. **Supervisión.** El panel muestra participantes únicos, entregas pendientes, premios reservados y entregados, uso de boosters y errores de procesamiento; la bandeja de revisión resuelve evidencias; las corridas de conciliación se siguen y se reanudan desde el mismo panel. El cierre del semestre (`/admin/cierre`) exige resolver participaciones pendientes y premios reservados antes de cerrar.
5. **Reversión.** Apagar la bandera en Límites oculta la experiencia y detiene nuevos desbloqueos automáticos de insignias y boosters. GH sigue pudiendo confirmar reservas existentes, rechazar entregas y anular premios mientras el término esté abierto; las correcciones de asistencias siguen liberando/revirtiendo sus premios. La conciliación histórica permanece disponible.
6. **Instalaciones con datos previos a 0032.** La migración libera posiciones de insignias revocadas y deja las evidencias READY anteriores en PENDING con un evento de reprocesamiento. Esperar a que `gamification.evidence-process` termine antes de revisar imágenes. Comprobar un acceso del autor y de ADMIN: la URL debe apuntar a `evidence/processed/`, nunca a la clave de subida. Si falla el bucket, reintentar el job desde Sistema; no marcar READY manualmente. Esta preparación no despliega ni activa producción: la promoción posterior requiere CI y comprobación en staging.

## Gamificación, directorio y podio · producción, 2026-09-15

[PR 34](https://github.com/Mateoloperaortiz/LaOE/pull/34) y [PR 35](https://github.com/Mateoloperaortiz/LaOE/pull/35) integrados en `main` y promovidos con SHA `e430dc181017fa8528a3528ac12e93e6b0389b81`. La entrega lleva retos, boosters y colección ([ADR-067](adr/ADR-067-retos-boosters-y-coleccion.md) y [ADR-068](adr/ADR-068-correcciones-de-gamificacion.md)), el directorio de comités de Mi OE ([ADR-069](adr/ADR-069-directorio-de-comites-de-mi-oe.md)) y el podio de comités ([ADR-070](adr/ADR-070-podio-de-comites-en-gh-points.md)).

Comprobaciones: CI completo de `main` `35028922963` y smoke de staging `35029880093`, ambos success sobre el SHA promovido; el healthcheck de staging servía ese mismo SHA antes de promover. La promoción reutilizó esa evidencia según ADR-054: CI `35047828457` en modo promoción con los jobs pesados omitidos, y smoke de producción `35047991825` contra `https://oeeafit.com` con `indexing=true`.

Railway staging `a586cbc4-452a-4d9d-9401-6fa5b046a12c` y producción `d0c7f388-eab8-490e-9eef-0f4ad83041da`: SUCCESS. `db:release` aplicó `0030_gamificacion`, `0031_booster_pedido` y `0032_gamificacion_correcciones` en ambos entornos y verificó 109 índices con `pg_trgm`. El healthcheck de producción responde el SHA promovido con Postgres en 1 ms; la portada pública responde 200.

Cierre del día: `720b58bbf477752c9b9e49d139444a3623f065d2` se promovió después para llevar el arreglo del ruido de npm a producción (CI de `main` `35049467929`, staging `aaab59fc-9722-4899-89b0-2c4716c4645c` con smoke `35049990884`, CI de promoción `35050046444`, producción `a614d596-be92-4b3c-aa41-e6d7eabfc46a` con smoke `35050223140`). El pre-deploy y el arranque de los dos entornos ya no registran `npm warn`; el healthcheck de `oeeafit.com` sirve ese SHA con Postgres en 2 ms y las rutas públicas y privadas responden como antes.

La entrega queda apagada: `gamification.enabled` sigue en falso y nada cambia para los miembros. La conciliación histórica, los borradores de GH y la activación siguen el procedimiento de «Activación de retos, boosters y colección (ADR-067)», más arriba. Esta promoción no ejecutó ninguno de esos pasos.

## GT que cumple GAP · producción, 2026-09-16

[PR 38](https://github.com/Mateoloperaortiz/LaOE/pull/38) integrado en `main` y promovido con SHA `d38ddc5d1a034b4da20f7d9bc1240a28d5b089ec`. La entrega implementa [ADR-071](adr/ADR-071-gt-de-macroevento-cumple-gap.md): una participación GT de macroevento acreditada cumple el criterio GAP además de sumar sus tramos de GT, también para los nuevos. La equivalencia es el parámetro `alsoCounts` del criterio.

Comprobaciones: CI del PR `35101246575` y CI completo de `main` `35102079082`, ambos success sobre el SHA promovido. Railway staging `5ffaebe9-423c-4340-9662-1e83ef92bb2b` SUCCESS y smoke de staging `35103245693` success, con el healthcheck de staging sirviendo el SHA antes de promover. La promoción reutilizó esa evidencia según ADR-054: CI `35110486372` en modo promoción con los jobs pesados omitidos, y smoke de producción `35110855542` contra `https://oeeafit.com`.

Railway producción `b18d3099-7bf7-45de-99c6-76a180ce0c92`: SUCCESS. `db:release` aplicó `0033_gt_cumple_gap` en ambos entornos y verificó 109 índices con `pg_trgm`. El healthcheck de producción responde el SHA promovido con Postgres en 2 ms, y la portada responde 200.

La migración sí encontró el criterio GAP del término abierto en los dos entornos y encoló su recálculo. Ese recálculo lo procesó el contenedor **anterior**, que sigue atendiendo mientras corre el pre-deploy del nuevo: en producción, `a614d596` a las 14:46:26 UTC (473 personas), y en staging, `aaab59fc` a las 13:38:27 UTC (45 personas). En los dos casos corrió el código previo, que ignora `alsoCounts`. El inicio de Mi OE, `/app/permanencia`, la pestaña Permanencia de la Persona 360 y los avisos diarios calculan en vivo, así que ya aplicaban la equivalencia. En cambio, Cumplimiento, Junta y Cierre leen snapshots y quedaron sin ella. Por eso los logs del contenedor nuevo no mostraban ningún recálculo: al revisar el efecto de una migración que encola jobs, hay que mirar también los logs del despliegue anterior.

Corrección aplicada el mismo día. Mateo abrió el criterio GAP de 2026-2 en Reglas, confirmó «GT de macroevento» marcado y «Código» vacío, y guardó sin cambios. Guardar una regla encola el recálculo del término, y a las 15:13:11 UTC lo procesó el despliegue nuevo `b18d3099`: 473 personas, primer intento y sin fallos, así que los snapshots de producción ya tienen la equivalencia. Staging se corrige con su recálculo diario.

La tabla general de producción no coincide con la de referencia. Según el admin, «Grupos de trabajo de macroeventos» y «GAP OE» aplican a «Todos», y no solo a veteranos; la tabla muestra «Veteranos 50 · Nuevos 59 · nominal 50», con la advertencia de desvío. Con esa tabla, un nuevo con un GT acreditado pasa de 4 a 9 puntos, no de 0 a 5. Queda que GH confirme si esos dos criterios deben aplicar a los nuevos; se ajusta en «Aplica a» de cada criterio.

En producción, `Failed to find Server Action` apareció tres veces en 17 segundos justo después del arranque, con el mismo identificador, y no volvió a salir: fue una pestaña cargada con la versión anterior invocando una acción del build reemplazado, y se resuelve al recargar la página. La promoción la bloqueó primero el clasificador de permisos de Claude Code y se ejecutó con la autorización explícita de Mateo.

## Editor de retos · producción, 2026-09-16

[PR 42](https://github.com/Mateoloperaortiz/LaOE/pull/42) integrado en `main` y promovido con SHA `8348ecc785765cc2a3cbb7c3c1076f87098177c0` el mismo día en que GH no pudo guardar su primer reto real. Corrige tres defectos del editor: la pregunta de trivia que viajaba oculta, las horas leídas en UTC y los retos publicados que no guardaban título ni descripción. Además, un error al crear ya no descarta lo escrito. El detalle está en el registro de avances del roadmap.

Comprobaciones: CI del PR `35130004852` y CI completo de `main` `35130858920`, ambos success. Railway staging `ec44845a-fced-4c10-8714-94a77544490f` SUCCESS y smoke de staging `35131949407` success, con el healthcheck de staging sirviendo el SHA antes de promover. La promoción reutilizó esa evidencia según ADR-054: CI `35132075163` en modo promoción, y smoke de producción `35132361086` contra `https://oeeafit.com`.

Railway producción `ee649fe9-63f0-41bb-a37a-55b64dff8728`: SUCCESS. No hubo migraciones: `db:release` verificó 109 índices con `pg_trgm`. Tras el arranque, el poller y el scheduler quedaron activos y el outbox se drenó sin fallos. El healthcheck responde el SHA promovido y la portada responde 200.

La promoción no tocó datos ni `gamification.enabled`. Los retos guardados antes de este despliegue conservan la ventana corrida cinco horas; si alguno se creó escribiendo la hora de Colombia más cinco, su instante guardado ya es el correcto. Una pestaña del editor abierta desde antes del despliegue invoca acciones del build anterior (`Failed to find Server Action`): hay que recargarla antes de guardar.

## Conteo de la jornada de activación · producción, 2026-09-16

[PR 43](https://github.com/Mateoloperaortiz/LaOE/pull/43) promovido con SHA `89405e23be74164058be7d33e8de49524b951bc1` en plena jornada de activación. Corrige el chip de cada comité, que contaba también las pertenencias cerradas y las de quien ya no puede entrar. El detalle está en el registro de avances del roadmap. El PR no se mezcló por sí mismo: la rama de docs del [PR 44](https://github.com/Mateoloperaortiz/LaOE/pull/44) se creó encima de su commit `2b05a60` en el mismo checkout, y al mezclar el 44 GitHub marcó también el 43 como mezclado. Por eso el candidato validado es `89405e2`, que además trae esos docs.

Comprobaciones: CI del PR `35132302564` y CI completo de `main` `35133354408` sobre `89405e2`, ambos success. Railway staging `22d01cd1-5b42-4ca8-ae73-8cccf97a195f` SUCCESS y smoke de staging `35134287699` success, con el healthcheck de staging sirviendo el SHA antes de promover. La promoción reutilizó esa evidencia según ADR-054: CI `35135017776` en modo promoción y smoke de producción `35135380181` contra `https://oeeafit.com`.

Railway producción `7f3a3cd2-7ee5-44b8-b950-1f37df60304e`: SUCCESS. No hubo migraciones: `db:release` verificó 109 índices con `pg_trgm`. Tras el arranque, el poller del outbox y el scheduler quedaron activos, y el outbox se drenó sin fallos. El healthcheck sirve el SHA promovido desde las 18:35:54 UTC.

Antes de promover se corrió una consulta de solo lectura en producción, con totales. En el término en curso, GEMIS tenía 27 pertenencias: 25 vigentes, de las cuales 24 con contraseña, y 2 de personas que salieron del comité sin contraseña. Con el arreglo, su chip pasa de 24/27 a 24/25. Los otros chips que cambian son CIGMA, de 16/39 a 15/37, y BIG, que deja de mostrar contador porque ninguna de sus tres pertenencias sigue vigente. La insignia «Sin contraseña» que queda en GEMIS es correcta: esa ficha no tiene credencial ni enlace emitido, y tampoco cambios de estado ni duplicados. Se resuelve emitiéndole el enlace desde la jornada.

La promoción y la consulta las bloqueó primero el clasificador de permisos de Claude Code y se ejecutaron con la autorización explícita de Mateo. Una pestaña de la jornada abierta desde antes del despliegue muestra el conteo viejo y puede fallar al emitir con `Failed to find Server Action`: hay que recargarla.

## Alcance de la autorización · producción, 2026-09-16

[PR 46](https://github.com/Mateoloperaortiz/LaOE/pull/46) promovido con SHA `40e049283cf836f072fd2d8bc07798f51773f526`. Aplica [ADR-072](adr/ADR-072-alcance-autorizado-en-el-dominio.md): editar, borrar y puntuar criterios de permanencia exige que el criterio sea de la tabla autorizada; decidir una inscripción exige que sea de la convocatoria operada; y `GET /api/admin/buscar` responde solo a ADMIN. El detalle está en el registro de avances del roadmap. La rama salió de `origin/main` en un worktree propio, porque el checkout principal lo usaba otra sesión.

Comprobaciones: CI del PR `35137551236` y CI completo de `main` `35150722967` sobre `40e0492`, ambos success. Railway staging `985e93fd-de8a-4e91-9894-b941f1f37dc8` SUCCESS y smoke de staging `35151569244` success, con el healthcheck de staging sirviendo el SHA antes de promover. La promoción reutilizó esa evidencia según ADR-054: CI `35152245778` en modo promoción y smoke de producción `35152448674` contra `https://oeeafit.com`.

Railway producción `c9213f96-07d3-43c5-86b0-9b339e303c32`: SUCCESS. No hubo migraciones: `db:release` verificó 109 índices con `pg_trgm`. Tras el arranque, el poller del outbox y el scheduler quedaron activos, y el outbox se drenó sin fallos. El healthcheck sirve el SHA promovido desde las 21:26:58 UTC, y `GET /api/admin/buscar` sin sesión sigue respondiendo 401.

La mezcla y la promoción se ejecutaron con la autorización explícita de Mateo. Sin datos tocados. Una pestaña del admin abierta desde antes del despliegue invoca acciones del build anterior (`Failed to find Server Action`): hay que recargarla. Queda opcional AL5, una consulta de solo lectura con totales para saber si alguien usó los huecos antes del arreglo. Con la auditoría anterior solo se puede saber en parte: las ediciones de criterios traen su tabla, los puntajes su regla y las decisiones su convocatoria, pero los borrados anteriores solo guardaban clave y peso, y las búsquedas y las vistas de páginas no se auditan.

**AL5, auditoría de solo lectura (2026-09-16).** Autorizada por Mateo, con totales y sin nombres. Túnel con la salida descartada, credenciales solo dentro de `railway run -s web` y sesión con `default_transaction_read_only`. El SQL se probó antes en la base local y con eventos sintéticos dentro de una transacción revertida, y dio los candidatos esperados. La autoridad de cada actor es aproximada: ADMIN y `COMMITTEE_LEADER` actuales o concedidos alguna vez, y cargos con `PERMANENCE` vivos en el instante, con la salvedad de que los rellenados por `0015` empiezan en `joined_at`. Resultados hasta el corte de las 21:26:58 UTC:

- **Inscripciones (`call.entry-decided`) y puntajes del líder (`leader-score.recorded`):** ninguno.
- **Ediciones de criterios (`permanence-rule.updated`):** 6, todas de ADMIN.
- **Borrados de criterios (`permanence-rule.deleted`):** 6 por alguien sin ADMIN, sin tabla auditada. Son de una sola persona con Permanencia en su comité, del mismo día, sobre las 3 claves de la plantilla de comité. Cada borrado quedó seguido de volver a cargar la plantilla o copiar en su propia tabla (3 cargas sobre 1 tabla), y ninguna clave borrada está en la tabla general. Es el patrón de borrar y recargar la plantilla en la tabla propia.

No hay evidencia de uso de los huecos. Queda sin respuesta si alguien usó el buscador o abrió un criterio ajeno por la URL, porque esos GET no se auditan.

## Comités inactivos · producción, 2026-09-17

[ADR-073](adr/ADR-073-un-comite-inactivo-sale-de-la-app.md) publicada con el SHA `8343855a92c9c9e2e9a6c779e79326d4e53ffb71` ([PR 50](https://github.com/Mateoloperaortiz/LaOE/pull/50)), mezclado y promovido con la autorización explícita de Mateo. CI del PR [35257866847](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35257866847), de `main` [35261755948](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35261755948) y de promoción [35264020000](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35264020000), los tres en verde. Staging `da01f37d-6456-4cc9-ac23-9b47ebe2c5dc` SUCCESS a las 19:15:59 UTC con smoke [35263858167](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35263858167); producción `2c57c021-035a-4a71-b476-997647e5de4b` SUCCESS a las 19:21:25 con smoke [35264402577](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35264402577). Sin migraciones. El healthcheck de `oeeafit.com` sirve el SHA desde las 19:21 UTC; el portal lista 18 comités y BIG, IUS y SOS siguen respondiendo 404.

Dos tropiezos de operación, con su salida:

- **Un E2E inestable en `main` deja el gate bloqueado aunque se relance.** El primer CI de `main` falló por `macroeventos.spec.ts` («element is not stable» al hacer clic, con el mismo árbol que ya había pasado en el PR). `gh run rerun <id> --failed` dejó la partición en verde, pero el job `CI` siguió fallando con «La partición 4 tiene casos unexpected»: `actions/upload-artifact@v4` no pisa el artefacto del intento anterior, así que la corrida tenía dos `ci-e2e-4` y el gate, que los baja con `merge-multiple`, leía el viejo. Se resolvió borrando el artefacto del intento fallido (`gh api -X DELETE .../actions/artifacts/<id>`) y relanzando solo el job del gate (`gh run rerun <id> --job <id>`).
- **Railway salta el despliegue de staging cuando el CI de `main` falla, y no vuelve a intentarlo.** El deployment quedó `SKIPPED` y el smoke correspondiente también, así que staging seguía en el SHA anterior. Con el CI ya en verde, `railway redeploy --service web --environment staging --project <id> --from-source --yes` crea un despliegue nuevo con el último commit de la rama. El smoke se dispara solo cuando el `deployment_status` llega en `success`: los eventos intermedios producen corridas `skipped`, que no son un fallo.

## Favicon del sitio · producción, 2026-09-17

Arreglo del favicon publicado con el SHA `e9763e0954943ded2281dace1205a02b325cfe9f` ([PR 49](https://github.com/Mateoloperaortiz/LaOE/pull/49)), mezclado y promovido con la autorización explícita de Mateo. CI de `main` [35256269738](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35256269738) a las 18:01 UTC, smoke de staging [35257382417](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35257382417) a las 18:12, CI de promoción [35257513321](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35257513321) a las 18:13 y smoke de producción [35257893604](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35257893604) a las 18:17, los cuatro en verde sobre ese SHA. Los despliegues fueron `a2fdce33-4fb2-4d50-9828-cace83120a5c` en staging y `789ecd2c-b8cd-4148-aee3-d571cd3f00e5` en producción; hoy figuran `REMOVED` porque los reemplazaron los despliegues posteriores del mismo día. Sin migraciones.

Comprobación pública del 2026-09-18 a las 00:01:07 UTC, ya con `33407ad` corriendo: la portada de `oeeafit.com` trae `<link rel="icon" href="/icon.svg" type="image/svg+xml"/>` junto al de iOS, `/icon.svg` responde 200 y `/favicon.ico` sigue en 404 a propósito, porque con un `rel="icon"` declarado los navegadores no lo piden.

Queda en el registro, por si reaparece: en Next 16 `accumulateMetadata` agrega los íconos por convención de archivo **solo** si la metadata no declara `icons` propios. Cualquier `icons.<algo>` nuevo en el layout raíz descarta `src/app/icon.svg` en todo el sitio, así que hay que declarar también `icons.icon`.

## Aviso diario del Wordle · producción, 2026-09-17

[ADR-074](adr/ADR-074-aviso-diario-del-wordle.md) publicada con el SHA `33407ad0ce0233eca3994106f7a10678a9718915` ([PR 52](https://github.com/Mateoloperaortiz/LaOE/pull/52)), mezclado y promovido con la autorización explícita de Mateo. CI del PR [35284081554](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35284081554) 10/10, CI de `main` [35284770369](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35284770369) y CI de promoción [35285604232](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35285604232), los tres en verde. Staging `2c0548dd-a0a7-49dd-ae3e-1b852e53d014` SUCCESS a las 23:09:10 UTC con smoke [35285506576](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35285506576); producción `02d49159-f577-4c14-bee2-cb2cc1a7623a` SUCCESS a las 23:12:58 con smoke [35285810391](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35285810391). El healthcheck de `oeeafit.com` sirve el SHA desde las 23:13 UTC.

Con migración: el pre-deploy registró «migraciones aplicadas y esquema verificado» con 109 índices a las 23:12:43 UTC (`0034_aviso_diario_del_wordle`: el valor `WORDLE` en `message_kind` y la columna `push_wordle`). El scheduler arrancó a las 23:12:56 con `wordle` entre sus entradas, en huso `America/Bogota`.

Dos cosas para la próxima:

- **El aviso todavía no se disparó.** El primer `0 9 * * *` real cae el 2026-09-18. Comprobarlo en `/admin/mensajes`: filas `PUSH` de tipo `WORDLE` con la clave `wordle:2026-09-18`, una por persona, y ninguna repetida.
- **Una promoción cerca de las 9:00 se puede comer el primer aviso.** Railway corre el pre-deploy mientras el contenedor anterior conserva su poller (ver el apartado de la carrera de contenedores): si el programado encola `participation.wordle-reminder` en esa ventana, lo toma el código viejo, que no tiene handler para ese tipo y lo descarta. Promover fuera de esa hora, o reencolar el aviso a mano.

## Biblioteca de iconos · producción, 2026-09-19

[ADR-076](adr/ADR-076-biblioteca-de-iconos.md) publicada con el SHA `ea15713f06cffe1b83b6b22e74773115e4fd13da`, promovido con la autorización explícita de Mateo. El SHA reúne ocho PR mezclados el 2026-09-18 ([PR 54](https://github.com/Mateoloperaortiz/LaOE/pull/54), [PR 57](https://github.com/Mateoloperaortiz/LaOE/pull/57) a [PR 63](https://github.com/Mateoloperaortiz/LaOE/pull/63)); solo el [PR 59](https://github.com/Mateoloperaortiz/LaOE/pull/59) cambia lo que ve una persona. CI de `main` [`35414928250`](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35414928250) y CI de promoción [`35415663285`](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35415663285) en verde, el segundo reutilizando la evidencia del primero en 31 s. Staging `608041c1-1c53-4e07-a99c-b9aef7d7ea82` SUCCESS con smoke [`35415320645`](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35415320645); producción `70e358ed-4096-4228-aaa6-fd522e225578` SUCCESS a las 02:28:51 UTC con smoke [`35415772158`](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35415772158). El healthcheck de `oeeafit.com` sirve el SHA desde las 02:28:56 UTC.

Sin migraciones: el pre-deploy registró «migraciones aplicadas y esquema verificado» con los mismos 114 índices. El scheduler arrancó a las 02:28:48 UTC con `wordle` entre sus entradas, en huso `America/Bogota`. Se promovió a las 21:28 de Bogotá, lejos de las 9:00 del aviso del Wordle (ver el apartado anterior).

Una cosa para la próxima: **cuando un E2E inestable deja el gate en rojo, el orden importa.** Borrar primero el artefacto `ci-e2e-N` del intento fallido (`gh api -X DELETE .../actions/artifacts/<id>`) y después `gh run rerun <id> --failed` deja una sola copia del artefacto, y el gate, que corre al final del relanzamiento, sale en verde sin relanzarlo aparte. Así se destrabó el primer intento del PR 62.

## The Games · preparación y operación (ADR-089 a ADR-091 y ADR-095 a ADR-101)

Ensayo sintético (desarrollo y staging, nunca producción):

- `npm run db:seed` siembra, sobre la edición «prueba» de Días EAFIT, la competencia `ensayo-the-games`. Es idempotente y se crea con los comandos del dominio, así que queda auditada:
  - 30 equipos y 15 bases por jornada, con la 5 y la 10 inflables.
  - Las dos jornadas generadas, con 15 rotaciones de 20 y 45 minutos.
  - La rúbrica de The Challenge, apuestas con 1000 puntos y una apuesta abierta, y un anuncio.
  - El personal: operador, `oe.demo` activo más bajo; jueces, los dos siguientes, en la base 1 de cada jornada.
  - Dos capitanes sintéticos por equipo, con los nombres publicados en la vitrina (ADR-095).
  - El reparto de poderes: 5 tarjetas por equipo, 2/3 en los impares y 3/2 en los pares, con las del jueves entregadas (ADR-098).
  - La competencia queda en vivo.
- Entra como `oe.demo.admin@eafit.edu.co` a `/admin/the-games`. Los códigos de equipo salen en el log del seed. Si se pierden, se vuelven a emitir en Equipos, y los anteriores dejan de valer.
- En local, la vitrina de DÍAS se prueba con `NEXT_PUBLIC_THE_GAMES_API=http://localhost:3000/api/v1/the-games/ npm run dev` en `dias` y `http://localhost:3100/the-games/?c=ensayo-the-games`. La casa necesita `PUBLIC_API_ORIGINS=http://localhost:3100,http://localhost:3101`, igual que staging.
- En staging se siembra con el mismo `npm run db:seed`, por el túnel al Postgres de staging descrito arriba (`railway run --no-local … -e staging` con `DATABASE_URL` del túnel y `NODE_ENV=development` solo en ese proceso local).

Ensayo en producción (ADR-089 regla 2; se opera igual que la competencia real y se archiva después):

- Se corre con el túnel al Postgres de producción y las variables de Railway, sin `.env` ni cambiar `NODE_ENV`: `railway run --no-local -p <project-id> -s web -e production -- env DATABASE_URL=<URL del túnel> npm run the-games:ensayo -- --admin <correo del ADMIN>`.
- Si falta, crea la edición 2026 de Días EAFIT en **borrador**, del lunes 28 de septiembre a las 8:00 al viernes 2 de octubre a las 20:00, en la Universidad EAFIT.
- Sobre esa edición crea `ensayo-2026`, igual al ensayo sintético pero sin personas inventadas: sin capitanes. El ADMIN que lo corre queda como juez de la base 1 del jueves. Queda en vivo solo para `dias.oeeafit.com/the-games/?c=ensayo-2026`: la portada de DÍAS no tiene el slug y sigue en «Por anunciar».
- Los códigos de equipo salen una sola vez en la salida del comando. Es idempotente: si `ensayo-2026` ya existe, no toca nada.
- Terminado el ensayo, se archiva desde Resumen. Las respuestas de formulario y los equipos reales van en la competencia `the-games-2026`.

Los ensayos que ya existían no reciben tarjetas con el seed, porque es idempotente: se les pega el reparto en Poderes.

Antes de promover:

1. `PUBLIC_API_ORIGINS` queda declarada en `.railway/railway.ts`: `https://dias.oeeafit.com` en producción; en staging, el sitio de DÍAS en local. Se carga **antes** de promover.
2. La migración `0040_the_games` es aditiva: solo crea tablas. `db:release` la aplica y verifica sus índices. La `0041_the_games_capitanes` también: crea `competition_team_captain` y la columna `show_captains`, apagada.
3. Smoke manual: `GET /api/v1/the-games/__smoke__` responde 404 en JSON con `Access-Control-Allow-Origin: https://dias.oeeafit.com`.
4. La migración `0042_the_games_poderes` es aditiva: crea las tablas de poderes y cuatro columnas que admiten nulos (el inicio de cada base y el resultado oficial). Antes de promoverla en pleno evento, confirmar en Resultados qué enfrentamientos ya tienen resultado: los que no tienen poderes no cambian.
5. La migración `0044_the_games_personal_gap` es aditiva: crea el enum y la tabla del apoyo de las bases (ADR-101). Se puede promover en pleno evento.

En producción, sin código:

1. Crear la edición de Días EAFIT 2026 en `/admin/eventos` y registrar la Dirección de The Games en su mesa (`/admin/macroeventos/dias-eafit`).
2. Crear el formulario público de inscripción en `/admin/formularios`: audiencia pública, consentimiento, acción `createPerson=false`, sin embudo ni edición, con un campo de clave `equipo`. En 2026 no hace falta: los capitanes salen de la hoja de inscripción de la OE (paso 7).
3. En `/admin/the-games`, ADMIN crea la competencia (`the-games-2026`, en borrador) y la de ensayo. En Resumen se liga el formulario, se fijan los 1000 puntos iniciales de apuestas y se encienden las apuestas cuando la OE lo pida.
4. Equipos (desde las inscripciones, o desde la hoja de rotaciones en el paso 6), bases por jornada (las de inflables, macro) y personal: los operadores de a uno, y los líderes y el apoyo de cada base desde la hoja del GAP (ver «Personal desde la hoja del GAP»).
5. Emitir los códigos e imprimir las tarjetas antes de salir de la pantalla: no se vuelven a mostrar. Cada tarjeta trae la dirección del hub de capitanes (`dias.oeeafit.com/capitanes`, ADR-096) y se entrega en mano a los capitanes del equipo.
6. Cargar el calendario de cada jornada con la duración que dé la OE. El validador debe decir que no hay errores.
   - Si la OE entrega su hoja de rotaciones, como la del jueves 2026-10-01, se importa (ADR-094). En Rotaciones, «Importar la jornada N desde la hoja»: en la hoja «Equipo-Rotacion-Base» se seleccionan las columnas A a D, se copian y se pegan. Si la competencia todavía no tiene equipos, los crea en el orden de la hoja. Si faltan las bases de esa jornada, las crea como «Base 1» a «Base 15»; después, en Bases, se les pone nombre y se marcan como macro las de inflables. Si la hoja tiene errores, no se guarda nada y la pantalla dice en qué línea están.
   - Si no, se genera con 15 rotaciones. Si la jornada 1 se importó, la 2 también se importa: el generador de la 2 supone su propia jornada 1.
7. Cargar los capitanes (ADR-095), solo ADMIN. De la hoja de inscripción de la OE se toman las filas de los capitanes y se arman **tres columnas, en este orden: Equipo, Nombre y Celular**. Nada más: la hoja trae cédula, datos de salud y contactos de emergencia, y la casa rechaza una fila con más columnas. «Equipo N» es el equipo N de la casa. En Equipos, «Cargar los capitanes desde la hoja» y pegar. Cada carga reemplaza a todos los capitanes. La Dirección revisa equipo por equipo en la columna Capitanes. Con la autorización de la inscripción confirmada, «Mostrar los nombres en la vitrina». El texto armado no se guarda en ningún repositorio y se borra después de cargarlo.

Durante el evento:

- El operador avanza las rotaciones desde Rotaciones; los jueces registran desde `/admin/the-games/<id>/juez`, que se actualiza sola. Lo que quede sin resultado al cerrar aparece en la mesa de control como pendiente.
- Desde ADR-106 la base empieza con la rotación: el líder no la empieza. Si recibe tarjetas, las registra y toca «Confirmar poderes»; si algún equipo registró un poder, lo confirma antes de ver el resultado. Cada resultado pide confirmar y queda bloqueado para el líder: si hay un error, llama a la operación, que lo corrige o lo anula en la mesa de control.
- Para saber a quién llamar, la pestaña Seguimiento (ADR-105) muestra qué bases ya registraron la rotación en curso, los resultados que se deben de rotaciones cerradas y quién se demora más en cada jornada, con el líder y el calificador de cada base. No trae celulares. El líder que todavía no registra ve en su pantalla cuántas bases ya lo hicieron, y si una rotación cerrada quedó sin su resultado, que se lo pase a la operación.
- Si un líder no registra nunca, revisar en Personal si sale «Sin contraseña»: sin ella no puede entrar, y todo lo de su base lo termina registrando la operación.
- Para abrir la vitrina se pasa la competencia a `LIVE` y se pone su slug en `edition.theGames.slug` de `dias`, que se vuelve a desplegar. Mientras tanto, `dias.oeeafit.com/the-games/?c=<slug>` abre cualquier competencia pública, como el ensayo.
- Si la casa se cae, la vitrina muestra lo último que recibió con la hora. Respaldo: la tabla de Posiciones y el libro de puntos.
- Si la carga pesa, se agrega una Cache Rule de Cloudflare para `/api/v1/*`. No hay límite por IP: el campus sale por NAT.
- Cada equipo ve su recorrido del día en `dias.oeeafit.com/the-games/` con «Buscá tu equipo», o directo con `?equipo=N` (ADR-097). Los capitanes también lo ven en el hub.
- Los capitanes apuestan en `dias.oeeafit.com/capitanes` con el código de la tarjeta (ADR-096), por la API `/api/v1/the-games/hub` de la casa: ven el saldo del equipo y las apuestas abiertas, y apuestan. Si un capitán no tiene celular, el operador registra la apuesta desde Apuestas con el mismo código. Si una tarjeta se pierde, «Volver a emitir todos» invalida las viejas y cierra las sesiones del hub: hay que imprimir y repartir las 30 otra vez.
- La primera vez que un equipo entra al hub, el capitán tiene que leer y aceptar las instrucciones (ADR-099). En Equipos se ve qué equipos las aceptaron y cuándo. Si se cambia el texto en DÍAS, se sube `HUB_TERMS_VERSION` en los dos repos y cada equipo vuelve a aceptar.
- Si un capitán objeta que su nombre salga en la vitrina, «Dejar de mostrarlos» la apaga para todos. Después se vuelve a cargar la hoja sin esa fila y se prende de nuevo.
- Para que los equipos compitan sin estar pendientes de las posiciones, la operación oculta la tabla en Posiciones con «Ocultar la tabla» (ADR-107). La vitrina deja de mandar las posiciones y `dias` muestra un aviso en la tabla y en el podio. La rotación, sus resultados, «Buscá tu equipo», las apuestas y el hub siguen igual. «Mostrar la tabla» la vuelve a publicar, y las pantallas la toman en unos 15 segundos. Para proyectar el podio hay que mostrarla antes: mientras está a la vista, también se ve en `dias.oeeafit.com/the-games/`.

The Challenge y Macro reto (ADR-100):

- **The Challenge (jueves en la mañana):** en Extras se crea «The Challenge» como **puntos directos**, jornada 1.
  - Cada jurado califica por aparte en la plantilla de jurado, o en la hoja «Consolidado» de la OE.
  - En la extra, «Calificación de los jurados»: se escribe el nombre del jurado, se pega su tabla desde el encabezado hasta el último equipo y se cargan las notas. Volver a cargar un jurado reemplaza solo sus notas; uno mal cargado se quita (ADR-103).
  - La casa ordena a los equipos con el promedio de los jurados y marca el podio sugerido y los empates. Las notas no dan puntos.
  - Con el podio decidido (los empates los resuelve la organización), en los puntos de la misma extra se fija 2000 al primero, 1000 al segundo y 500 al tercero. Los demás no suman.
- **Macro reto (dos veces al día, los dos días):** en Extras se crean cuatro de puntos directos: «Macro reto 1» y «Macro reto 2» en la jornada 1, y «Macro reto 3» y «Macro reto 4» en la jornada 2. Se pueden crear antes del evento, porque sin puntos no mueven la tabla. Al terminar cada uno, se fija 2000 al ganador en su extra. No son las bases macro (inflables), y los poderes no valen en ellos.
- **La rúbrica no se usa en `the-games-2026`.** Si existe una extra con rúbrica, no se le cargan notas: cada equipo sumaría hasta 1000.
- **Corregir:** si hay un error, se fija el total correcto. La casa inserta solo la diferencia.

Personal desde la hoja del GAP (ADR-101):

- **Dónde.** Solo en `the-games-2026`, nunca en `ensayo-2026`: los líderes quedarían como jueces del ensayo. El ensayo se prueba con miembros sintéticos.
- **Cargar.** ADMIN o la Dirección, en Personal, «Cargar el personal desde la hoja del GAP»:
  1. Elegir la jornada.
  2. En la hoja «GAP JUEVES» (o «GAP VIERNES»), seleccionar las columnas A a C, desde el encabezado hasta la última persona, copiar y pegar.
  3. Tocar «Revisar».
  - La base va en la fila del líder y vale para las de abajo.
  - El viernes vale la numeración de la hoja, del 16 al 30.
  - Se saltan el encabezado, las filas vacías y la de totales.
- **Corregir los errores.** Cada error dice su línea, y no se guarda nada hasta que no quede ninguno.
  - **Nombre que no aparece o que puede ser varias personas:** se reemplaza en lo pegado por el nombre como está en la casa (la pantalla sugiere hasta tres) o por el correo institucional, y se vuelve a revisar.
  - **Persona en licencia:** puede ser apoyo (calificador, veedor o VAR), pero no líder, porque el líder tiene que poder entrar a registrar (ADR-102). Si un líder está en licencia, GH lo reactiva o la OE pone otro líder.
  - **Persona que ya no es miembro:** se quita su fila.
- **Revisar.** Antes de guardar hay que mirar cuatro cosas:
  - los nombres parciales («hoja → casa»);
  - que cada base tenga su líder;
  - quiénes salen;
  - los avisos.

  Después, «Guardar el personal del jueves». Guardar reemplaza a los líderes y al apoyo de esa jornada. Los operadores y la otra jornada no cambian. Si algo cambió desde la revisión, la pantalla muestra la nueva y hay que guardar otra vez.
- **Activar a los líderes antes de las rotaciones.** Personal marca «Sin contraseña» a los líderes que todavía no pueden entrar. Esos pasan por la jornada de activación (`/admin/personas/activacion`, un QR por persona, en persona). Cada líder entra una vez y comprueba que `/admin` lo lleva a su pantalla, con su base y con quién está.
- **Cambios durante el evento.**
  - Se corrige la hoja y se vuelve a cargar la jornada, o se asigna un juez de a uno.
  - Quien sale de una base deja de registrar ahí, pero sus resultados y poderes quedan.
  - A alguien del apoyo lo quita cualquier operador con «Quitar».
- **El texto pegado** no se guarda en ningún lado. No se deja la hoja en un repositorio ni en una carpeta compartida.
- **Después del evento:** sumar al personal al GAP de Días EAFIT, con el área The Games (ADR-101, regla 10). La evaluación la hace GH.

Poderes (ADR-098):

- **Reparto.** Antes de la rotación 1 del jueves, en Poderes, se pega el reparto de los líderes en **tres columnas: Equipo, Poder y Jornada**. El poder va por su nombre («Multiplicador x2», «Cambio de resultados», «Cancelar poder», «1 min tarde», «Un jugador menos») y la jornada como «jueves» o «viernes». Es todo o nada. Cada equipo lleva 5 tarjetas, 2/3 o 3/2 entre las jornadas, y los tipos se pueden repetir.
- **Entrega.** Cuando los líderes entregan las tarjetas físicas, se marcan con «Entregar las del jueves», por equipo o para todos. Una tarjeta sin entregar no se puede usar, y el líder de base lo ve como «Sin tarjetas entregadas para hoy».
- **En la base.** El equipo le entrega la tarjeta al líder antes de empezar. El líder la registra en su pantalla («¿Recibiste la tarjeta?»), toca «Empezar la base» y al final registra el resultado. Cada botón de resultado muestra el oficial que va a quedar. Con «1 min tarde», la pantalla muestra la cuenta regresiva del rival.
- **Reglas:** están en el panel de Poderes y en ADR-098. Hay una tarjeta por equipo en cada base, y solo en bases normales. Las del jueves no pasan al viernes.
- **Correcciones:**
  - Un poder mal registrado antes de empezar lo quita el mismo líder.
  - Después de empezar, solo lo revierte un operador, con motivo, en Poderes. Si ya hay resultado, lo vuelve a calcular con reversiones en el libro.
  - Una tarjeta mal asignada se anula con motivo, si no se usó.
- **Si se cae el celular de un líder:** un operador se asigna como juez de esa base en Personal y sigue desde la pantalla de juez.
- **Si algo no cuadra:** se registra un ajuste en Extras (`ADJUSTMENT`, con motivo). Nunca se edita el libro.
- **Apuestas atadas a un enfrentamiento:** se resuelven con el resultado oficial, que es el que muestra la pantalla pública.

Después del evento: archivar `the-games-2026` (a más tardar el 2026-10-16) y `ensayo-2026` desde Resumen. Archivar borra los capitanes y apaga su vitrina (ADR-095).


## Cupo diario de las campañas (ADR-115)

Desde [ADR-115](adr/ADR-115-reglas-de-campanas-y-tareas-de-gh.md) reglas 5 y 6, una campaña que sale por Resend (hoy todas, porque sin `AWS_REGION` no hay SES) no pasa del cupo del día menos un margen para lo transaccional. Desde [ADR-116](adr/ADR-116-reglas-de-correccion-privacidad-y-permisos.md) reglas 19 y 20 se ve y se opera en el admin: **Campañas → Cupo de correo** (`/admin/campanas/cupo`, solo ADMIN).

- **Cuánto cabe.** `RESEND_DAILY_LIMIT` (95) menos el margen `campaigns.transactionalReserve`. Sin margen fijado es un tercio del cupo hacia arriba: 32, y caben 63 correos de campaña al día, menos los transaccionales que hayan salido ese día. El día es el de Colombia. Una campaña a 300 personas tarda cinco días o más. La pantalla muestra el cupo del día, lo enviado hoy, el margen y lo que cabe todavía.
- **Cómo se ve.** La campaña sigue `Enviando` y sus destinatarios en `Pendiente`, sin fallidos. Su pantalla dice cuántos faltan y, si esperan, por qué y hasta cuándo: el cupo de hoy ya no tiene lugar (siguen a la medianoche de Colombia), el margen cubre todo el cupo, o hay un corte del proveedor. No es una campaña trabada.
- **El corte por cuota.** Si Resend rechaza un correo de campaña por cuota, el web registra el aviso `campañas: el proveedor rechazó por cuota, lo pendiente espera a que termine el corte`, con `provider`, `error`, `reason` y `released`, y guarda el corte en `campaigns.quotaExhaustedAt`: el proveedor, la causa, la hora del lote y hasta cuándo dura. Mientras dure, ningún lote le pide nada al proveedor. Dura según la causa: `BURST` (un `rate_limit_exceeded` que no cedió con los cuatro intentos del adaptador), lo que haya pedido el proveedor o quince minutos; `DAILY` (`daily_quota_exceeded`), hasta la medianoche de Colombia; `MONTHLY` (`monthly_quota_exceeded`), hasta el primer día del mes siguiente de Colombia.
- **Consultarlo.** En Cupo de correo, el corte vigente sale con su causa, desde cuándo y hasta cuándo. En una sesión de solo lectura se ve lo mismo con `select key, value from app_config where key like 'campaigns.%';`. Un `value` que es una fecha sola es un corte anterior a ADR-116 y vale como `DAILY`; uno cuyo `until` ya pasó no detiene a nadie.
- **Levantar el corte.** Con el botón «Levantar el corte» de esa pantalla. Queda en `audit_log` (`config.updated`, con quién y su IP). Rige enseguida en el proceso que recibió la acción y a los 30 segundos, lo que dura la caché de configuración, en los demás. Tiene sentido cuando se sabe que el proveedor ya acepta: se subió el plan, o el cupo del mes cerró antes de lo que supone el corte (DT-184). Si vuelve a rechazar, el corte se escribe otra vez.
- **Cambiar el margen.** En la misma pantalla: un entero de cero en adelante, con auditoría. Un margen igual o mayor que el cupo no deja salir ninguna campaña, y la pantalla de cada campaña en curso lo dice.
- **Volver a una versión anterior a ADR-116.** Antes de desplegarla hay que borrar la fila si guarda un corte con causa: `delete from app_config where key = 'campaigns.quotaExhaustedAt';`. La versión anterior no sabe leer ese valor y su tick de campañas falla entero. Es la única escritura a mano que queda: va con la autorización explícita de Mateo y se anota acá, porque no pasa por `setConfig` y no deja auditoría.
