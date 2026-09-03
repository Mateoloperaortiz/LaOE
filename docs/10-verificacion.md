# Verificación

Cómo se prueba cada capa cuando exista código. Cada fase del [roadmap](09-roadmap.md) se considera lista solo si pasa lo que le corresponde aquí.

## Local

- OrbStack como runtime de contenedores: `docker compose up -d` levanta Postgres 18 en `127.0.0.1:5433` (el 5432 lo usa GHPOINTS) y Garage como bucket S3 en `127.0.0.1:3900`; `npm run storage:init` aplica el CORS del bucket con el mismo comando que se usa contra Railway. Mailer de consola.
- `npm run db:reset`: esquema desde cero con las migraciones SQL de Drizzle, verificación de índices parciales y extensiones, y datos sintéticos sin información real.
- `npm run check`: Biome, dependency-cruiser, knip, `tsc --noEmit`, unit, integración contra la base local y `next build`.
- `npm run test:e2e`: Playwright (Chromium) contra el dev server, con `axe` en cada pantalla; `OTP_FIXED_CODE` del `.env` como código. Las pruebas de integración corren contra `casa_digital_test` (la crea y migra `tests/integration/global-setup.ts`) para no chocar con el poller del dev server; las e2e usan la base de desarrollo.
- `npm run dev` y revisión en navegador a 360, 768 y 1280 px, claro y oscuro, navegación por teclado, `axe` sin violaciones serias o críticas, Lighthouse con PWA instalable.

## Unit (módulos puros, sin base)

- Invariantes del ledger: aprobado ⇔ una entrada viva; reversión; término cerrado.
- Ranking: empates (1, 2, 2, 4), orden visual, tableros derivados por `firstTermId`.
- Término actual por fecha y bordes a medianoche de Bogotá.
- Tope de 3 comités y mínimo de 1 para activos.
- Validación de formularios y de acciones declaradas.
- Mapeo de tipos legados de GHPOINTS.
- Backoff y dead letter del outbox; derivación del código rotativo.
- Medios: tipos y tamaños permitidos, clave de subida, variante elegida para un ancho pedido, `srcset`, errores permanentes frente a transitorios. Fechas: `datetime-local` de Bogotá a UTC y vuelta. ICS: plegado a 75 octetos, escape y `UID` por edición.
- Roster (fase 2): parser CSV con BOM, comillas y `;` o `,`; cabeceras sin tildes ni mayúsculas; `COMITES` y `CARGO` "General de A3; Logística de PIXEL"; `ENTRADA A LA OE` como término o fecha; cada error y advertencia de 13-importacion con su texto de T-165 y T-483; sugerencia de sigla por similitud; diff por campo contra lo existente; fechas convencionales de un término faltante; celular normalizado.
- Personas y CRM (fase 2): partición del nombre completo de GHPOINTS; filtro de segmento a condiciones; token del carnet (firma, vencimiento, manipulación, comparación en tiempo constante); esquema del JSON de artículos de normativa.
- Cálculo de permanencia: con las tablas de ejemplo de 2026-2 (general y A3), un nuevo, un veterano, uno en prueba y una transferencia reproducen las hojas de GH criterio por criterio, con el ejemplo de Pixel 75 % y Cigma 95 %; "no alcanza" cuando lo que queda posible no cubre el umbral; GT por cantidad; margen de prueba de 10 puntos; propuesta de cierre con salida del comité o de la OE según la regla de GH; expulsión por asamblea obligatoria; obligatorias de primer y segundo semestre.

## Integration (con Postgres)

- Check-in único con 200 registros concurrentes sobre la misma ocasión.
- Reversión idempotente y cancelación de ocasión con créditos vivos.
- Outbox drenado exactamente una vez con dos pollers compitiendo (y `after()` si se usa); `dedupeKey` colapsando recomputes.
- Correo transaccional: sale por Resend hasta el límite diario y por SES desde ahí o ante error de cuota; cada envío queda en `message` con su proveedor.
- Storage: subida con `POST` prefirmado y condiciones de tamaño contra Garage en local, `HEAD` y lectura por URL prefirmada; un archivo fuera de rango se rechaza.
- Medios: confirmar una subida registra el `MediaAsset` en `PENDING` y encola `media.process`; el handler genera las tres variantes WebP de un PNG creado con `sharp` y marca `READY`; un objeto que no es imagen queda `FAILED` sin reintento; la redirección elige la variante por ancho y respeta visibilidad y estado.
- Contenido y eventos: páginas, anuncios, eventos y ediciones se crean y editan con auditoría; identificadores repetidos y fin anterior al inicio fallan con el texto del inventario; solo lo publicado con audiencia pública sale en las lecturas del portal; el próximo encuentro es la edición pública más cercana en el futuro.
- OTP: rate limit por correo e IP, vencimiento, intentos, no enumeración.
- Step-up de admin y destrucción de sesiones al retirar o cambiar correo.
- Auditoría en la misma transacción: si falla la auditoría, no hay mutación.
- Formulario público: vincula por correo normalizado, registra consentimiento, no crea puntos.
- Importación del roster: el archivo de ejemplo de `13-importacion-del-roster.md` crea personas, pertenencias con cargo y consentimientos; subirlo dos veces no duplica; una fila con sigla inexistente o dos Generales en el mismo comité bloquea el lote con el error señalado; el modo actualización solo toca las columnas presentes; `Retirado` sobre un activo lo da de baja; un término faltante se crea con fechas convencionales; el mismo lote en XLSX da el mismo resultado.
- Personas: cambiar el estado o el correo revoca el acceso (una sesión creada antes deja de resolver un actor en la misma transacción) y el handler del outbox borra las sesiones y revoca los permisos, salvo el último ADMIN; un General por comité y término y el tope de 3 comités se rechazan con el texto señalado; un consentimiento vivo por propósito.
- Línea de tiempo: un `membership.changed` drenado con `drain()` produce exactamente una interacción aunque se procese dos veces; una nota solo la edita su autor; un segmento devuelve las personas esperadas y su export exige step-up.
- Datos propios: editar celular y correo personal audita y escribe la línea de tiempo; una foto subida por otra persona se rechaza; la solicitud de eliminación crea una sola tarea con vencimiento a 15 días hábiles; el JSON de mis datos incluye las notas.
- Normativa: confirmar un PDF subido a Garage crea el documento; reemplazar los artículos es atómico; la búsqueda en español encuentra "asamblea" aunque se escriba sin tildes; la redirección al PDF exige sesión y documento publicado.
- Migración en seco: sobre un esquema mínimo de GHPOINTS creado en la base de prueba, el script es idempotente y mapea líderes a permiso más `GENERAL`; `verify-migration` queda en cero.
- "Dar de alta" en una transacción: membresía, comités, `firstTermId`, interacción.
- "Dar de baja": motivo y consentimientos registrados; celular borrado sin consentimiento de contacto; formularios y tareas borrados; historia intacta; aparece en la galería solo con consentimiento `MEMORIAL`; la eliminación a pedido anonimiza y conserva comités y ledger anónimos.
- Recalculo de permanencia al aprobar un check-in, registrar una evaluación o cambiar una regla; snapshot congelado al cerrar el término.

