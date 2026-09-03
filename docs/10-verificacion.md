# Verificación

Cómo se prueba cada capa cuando exista código. Cada fase del [roadmap](09-roadmap.md) se considera lista solo si pasa lo que le corresponde aquí.

## Local

- PostgreSQL en Docker (`docker compose up -d`), emulador S3 local para el bucket y mailer de consola.
- `npm run db:reset && npm run db:seed`: esquema desde cero, uniques parciales y datos sintéticos sin información real.
- `npm run dev` y revisión en navegador a 360, 768 y 1280 px, claro y oscuro, navegación por teclado, `axe` sin violaciones serias o críticas, Lighthouse con PWA instalable.

## Unit (módulos puros, sin base)

- Invariantes del ledger: aprobado ⇔ una entrada viva; reversión; término cerrado.
- Ranking: empates (1, 2, 2, 4), orden visual, tableros derivados por `firstTermId`.
- Término actual por fecha y bordes a medianoche de Bogotá.
- Tope de 3 comités y mínimo de 1 para activos.
- Validación de formularios y de acciones declaradas.
- Mapeo de tipos legados de GHPOINTS.
- Backoff y dead letter del outbox; derivación del código rotativo.
- Cálculo de permanencia: con las tablas de ejemplo de 2026-2 (general y A3), un nuevo, un veterano, uno en prueba y una transferencia reproducen las hojas de GH criterio por criterio, con el ejemplo de Pixel 75 % y Cigma 95 %; "no alcanza" cuando lo que queda posible no cubre el umbral; GT por cantidad; margen de prueba de 10 puntos; propuesta de cierre con salida del comité o de la OE según la regla de GH; expulsión por asamblea obligatoria; obligatorias de primer y segundo semestre.

## Integration (con Postgres)

- Check-in único con 200 registros concurrentes sobre la misma ocasión.
- Reversión idempotente y cancelación de ocasión con créditos vivos.
- Outbox drenado exactamente una vez con dos pollers compitiendo (y `after()` si se usa); `dedupeKey` colapsando recomputes.
- OTP: rate limit por correo e IP, vencimiento, intentos, no enumeración.
- Step-up de admin y destrucción de sesiones al retirar o cambiar correo.
- Auditoría en la misma transacción: si falla la auditoría, no hay mutación.
- Formulario público: vincula por correo normalizado, registra consentimiento, no crea puntos.
- Importación del roster: el archivo de ejemplo de `13-importacion-del-roster.md` crea personas, pertenencias con cargo y consentimientos; subirlo dos veces no duplica; una fila con sigla inexistente o dos Generales en el mismo comité bloquea el lote con el error señalado.
- "Dar de alta" en una transacción: membresía, comités, `firstTermId`, interacción.
- "Dar de baja": motivo y consentimientos registrados; celular borrado sin consentimiento de contacto; formularios y tareas borrados; historia intacta; aparece en la galería solo con consentimiento `MEMORIAL`; la eliminación a pedido anonimiza y conserva comités y ledger anónimos.
- Recalculo de permanencia al aprobar un check-in, registrar una evaluación o cambiar una regla; snapshot congelado al cerrar el término.

## E2E (Playwright)

- Ingreso por OTP con código fijo de test y redirección a `next`.
- QR de check-in: sin sesión → ingreso → vuelve al QR → puntos acreditados y visibles en Mi OE.
- Admin publica una edición con portada subida directo al bucket por `POST` prefirmado (emulador con CORS) y la ve el visitante.
- Kanban de admisión hasta "Dar de alta" y primer ingreso del nuevo miembro.
- Una licencia pedida desde Mi OE aparece como tarea, GH la aprueba y la membresía cambia con auditoría; una convocatoria interna inscribe a la persona en el grupo y su permanencia lo refleja.
- Campaña enviada al mailer de consola respetando preferencias y baja.
- Modo anfitrión: el líder marca a una persona sin sesión.
- Un miembro ve subir su porcentaje de permanencia tras un check-in de integración; el líder evalúa un GAP y el porcentaje cambia; GH cierra el término y la decisión aparece en la persona.

## Migración

- Correr `migrate-ghpoints` sobre una restauración local del dump; `verify-migration` debe reportar cero diferencias en conteos y sumas.
- Muestreo manual de 20 personas y comprobación de todos los `publicId` en `/a/[publicId]`.

## Despliegue

- `staging` sigue `main` y recibe cada cambio; `production` solo avanza cuando la rama `production` se adelanta a mano, con el pre-deploy de migraciones en verde.
- Tras cada release: `/api/health`, poller del outbox visible en los logs, un OTP real recibido en un buzón `@eafit.edu.co`, una portada servida desde `/api/media/[id]` y un push recibido en un iPhone con la PWA instalada.
- Una vez al mes: descargar la copia cifrada de R2, descifrarla con la clave privada de `age`, restaurarla en local y abrir la app contra esa copia.

## Cierre de fase

Cada fase se cierra con: CI en verde, revisión manual en los tres anchos y dos temas, checklist del roadmap marcado y fila en el registro de avances.
