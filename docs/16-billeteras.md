# Operación del carnet en billeteras

Procedimiento de fase 8 ([ADR-040](adr/ADR-040-carnet-en-billeteras-fase-8.md)). El estado y los cierres viven en el [roadmap](09-roadmap.md); este documento describe cómo operar y qué evidencia registrar. Las pruebas con fixtures verifican software y no acreditan que una cuenta real de Apple o Google esté habilitada. El despliegue sigue el [runbook general](15-runbook.md), sin modificar el estado histórico de fase 7.

## Configuración por entorno

Cada proveedor se habilita cuando está presente su grupo completo de credenciales. Valores vacíos equivalen a ausentes; un grupo parcial falla en el arranque. La configuración se cachea por proceso: después de actualizar variables, reiniciar/desplegar y comprobar el SHA/health del entorno exacto.

| Variable | Uso y comprobación |
| --- | --- |
| `APPLE_PASS_TYPE_ID` | Identificador que empieza por `pass.`; distinto entre staging y producción, con certificado emitido para ese identificador |
| `APPLE_TEAM_ID` | Diez caracteres mayúsculos/números del equipo de Apple; puede ser el mismo equipo en ambos entornos |
| `APPLE_PASS_CERT_BASE64` | Certificado de firma en PEM codificado en base64; comprobar Pass Type ID, equipo y vigencia antes de cargarlo |
| `APPLE_PASS_KEY_BASE64` | Clave privada RSA correspondiente al certificado; PEM en base64 |
| `APPLE_PASS_KEY_PASSPHRASE` | Solo si la clave Apple está cifrada; no dejarla sola al deshabilitar Apple |
| `GOOGLE_WALLET_ISSUER_ID` | Id numérico de emisor con la cuenta de servicio autorizada |
| `GOOGLE_WALLET_SA_EMAIL` | Correo de la cuenta de servicio de Google Cloud |
| `GOOGLE_WALLET_SA_KEY_BASE64` | Clave privada RSA de la cuenta de servicio en PEM/base64 |
| `GOOGLE_WALLET_CLASS_SUFFIX` | Namespace: `carnet-oe-staging` en staging, `carnet-oe` en producción. Puede existir sin las otras variables y no habilita Google; sin valor el default es `carnet-oe` |
| `APP_URL` | Origen público correcto del entorno, HTTPS para los dispositivos y el logo Google |
| `JOBS_ENABLED` / `APP_TIMEZONE` | `true` y `America/Bogota` para procesar los eventos y conciliar a las 00:05 locales; el proceso mantiene `TZ=UTC` |

Cargar las credenciales por el canal privado de operación; no imprimirlas, agregarlas a fixtures ni adjuntarlas a evidencia. `.railway/railway.ts` preserva los secretos opcionales y declara el sufijo por entorno. Antes de aplicar, revisar el plan sobre el entorno exacto y confirmar que no elimina referencias de pases, secretos, Postgres ni buckets. Sin cuentas reales, conservar los proveedores apagados.

Para deshabilitar Apple, quitar todo el grupo de Apple, incluida una contraseña que exista. Para deshabilitar Google, quitar sus tres credenciales; el sufijo puede conservarse. Retirar credenciales no revoca por sí mismo los QR ya emitidos. La gestión local permanece y las limpiezas de Google siguen pendientes hasta recuperar acceso al proveedor.

## Identificadores, recursos y renovación

Apple identifica el pase por Pass Type ID y serial (`personId`). Volver a agregar el mismo par permite reemplazarlo; separar los Pass Type ID evita que pruebas de staging sustituyan el pase de producción. Renovar el certificado del mismo identificador conservando su clave correspondiente es distinto de cambiar el identificador. Registrar responsable y vencimiento del certificado y renovar antes de que expire. El WWDR G4 público se versiona; los certificados de firma reales y sus claves no.

Google usa clase `<issuerId>.<suffix>` y objeto `<issuerId>.<suffix>.<personId>`. Una vez emitido un pase, no cambiar issuer o sufijo como una simple rotación de credenciales: el código rechaza que el nuevo id no coincida con la referencia registrada. Se necesita una migración explícita que conserve el acceso a objetos anteriores para poder limpiarlos. Rotar la clave de la misma cuenta autorizada no cambia esos ids.

`npm run wallet:assets` genera los PNG de Apple (ícono 29/58/87 y logo 50/100/150) y `public/wallet/google-logo.png` (1024 × 1024) desde el isotipo existente. El logo Google debe responder públicamente por HTTPS en `/wallet/google-logo.png`; el objeto lo omite en HTTP local. Estos recursos contienen marca, nunca datos de personas.

