# ADR-077: El lanzador E2E suma su origen al CORS del bucket local

- Estado: Aceptada
- Fecha: 2026-09-18
- Relacionadas: ADR-022, ADR-052
- Enmienda: ADR-052 (regla 2)

## Contexto

[ADR-052](ADR-052-aislamiento-y-fallos-de-las-pruebas-e2e.md) le da a cada corrida E2E su base desechable, y `E2E_PORT` deja que varias sesiones corran la suite a la vez, cada una en su worktree y en su puerto (3011, 3012…). El bucket, en cambio, es el emulador local que comparten todas. La subida directa de [ADR-022](ADR-022-medios-prefirmados.md) sale del navegador hacia el bucket, y el bucket solo responde a los orígenes de su CORS. Ese CORS lo escribe `storage:init` con `APP_URL` más `MEDIA_CORS_ORIGINS`: en local, solo `http://localhost:3000`.

El 2026-09-18 quedó comprobado que en cualquier otro puerto el navegador no puede subir nada. `gamificacion.spec.ts` «evidencia: el miembro entrega texto e imagen y el admin la aprueba» falla con el aviso T-2430 «No pudimos subir la imagen. Probá de nuevo.»; el registro de avances la traía desde el 2026-09-16 como «fallo previo, con `next dev`», sin causa. No era del producto: en el 3000 la misma prueba pasa, y por eso pasa en CI. Tampoco era solo esa. Con el lanzador sin el arreglo, en el puerto 3014, las seis specs que adjuntan archivos dieron 5 fallos de 41, uno o dos por cada uno de los cuatro flujos de subida directa: la foto de Ajustes (`ajustes-ux.spec.ts:16`), la evidencia (`gamificacion.spec.ts:212`), la portada de 5 MB (`medios.spec.ts:15`) y el PDF y la imagen privada de normativa (`normativa.spec.ts:97` y `:167`). `roster.spec.ts` y `permanencia-admin.spec.ts` pasaron porque su archivo atraviesa la app.

[10-verificacion.md](../10-verificacion.md) pedía correr antes `MEDIA_CORS_ORIGINS=http://localhost:<puerto> npm run storage:init`. Tenía dos problemas. Era un paso manual que ninguna sesión recordaba. Y `PutBucketCors` reemplaza la configuración entera: la sesión que lo corría le quitaba el origen a las demás.

## Decisión

1. `npm run test:e2e` suma `http://localhost:<E2E_PORT>` al CORS del bucket antes de crear su base. Solo alcanza al bucket local: `createE2eEnvironment` ya rechazó cualquier otro endpoint.
2. **Aditivo.** Lee las reglas vigentes, las reescribe tal como estaban y agrega una regla con ese único origen. Garage responde con todos los orígenes de la regla que coincide, y por eso cada origen va en su regla, igual que en `storage:init`. Un bucket al que nadie le aplicó CORS responde 404 `NoSuchCORSConfiguration` y cuenta como sin reglas.
3. **Idempotente.** Si alguna regla ya admite el origen, o admite `*`, no escribe. Es el caso de CI, donde `storage:init` ya declaró el 3000.
4. **Serializado.** S3 no ofrece escritura condicional del CORS, así que dos lanzadores que leen a la vez se pisan: gana el último y el otro pierde su origen. Leer, sumar y escribir va bajo `pg_advisory_xact_lock(hashtext('bucket-cors:<bucket>'))` en la conexión administrativa que el lanzador ya abre contra la base `postgres` del PostgreSQL local, que las sesiones también comparten. Comprobado en rojo: sin el candado, la prueba de integración de ocho sumas simultáneas terminó con 4 orígenes de los 10 esperados.
5. El lanzador no retira su origen al terminar. Sería otra escritura sobre estado compartido para recortar una lista que solo crece con los puertos que se usan. `storage:init` sigue siendo declarativo: reemplaza la lista por la del entorno, que es lo que necesitan staging y producción, y en local la devuelve a su estado base.
6. Si el bucket no responde, el lanzador falla ahí, antes de crear la base, con el origen en el mensaje.

## Consecuencias

- Un worktree corre la suite en cualquier puerto sin preparar nada. La instrucción manual sale de 10-verificacion.
- `scripts/lib/bucket-cors.ts` reúne el cliente, la regla por origen, la lectura y la suma. `storage-init.ts` lo usa sin cambiar lo que aplica en Railway.
- Correr `storage:init` en local mientras otra sesión tiene la suite en otro puerto le quita el origen a esa corrida: sus subidas fallan hasta que vuelva a lanzar. Es un comando manual y poco frecuente; queda advertido en 10-verificacion.
- Una corrida filtrada a specs que no suben nada ahora también necesita a Garage arriba. `docker compose up -d` levanta los dos servicios.
- Pruebas: unitarias de la suma pura, e integración contra Garage y PostgreSQL en un bucket desechable, sin tocar `media`: bucket sin CORS, origen de otra sesión conservado, origen repetido sin reescritura y ocho lanzadores a la vez.
