# Runbook de lanzamiento y operación

Regla vigente: [ADR-039](adr/ADR-039-arranque-limpio-fase-7.md). Preparado el 2026-09-06. **Los pasos operativos se consideran pendientes** hasta que una fila de evidencia registre su ejecución. Este documento no acredita que Railway, dominio, correo, push o respaldos estén configurados.

## Entornos, variables y promoción

Raíz del repo: `/Users/mateo/Documents/GitHub/LaOE/casa-digital`. Repo anterior: `/Users/mateo/Documents/GitHub/GHPOINTS`.

Proyecto nuevo `casa-digital`, región `us-east4-eqdc4a`. Solo `staging` y `production`; `web` y `Postgres` con una réplica y límites de 1 vCPU/1 GB. Dominio personalizado omitido del IaC hasta T6. `db:release` aplica migraciones y verifica esquema; nunca usar seed o migradores GHPOINTS en producción.

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
| `VAPID_SUBJECT` | Correo real de contacto | Correo real de contacto |
| `backup` | No existe | Cron mensual, referencias DB/bucket y secretos R2/age |

Antes de crear recursos, comprobar tope duro US$20 y alerta US$15. No aumentar automáticamente. Usar `.railway/railway.ts`, revisar `railway config plan` y aplicar solo el proyecto/entorno confirmado. Aprovisionar secretos y referencias en el orden que permita un primer arranque válido; `preserve()` conserva valores, no los inventa.

Cada tramo de código cierra con `npm run check`, `npm run test:e2e` cuando corresponda, commit convencional y push. No ejecutar check/build con `next dev` usando el mismo `.next`. Promoción: verificar CI y staging antes de `git -c 'credential.helper=!gh auth git-credential' push origin main:production`. Registrar SHA promovido y SHA del healthcheck. La promoción no se ejecuta dentro de la ventana del dominio.

## T2 y T3: staging y claves

1. Confirmar acceso de Railway al repo privado, presupuesto y proyecto/entorno de destino. Aplicar el IaC de staging y generar su dominio de Railway; completar `APP_URL`.
2. Configurar secretos de staging y claves VAPID propias. `OTP_FIXED_CODE` debe estar ausente en el servicio; se lee el OTP real de consola en los logs para la cuenta sintética.
3. Aplicar CORS con `railway run --no-local -p <project-id> -s web -e staging -- node --import tsx scripts/storage-init.ts`. No agregar `--env-file`; evitar que `.env` local sobreescriba el entorno remoto.
4. Abrir túnel al Postgres correcto y sembrar únicamente staging con datos sintéticos. `railway run --no-local -p <project-id> -s web -e <entorno>` ejecuta un proceso **local** con variables remotas; las direcciones privadas no son accesibles desde la estación. Reemplazar `DATABASE_URL` por la URL local que imprime el túnel. `NODE_ENV=development` solo se usa en el proceso local del seed sintético, nunca para bootstrap ni para la app desplegada.
5. Verificar `npm run smoke -- --base <URL staging> --expected-sha <SHA> --indexing false --bucket-origin <origen del bucket staging>`, OTP, admin, server actions y portada subida desde el navegador. Confirmar que la redirección prefirmada use el host virtual del bucket y que CORS/CSP no la bloqueen.
6. Activar y verificar respaldos diario/semanal/mensual y PITR. Registrar comandos reales y recurso exacto; no asumir que una configuración de otro Postgres se heredó.
7. Crear clave Resend nueva para el dominio ya verificado, claves VAPID de producción, bucket R2 privado `oe-respaldos` y credenciales restringidas a ese bucket. Estado al 2026-09-06: sesión Cloudflare accedida en Chrome; R2 exige completar el formulario de facturación. Mateo debe ingresar método de pago y datos en pantalla para habilitarlo. El bucket todavía no existe. Guardar la privada age solo con Mateo (1Password); publicar únicamente el destinatario público.
8. Crear rama `production` desde el candidato validado y protegerla como `main`. SES queda fuera; `AWS_REGION` ausente. Resend usa máximo cuatro llamadas, esperas de 1/2/4 segundos y respeta Retry-After dentro de un presupuesto total de espera de 30 segundos. Si Retry-After no cabe, falla sin adelantar el reintento; cuotas diaria y mensual no se reintentan.

