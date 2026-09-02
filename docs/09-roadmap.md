# Roadmap y seguimiento

Este es el archivo de tracking. Cada casilla es un entregable; se marca cuando cumple el criterio "listo cuando" de su fase y se anota en el registro de avances. Orden de magnitud trabajando solo y por ratos: 2 a 3 semanas por fase, una para el cutover.

Estados de fase: `pendiente` · `en curso` · `lista`.

## Fase 0 · Cimientos · `pendiente`

Cuentas y accesos:

- [ ] Repositorio en GitHub (remoto de este repo) con protección de `main`
- [ ] Vercel Pro (1 asiento), proyecto en `iad1`
- [ ] Neon: proyecto en `us-east-1`, integración con Vercel para ramas por preview, alerta de uso
- [ ] Cloudflare R2: buckets público y privado, CORS, dominio `media.oeeafit.com` reservado
- [ ] Resend: dominio `oeeafit.com` verificado (ya existe en GHPOINTS; confirmar acceso)
- [ ] Claves VAPID para push

Código base (empieza cuando se autorice escribir código):

- [ ] Scaffold Next.js 16 + TypeScript + Tailwind 4 + shadcn base; `vercel.json` con región y crons
- [ ] Tokens de marca, texturas, componente `Cartel`, tema claro/oscuro, fuentes locales
- [ ] Esquema Prisma por módulos, migraciones, uniques parciales, cliente pooled + `DIRECT_URL`
- [ ] Acceso: OTP, sesiones, guards, step-up, `/ingresar`
- [ ] Admin kit (`defineResource`) y paleta ⌘K
- [ ] Outbox + `after()` + cron `drain`, vista de jobs y dead letter
- [ ] Adaptadores: Mailer (consola/Resend), Storage (R2/emulador), Pusher
- [ ] Auditoría en transacción y `AppConfig`
- [ ] CI: lint, typecheck, unit, integration con Postgres, build
- [ ] Respaldo: `pg_dump` nocturno cifrado a R2 desde GitHub Actions y cron `backup-check`
- [ ] Seed sintético sin datos reales

Listo cuando: login por OTP con roster semilla sintético, shell del admin, claro/oscuro en 3 anchos, preview por PR con su rama de Neon, cron `drain` corriendo en producción.

## Fase 1 · Portal público y contenido · `pendiente`

- [ ] Páginas editables: La OE, Unirse, Privacidad
- [ ] Cartelera pública y anuncios
- [ ] Eventos y ediciones: los 4 macroeventos como identidades sin fechas inventadas
- [ ] Comités con 27 logos y fichas editoriales
- [ ] Inicio con cartelera, próximo encuentro y macroeventos
- [ ] ICS público
- [ ] OG images con cartel tipográfico
- [ ] Admin de Contenido con subida directa a R2 y variantes
- [ ] SEO básico, sitemap, robots

Listo cuando: contenido real de la OE publicable sin tocar código; nada personal en público; una portada de 5 MB sube y se sirve desde `media.oeeafit.com`.

## Fase 2 · Personas y Mi OE · `pendiente`

- [ ] Modelo de personas, membresías, comités por término, cargos, consentimientos
- [ ] Asistente de importación CSV con vista previa, diff y versión de política
- [ ] Migración en seco de roster, comités y permisos desde un dump de GHPOINTS
- [ ] Persona 360 con todas las pestañas
- [ ] Interacciones automáticas, notas, tareas, etiquetas, segmentos
- [ ] Mi OE: inicio, directorio, comités internos, ajustes (sesiones, datos, consentimientos)
- [ ] Normativa: documentos en R2 privado con lector y búsqueda
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
- [ ] Plantillas de correo y campañas por segmento en lotes por cron, con baja
- [ ] Registro de mensajes por persona
- [ ] Recordatorios (ocasiones de hoy, asambleas pendientes, términos)
- [ ] ICS personal

Listo cuando: un anuncio llega al celular de un integrante en menos de un minuto.

## Fase 6 · Cutover · `pendiente`

- [ ] Ensayo completo de migración sobre dump reciente
- [ ] Congelación de GHPOINTS y migración delta
- [ ] DNS de `oeeafit.com` a Vercel y `media.oeeafit.com` a R2
- [ ] Verificación en producción: OTP real, check-in real, portada, push
- [ ] Semana de monitoreo
- [ ] Apagado de GHPOINTS, dump final cifrado, cancelación de Railway
- [ ] README, ADR y runbook actualizados

Listo cuando: oeeafit.com sirve la app nueva y GHPOINTS está apagado con respaldo.

## Backlog (fuera de v1)

- Passkeys como segundo factor o acceso rápido
- Acceso de solo lectura para egresados
- Reto relámpago, boosters, palabra del día, badges persistidos
- Fórmulas alternativas de score de comité (ponderadas)
- WhatsApp Business API
- Galería de fotos por edición con consentimiento

## Registro de avances

| Fecha | Fase | Qué cambió |
| --- | --- | --- |
| 2026-09-02 | — | Documentación inicial: visión, arquitectura, CRM, modelo de datos, 20 ADR, acceso, mapa del sitio, marca, migración, roadmap |
