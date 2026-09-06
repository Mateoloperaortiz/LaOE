# Casa digital de la OE

Documentación de la nueva casa digital de la **Organización Estudiantil de la Universidad EAFIT (OE)**: portal público con la línea gráfica oficial, **Mi OE** para el roster, **Participación y GH Points**, y un **CRM de comunidad** para personas, admisión, egresados, aliados y contactos institucionales. Una sola aplicación destinada a [oeeafit.com](https://oeeafit.com), que empieza con datos nuevos y retira el despliegue experimental de GHPOINTS.

## Estado

**Fase 7 en curso** (6 de septiembre de 2026): [ADR-039](docs/adr/ADR-039-arranque-limpio-fase-7.md). F7-T0 a T3 están listos. El candidato `f8711a7` fue validado en staging y está desplegado en producción, con CI y smoke 6/6 en verde; producción usa todavía su dominio temporal, con `APP_URL` en oeeafit.com. El ADMIN real ya fue creado con membresía ACTIVE y auditoría, sin consentimiento ni comités; la reejecución fue idempotente. Mateo recibió el OTP real de Resend y comprobó Mi OE y Administración. R2 y la clave age en 1Password están verificados; se restauraron la copia de staging con siete objetos y la primera copia de producción anterior al bootstrap. El respaldo posterior al ADMIN también se restauró con la cuenta, su sesión y el mensaje de acceso, sin consentimientos. La corrección del aviso desactualizado de respaldo pasó check (168 unitarias, 181 integración y build) y 78 e2e sin reintentos; su despliegue sigue pendiente. Siguen pendientes retiro del dominio temporal, iPhone, noche de jobs y cutover; DNS y GHPOINTS permanecen intactos. Evidencia y próximos pasos en el [runbook](docs/15-runbook.md).

**Fase 6 lista en local** (6 de septiembre de 2026): comunicaciones y PWA sobre las fases anteriores. Bus de notificaciones por outbox con preferencias por tipo y registro de mensajes por persona; Mi OE instalable con manifest, iconos y service worker propio solo para push; suscripciones, preferencias y calendario personal (ICS) en Ajustes; anuncios con push desde la cartelera; plantillas en Markdown y campañas por segmento en lotes por minuto con enlace de baja; recordatorios de participación y avisos de permanencia por push; encuesta anónima tras la ocasión con calificación de 1 a 5 y agregados por ocasión y comité. Verificado con push real en Chrome de escritorio con claves VAPID locales.

**Fase 5 lista en local** (5 de septiembre de 2026): admisión, aliados y contactos sobre las fases anteriores. Formularios propios con constructor (campos tipados y acciones: crear la persona como prospecto, entrar a un pipeline, inscribirse a una edición, etiquetar), envío público en `/f/[slug]` con honeypot, rate limit por IP, una respuesta por correo y consentimiento de tratamiento de datos, formularios de miembros que toman la persona de la sesión, bandeja de respuestas e inscritos por edición con exporte; "Unirse" con el botón hacia el formulario de admisión abierto y la edición con "Inscribite"; organizaciones con contactos externos, notas, tareas, etiquetas y tarjetas de patrocinio, y la paleta que las encuentra; pipelines con plantillas de admisión y patrocinio, kanban con "Mover a…" y arrastrar nativo, tarjeta por outbox desde la respuesta y "Dar de alta" desde la tarjeta o la Persona 360 (membresía, comités, consentimiento y correo de bienvenida); solicitudes desde Mi OE (licencia, retiro voluntario y cambio de comité para el semestre siguiente como transferencia) con tarea para GH, aprobación que ejecuta el comando de `people` en la misma transacción, rechazo con motivo y correo de respuesta; convocatorias internas a grupos de trabajo con cupo, ventana y selección por orden de llegada o manual, cuya inscripción aceptada entra al grupo por outbox; y el inicio del admin como tablero de pendientes. Las reglas de la fase viven en [ADR-037](docs/adr/ADR-037-admision-aliados-y-contactos-fase-5.md).

**Fase 4 lista en local** (5 de septiembre de 2026): permanencia sobre las fases anteriores. Reglas como datos por término (tabla general y una por comité, con sumas frente al nominal, bloqueo y comentario de GH, copia del término anterior, tabla de referencia y vista previa del impacto); cálculo por outbox con snapshot por persona y término, umbral por condición (activo, nuevo, prueba, transferencia), "lo que aún es posible" y estados en camino, en riesgo y no alcanza; grupos de trabajo (comités de trabajo sembrados por cargo de junta, GT, GAP, GAP OE, barra brava y tareas de nuevos) con líderes y evaluadores que entran al admin por esas filas, alta por nombre e importación CSV; evaluaciones con ventana, puntajes del líder con observación, créditos manuales y destacado del mes con anuncio del comité e insignia; Mi OE con `/app/permanencia`, barra y avisos en el inicio; cumplimiento con filtros y exporte; cierre con propuestas derivadas, confirmación por persona o en bloque y aplicación por job reanudable (baja, prueba, salida del comité); panel de la junta con agregados sin nombres. Las reglas de la fase viven en [ADR-036](docs/adr/ADR-036-permanencia-fase-4.md).

**Fase 3 lista en local** (4 de septiembre de 2026): participación y GH Points sobre las fases anteriores. Ocasiones con QR, código rotativo de seis dígitos, contador en vivo, aprobaciones, cancelación con reversión y cierre automático; check-in propio en `/a/[publicId]` (sin sesión pide entrar y vuelve) y modo anfitrión con búsqueda por nombre y lectura del carnet con la cámara; ledger append-only con crédito en la misma transacción, ajustes y reversiones; rankings de nuevos, veteranos y comités (top 10 con nombres más el puesto propio); score de comité recalculado por outbox con clave por ocasión; asambleas con requisito derivado del término y ajustes; cierre de puntos con `TermStanding`; vista de líder con serie semanal de reuniones; exportes CSV con step-up; alias para los QR impresos de GHPOINTS; y la migración completa (asistencias, ledger, asambleas, requisitos, standing y alias) con `migrate:verify` en cero sobre la copia local. Las reglas de la fase viven en [ADR-035](docs/adr/ADR-035-participacion-y-gh-points-fase-3.md).

**Fase 2 lista en local** (3 de septiembre de 2026): personas y Mi OE sobre la fase 1. En el admin: importación del roster (CSV o XLSX) en tres pasos con vista previa y step-up, Persona 360 con línea de tiempo, notas, tareas, etiquetas y segmentos, cargos de junta y de comité, consentimientos por propósito, comando de salida y anonimización a pedido, documentos de normativa (PDF en el bucket y artículos buscables) y ensayo de migración desde GHPOINTS (`npm run migrate:ghpoints` y `migrate:verify`, en cero diferencias sobre la copia local). En Mi OE: inicio con onboarding, agenda y cartelera de miembros, directorio sin correos, comités internos, galería de egresados, normativa con buscador, carnet con QR firmado y ajustes (foto, contacto, sesiones, consentimientos, descarga de mis datos y solicitud de eliminación). La fase 1 dejó el portal público editable (páginas, cartelera, macroeventos, comités, medios, OG, SEO, ICS) y la fase 0 el código base (scaffold, datos, marca, acceso por OTP, outbox, admin kit y seed sintético). El seguimiento vive en el [roadmap](docs/09-roadmap.md); las reglas de la fase 2 en [ADR-034](docs/adr/ADR-034-personas-y-mi-oe-fase-2.md) y las de la fase 1 en [ADR-033](docs/adr/ADR-033-contenido-y-medios-fase-1.md). El repositorio vive en [github.com/Mateoloperaortiz/LaOE](https://github.com/Mateoloperaortiz/LaOE) (privado) con CI en cada push. La parte B de la fase 0 quedó comprobada con staging, R2 y las copias externas restauradas; queda completar el contenido real que debe aportar la OE ([11-contenido-pendiente.md](docs/11-contenido-pendiente.md)).

Versión de la documentación: 6 de septiembre de 2026.

## Un solo lugar

Una app, una base de datos, un bucket, un admin y un proveedor de correo. Todo lo que hoy vive disperso (Excel del roster, Microsoft Forms, la app de GH Points, tres formas de iniciar sesión, enlaces sueltos) entra en un mismo producto. El detalle está en [docs/00-vision.md](docs/00-vision.md).

## Cómo correr en local

Requisitos: Node 24 (`.node-version`), npm 11 y [OrbStack](https://orbstack.dev) (provee `docker` y `docker compose`).

```bash
cp .env.example .env        # valores locales; SESSION_SECRET real con: openssl rand -hex 32
npm install                 # instala dependencias y los hooks de git (lefthook)
npm run db:up               # Postgres 18 en 127.0.0.1:5433 y Garage (bucket S3) en 127.0.0.1:3900
npm run storage:init        # crea el bucket `media` si falta y aplica su CORS
npm run db:reset            # esquema desde cero + datos sintéticos
npm run dev                 # http://localhost:3000 · salud en /api/health
```

Las pruebas de integración usan una base aparte (`casa_digital_test`, creada y migrada sola); las e2e (`npm run test:e2e`) corren contra el dev server y su base. `npm run check` corre todo lo que corre el CI: Biome, dependency-cruiser, knip, `tsc`, pruebas unitarias, pruebas de integración contra la base local y `next build`. Cómo se prueba cada capa: [docs/10-verificacion.md](docs/10-verificacion.md).

## Cómo leer la documentación

| Archivo | Para qué |
| --- | --- |
| [00-vision.md](docs/00-vision.md) | Contexto, decisiones cerradas, alcance y lo que queda fuera |
| [01-arquitectura.md](docs/01-arquitectura.md) | Monolito modular en Railway (web con worker en proceso, Postgres, bucket), módulos, jobs, layout del código, costo |
| [02-crm.md](docs/02-crm.md) | El CRM de comunidad: persona, etapas, Persona 360, pipelines, privacidad |
| [03-modelo-de-datos.md](docs/03-modelo-de-datos.md) | Modelos, relaciones y restricciones |
| [04-decisiones.md](docs/04-decisiones.md) y [adr/](docs/adr/README.md) | Las reglas del sistema, una ADR por archivo |
| [05-acceso.md](docs/05-acceso.md) | Quién entra y cómo |
| [06-mapa-del-sitio.md](docs/06-mapa-del-sitio.md) | Rutas del portal, Mi OE y administración |
| [07-marca.md](docs/07-marca.md) | Tokens de la línea gráfica y reglas de uso |
| [08-migracion-ghpoints.md](docs/08-migracion-ghpoints.md) | Referencia histórica de los migradores; no se ejecutan para el lanzamiento |
| [09-roadmap.md](docs/09-roadmap.md) | Fases con checklists: **aquí se hace el seguimiento** |
| [10-verificacion.md](docs/10-verificacion.md) | Cómo se prueba cada capa |
| [11-contenido-pendiente.md](docs/11-contenido-pendiente.md) | Lo que la OE debe aportar |
| [12-permanencia.md](docs/12-permanencia.md) | La tabla de permanencia de GH como tablero: reglas por término, grupos de trabajo, evaluaciones y progreso del miembro |
| [13-importacion-del-roster.md](docs/13-importacion-del-roster.md) | Formato del archivo del roster, validaciones y qué hace la importación |
| [14-copy-y-textos.md](docs/14-copy-y-textos.md) | Todos los textos de la app con propuesta, dueño y estado, para que GH, comunicaciones y los comités pongan los suyos |
| [15-runbook.md](docs/15-runbook.md) | Despliegue, bootstrap, respaldo, restauración, dominio y retiro con evidencia |
| [decisiones-abiertas.md](docs/decisiones-abiertas.md) | Preguntas sin cerrar |
| [glosario.md](docs/glosario.md) | Términos de la interfaz y del código |

## Relación con GHPOINTS

GHPOINTS (repositorio hermano, `../GHPOINTS`) fue experimental y no se usó en producción para la OE. La decisión vigente es empezar de cero: sus datos y QR no se migran. Tras verificar la app nueva y el respaldo recuperable se elimina el proyecto, se revocan sus integraciones y se archiva el repositorio. El archivo cifrado se conserva durante 90 días contados desde la eliminación verificada del proyecto GHPOINTS. Ver [ADR-039](docs/adr/ADR-039-arranque-limpio-fase-7.md) y [15-runbook.md](docs/15-runbook.md).

## Cómo se hace seguimiento

1. Cada entregable de una fase es una casilla en [09-roadmap.md](docs/09-roadmap.md); se marca cuando cumple su criterio de "listo cuando" y se anota en el registro de avances del mismo archivo.
2. Toda regla nueva o cambiada es una ADR en [docs/adr/](docs/adr/README.md); una regla vieja no se edita, se reemplaza por otra que la referencia.
3. Lo que no está decidido vive en [decisiones-abiertas.md](docs/decisiones-abiertas.md) hasta que se cierra con fecha y pasa a [00-vision.md](docs/00-vision.md) o a una ADR.
4. Los avances quedan en el historial de git de este repositorio.
