# Roadmap y seguimiento

Este es el archivo de tracking. Cada casilla es un entregable; se marca cuando cumple el criterio "listo cuando" de su fase y se anota en el registro de avances. Orden de magnitud trabajando solo y por ratos: 2 a 3 semanas por fase, una para el cutover.

Estados de fase: `pendiente` · `en curso` · `lista`.

## Fase 0 · Cimientos · `pendiente`

Cuentas y accesos:

- [ ] Repositorio `LaOE` en GitHub (remoto de este repo) con protección de `main`
- [ ] Proyecto `casa-digital` en el workspace Pro de Railway con el entorno `staging`: servicios `web`, `Postgres` y bucket `media`; variables por referencia; misma región que GHPOINTS; dominio de Railway o `pruebas.oeeafit.com` con `noindex`
- [ ] Respaldos del volumen de Postgres (diario, semanal, mensual) y PITR activados
- [ ] CORS del bucket configurado para el dominio de producción y los de PR o staging
- [ ] Límite duro de uso del workspace revisado para dos apps en convivencia
- [ ] Resend: dominio `oeeafit.com` verificado (ya existe en GHPOINTS; confirmar acceso)
- [ ] AWS SES: cuenta, dominio `oeeafit.com` verificado, salida del sandbox
- [ ] Cloudflare R2: bucket privado para copias; par de claves `age` (la privada solo con Mateo)
- [ ] Claves VAPID para push

Código base (empieza cuando se autorice escribir código):

- [ ] Scaffold Next.js 16 + TypeScript + Tailwind 4 + shadcn base; `railway.json` con build, start, healthcheck y pre-deploy
- [ ] Tokens de marca, texturas, componente `Cartel`, elementos gráficos SVG, tema claro/oscuro, Sofia Sans Extra Condensed y Plus Jakarta Sans servidas en local, favicon con el isotipo
- [ ] Esquema Prisma por módulos, migraciones, uniques parciales
- [ ] Acceso: OTP, sesiones, guards, step-up, `/ingresar`
- [ ] Admin kit (`defineResource`) y paleta ⌘K
- [ ] Outbox + poller + scheduler en `instrumentation.ts`; vista de jobs y dead letter
- [ ] Adaptadores: Mailer (consola; Resend con desbordamiento a SES), Storage (bucket de Railway/emulador), Pusher
- [ ] Auditoría en transacción y `AppConfig`
- [ ] CI: lint, typecheck, unit, integration con Postgres, build
- [ ] Servicio `backup` con cron mensual de Railway (`pg_dump` + objetos del bucket, cifrado con `age`, subida a R2) y job `backup-check` en el web
- [ ] Seed sintético sin datos reales

Listo cuando: login por OTP con roster semilla sintético en `staging`, shell del admin, claro/oscuro en 3 anchos, poller del outbox visible en los logs, health en verde, primera copia en R2 restaurada en local.

## Fase 1 · Portal público y contenido · `pendiente`

- [ ] Páginas editables: La OE, Unirse, Privacidad
- [ ] Cartelera pública y anuncios
- [ ] Eventos y ediciones: los 4 macroeventos como identidades sin fechas inventadas
- [ ] Comités con 27 logos y fichas editoriales
- [ ] Inicio con cartelera, próximo encuentro y macroeventos
- [ ] ICS público
- [ ] OG images con cartel tipográfico
- [ ] Admin de Contenido con subida directa prefirmada, confirmación y variantes
- [ ] SEO básico, sitemap, robots
- [ ] Lista de revisión de marca aplicada a cada pantalla pública ([07-marca.md](07-marca.md))

Listo cuando: contenido real de la OE publicable sin tocar código; nada personal en público; una portada de 5 MB sube directo al bucket y se sirve por redirección prefirmada.

## Fase 2 · Personas y Mi OE · `pendiente`

- [ ] Modelo de personas, membresías, comités por término, cargos, consentimientos
- [ ] Asistente de importación CSV con vista previa, diff y versión de política
- [ ] Migración en seco de roster, comités y permisos desde un dump de GHPOINTS
- [ ] Persona 360 con todas las pestañas
- [ ] Interacciones automáticas, notas, tareas, etiquetas, segmentos
- [ ] Mi OE: inicio, directorio, comités internos, ajustes (sesiones, datos, consentimientos)
- [ ] Normativa: documentos en el bucket privado con lector y búsqueda
- [ ] Carnet digital con QR firmado
- [ ] Exportar mis datos y solicitud de eliminación

Listo cuando: un admin encuentra a cualquier persona en 2 segundos y ve toda su historia; un integrante importado entra por OTP y ve su ficha.

## Fase 3 · Participación y GH Points · `pendiente`