Túnel de referencia: `railway connect Postgres --tunnel-only -P 6544` después de enlazar y verificar explícitamente el project-id y entorno deseados; no confiar en el último enlace local. Registrar la URL utilizable sin contraseña. Si el cliente rechaza TLS del túnel, resolver y documentar la configuración comprobada; no copiar una URL de otro entorno ni imprimir secretos en el registro.

## T4: producción limpia y primer acceso

1. Aplicar IaC para production: web, Postgres, bucket y backup. Confirmar rama candidata y variables finales. Inspeccionar que no se ejecutó seed y que `person` está vacía.
2. Generar dominio temporal de Railway para comprobar health y smoke; no agregar aún oeeafit.com al IaC. Aplicar `storage:init` para `APP_URL=https://oeeafit.com` y verificar PITR/respaldos del Postgres nuevo.
3. Mateo proporciona fuera del repo un JSON privado con esta estructura; los textos entre corchetes son campos a completar, no datos válidos:

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

4. Por túnel al Postgres de production, ejecutar `node --import tsx scripts/bootstrap-admin.ts --input <ruta privada>` dentro de `railway run --no-local -p <project-id> -s web -e production -- env DATABASE_URL=<URL del túnel> …`, con sus variables remotas y `DATABASE_URL` apuntando al túnel. No cargar `.env` local, no alterar `NODE_ENV`, no poner datos personales en comandos del repo. El bootstrap crea término de ingreso si falta, persona, membresía ACTIVE y ADMIN en una transacción auditada; no crea comités, consentimiento, bienvenida ni importación. Repetir el mismo ADMIN no modifica nada; otro ADMIN existente bloquea una nueva concesión.
5. Entrar mediante OTP real de Resend y comprobar acceso al admin; confirmar cero consentimientos del bootstrap. Política pendiente debe permitir acceso y check-in, y bloquear nuevas autorizaciones y los flujos que las crean. Mantener las revocaciones disponibles.
6. Ejecutar backup manual y comprobar restauración DB+medios desde R2 (sección siguiente). Retirar el dominio temporal antes de T6; registrar el identificador y comprobar que producción queda sin dominio público. Configurar el término actual y su calendario desde el admin con datos reales, no inferidos del término de ingreso.

La política y el roster se cargan desde la app: publicar primero `/privacidad`, establecer una versión válida al final y entonces importar el roster real. La versión es el interruptor técnico de habilitación; no se crea un consentimiento con `pendiente` ni se cambian versiones históricas. Los demás permisos se conceden mediante el admin y su step-up normal.

## Backup y restauración