Los badges de agregar a Apple/Google se distribuyen por separado del generador de PNG. La procedencia registrada a continuación identifica el proveedor, idioma, archivo y límites de verificación. Al renovar un recurso, conservar su origen y condiciones de uso; un redibujo o una captura no sustituyen el badge del proveedor. Revisión visual en [07-marca.md](07-marca.md).

### Procedencia seleccionada para la entrega

- **Google:** variante español de España `es-ES`, con el texto «Añadir a Google Wallet» que coincide con T-1192. Archivo `add-to-wallet-svg/svg/esES_add_to_google_wallet_add-wallet-badge.svg` del [ZIP oficial](https://developers.google.com/static/wallet/download-assets/add-to-wallet-svg.zip), conservado sin modificaciones como `public/wallet/google-wallet-badge.svg`. Tamaño: 16 435 bytes; SHA-256: `ccf813397a0443cbc2a7e0601a3e98010bd74d25b4c90c386351443c87e01816`. La variante `es-419` se descartó porque su texto «Agregar a la Billetera de Google» no coincide con el nombre accesible inventariado. Conservar junto al recurso el registro de descarga y las condiciones del proveedor.
- **Apple:** español México `es-MX`, archivo de `@neostore/cinto@1.0.98` distribuido por The Wallet Crew, conservado sin modificaciones propias como `public/wallet/apple-wallet-badge.svg`. [Archivo versionado del distribuidor](https://cdn.jsdelivr.net/npm/@neostore/cinto@1.0.98/dist/apple/es-MX.svg); SHA-256: `f49a464ad965be2f5cbe2f7333ffa132e7714d4f8a050ce8c906ff5881ea476a`. El distribuidor optimizó el arte con SVGO. No se verificó igualdad de bytes con el ZIP de Apple ni se aceptó un acuerdo de descarga usando una titularidad no acreditada.

Al activar Apple, la persona titular de la cuenta debe validar el arte y sus condiciones de uso conforme a la [guía de Apple](https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/) y obtener el paquete original si corresponde. La evidencia geométrica y la copia sin modificaciones nuestras no sustituyen esa validación. El cierre de software puede registrar este recurso y su límite; la validación del titular permanece pendiente con la activación Apple.

## Activación y pruebas reales

1. Completar cuenta y habilitación del proveedor. Apple requiere decisión de pago/titular y certificado de firma válido; Google requiere emisor, Wallet API, cuenta de servicio y testers, además del acceso de publicación cuando se distribuya fuera del modo demo.
2. Publicar la política aplicable y revisar los avisos: T-1214 explica el envío de datos a Google; T-1215 explica almacenamiento/sincronización de Apple según la configuración de la persona. No prometer que guardar en Apple evita todo tratamiento posterior por Apple.
3. Validar primero staging con personas sintéticas y HTTPS. Comprobar badges, logo público, rutas con sesión y `no-store`, 404 del proveedor apagado y estado local coherente. Registrar la versión de la app usada; ninguna comprobación de staging cambia el roster real.
4. Iniciar la emisión desde los badges de `/app/carnet` con la sesión válida del propio miembro y guardar el pase con credenciales válidas en el dispositivo. Apple: navegador y PWA instalada en iPhone; Google: cuenta admitida por el emisor. La fecha de emisión local acredita preparación del pase, no que la persona lo haya guardado en Wallet.
5. Desde otro celular, abrir el modo anfitrión de una ocasión, escanear el pase, cotejar el nombre y registrar el check-in. El teléfono del miembro puede mostrar el pase guardado; el anfitrión requiere red para resolver `oe2` y verificar membresía.
6. Cambiar comité/nombre en staging y observar el refresco de Google; probar el cambio de término sin un evento nuevo del roster. Revocar el QR: el anterior debe fallar de inmediato; Google debe recibir uno nuevo en el mismo objeto y Apple debe volver a agregarse. Dar de baja debe dejar Google `EXPIRED`; probar anonimización con persona desechable y comprobar que el objeto ya no tenga QR, nombre personal, módulos ni enlaces previos.

La herramienta auxiliar es un diagnóstico local: `npm run wallet:check` verifica configuración, certificados y assets; `npm run wallet:check -- --fixtures` verifica los archivos y ejecuta suites unitarias de juguete sin heredar credenciales. Ambos modos funcionan sin red ni base de datos y no emiten pases para personas. No hay una opción de emisión por correo: emitir requiere la acción propia desde la UI y una sesión válida. Salida 0 significa que pasaron las comprobaciones locales solicitadas; salida 1 indica errores por corregir. Una corrida correcta no acredita guardado en dispositivos, integración/outbox ni escaneo por anfitrión.

Registrar por cada proveedor: fecha/hora, entorno, SHA, dispositivo/navegador, tipo de cuenta de prueba, guardado correcto, check-in, cambio de datos, revocación/reemisión y baja. Conservar únicamente resultados e ids operativos necesarios: claves, `.pkpass`, QR, token `oe2` y enlace JWT son privados. Las casillas de activación permanecen abiertas sin esa evidencia.

## Estados y diagnóstico

| Situación | Qué significa | Qué hacer |
| --- | --- | --- |
| No aparece un badge | Ese proveedor no está configurado | Comprobar el grupo de variables y reinicio; el sufijo Google solo no lo enciende |
| Emisión pendiente en 360 | Hay una reserva durable; aún no se confirmó emisión | Revisar error de ruta/outbox; reintentar la emisión propia. No marcar como instalado ni borrar la reserva |
| Google tarda o falla | La operación remota no terminó; hay timeout de 10 s por llamada | Usar el carnet de Mi OE y revisar `wallet.sync`; no repetir rotaciones como método de reintento |
| Aviso Apple persiste | El pase emitido representa otra generación, revisión o término | Volver a agregarlo cuando Apple esté habilitado; no borrar el aviso cambiando fechas locales |
| QR anterior revocado | `oe2` ya no representa la credencial vigente | Mostrar Mi OE o reemitir. `oe1` y las sesiones conservan sus reglas; esto no retira el pase de una cuenta Google |
| Google devuelve 404 al sincronizar | El objeto registrado no existe | Se marca revocado sin recrearlo desde un job. Reemisión requiere acción propia; 404 durante limpieza permite cerrar esa referencia |
| Baja/reactivación antes de drenar | La generación subió y el carnet anterior continúa inválido | Reemitir explícitamente. Un evento atrasado no debe rehabilitarlo; revisar la comparación de generaciones |
| Limpieza sin credenciales o con error | No se pudo confirmar supresión remota | Conservar fila/referencia y pendiente; restaurar credenciales autorizadas y reintentar |

El panel `/admin/sistema/jobs` muestra pendientes, intentos y dead letters. `wallet.sync` usa el backoff existente; restauradas las credenciales, reintentar los fallidos pertinentes desde el panel. La conciliación `wallet.reconcile` corre cada día a las 00:05 de Bogotá, pagina por id en lotes de 100 y encola las sincronizaciones: no exige otro evento cuando empieza el semestre. Cada pase Google vigente se vuelve a enviar por PUT con los datos actuales aunque sus snapshots de generación, revisión y término coincidan. Así se recuperan cambios de nombre/comités cuyo evento se perdió o no llegó a procesarse; filtrar solo por `isStalePass` perdería esa recuperación, porque esos snapshots no describen nombre ni comités. Un pase ya revocado no se recrea; una anonimización pendiente todavía puede requerir limpieza.

No borrar filas de `wallet_pass` o eventos fallidos para ocultar errores del proveedor. La referencia de Google se elimina después de limpiar el objeto o confirmar 404; hasta entonces permite completar la supresión. La revocación/baja local no espera a Google, porque usa un lock distinto del envío remoto.

## Estado de entrega de software · 2026-09-06

| Comprobación | Apple | Google |
| --- | --- | --- |
| Implementación y configuración independiente | Verificadas; apagado sin credenciales | Verificadas; apagado sin credenciales |
| Criptografía y transporte | ZIP, manifiesto y CMS con certificados de juguete | OAuth/RS256/REST simulado; ningún contacto real |
| Ciclo de vida | Reemisión, aviso persistente y QR revocado | Reserva durable, eventos, conciliación diaria y supresión reintentable |
| Activación real | Pendiente: titular/cuenta, credenciales, arte/licencia y dispositivo/PWA | Pendiente: emisor, publicación y dispositivo |

El cierre local pasó `npm run check` (233 pruebas unitarias, 220 de integración y build), `CI=true npm run test:e2e` (91/91) y ambos modos de `wallet:check`. El carnet y la 360 se revisaron en 375/768/1440 px y claro/oscuro, con nombres largos, foco visible y axe. Las pruebas conservan Apple de juguete y Google apagado; no acreditan aceptación en una billetera real. E2E usa servidor propio, sesión/OTP sintéticos, correo de consola, push apagado y servicios de datos/medios de loopback.

La revisión visual adicional con ambos proveedores configurados con credenciales sintéticas pasó 6/6 combinaciones (375/768/1440, claro/oscuro): badges proporcionados, foco de 2 px, cero violaciones axe y cero desbordamientos/recortes. Se realizó sin pulsar los enlaces de emisión y con cero peticiones a Wallet o a orígenes externos. El servidor temporal se retiró al finalizar.