- [ ] Términos con derivación por fecha y recordatorio de creación
- [ ] Ocasiones: ciclo de vida, consola con QR, código rotativo, contador en vivo, aprobaciones
- [ ] Check-in propio en `/a/[publicId]` y modo anfitrión
- [ ] Ledger con crédito automático, ajustes y reversiones
- [ ] Rankings nuevos, veteranos y comités
- [ ] Score de comité por outbox con `dedupeKey`
- [ ] Asambleas y requisitos por término
- [ ] Cierre de término y `TermStanding`
- [ ] Vista de líder: roster sin correos, score, proponer ocasiones
- [ ] Exportes CSV/XLSX con step-up
- [ ] Migración de asistencias, ledger y asambleas con `verify-migration` en cero
- [ ] Alias legados para QR impresos

Listo cuando: 500 escaneos concurrentes sin duplicados ni recomputes repetidos; sumas migradas idénticas.

## Fase 4 · Admisión, aliados y contactos · `pendiente`

- [ ] Constructor de formularios con campos tipados y acciones
- [ ] Formularios públicos con honeypot, rate limit y consentimiento
- [ ] Bandeja de respuestas vinculadas a personas
- [ ] Pipelines kanban con plantillas de admisión y patrocinio
- [ ] "Dar de alta" desde la tarjeta
- [ ] Organizaciones, contactos externos y patrocinios por edición
- [ ] Inscripciones a ediciones mediante formularios
- [ ] Tablero de tareas y pendientes en el inicio del admin

Listo cuando: una convocatoria completa (formulario → entrevista → alta) se hace sin Excel.

## Fase 5 · Comunicaciones y PWA · `pendiente`

- [ ] Manifest, service worker, instalación en iOS y Android
- [ ] Push web: suscripción, preferencias, envío por outbox
- [ ] Anuncios con push
- [ ] Plantillas de correo y campañas por segmento en lotes programados, con baja
- [ ] Registro de mensajes por persona
- [ ] Recordatorios (ocasiones de hoy, asambleas pendientes, términos)
- [ ] ICS personal

Listo cuando: un anuncio llega al celular de un integrante en menos de un minuto.

## Fase 6 · Cutover · `pendiente`

- [ ] Crear el entorno `production` (web, Postgres, bucket) y la rama `production`; CORS y variables de producción
- [ ] Ensayo completo de migración sobre un dump reciente
- [ ] Congelación de GHPOINTS y migración delta; copia de medios nuevos
- [ ] Mover `oeeafit.com` del servicio GHPOINTS al servicio `web` nuevo
- [ ] Verificación en producción: OTP real, check-in real, portada, push
- [ ] Semana de monitoreo con GHPOINTS detenido
- [ ] Dump final cifrado fuera de Railway; eliminar el proyecto GHPOINTS
- [ ] README, ADR y runbook actualizados

Listo cuando: oeeafit.com sirve la app nueva y el proyecto GHPOINTS está eliminado con respaldo.

## Backlog (fuera de v1)

- Passkeys como segundo factor o acceso rápido
- Acceso de solo lectura para egresados
- Reto relámpago, boosters, palabra del día, badges persistidos
- Fórmulas alternativas de score de comité (ponderadas)
- WhatsApp Business API
- Galería de fotos por edición con consentimiento
- Servicio `worker` separado y Cloudflare como CDN, solo con uso medido

## Registro de avances

| Fecha | Fase | Qué cambió |
| --- | --- | --- |
| 2026-09-02 | — | Documentación inicial: visión, arquitectura, CRM, modelo de datos, 20 ADR, acceso, mapa del sitio, marca, migración, roadmap |
| 2026-09-02 | — | Carpeta renombrada de `Untitled` a `casa-digital`. Hosting vuelve a Railway en el workspace Pro existente: ADR-021 reemplaza a ADR-019 y enmienda ADR-001, ADR-012 y ADR-016. Marca reescrita a partir del manual de 19 páginas (logo, color, tipografía, elementos, texturas, composición, orden del feed) |
| 2026-09-02 | — | Cerradas cuatro decisiones: sustitutos libres de fuentes por comparación visual (Sofia Sans Extra Condensed y Plus Jakarta Sans), isotipo aprobado como favicon, elementos gráficos redibujados en SVG, subida directa prefirmada al bucket (ADR-022 reemplaza a ADR-016). Láminas de comparación en `docs/assets/` |
| 2026-09-02 | — | Cerradas siete decisiones de operación (ADR-023): entorno `staging` persistente, copia mensual a Cloudflare R2 con servicio cron, repositorio `LaOE`, política de datos ya aprobada, correo con desbordamiento automático a SES, seguir en Pro, sin CDN por ahora |