Servicio `backup` solo en producción, imagen `docker/backup/Dockerfile` con PostgreSQL 18, Bash, age, rclone y zstd. Cron UTC `0 8 1 * *` (03:00 de Bogotá del día 1). Variables: referencias `DATABASE_URL` y `S3_*`, más `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `AGE_RECIPIENT`, `TZ=UTC`. La privada age nunca se carga en Railway.

Corrida manual desde el despliegue existente:

```sh
railway redeploy -p <project-id> -e production -s backup --yes --json
```

Un lock asesor PostgreSQL `(7043, 39)` excluye corridas solapadas de cron, manuales y despliegues durante toda la copia. Si otra copia mantiene el lock, la nueva corrida falla sin esperar indefinidamente ni tocar copias completas o `backup.lastRunAt`; se libera al terminar o fallar.

No usar `--from-source` ni argumentos alternativos. Esperar terminación exitosa y revisar logs del deployment exacto. La copia final `casa-digital/YYYYMMDDTHHMMSSZ-<16hex>.tar.zst.age` incluye `database.dump`, `media/` y `manifest.json`. `backupRevision` en el manifiesto es el SHA de la imagen de backup (o `unknown`), no el SHA del web. Se sube como `.uploading`, se descarga para comparar SHA256 y solo entonces se publica el nombre final. Secuencia: dump/copia → compresión/cifrado → subida y comprobación remota → retención → escritura de `backup.lastRunAt`. Un fallo antes de la comprobación no elimina copias ni actualiza la marca.

Retención: **12 copias completas totales**, incluidas las manuales y las mensuales, bajo `casa-digital/`. No se interpreta como 12 meses ni como 12 por tipo. El archivo GHPOINTS se guarda en `ghpoints/`, fuera de esta poda.

Restauración obligatoria antes del lanzamiento y después cada mes:

1. Descargar una copia real de R2 y usar `set -o pipefail` con `age -d -i <privada> <archivo> | zstd -d | tar -C <directorio privado> -xf -` para detectar fallos del descifrado o la extracción.
2. Leer el manifiesto y comprobar dump/objetos incluidos. Restaurar `database.dump` en una base PostgreSQL 18 local nueva con `pg_restore --no-owner --no-acl --exit-on-error`; nunca sobrescribir la base desplegada para probar.
3. Restaurar `media/` en un bucket local o de prueba y configurar la app contra ambos recursos restaurados. `MAILER=console`, claves VAPID ausentes y `JOBS_ENABLED=false` durante esta inspección.
4. Verificar conteos, abrir la app y recuperar al menos un objeto cuando la copia contenga medios. Antes del lanzamiento debe demostrarse también recuperación de un objeto sintético en la prueba completa de backup de T1/T5; una copia vacía de producción no reemplaza esa prueba. No cargar medios de prueba a producción para satisfacerla.
5. Registrar copia, checksum/manifiesto, fecha, resultado de descifrado y recuperación. No registrar la privada age ni datos personales.

## T5 y T6: ensayo y dominio

En **staging**, con el mismo candidato de producción y solo datos sintéticos: smoke, check-in, subida de medios, OTP de consola, controles de política, PWA instalada y push real en iPhone. Dejar correr una noche de jobs que incluya cierre horario y tareas de permanencia; comprobar logs, outbox y mensajes. No existe entorno `ensayo` ni importación de GHPOINTS.

Smoke exige HTTPS, salvo loopback para pruebas. En el dominio temporal de producción, agregar `--canonical-base https://oeeafit.com` a `npm run smoke -- --base <URL> --expected-sha <SHA> --indexing <true|false> --bucket-origin <origen del bucket>`; `--indexing true` corresponde a producción.

La ventana del dominio empieza con código desplegado, health/backup comprobados e inputs/credenciales listos. No se construye ni despliega código dentro de ella:

1. Crear y verificar un respaldo completo de GHPOINTS antes de mover el dominio, con dump, objetos y manifiesto cifrados. Registrar proyecto y evidencia recuperable; no migrarlo.
2. Retirar oeeafit.com del servicio GHPOINTS y agregarlo al web de production en puerto 8080, con proyecto/servicio/entorno explícitos.
3. En Cloudflare cambiar destino del CNAME y TXT de verificación que requiera Railway. Conservar proxy activo, SSL Full, DNSSEC, NS/DS y regla www. No limpiar otras integraciones todavía.
4. Esperar dominio verificado y certificado operativo; purgar caché. Correr `npm run smoke -- --base https://oeeafit.com --expected-sha <SHA> --indexing true --bucket-origin <origen del bucket production>`, comprobar www → apex, OTP, admin, cabeceras y medios. PWA/push se comprueban desde el origen final. Si falla antes de retirar GHPOINTS, corregir el destino con los valores anotados; no prometer una reversión de datos.
5. Tras verificar, reconciliar el dominio en `.railway/railway.ts` y comprobar `railway config plan` sin diferencias inesperadas. Commit/push y promoción del cambio declarativo se ejecutan **después** de la ventana.

## T7: archivo y retiro de GHPOINTS

No hay espera de 48 horas. Ejecutar solo después de verificar producción y con el proyecto GHPOINTS identificado explícitamente:

1. Abrir túnel al Postgres viejo, generar dump final completo y listar/copiar los objetos existentes, incluidos los que no tengan fila asociada y deban conservarse. No importar ese dump ni esos objetos a casa-digital.
2. Cifrar dump, objetos y manifiesto con age. Guardar en `oe-respaldos/ghpoints/` y una copia privada con Mateo. Descargar/descifrar el archivo y comprobar restauración local antes de borrar nada.
3. Registrar fecha de creación y fecha de vencimiento calculada a **90 días de esa ejecución**. No fijar una fecha de diciembre antes de conocer el día real del retiro.
4. Eliminar el proyecto viejo desde el panel después de verificar identidad y copia recuperable. El borrado incluye Postgres, PITR y buckets del proyecto; anotar resultado real.
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
| — | T2–T8 restantes | — | Pendiente de ejecución | Servicios, dominios, respaldo, OTP y push todavía no acreditados |
