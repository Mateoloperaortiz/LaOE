# Roadmap y seguimiento

Este es el archivo de tracking. Cada casilla es un entregable; se marca cuando cumple el criterio "listo cuando" de su fase y se anota en el registro de avances. Orden de magnitud trabajando solo y por ratos: 2 a 3 semanas por fase, una para el cutover.

Estados de fase: `pendiente` · `en curso` · `lista`.

## Fase 0 · Cimientos · `en curso`

Orden decidido el 2026-09-03: primero el código base corriendo en local (A), después las cuentas, GitHub y Railway (B). Cada tramo de A cierra con su verificación y un commit.

### A. Código base en local (OrbStack: Postgres 18 en 5433 y Garage como bucket)

- [x] T0 · Docs: ADR-032 (Drizzle y esquema por módulo), ajustes en 01, 03, 08 y 10, esta fase reordenada
- [x] T1 · Scaffold con `create-next-app`: Next.js 16 + TypeScript 5.9 + Tailwind 4 + shadcn base, Biome y React Compiler; `compose.yaml`; `src/env.ts` con Zod; logs con `pino`; `GET /api/health`; `npm run check` (Biome, dependency-cruiser, knip, tsc, unit, integración, build); `railway.json` con build, start, healthcheck y pre-deploy
- [x] T2 · Esquema Drizzle por módulo (identity, people, term, system), migraciones SQL, uniques parciales y `pg_trgm`; `src/db/tx.ts` con auditoría y outbox en la misma transacción; `db:release` con verificación; `db:reset`
- [x] T3 · Tokens de marca, texturas, componente `Cartel`, elementos gráficos SVG, tema claro/oscuro, Sofia Sans Extra Condensed y Plus Jakarta Sans servidas en local, favicon con el isotipo
- [x] T4 · Acceso: OTP, sesiones, guards, step-up, `/ingresar` con los textos T-040 a T-055; diccionario de textos que carga `14-copy-y-textos.md` por código (`T-…`) para que cambiar un texto no sea cambiar lógica
- [x] T5 · Outbox + poller + scheduler en `instrumentation.ts`; vista de jobs y dead letter; adaptadores Mailer (consola; Resend con desbordamiento a SES), Storage (bucket S3 de Railway; Garage en local), Pusher; `AppConfig`
- [x] T6 · Admin kit (`defineResource`) con Comité, Término y Permisos; paleta ⌘K
- [x] T7 · Seed sintético sin datos reales; suite completa (unit, integración, e2e con `axe`); CI en `.github/workflows/ci.yml` listo para el remoto

Listo cuando (en local): login por OTP con el roster semilla sintético, cascarón del admin, claro/oscuro en 3 anchos, poller del outbox visible en los logs, health en verde, `npm run check` en verde.

**Cumplido el 2026-09-03**: `npm run db:reset` deja 27 comités, 41 personas sintéticas y un ADMIN de demo; el ingreso por OTP con `oe.demo.admin@eafit.edu.co` llega al admin; claro/oscuro revisado en 360, 768 y 1280; el poller aparece en los logs y procesa lo encolado; `npm run check` y `npm run test:e2e` en verde.

### B. Cuentas, GitHub y Railway (después de A)

- [x] Repositorio `LaOE` en GitHub (remoto de este repo, privado) con protección de `main` y CI en verde
- [ ] Proyecto `casa-digital` en el workspace Pro de Railway con el entorno `staging`: servicios `web`, `Postgres` y bucket `media`; variables por referencia; misma región que GHPOINTS; dominio de Railway o `pruebas.oeeafit.com` con `noindex`
- [ ] Respaldos del volumen de Postgres (diario, semanal, mensual) y PITR activados
- [ ] CORS del bucket configurado con `storage:init` para el dominio de producción y los de staging
- [ ] Límite duro de uso del workspace revisado para dos apps en convivencia
- [ ] Resend: dominio `oeeafit.com` verificado (ya existe en GHPOINTS; confirmar acceso)
- [ ] AWS SES: cuenta, dominio `oeeafit.com` verificado, salida del sandbox
- [ ] Cloudflare R2: bucket privado para copias; par de claves `age` (la privada solo con Mateo)
- [ ] Claves VAPID para push
- [ ] Servicio `backup` con cron mensual de Railway (`pg_dump` + objetos del bucket, cifrado con `age`, subida a R2) y job `backup-check` en el web

Listo cuando: lo mismo de A pasando en `staging`, más la primera copia en R2 restaurada en local.

## Fase 1 · Portal público y contenido · `lista`

Plan aprobado el 2026-09-03 ([ADR-033](adr/ADR-033-contenido-y-medios-fase-1.md)): siete tramos en cortes verticales (esquema → dominio → admin → portal); cada uno cierra con `npm run check` y `npm run test:e2e` en verde, un commit convencional y push a `main`. Railway sigue pendiente (fase 0 B).

### Tramos

- [x] F1-T0 · Docs: ADR-033, modelo (`content`, `events`), mapa del sitio, textos T-300 a T-322 y T-330 a T-369, verificación, fuentes para OG en marca, `PUBLIC_INDEXING`
- [x] F1-T1 · Esquema completo de `content` y `events` con la migración `0003` (páginas y macroeventos sembrados) y páginas editables de punta a punta: `/admin/paginas`, `/la-oe`, `/unirse`, `/privacidad`, navegación T-038, Markdown sin HTML crudo
- [x] F1-T2 · Cartelera (`/admin/cartelera` con Publicar y Despublicar, `/cartelera`, `/cartelera/[id]`, bloque real en el inicio) y fichas públicas de comités (`/comites`, `/comites/[slug]`)
- [x] F1-T3 · Medios: presign, subida directa, confirm, `media.process` con variantes WebP, `GET /api/media/[id]`, `/admin/medios` con subidor, bucket en la CSP
- [x] F1-T4 · Eventos y ediciones: admin anidado con las extensiones del kit, `/eventos`, `/eventos/[slug]`, `/eventos/[slug]/[edicion]`, inicio con próximo encuentro y macroeventos, ICS público, seed sintético de anuncios y ediciones
- [x] F1-T5 · OG images con cartel tipográfico e instancias TTF, `generateMetadata`, `metadataBase`, sitemap, robots, `PUBLIC_INDEXING`
- [x] F1-T6 · Cierre: lista de revisión de marca por pantalla, tres anchos y dos temas, registro

### Entregables

