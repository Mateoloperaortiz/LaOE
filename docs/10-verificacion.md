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
- Participación (fase 3): `publicId` de 10 caracteres sin ambiguos que acepta los heredados; código rotativo determinista que cambia al minuto, acepta la ventana anterior, rechaza dos atrás y otro secreto, con comparación en tiempo constante; transiciones de ocasión y de check-in (`REJECTED → APPROVED` permitido, `CANCELLED` terminal); ventana por defecto desde el inicio; saldo, niveles por cortes y puestos 1, 2, 2, 4 con desempate por nombre o slug; tasa suavizada con los ejemplos de ADR-024 (μ = 40 %: 3 de 3 → 62,5 %, 1 de 3 → 37,5 %, 30 de 30 → 91 %, 12 de 30 → 40 %); requisito de asambleas por semestre y cumplimiento; código del término siguiente.
- Medios: tipos y tamaños permitidos, clave de subida, variante elegida para un ancho pedido, `srcset`, errores permanentes frente a transitorios. Fechas: `datetime-local` de Bogotá a UTC y vuelta. ICS: plegado a 75 octetos, escape y `UID` por edición.
- Roster (fase 2): parser CSV con BOM, comillas y `;` o `,`; cabeceras sin tildes ni mayúsculas; `COMITES` y `CARGO` "General de A3; Logística de PIXEL"; `ENTRADA A LA OE` como término o fecha; cada error y advertencia de 13-importacion con su texto de T-165 y T-483; sugerencia de sigla por similitud; diff por campo contra lo existente; fechas convencionales de un término faltante; celular normalizado.
- Personas y CRM (fase 2): partición del nombre completo de GHPOINTS; filtro de segmento a condiciones; token del carnet (firma, vencimiento, manipulación, comparación en tiempo constante); esquema del JSON de artículos de normativa.
- Cálculo de permanencia (fase 4): con las tablas de referencia de 2026-2 (general y A3), un nuevo, un veterano, uno en prueba y una transferencia reproducen las hojas de GH criterio por criterio, con el ejemplo de Pixel 75 % y Cigma 95 %; `params` válidos e inválidos por tipo de cálculo; integraciones sin las de solo nuevos; GAP OE por grupo con tope; barra brava compuesta; GT por cantidad; tasa de reuniones con `joinedAt` y `leftAt`; "lo que aún es posible" por tipo, con calendario, con esperadas y sin nada ocurrido; "en camino", "en riesgo" y "no alcanza" por margen; estado final y margen de prueba de 10 puntos; propuesta de cierre con salida del comité o de la OE según la regla de GH; expulsión por asamblea obligatoria; obligatorias de primer y segundo semestre; sumas de veteranos y nuevos frente al nominal; avisos por fecha (mitad, tres semanas, no alcanza, obligatoria, evaluaciones); CSV de correos de un grupo.

## Integration (con Postgres)