## E2E (Playwright)

- Ingreso por OTP con código fijo de test y redirección a `next`.
- Admin kit: crear y editar un comité desde el panel lateral, exportar el CSV; la paleta ⌘K encuentra personas y comités; otorgar un permiso exige step-up y el export de permisos queda auditado.
- QR de check-in: sin sesión → ingreso → vuelve al QR → puntos acreditados y visibles en Mi OE.
- Admin publica una edición con portada subida directo al bucket por `POST` prefirmado (emulador con CORS) y la ve el visitante: la subida de 5 MB va del navegador a Garage, la prueba drena el outbox con `drain()` (en CI el poller está apagado), y `GET /api/media/[id]` responde 302 hacia el bucket.
- Portal público: cada ruta pública pasa `axe`; un ADMIN edita y publica La OE y publica y fija un anuncio, y el visitante los ve en `/`, `/la-oe` y `/cartelera`; `og:image`, `canonical` y `robots` están en el HTML; `/opengraph-image` y el de una edición devuelven PNG; `/sitemap.xml` lista lo publicado y `/robots.txt` prohíbe todo mientras `PUBLIC_INDEXING` sea `false`.
- Personas y roster (fase 2): la paleta ⌘K encuentra a una persona sintética y abre su Persona 360; un cambio de estado con motivo aparece en Membresía; una nota y una tarea desde la 360; un segmento creado y exportado con step-up; el asistente sube el CSV sintético, muestra la vista previa, confirma con step-up y la persona nueva aparece en `/admin/personas`; el miembro importado entra por OTP con el código fijo y ve sus comités en `/app`.
- Mi OE (fase 2), con una segunda identidad sintética sin permisos: directorio sin correos en el HTML, ficha propia, editar celular, autorizar la foto, descargar el JSON de mis datos, galería de egresados, normativa (buscar y abrir un artículo; el enlace al PDF responde 302 al bucket), carnet con un QR cuyo token acepta `verifyCarnet`; `/admin` la redirige a `/app`; `axe` en cada pantalla.
- Kanban de admisión hasta "Dar de alta" y primer ingreso del nuevo miembro.
- Una licencia pedida desde Mi OE aparece como tarea, GH la aprueba y la membresía cambia con auditoría; una convocatoria interna inscribe a la persona en el grupo y su permanencia lo refleja.
- Campaña enviada al mailer de consola respetando preferencias y baja.
- Modo anfitrión: el líder marca a una persona sin sesión.
- Un miembro ve subir su porcentaje de permanencia tras un check-in de integración; el líder evalúa un GAP y el porcentaje cambia; GH cierra el término y la decisión aparece en la persona.

## Normativa

- `uv run --with pdfplumber scripts/normativa-extract.py estatutos <ruta del PDF firmado> > estatutos.json` genera el JSON revisable; antes de cargarlo se revisan a mano los artículos que cruzan páginas, las listas y los títulos de capítulo, y se compara la cantidad de artículos con el índice del PDF. El JSON no se commitea: se carga desde `/admin/documentos` junto con el PDF.

## Migración

- Correr `migrate-ghpoints` sobre una restauración local del dump (`GHPOINTS_DATABASE_URL`); `verify-migration` debe reportar cero diferencias en conteos y sumas.
- Muestreo manual de 20 personas y comprobación de todos los `publicId` en `/a/[publicId]`.

## Despliegue

- `staging` sigue `main` y recibe cada cambio; `production` solo avanza cuando la rama `production` se adelanta a mano, con el pre-deploy de migraciones en verde.
- Tras cada release: `/api/health`, poller del outbox visible en los logs, un OTP real recibido en un buzón `@eafit.edu.co`, una portada servida desde `/api/media/[id]` y un push recibido en un iPhone con la PWA instalada.
- Una vez al mes: descargar la copia cifrada de R2, descifrarla con la clave privada de `age`, restaurarla en local y abrir la app contra esa copia.

## Cierre de fase

Cada fase se cierra con: CI en verde, revisión manual en los tres anchos y dos temas, checklist del roadmap marcado y fila en el registro de avances.