- [x] Páginas editables: La OE, Unirse, Privacidad
- [x] Cartelera pública y anuncios
- [x] Eventos y ediciones: los 4 macroeventos como identidades sin fechas inventadas
- [x] Comités con 27 logos y fichas editoriales
- [x] Inicio con cartelera, próximo encuentro y macroeventos
- [x] ICS público
- [x] OG images con cartel tipográfico
- [x] Admin de Contenido con subida directa prefirmada, confirmación y variantes
- [x] SEO básico, sitemap, robots
- [x] Lista de revisión de marca aplicada a cada pantalla pública ([07-marca.md](07-marca.md))
- [x] Textos del portal tomados de `14-copy-y-textos.md` (T-001 a T-033), sin copy inventado en el código

Listo cuando: contenido real de la OE publicable sin tocar código; nada personal en público; una portada de 5 MB sube directo al bucket y se sirve por redirección prefirmada.

**Cumplido el 2026-09-03 (en local)**: un ADMIN publica páginas, anuncios, eventos, ediciones y fichas de comité desde el admin sin tocar código; el portal no muestra ningún dato personal (las fichas de comité no tienen roster y los organizadores son comités); una portada de 5,9 MB sube del navegador a Garage con `POST` prefirmado y se sirve con 302 a una URL prefirmada (prueba e2e `medios.spec.ts`); `npm run check` y las 15 pruebas e2e con `axe` en verde; revisado en 375, 768 y escritorio, claro y oscuro. Lo que falta para publicar contenido real está en [11-contenido-pendiente.md](11-contenido-pendiente.md) (textos de La OE completos, Unirse, política de privacidad, presentaciones y contactos de los 27 comités, descripciones y fechas de los macroeventos).

## Fase 2 · Personas y Mi OE · `lista`

Plan aprobado el 2026-09-03 ([ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md)): ocho tramos en cortes verticales; cada uno cierra con `npm run check` y `npm run test:e2e` en verde, un commit convencional y push a `main`. Railway sigue pendiente (fase 0 B).

### Tramos

- [x] F2-T0 · Docs: ADR-034, modelo (`people`, `crm`, `content`, `system`), mapa del sitio, roster, acceso, migración, verificación, textos T-370 a T-418 (Mi OE), T-420 a T-515 (admin) y T-223, roadmap
- [x] F2-T1 · Esquema y dominio de personas: migración `0004`, comandos de persona, membresía, comités del término, cargos y consentimientos, corte de acceso por `sessionsRevokedAt`, varios handlers por evento, `/admin/personas` por el kit, Persona 360 básica, `/admin/cargos`, seed con consentimientos, egresados y cargos, fábricas de prueba
- [x] F2-T2 · CRM: línea de tiempo por outbox, notas, tareas, etiquetas, segmentos; filtros asíncronos del kit; pestañas Línea de tiempo, Tareas y Resumen
- [x] F2-T3 · Asistente de importación del roster en tres pasos, archivo original en el bucket, `/admin/sistema/importaciones`
- [x] F2-T4 · Galería de egresados y migración en seco de roster, comités y permisos desde la copia local de GHPOINTS
- [x] F2-T5 · Mi OE: inicio con agenda, cartelera de miembros, tus comités y onboarding; directorio; comités internos; ajustes con datos propios, foto, consentimientos, mis datos y eliminación; segunda identidad e2e sin permisos
- [x] F2-T6 · Normativa (PDF en el bucket, artículos desde el extractor, lector y búsqueda) y carnet con QR firmado
- [x] F2-T7 · Cierre: lista de revisión de marca en las pantallas nuevas, tres anchos y dos temas, registro

### Entregables

- [x] Modelo de personas, membresías, comités por término, cargos, consentimientos
- [x] Asistente de importación del roster (CSV o Excel) con el formato de `13-importacion-del-roster.md`: mapeo de columnas, validación por fila, vista previa con diff, modo actualización por correo con subconjunto de columnas, consentimiento, auditoría, archivo original en el bucket
- [x] Catálogo de cargos de comité (General, Financiero, Publicidad, Relaciones Públicas, Logística, Gestión Humana, Miembro) y propuesta de permiso de líder para cada General
- [x] Migración en seco de roster, comités y permisos desde un dump de GHPOINTS
- [x] Persona 360 con todas las pestañas
- [x] Interacciones automáticas, notas, tareas, etiquetas, segmentos
- [x] Mi OE: inicio, directorio, comités internos, ajustes (sesiones, datos, consentimientos)
- [x] Ajustes: la persona edita foto, celular y correo personal con consentimiento por propósito; cada cambio se audita y queda en la línea de tiempo
- [x] Onboarding de nuevos: lista de pasos de la primera semana (normativa, comité, primera integración, activar push) en el inicio de Mi OE; los pasos con hecho registrado se marcan solos; se liga a los criterios de nuevos en la fase 4
- [x] Normativa: documentos en el bucket privado con lector y búsqueda
- [x] Carnet digital con QR firmado
- [x] Exportar mis datos y solicitud de eliminación
- [x] Comando de salida con motivo (graduación, retiro, permanencia) y consentimientos de galería y de contacto; depuración de lo que no es historia
- [x] Galería de egresados por año en Mi OE (`/app/egresados`), con cartel por año
- [x] Correo personal opcional con consentimiento, capturado al dar de baja

Listo cuando: un admin encuentra a cualquier persona en 2 segundos y ve toda su historia; un miembro importado entra por OTP y ve su ficha. **Cumplido en local el 2026-09-03**: la paleta ⌘K abre la Persona 360 con importación, comités, consentimientos y línea de tiempo (`personas.spec.ts`), y el miembro que entra por el roster ve sus comités en `/app` tras el OTP (`roster.spec.ts`). Las pestañas Participación, Permanencia, Formularios y Solicitudes de la 360 muestran el aviso T-240 hasta su fase.

## Fase 3 · Participación y GH Points · `en curso`

Plan aprobado el 2026-09-03 ([ADR-035](adr/ADR-035-participacion-y-gh-points-fase-3.md)): diez tramos en cortes verticales; cada uno cierra con `npm run check` y `npm run test:e2e` en verde, un commit convencional y push a `main`. Railway sigue pendiente (fase 0 B). Decisiones de Mateo: el líder abre solo las ocasiones sin puntos, el ranking muestra el top 10 con nombres más el puesto propio, entran la cámara en el modo anfitrión, la serie semanal de reuniones y el cierre automático de ocasiones; el exporte XLSX queda fuera.