- Check-in único con **500 registros concurrentes** de personas distintas sobre la misma ocasión (el "listo cuando" de la fase 3): exactamente 500 check-ins y 500 entradas del ledger, un solo `score.recompute` pendiente, y la misma ráfaga repetida rechaza los 500 con T-095 sin cambiar nada; `drain` deja una fila de score por comité con elegibles igual a la función pura.
- Participación (fase 3): aprobación manual deja `PENDING` sin entrada y aprobar acredita una sola vez; anular revierte con `reversalOfId`; cancelar la ocasión revierte todos los créditos vivos en una transacción; ventana, solo nuevos, código rotativo inválido y término cerrado rechazan con el texto señalado; el check-in de anfitrión con carnet válido, vencido y manipulado; el líder solo opera ocasiones de su comité y abre solo las de 0 puntos; la serie semanal crea las reuniones hasta el fin del término e ignora las que ya existen; rankings por `firstTermId` solo con activos y puesto propio fuera del top; el cierre de puntos falla con ocasiones abiertas, estampa `pointsClosedAt`, escribe `term_standing` y bloquea los ajustes; `auto-close` cierra solo las vencidas y congela el denominador; `term-check` emite una sola vez y crea una sola tarea; los exportes personales exigen step-up.
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
- Migración en seco: sobre un esquema mínimo de GHPOINTS creado en la base de prueba (actividad procesada con asistencias aprobada, anulada con reversión, pendiente y rechazada; actividad con edición; actividad abierta de una temporada cerrada; asamblea confirmada y elección en borrador; `publicId` retirados; bono, penalización, reto relámpago, reversión huérfana y crédito repetido; requisito ajustado; hall of fame; scores congelados), el script es idempotente, mapea líderes a permiso más `GENERAL`, conserva `publicId`, enlaza reversiones, deja las sumas por persona y término iguales, escribe el standing del término cerrado con el JSON viejo bajo `stats.legacy` y encola el recompute del score; la segunda corrida no inserta nada ni advierte; `verify-migration` queda en cero con las advertencias esperadas.
- "Dar de alta" en una transacción: membresía, comités, `firstTermId`, interacción.
- "Dar de baja": motivo y consentimientos registrados; celular borrado sin consentimiento de contacto; formularios y tareas borrados; historia intacta; aparece en la galería solo con consentimiento `MEMORIAL`; la eliminación a pedido anonimiza y conserva comités y ledger anónimos.
- Permanencia (fase 4): una regla con clave repetida o `params` inválidos se rechaza; el líder no escribe otra tabla ni una bloqueada y ADMIN sí; copiar solo sobre una tabla vacía; la referencia es idempotente; N `checkin.approved` drenados dejan un solo recompute pendiente por persona y el snapshot igual a la función pura; cambiar una regla recalcula el término; un término con permanencia cerrada no recalcula y sus filas congeladas no cambian; la vista en vivo coincide con el snapshot; la siembra de comités de trabajo es idempotente y toma los líderes de los cargos; el evaluador solo evalúa dentro de la ventana y ADMIN siempre; insuficiente sin nota se rechaza; una evaluación buena de una tarea de nuevos marca el paso del onboarding; el puntaje del líder respeta el comité, las cotas y la observación; el crédito manual solo va en criterios manuales; el destacado del mes publica el anuncio del comité solo con consentimiento y es único por mes; el cierre exige puntos cerrados, propone por estado y por obligatoria, exige motivo al cambiar, confirma en bloque, y al aplicar (drenando) da de baja con motivo permanencia y `lastTermId`, escribe la prueba en el término siguiente creado, estampa `leftAt`, congela, deja de recalcular y una segunda corrida no hace nada; los indicadores de la junta salen de datos sembrados sin ids ni nombres.

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
- Participación (fase 3): la consola muestra el QR y el contador sube tras un check-in; `/app/gh-points` muestra saldo, nivel, movimientos y puesto; el admin cierra un término de pruebas con step-up y ve el standing; el líder entra al admin recortado, crea la serie semanal y `/admin/personas` lo devuelve a `/app`; `axe` en cada pantalla nueva.
- Permanencia (fase 4): un miembro ve la barra en `/app` y "0 de 5" integraciones en `/app/permanencia`, hace check-in en una integración `e2e-` sin puntos y ve "1 de 5" sin esperar al outbox; el director de GH (el ADMIN de pruebas como evaluador) marca buen desempeño en un GAP y el porcentaje del miembro cambia; ADMIN carga la tabla de referencia, ve las sumas frente al nominal y bloquea; crea un grupo `e2e-`, importa un CSV con el correo del miembro y lo ve listado; el líder asigna un puntaje con observación y el miembro la lee; GH confirma todas las propuestas del término de pruebas `2019-2` para una persona desechable, aplica con step-up y la 360 muestra la decisión y la baja; un miembro con `BOARD` temporal entra a `/admin/junta` sin ver correos y `/admin/personas` lo devuelve a `/app`; `axe` en cada pantalla nueva.

## Normativa

- `uv run --with pdfplumber scripts/normativa-extract.py estatutos <ruta del PDF firmado> > estatutos.json` genera el JSON revisable; antes de cargarlo se revisan a mano los artículos que cruzan páginas, las listas y los títulos de capítulo, y se compara la cantidad de artículos con el índice del PDF. El JSON no se commitea: se carga desde `/admin/documentos` junto con el PDF.

## Migración

- Correr `migrate-ghpoints` sobre una restauración local del dump (`GHPOINTS_DATABASE_URL`); `verify-migration` debe reportar cero diferencias en conteos y sumas.
- Muestreo manual de 20 personas y comprobación de todos los `publicId` en `/a/[publicId]` y de las asambleas en `/asamblea/[publicId]`.
- Fase 3: la prueba de integración sobre el esquema mínimo de GHPOINTS cubre asistencias aprobadas con puntos, anuladas con reversión, asambleas confirmadas, `publicId` retirados, requisitos ajustados y el hall of fame; la segunda corrida no cambia nada y las sumas por (persona, término) coinciden.

## Despliegue

- `staging` sigue `main` y recibe cada cambio; `production` solo avanza cuando la rama `production` se adelanta a mano, con el pre-deploy de migraciones en verde.
- Tras cada release: `/api/health`, poller del outbox visible en los logs, un OTP real recibido en un buzón `@eafit.edu.co`, una portada servida desde `/api/media/[id]` y un push recibido en un iPhone con la PWA instalada.
- Una vez al mes: descargar la copia cifrada de R2, descifrarla con la clave privada de `age`, restaurarla en local y abrir la app contra esa copia.

## Cierre de fase

Cada fase se cierra con: CI en verde, revisión manual en los tres anchos y dos temas, checklist del roadmap marcado y fila en el registro de avances.
