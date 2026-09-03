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

- [ ] Repositorio `LaOE` en GitHub (remoto de este repo, privado) con protección de `main` y CI en verde
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
- [ ] Textos del portal tomados de `14-copy-y-textos.md` (T-001 a T-033), sin copy inventado en el código

Listo cuando: contenido real de la OE publicable sin tocar código; nada personal en público; una portada de 5 MB sube directo al bucket y se sirve por redirección prefirmada.

## Fase 2 · Personas y Mi OE · `pendiente`

- [ ] Modelo de personas, membresías, comités por término, cargos, consentimientos
- [ ] Asistente de importación del roster (CSV o Excel) con el formato de `13-importacion-del-roster.md`: mapeo de columnas, validación por fila, vista previa con diff, modo actualización por correo con subconjunto de columnas, consentimiento, auditoría, archivo original en el bucket
- [ ] Catálogo de cargos de comité (General, Financiero, Publicidad, Relaciones Públicas, Logística, Gestión Humana, Miembro) y propuesta de permiso de líder para cada General
- [ ] Migración en seco de roster, comités y permisos desde un dump de GHPOINTS
- [ ] Persona 360 con todas las pestañas
- [ ] Interacciones automáticas, notas, tareas, etiquetas, segmentos
- [ ] Mi OE: inicio, directorio, comités internos, ajustes (sesiones, datos, consentimientos)
- [ ] Ajustes: la persona edita foto, celular y correo personal con consentimiento por propósito; cada cambio se audita y queda en la línea de tiempo
- [ ] Onboarding de nuevos: lista de pasos de la primera semana (normativa, comité, primera integración, activar push) en el inicio de Mi OE; los pasos con hecho registrado se marcan solos; se liga a los criterios de nuevos en la fase 4
- [ ] Normativa: documentos en el bucket privado con lector y búsqueda
- [ ] Carnet digital con QR firmado
- [ ] Exportar mis datos y solicitud de eliminación
- [ ] Comando de salida con motivo (graduación, retiro, permanencia) y consentimientos de galería y de contacto; depuración de lo que no es historia
- [ ] Galería de egresados por año en Mi OE (`/app/egresados`), con cartel por año
- [ ] Correo personal opcional con consentimiento, capturado al dar de baja

Listo cuando: un admin encuentra a cualquier persona en 2 segundos y ve toda su historia; un miembro importado entra por OTP y ve su ficha.

## Fase 3 · Participación y GH Points · `pendiente`

- [ ] Términos con derivación por fecha y recordatorio de creación
- [ ] Ocasiones: ciclo de vida, consola con QR, código rotativo, contador en vivo, aprobaciones
- [ ] Check-in propio en `/a/[publicId]` y modo anfitrión
- [ ] Ledger con crédito automático, ajustes y reversiones
- [ ] Rankings nuevos, veteranos y comités
- [ ] Score de comité por outbox con `dedupeKey`, tasa cruda y suavizada
- [ ] Asambleas ordinarias, elección de junta y segunda vuelta con requisitos por término y cumplimiento por persona
- [ ] Cierre de término y `TermStanding`
- [ ] Vista de líder: roster sin correos, score, proponer ocasiones
- [ ] Exportes CSV/XLSX con step-up
- [ ] Migración de asistencias, ledger y asambleas con `verify-migration` en cero
- [ ] Alias legados para QR impresos

Listo cuando: 500 escaneos concurrentes sin duplicados ni recomputes repetidos; sumas migradas idénticas.

## Fase 4 · Permanencia · `pendiente`

- [ ] Reglas por término: editor, copia del término anterior, vista previa del impacto sobre el roster
- [ ] Tabla general y tablas por comité (editadas por su líder) con aviso frente al valor nominal y bloqueo de GH
- [ ] Resultado por comité con umbral por condición (60 / 80 / 70), periodo de prueba y transferencias internas
- [ ] Reuniones de comité como ocasiones en serie semanal sin puntos, con asistencia por modo anfitrión
- [ ] Comités de trabajo sembrados (CAP, CGH, CCM, CAE, CML, CAF, Athletic) con sus cargos de junta
- [ ] Categoría de ocasión (integración, partido del Athletic, charla, taller, social) y marca "solo nuevos"
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