### Tramos

- [x] F3-T0 · Docs: ADR-035 y enmiendas (ADR-006, 009, 024, 034), modelo (`terms`, `participation`, `system`), arquitectura, acceso, mapa del sitio, migración, verificación, textos T-521 a T-560 (Mi OE) y T-561 a T-674 (admin), glosario, contenido pendiente, roadmap
- [ ] F3-T1 · Módulo `terms`: el término sale de `participation` sin cambio de SQL; imports de `people`, `crm`, `system`, admin, scripts y pruebas; `deps:check` en verde
- [ ] F3-T2 · Esquema y dominio base: migración `0005` con ocasiones, check-ins, ledger, score, standing, requisito de asambleas y alias legados; funciones puras (`publicId`, código rotativo, transiciones, ventana, saldo, niveles, puestos, tasa suavizada, requisito); comandos de ocasión; recurso `/admin/ocasiones`; lecturas nuevas de `people` y `events`; seed con ocasiones; fábricas y limpieza e2e
- [ ] F3-T3 · Check-in propio en `/a/[publicId]` con crédito en la misma transacción, decisiones, cancelación con reversiones, `/asamblea/[publicId]`, T-100 en `/ingresar`, handler `score.recompute`, línea de tiempo y onboarding por outbox, prueba de 500 check-ins concurrentes, e2e del QR
- [ ] F3-T4 · Consola con QR, contador en vivo (`GET /api/ocasiones/[id]/live`), pendientes, alta manual, ciclo de vida con step-up, código rotativo; modo anfitrión con cámara y búsqueda por nombre; `camera=(self)` en el proxy; el layout del admin admite líderes
- [ ] F3-T5 · Mi OE: `/app/gh-points` (saldo, nivel, movimientos, rankings, asambleas), saldo y ocasiones en el inicio; `/admin/rankings`, `/admin/ledger`; Persona 360 con Participación y Resumen reales; paleta con ocasiones
- [ ] F3-T6 · Asambleas (requisito derivado, ajustes, cumplimiento, `/admin/asambleas`), cierre de puntos con `TermStanding` (`/admin/cierre`), programados `auto-close` y `term-check` con tarea al faltar el término siguiente
- [ ] F3-T7 · Vista de líder (`/admin/comites/[slug]`) con roster sin correos, score, ocasiones propias y serie semanal; exportes CSV con step-up (`ocasiones`, `check-ins`, `ledger`, `rankings`, `asambleas`); `/admin/sistema/alias`
- [ ] F3-T8 · Migración de ocasiones, check-ins, ledger, asambleas, requisitos, standing y alias desde GHPOINTS; `verify-migration` con sumas; ensayo contra la copia local
- [ ] F3-T9 · Cierre: lista de revisión de marca en las pantallas nuevas, tres anchos y dos temas, registro

### Entregables

- [ ] Términos con derivación por fecha y recordatorio de creación (tarea al faltar el siguiente)
- [ ] Ocasiones: ciclo de vida, consola con QR, código rotativo, contador en vivo, aprobaciones, cierre automático
- [ ] Check-in propio en `/a/[publicId]` y modo anfitrión con cámara
- [ ] Ledger con crédito automático, ajustes y reversiones
- [ ] Rankings nuevos, veteranos y comités (top 10 más puesto propio)
- [ ] Score de comité por outbox con `dedupeKey`, tasa cruda y suavizada
- [ ] Asambleas ordinarias, elección de junta y segunda vuelta con requisito derivado del término, ajustes y cumplimiento por persona
- [ ] Cierre de término y `TermStanding`
- [ ] Vista de líder: roster sin correos, score, ocasiones propias, serie semanal de reuniones
- [ ] Exportes CSV con step-up
- [ ] Migración de asistencias, ledger y asambleas con `verify-migration` en cero
- [ ] Alias legados para QR impresos

Listo cuando: 500 escaneos concurrentes sin duplicados ni recomputes repetidos; sumas migradas idénticas.

## Fase 4 · Permanencia · `pendiente`

- [ ] Reglas por término: editor, copia del término anterior, vista previa del impacto sobre el roster
- [ ] Tabla general y tablas por comité (editadas por su líder) con aviso frente al valor nominal y bloqueo de GH
- [ ] Resultado por comité con umbral por condición (60 / 80 / 70), periodo de prueba y transferencias internas
- [ ] Reuniones de comité en el criterio de asistencia (la serie semanal sin puntos y el modo anfitrión llegan en la fase 3)
- [ ] Comités de trabajo sembrados (CAP, CGH, CCM, CAE, CML, CAF, Athletic) con sus cargos de junta
- [ ] Uso de la categoría de ocasión (integración, partido del Athletic, charla, taller, social) y de la marca "solo nuevos" en los criterios (las columnas nacen en la fase 3)
- [ ] Grupos de trabajo por término (comités de trabajo, GT de macroevento, GAP, GAP OE, barra brava, tareas de nuevos) con líder e miembros; importación CSV
- [ ] Evaluaciones de desempeño por el director de GH de cada frente (y el GH principal para nuevos), con bandeja de pendientes y recordatorios
- [ ] Puntajes del líder (subcomité, liderazgo, destacado del mes, convivencia) con observación obligatoria cuando no es completo
- [ ] Créditos manuales auditados
- [ ] Cálculo por outbox con snapshot por persona y término; estados incluido "no alcanza"
- [ ] Mi OE: `/app/permanencia` con progreso, cómo sumar más y evaluaciones pendientes; barra en el inicio
- [ ] Admin: cumplimiento por comité con filtros y export; cierre con propuesta automática según la regla de GH (cumple, prueba, salida del comité, salida de la OE, expulsión por asamblea obligatoria) y confirmación por persona y comité
- [ ] Aviso antes de cada asamblea obligatoria y ventana de evaluación dos semanas antes del cierre
- [ ] Persona 360: pestaña Permanencia
- [ ] Avisos a mitad de término y tres semanas antes del cierre
- [ ] Reconocimientos: el destacado del mes de cada comité se publica en la cartelera del comité y como insignia en el perfil
- [ ] Panel de la junta: retención por semestre, nuevos por comité, distribución de permanencia, cuántos van a "no alcanza", asistencia a reuniones por comité; permiso `BOARD`

Listo cuando: un miembro ve en su celular el mismo porcentaje que GH calcula en su hoja para el término de prueba, criterio por criterio, y GH cierra un término con decisiones registradas.

## Fase 5 · Admisión, aliados y contactos · `pendiente`

- [ ] Constructor de formularios con campos tipados y acciones
- [ ] Formularios públicos con honeypot, rate limit y consentimiento
- [ ] Bandeja de respuestas vinculadas a personas
- [ ] Pipelines kanban con plantillas de admisión y patrocinio
- [ ] "Dar de alta" desde la tarjeta
- [ ] Organizaciones, contactos externos y patrocinios por edición
- [ ] Inscripciones a ediciones mediante formularios
- [ ] Tablero de tareas y pendientes en el inicio del admin
- [ ] Solicitudes con flujo desde Mi OE: licencia, retiro voluntario, cambio de comité y transferencia interna; tarea para GH y comando al aprobar; rechazo con motivo
- [ ] Convocatorias internas: formulario ligado a un grupo de trabajo con cupo, ventana y selección; la inscripción aceptada crea la pertenencia al grupo

Listo cuando: una convocatoria de admisión completa (formulario → entrevista → alta) y una convocatoria interna a un GT se hacen sin Excel, y una licencia pedida desde Mi OE termina aprobada y aplicada sin que GH toque la base.

## Fase 6 · Comunicaciones y PWA · `pendiente`

- [ ] Manifest, service worker, instalación en iOS y Android
- [ ] Push web: suscripción, preferencias, envío por outbox
- [ ] Anuncios con push
- [ ] Plantillas de correo y campañas por segmento en lotes programados, con baja
- [ ] Registro de mensajes por persona
- [ ] Recordatorios (ocasiones de hoy, asambleas pendientes, términos)
- [ ] ICS personal
- [ ] Encuesta tras la ocasión: formulario corto enviado por push a quienes hicieron check-in al cerrar la ocasión; respuestas anónimas agregadas por ocasión y comité

Listo cuando: un anuncio llega al celular de un miembro en menos de un minuto y la encuesta de una ocasión cerrada llega a sus asistentes.

## Fase 7 · Cutover · `pendiente`

- [ ] Crear el entorno `production` (web, Postgres, bucket) y la rama `production`; CORS y variables de producción
- [ ] Ensayo completo de migración sobre un dump reciente
- [ ] Congelación de GHPOINTS y migración delta; copia de medios nuevos
- [ ] Mover `oeeafit.com` del servicio GHPOINTS al servicio `web` nuevo
- [ ] Verificación en producción: OTP real, check-in real, portada, push
- [ ] Semana de monitoreo con GHPOINTS detenido
- [ ] Dump final cifrado fuera de Railway; eliminar el proyecto GHPOINTS
- [ ] README, ADR y runbook actualizados

Listo cuando: oeeafit.com sirve la app nueva y el proyecto GHPOINTS está eliminado con respaldo.

## Backlog (después de la v1)

- Votación electrónica de la junta con segunda vuelta: cuando la asistencia funcione sin fallas y con las reglas de los estatutos (voto secreto, quórum)
- Actas de reunión ligadas a la reunión semanal: decisiones y tareas
- Subcomités como tipo de grupo de trabajo
- Inventario y préstamos de logística (banners, sonido, tote bags)
- Álbum de fotos por edición con consentimiento
- Modo anfitrión sin señal: cola de check-ins en el celular que se sincroniza después
- Certificados de participación con QR de verificación (no priorizado)
- Passkeys como segundo factor o acceso rápido
- Reto relámpago, boosters, palabra del día, badges persistidos
- Fórmulas alternativas de score de comité (ponderadas)
- WhatsApp Business API
- Servicio `worker` separado y Cloudflare como CDN, solo con uso medido

## Registro de avances

| Fecha | Fase | Qué cambió |
| --- | --- | --- |
| 2026-09-02 | — | Documentación inicial: visión, arquitectura, CRM, modelo de datos, 20 ADR, acceso, mapa del sitio, marca, migración, roadmap |
| 2026-09-02 | — | Carpeta renombrada de `Untitled` a `casa-digital`. Hosting vuelve a Railway en el workspace Pro existente: ADR-021 reemplaza a ADR-019 y enmienda ADR-001, ADR-012 y ADR-016. Marca reescrita a partir del manual de 19 páginas (logo, color, tipografía, elementos, texturas, composición, orden del feed) |
| 2026-09-02 | — | Cerradas cuatro decisiones: sustitutos libres de fuentes por comparación visual (Sofia Sans Extra Condensed y Plus Jakarta Sans), isotipo aprobado como favicon, elementos gráficos redibujados en SVG, subida directa prefirmada al bucket (ADR-022 reemplaza a ADR-016). Láminas de comparación en `docs/assets/` |
| 2026-09-02 | — | Cerradas siete decisiones de operación (ADR-023): entorno `staging` persistente, copia mensual a Cloudflare R2 con servicio cron, repositorio `LaOE`, política de datos ya aprobada, correo con desbordamiento automático a SES, seguir en Pro, sin CDN por ahora |
| 2026-09-02 | — | Reglas de GH confirmadas (ADR-024): comités 1 a 3, asambleas ordinarias más elección de junta y segunda vuelta, código rotativo opcional, score con suavizado, sin medallas migradas, egresados sin acceso. Cloudflare completo evaluado y descartado. Queda una sola decisión abierta |
| 2026-09-02 | — | Permanencia (ADR-025): la tabla de GH pasa a ser una fase propia (nueva fase 4; admisión, comunicaciones y cutover pasan a 5, 6 y 7). Doc `12-permanencia.md` con la transcripción de las capturas, el modelo y las vistas. Siete preguntas nuevas para GH |
| 2026-09-02 | — | Permanencia en dos niveles (ADR-026): cada comité tiene su tabla dentro de un presupuesto; tabla de A3 transcrita; reuniones de comité como ocasiones; comité principal; puntajes del líder con observación. Cuatro preguntas más para GH |
| 2026-09-02 | — | GH (Miguel Gaviria) respondió: dos tablas (general ≈ 50, comité ≈ 60) con resultado por comité, umbrales fijos 60 / 80 / 70, periodo de prueba con margen de 10, GT por cantidad, asambleas obligatorias dos y tres para el 10 %, evaluadores directores de GH, comités de trabajo con sus líderes, puntos definidos por actividad. ADR-027; 12-permanencia reescrito; siete preguntas abiertas |
| 2026-09-02 | — | GH cerró las siete: salida del comité o de la OE según la regla, expulsión por asamblea obligatoria, obligatorias por semestre, evaluación al cerrar el semestre, Athletic con capitán y DT (ADR-028). Solo queda abierta la anonimización de egresados, de la junta |
| 2026-09-02 | — | Formato del roster definido con las columnas de GH más `CARGO` (ADR-029): cargo dentro del comité como catálogo en la pertenencia, nombre y apellido separados, validaciones e idempotencia. Doc `13-importacion-del-roster.md` |
| 2026-09-02 | — | GH confirmó los cinco estados y los seis cargos; `CARGO` llegará en una segunda entrega, así que la importación admite actualizaciones parciales por correo |
| 2026-09-03 | — | ADR-030: el perfil de egresado (memorial) reemplaza la anonimización por plazo; galería de egresados por año en la fase 2; el permiso del General se otorga con confirmación. Sin decisiones abiertas |
| 2026-09-03 | — | Siete mejoras aceptadas por Mateo (ADR-031): solicitudes con flujo, convocatorias internas, onboarding de nuevos, reconocimientos, panel de la junta, encuesta tras ocasión y autogestión de datos, repartidas en las fases 2, 4, 5 y 6. Backlog ampliado: votación electrónica, actas, subcomités, inventario, álbum, modo sin señal, certificados |
| 2026-09-03 | — | Inventario completo de copy y textos (`14-copy-y-textos.md`): portal, acceso, Mi OE, permanencia, consentimientos, admin, push, correos y documentos, con propuesta, dueño y estado; los textos sensibles quedan marcados para revisar con GH |
| 2026-09-03 | — | Término oficial: "miembro" (decisión de Mateo, alineada con GH). Renombrado en toda la documentación; el cargo por defecto del comité pasa a `MIEMBRO` |
| 2026-09-03 | — | El estado de membresía `ACTIVE` se dice "activo", como GH; renombrado donde la documentación decía "vigente" en ese sentido |
| 2026-09-03 | 0 | Arranca el código, escrito desde cero (de GHPOINTS solo versiones de referencia y lecciones ya documentadas). Drizzle 0.45 reemplaza a Prisma (ADR-032). Local primero con OrbStack (Postgres 18 en 5433, Garage como emulador S3); GitHub y Railway al cerrar la fase. Fase 0 reordenada en A (código en local) y B (cuentas y Railway); T0 listo |
| 2026-09-03 | 0 | T1 listo: scaffold Next.js 16.3 con Biome y React Compiler, `compose.yaml` para OrbStack (Postgres 18 en 5433, Garage v2.3 como bucket `media` con CORS por `storage:init`), `src/env.ts` con Zod, logs con pino, cliente Drizzle, `GET /api/health`, `npm run check` (Biome, dependency-cruiser, knip, tsc, unit, integración, build) en verde, hooks con lefthook, `railway.json` |
| 2026-09-03 | 0 | T2 listo: esquemas Drizzle de identity, people, participation (term) y system; migración `0000_inicial` con enums, checks y uniques parciales, y `0001_catalogos_y_trgm` (pg_trgm, índices GIN, catálogo de cargos y `app_config`); `runCommand` con auditoría y outbox en la misma transacción; `db:release` migra y verifica índices y extensiones; `db:reset`; 9 pruebas de integración de restricciones |
| 2026-09-03 | 0 | T3 listo: línea gráfica en la web (`src/shared/brand`): once tokens y tintes, Sofia Sans Extra Condensed y Plus Jakarta Sans locales, granito por SVG, `Cartel` en cinco fondos, `BarraTitulo`, `Numeral`, nueve `Elemento` SVG, `SelloOE`, `Insignia`, logos como máscara tintable, isotipo como favicon, tema claro/oscuro con conmutador, diccionario de textos (`copy:sync` desde 14-copy) y muestrario `/marca` solo en desarrollo; home provisional, `/ingresar` vacío, 404 y error; revisado en 360/768/1280, claro y oscuro, axe sin violaciones |
| 2026-09-03 | 0 | T4 listo: módulo `identity` (OTP con respuesta uniforme y límites contados en Postgres, sesiones opacas de 24 h o 90 días, step-up, `getActor` cacheado por request, guards puros), lecturas públicas de `people`, `proxy.ts` con redirección de rutas protegidas y CSP con nonce, `/ingresar` en dos pasos con los textos T-040 a T-055, cascarones de Mi OE (inicio y sesiones en Ajustes) y de Administración, Mailer de consola; 16 pruebas unitarias, 18 de integración y 3 e2e con Playwright y axe |
| 2026-09-03 | 0 | T5 listo: poller del outbox por fila con `FOR UPDATE SKIP LOCKED`, backoff 1 min/5 min/30 min/2 h/12 h y dead letter al quinto fallo; scheduler con `croner` en hora de Bogotá que encola `identity.prune`, `system.prune` y `system.backup-check` con clave de deduplicación y advisory lock; handlers registrados por módulo; `AppConfig` tipado con caché y escritura auditada; vista `/admin/sistema/jobs` con reintento auditado; módulo `comms` con tabla `message` y correo transaccional Resend con desbordamiento a SES; adaptadores Storage (POST prefirmado, HEAD, lectura prefirmada, probado contra Garage) y Pusher (VAPID); 20 unitarias, 28 de integración |
| 2026-09-03 | 0 | T6 listo: admin kit en `src/shared/admin-kit` (definición de recurso por módulo con columnas, filtros, esquema Zod, campos y comandos; listado paginado con búsqueda por URL, panel lateral de crear y editar, export CSV con celdas neutralizadas, acción genérica que exige ADMIN y step-up) con Comités, Términos y Permisos; step-up en `/ingresar/paso`; paleta ⌘K con `pg_trgm` sobre personas y comités; 24 unitarias, 31 de integración y 7 e2e (sesión de admin guardada por Playwright) |
| 2026-09-03 | 0 | T7 listo: `scripts/seed.ts` idempotente (27 comités por sigla, 41 personas sintéticas con membresías en los cuatro estados, 1 a 3 comités con un General por comité, ADMIN de demo y dos líderes), `db:reset` lo aplica tras migrar; `.github/workflows/ci.yml` con calidad e integración/e2e sobre Postgres 18 y Garage; los recursos sin comando de actualización no muestran Editar. **Fase 0 A completa**; queda B (GitHub y Railway) |
| 2026-09-03 | 0 | Parte B, primer ítem: repositorio privado `github.com/Mateoloperaortiz/LaOE` creado con `gh`, `main` empujada por HTTPS (el agente SSH de la Mac no firma desde el harness), ruleset activo sin borrado ni force push, primera corrida de `ci.yml` en verde (calidad e integración/e2e sobre Postgres 18 y Garage). Railway sigue pendiente por decisión de Mateo |
| 2026-09-03 | 1 | Arranca la fase 1 con su plan aprobado: ADR-033 (módulos `content` y `events`, catálogo por migración, Markdown sin HTML crudo, variantes WebP por outbox, 302 con caché menor que la firma, bucket en la CSP, render dinámico, OG con instancias TTF, `PUBLIC_INDEXING`, ICS a mano, kit con extensiones aditivas), modelo y mapa actualizados (`/cartelera/[id]`, `/admin/cartelera` única), textos T-300 a T-322 y T-330 a T-369 inventariados, verificación ampliada. F1-T0 listo |
| 2026-09-03 | 1 | F1-T1 listo: enum `audience`, esquemas de `content` (`page`, `announcement`, `media_asset`) y `events` (`event`, `event_edition`, `edition_committee`), migración `0003_contenido_y_eventos` que además siembra las tres páginas en borrador (La OE con la historia, misión y visión transcritas del manual) y los cuatro macroeventos publicados; dominio y recurso `paginas` en el admin; portal con navegación T-038 (`NavLink` con el activo subrayado en azul), `/[slug]` para las páginas fijas con `Markdown` (react-markdown + remark-gfm, sin HTML crudo) y "en preparación" para los borradores, bloque de contacto en La OE, enlace a Privacidad en el pie; kit con `rows` en textareas; `launch.json` arranca el dev server. 2 pruebas de integración y 2 e2e nuevas; `check` y e2e en verde; revisado en 375, 768 y escritorio, claro y oscuro |
| 2026-09-03 | 1 | F1-T2 listo: dominio de anuncios (crear, editar, publicar y despublicar con auditoría; público = audiencia pública y fecha ya pasada, fijados primero, programados a futuro no salen), recurso `cartelera` con acciones de fila Publicar y Despublicar; lecturas públicas de comités (activos y publicados); portal con `/cartelera`, `/cartelera/[id]`, `/comites` (cartel con logo por comité y rotación del feed) y `/comites/[slug]` (hero navy con logo, presentación Markdown o "todavía no publicó", botón Escribiles); inicio con la cartelera real y el botón "Conocé los comités"; `excerpt` puro para resúmenes; `formatDate`; `LogoComite` con caja apaisada; seed con los comités publicados. 3 unitarias, 2 de integración y 2 e2e nuevas; `check` y e2e (11) en verde |
| 2026-09-03 | 1 | F1-T3 listo: medios según ADR-022 y ADR-033: `POST /api/media/presign` (ADMIN; JPG, PNG o WebP de 5 KB a 20 MB; clave `uploads/AAAA/MM/<id>.<ext>`), subida directa del navegador con `MediaUploader`, `POST /api/media/confirm` (HEAD, `media_asset` en PENDING, evento `media.process` con clave de deduplicación), handler con `sharp` (variantes WebP 480/960/1600 sin agrandar en `variants/<id>/`, READY, o FAILED sin reintento si no decodifica; los fallos del bucket relanzan), `GET /api/media/[id]?w=` con 302 y caché menor que la firma (público 6 días, privado 5 minutos con sesión), `Imagen` con `srcset`, `/admin/medios` a medida (subidor y listado con estado), `sharp` declarado y externo, origen del bucket en `img-src` y `connect-src`, celdas con enlace en el kit. Corrección de fondo: el outbox estampa `next_attempt_at` con el reloj de la app (el de Postgres en OrbStack iba 10 ms adelantado y las filas recién encoladas no "vencían"). 6 unitarias, 3 de integración y 1 e2e nuevas (portada de 5,9 MB subida directo a Garage y servida con 302); `check` y e2e (12) en verde |
| 2026-09-03 | 1 | F1-T4 listo: dominio de eventos (resumen, descripción, portada, orden, publicación) y ediciones (fechas en Bogotá convertidas a UTC, lugar, inscripción externa, portada, organizadores en la misma transacción, unique por evento y slug, fin posterior al inicio) con lecturas públicas (`listPublishedEvents`, `getPublishedEvent`, `listPublishedEditionsOf`, `getPublishedEdition`, `findNextPublicEdition(s)`, `listPublicEditionsForIcs`); kit con `multiselect`, `datetime`, `emptyOption`, celdas con enlace, `ResourcePage` con `basePath`, `fixedFilters` y `title`, y acciones que revalidan la ruta de retorno; recursos `eventos` (enlace "Ediciones (n)") y `ediciones` montado en `/admin/eventos/[id]/ediciones` con el evento fijado; portal con `/eventos`, `/eventos/[slug]` y `/eventos/[slug]/[edicion]` (ficha Cuándo · Dónde · Organizan con logos, botón de inscripción externa, JSON-LD `Event` con nonce, "Próxima edición" o "Ya pasó"); inicio con "Próximo encuentro" y macroeventos desde la base; `GET /api/ics/publico.ics` a mano; enlaces al calendario en el pie y en eventos; tarjetas con enlace estirado (el título es el enlace, con nombre accesible); seed con dos anuncios y una edición "de prueba" por macroevento; `formatDateRange` y conversión `datetime-local` ↔ UTC. Corrección: en una plantilla `sql` de Drizzle las columnas no se califican, la subconsulta de conteo usa identificadores completos. 8 unitarias, 2 de integración y 1 e2e nuevas (edición con portada y organizadores creada desde el admin anidado; la imagen carga en el navegador a través del 302, lo que prueba la CSP); `check` y e2e (13) en verde |
| 2026-09-03 | 1 | F1-T5 listo: `scripts/og-fonts.py` (fonttools desde los WOFF2 del repo) genera Sofia Sans Extra Condensed 900 y Plus Jakarta Sans 600 en TTF subseteadas a latín (38 y 24 KB); `CartelOG` con estilos en línea, paleta por variante, rotación determinista por identificador e isotipo como silueta tenue; `opengraph-image` en inicio, cartelera y cada anuncio, eventos y cada evento y edición, comités y cada comité, y `/[slug]` para las páginas fijas (los que leen la base con `force-dynamic`; Next 16 les agrega un hash al nombre); layout raíz con `generateMetadata` (`metadataBase` desde `APP_URL`, Open Graph del sitio, `noindex` salvo `PUBLIC_INDEXING`); `paginaMetadata` con canonical y Open Graph completo en cada página pública; `robots.txt` cerrado salvo indexación y `sitemap.xml` con lo publicado, ambos dinámicos; `x-robots-tag` en el proxy; `PUBLIC_INDEXING` en `env`. 2 e2e nuevas (canonical, `og:image` que responde PNG en ocho rutas, JSON-LD, robots, sitemap); `check` y e2e (15) en verde |
| 2026-09-03 | 1 | F1-T6 listo y **fase 1 lista en local**: lista de revisión de marca (07-marca §11) aplicada a las nueve pantallas públicas en 375, 768 y escritorio, claro y oscuro; corrección hallada en la revisión: dentro de un `Cartel` (que no cambia con el tema) los enlaces y el botón secundario usan la tinta del cartel, no la del tema (en oscuro quedaban paper sobre paper). Entregables de la fase marcados, "listo cuando" cumplido en local, README actualizado. Queda Railway (fase 0 B) y el contenido real de la OE (11-contenido-pendiente) |
| 2026-09-03 | 2 | Arranca la fase 2 con su plan aprobado: ADR-034 (módulo `crm`; efectos cruzados por outbox con varios handlers por evento; `sessionsRevokedAt` corta el acceso sin ciclo entre `people` e `identity`; roster en CSV o XLSX con vista previa en `ImportJob`, step-up al confirmar y semestres faltantes creados con fechas convencionales; Persona 360 a medida; salida, reactivación y anonimización; foto propia por presign; normativa con artículos en Postgres y PDF por enlace prefirmado; carnet con HMAC; galería de egresados; mis datos y eliminación por tarea; migración en seco de roster, comités y permisos). Cuatro decisiones cerradas por Mateo (lector por artículos, extractor nuevo, semestres viejos, Excel). Modelo, mapa, roster, acceso, migración, CRM, arquitectura, verificación, contenido pendiente y glosario actualizados; textos T-370 a T-418, T-420 a T-515 y T-223 inventariados. F2-T0 listo |
| 2026-09-03 | 2 | F2-T1 listo: migración `0004_personas_y_mi_oe` (consentimientos, cargos de junta y de GH, condición del término, `crm` con interacciones, tareas, etiquetas, segmentos y onboarding, documentos y artículos con `tsvector`, importaciones, columnas de persona y `legacyId`; `onboarding.steps` y `privacy.deletionDays` sembrados); dominio de `people` (alta manual, edición, cambio de estado, baja con consentimientos y depuración, reactivación, anonimización que también limpia la auditoría, comités del término con tope y un General, cargos, consentimientos por filas); `sessionsRevokedAt` en `resolveActor`; registro del outbox con varios handlers por evento y eventos sin suscriptor dados por procesados; `identity` borra sesiones y revoca permisos por outbox (salvo el último ADMIN) y emite `permission.*`; `participation` con término actual, término por código, todos los términos y fechas convencionales; kit con filtros asíncronos; `/admin/personas` (listado, filtros por etapa, estado y comité, alta manual, export con step-up), Persona 360 con cabecera, pestañas y paneles (editar, cambiar estado, dar de baja, reactivar, anonimizar con step-up, comités del término, cargos con permiso Junta opcional, consentimientos por admin) y `/admin/cargos`; la paleta abre la 360; seed con egresados de varios años, consentimientos y cargos; fábricas de prueba; el `truncateAll` de integración restaura `app_config` (el `cascade` lo arrastraba) y el esquema de prueba se recrea en cada corrida. Corrección de marca: el botón cálido dentro de un cartel navy quedaba paper sobre naranja (contraste 2,2). 6 pruebas de integración y 2 e2e nuevas; `check` y e2e (17) en verde |
| 2026-09-03 | 2 | F2-T2 listo: módulo `crm` con la línea de tiempo alimentada por el outbox (`crm.timeline` traduce doce eventos con los textos de T-458, idempotente por la fila del outbox; los eventos llevan `actorId`), notas editables solo por su autor, tareas con responsable, vencimiento y filtro "mías", borrado de tareas al salir y de notas al anonimizar; etiquetas y segmentos en `people` (el listado de personas los filtra; el export de un segmento pasa por `/api/export/personas?segmento=` con step-up); kit con `actor` en `list` y filtros asíncronos; Persona 360 con Línea de tiempo (filtros por tipo y compositor de nota), Tareas, Resumen (último contacto y tareas abiertas), etiquetas en la cabecera y paneles de nota, tarea y etiquetas; `/admin/tareas`, `/admin/segmentos`, `/admin/etiquetas`; textos T-516 y T-517. 3 pruebas de integración, 3 unitarias y 2 e2e nuevas; `check` y e2e (18) en verde |
| 2026-09-03 | 2 | F2-T3 listo: asistente de importación del roster en tres pasos (`/admin/personas/importar`): el archivo (CSV con lector propio RFC 4180 o XLSX con `exceljs`, menos de 5 MB) llega por `POST /api/admin/importaciones/roster`, se guarda original en el bucket privado (`imports/AAAA/MM/`), se mapea por cabeceras tolerantes (corregibles a mano), se valida fila por fila con los textos de T-165 y T-483 (correo repetido o fuera del dominio, sigla inexistente con sugerencia por similitud, tope de 3, semestre inválido, estado, cargo desconocido o sin comité, dos Generales, columnas obligatorias) y se compara con la base (nuevas, con cambios, sin cambios, con errores); la vista previa vive en un `ImportJob`; aplicar exige step-up, relee el archivo, crea los semestres faltantes con fechas por semestre calendario y los cargos nuevos, crea o actualiza personas y membresías (estados por comando: licencia, honorario, baja por `Retirado`, reactivación), condición de prueba, comités del término con cargo (sin columna `CARGO` conserva los cargos; con `CORREO` y `CARGO` los completa) y consentimiento `MEMBERSHIP/IMPORT`, y emite `person.imported` (línea de tiempo); los permisos de líder aceptados se otorgan después del commit y quedan en el resumen; `/admin/sistema/importaciones`. 4 unitarias, 3 de integración y 1 e2e nuevas (el "listo cuando": un miembro importado entra por OTP y ve su ficha); `check` y e2e (19) en verde |
| 2026-09-03 | 2 | F2-T4 listo: galería de egresados (`/app/egresados`): un cartel por año de salida (rotación `feedVariant`) con los nombres, y tarjetas con foto (solo con consentimiento de directorio), comités con el cargo más alto, cargos de junta y años en la OE; entran solo egresados con consentimiento MEMORIAL vivo y sin anonimizar. Migración en seco desde GHPOINTS (`npm run migrate:ghpoints` y `npm run migrate:verify`; `GHPOINTS_DATABASE_URL` solo para scripts, sesión de solo lectura): `Season → term` por código, `Committee → committee` por sigla con `legacyId`, `Member → person + membership` (nombre partido por heurística, primer término por el `joinedAt` más viejo), `MemberCommittee → committee_membership` por cada término que solapa, `MemberRole → permission` (más General en el término actual si el comité no tiene otro) e `ImportJob` tipo GHPOINTS; idempotente por `legacyId`. Ensayo contra `ghpoints-db-1` sobre la base local reseteada (con seed): 63 personas, 63 membresías, 85 pertenencias y 8 permisos; 0 términos y 0 comités nuevos porque el seed ya los tenía; 5 líderes quedaron como Miembro con aviso porque el seed sintético ya tenía General en esos comités; `verify` en cero diferencias, segunda corrida sin cambios y base local reseteada después. 2 de integración y 1 e2e nuevas; `check` y e2e (20) en verde |
| 2026-09-03 | 2 | F2-T5 listo: Mi OE. Inicio con saludo, onboarding para quien entró este término (pasos de `onboarding.steps`, marcar hecho a mano), tus comités con el cargo, agenda con las ediciones publicadas para el público o solo para miembros y cartelera con audiencia de miembros. Directorio (`/app/personas`) con búsqueda por nombre, filtro por comité y paginación: nombre, foto solo con consentimiento de directorio (o iniciales), estado, comités del término con el cargo ("General de A3") y cargos de junta; nunca correos. Comités internos (`/app/comites` y `[slug]`): los propios y los demás, presentación, contacto y el roster del semestre con la dirección primero. Ajustes (`/app/ajustes`) en una sola página con las secciones de T-133: foto propia por presign con `purpose: "photo"` (privada, hasta 5 MB, bajo `photos/<personId>/`, solo la fija quien la subió), celular y correo personal (el institucional no se toca), notificaciones (fase 6), sesiones, consentimientos por propósito con la versión de la política, y "mis datos y privacidad": descarga en JSON por `GET /api/mis-datos` (auditada como `export.self` y en la línea de tiempo) y solicitud de eliminación con confirmación, que estampa `deletionRequestedAt` y abre por outbox una tarea `DELETION_REQUEST` sin asignar con vencimiento a `privacy.deletionDays` días hábiles. Segunda identidad e2e (`prueba.miembro@eafit.edu.co`, sin permisos) con su propio `storageState`. 1 de integración (4 casos) y 1 e2e (4 casos) nuevas; `check` y e2e (25) en verde |
| 2026-09-03 | 2 | F2-T6 listo: normativa y carnet. Documentos (`/admin/documentos`): el PDF firmado sube directo al bucket privado con un POST prefirmado propio (`/api/documentos/presign` y `/confirm`: HEAD, cabecera `%PDF-`, 1 KB a 20 MB, sha256) como `documents/<id>.pdf`, sin pasar por `media_asset`; los artículos entran por el JSON del extractor (`scripts/normativa-extract.py` con pdfplumber vía `uv run`, formato `oe-normativa/1`, revisable a mano) y se reemplazan en una sola transacción; publicar y despublicar. Lector en Mi OE (`/app/normativa` y `[id]`): documentos publicados, buscador en español sobre los artículos (`websearch_to_tsquery` + `ts_headline` con resaltado sin HTML crudo), índice por capítulo, artículos con ancla y "Abrir el PDF original" por `GET /api/documentos/[id]/pdf` (302 a una URL prefirmada de 10 minutos, solo con sesión y publicado, o en borrador para ADMIN); abrir un documento marca la evidencia `NORMATIVA_READ` del onboarding con `after()`. Carnet (`/app/carnet`): token `oe1.<personId>.<vence>.<HMAC-SHA256>` firmado con `SESSION_SECRET`, 24 horas, `signCarnet`/`verifyCarnet` puros con comparación en tiempo constante; QR como SVG en servidor (`qrcode`) dentro de un cartel con nombre completo, comités con cargo y semestre. Pestañas Normativa y Carnet en Mi OE; Documentos en el admin; T-518 a T-520 en el copy. 2 unitarias, 1 de integración y 2 e2e nuevas; `check` y e2e (28) en verde |
| 2026-09-03 | 2 | F2-T7 listo y **fase 2 lista en local**: lista de revisión de marca (07-marca §11) aplicada a las pantallas de Mi OE (inicio, directorio, comités y comité, egresados, normativa y documento, carnet, ajustes) y a las del admin (Persona 360, importación del roster, documentos) en 375, 768 y escritorio, claro y oscuro; dos correcciones: la navegación de Mi OE envuelve en 375 (Normativa, Carnet y Ajustes quedaban fuera de pantalla) y el destello del cartel de egresados pisaba el título. Entregables de la fase marcados, "listo cuando" cumplido en local, README actualizado; `check` (53 unitarias, 60 de integración) y e2e (28) en verde. Queda Railway (fase 0 B), el contenido real de la OE (11-contenido-pendiente: los PDF firmados de estatutos y reglamento con su JSON revisado, y la política de datos) y el resto de la migración en la fase 3 |
| 2026-09-03 | 3 | Arranca la fase 3 con su plan aprobado: ADR-035 (módulo `terms` propio para que `participation` importe `people` sin ciclo; check-in sin locks compartidos con el crédito en la misma transacción y el score por outbox con clave por ocasión; transiciones del check-in con reaprobación y anulación terminal; código rotativo TOTP de 6 dígitos; modo anfitrión con cámara; el líder abre solo ocasiones sin puntos y crea series semanales; rankings top 10 con puesto propio; requisito de asambleas derivado del término; cierre con `TermStanding`; cierre automático de ocasiones; alias legados; exportes CSV; migración de participación), con enmiendas a ADR-006, 009, 024 y 034. Modelo, arquitectura, acceso, mapa, migración, verificación, glosario y contenido pendiente actualizados; textos T-521 a T-674 inventariados. F3-T0 listo |
