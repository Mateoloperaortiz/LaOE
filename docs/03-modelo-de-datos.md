# Modelo de datos

PostgreSQL en Railway, Drizzle con el esquema de cada módulo en `src/modules/<módulo>/schema.ts` ([ADR-032](adr/ADR-032-drizzle-y-esquema-por-modulo.md)). En SQL las tablas y columnas van en `snake_case` (`point_entry.check_in_id`) y en el código en `camelCase`; esta página usa los nombres del código. Convenciones: ids `cuid2`; identificadores públicos `nanoid` solo donde se exponen en URL o QR; timestamps `timestamptz` en UTC; fechas de término como `date`; JSON parseado con Zod en la frontera de lectura; sin borrado físico de personas (anonimización).

## Diagrama

```mermaid
erDiagram
  Person ||--o| Membership : "ciclo de vida"
  Person ||--o{ CommitteeMembership : "por termino"
  Committee ||--o{ CommitteeMembership : ""
  Term ||--o{ CommitteeMembership : ""
  Person ||--o{ Appointment : "cargos"
  Person ||--o{ Permission : "permisos"
  Person ||--o{ Interaction : "linea de tiempo"
  Person ||--o{ Consent : ""
  Person ||--o{ Task : ""
  Person ||--o{ OnboardingProgress : ""
  Document ||--o{ DocumentArticle : ""
  Organization ||--o{ OrganizationContact : ""
  Person ||--o{ OrganizationContact : ""
  Pipeline ||--o{ PipelineStage : ""
  Pipeline ||--o{ Card : ""
  Person ||--o{ Card : "postulacion"
  Organization ||--o{ Card : "patrocinio"
  Form ||--o{ Submission : ""
  Person ||--o{ Submission : ""
  EventEdition ||--o{ EditionRegistration : ""
  Event ||--o{ EventEdition : ""
  EventEdition ||--o{ Occasion : "sesiones"
  Term ||--o{ Occasion : ""
  Occasion ||--o{ CheckIn : ""
  Person ||--o{ CheckIn : ""
  CheckIn ||--o| PointEntry : "credito"
  Term ||--o{ PointEntry : "ledger"
  Occasion ||--o{ CommitteeParticipation : "score"
  Term ||--o| TermStanding : "cierre"
  Term ||--o{ AssemblyRequirement : "ajustes"
  Person ||--o{ AssemblyRequirement : ""
  Campaign ||--o{ Message : ""
  Person ||--o{ Message : ""
  Person ||--o{ Session : ""
  Term ||--o{ PermanenceRule : "criterios"
  Term ||--o{ WorkGroup : ""
  WorkGroup ||--o{ WorkGroupMembership : ""
  Person ||--o{ WorkGroupMembership : "evaluacion"
  Person ||--o{ PermanenceSnapshot : "permanencia"
  Person ||--o{ PermanenceDecision : "cierre"
  Person ||--o{ LeaderScore : ""
  Person ||--o{ Recognition : ""
```

## Modelos por módulo

### identity

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `Session` | `personId`, `tokenHash` único, `expiresAt`, `userAgent`, `ip`, `lastSeenAt` | 90 días, renovable; se destruye al cambiar estado o correo |
| `OtpChallenge` | `email`, `codeHash`, `expiresAt`, `attempts`, `maxAttempts`, `consumedAt`, `ip` | 10 minutos, 5 intentos; rate limit contando filas |
| `Permission` | `personId`, `code` (`ADMIN`, `COMMITTEE_LEADER`, `BOARD`), `committeeId?`, `grantedById` | Unique parcial por (persona, código, comité); `BOARD` se otorga con los cargos de junta y da acceso al panel de la junta |

### people

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `Person` | `email` único en minúsculas, `kind` (`STUDENT`, `EXTERNAL`), `stage`, `firstName`, `lastName`, `fullName` (compuesto), `preferredName?`, `phone?`, `personalEmail?`, `program?`, `photoAssetId?`, `source`, `sessionsRevokedAt?`, `deletionRequestedAt?`, `anonymizedAt?`, `legacyId?` | Búsqueda con `pg_trgm` sobre nombre y correo; `personalEmail` es contacto (egresados y externos), nunca identidad de acceso; `photoAssetId` apunta a un `MediaAsset` y lo valida el dominio (sin clave foránea: la habría entre `people` y `content` en ciclo); `sessionsRevokedAt` invalida las sesiones anteriores al cambiar estado o correo ([ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md)); `deletionRequestedAt` y `anonymizedAt` registran la eliminación a pedido; `legacyId` es el id de `Member` en GHPOINTS |
| `Membership` | `personId` único, `status` (`ACTIVE`, `ON_LEAVE`, `HONORARY`, `INACTIVE`), `firstTermId`, `lastTermId?`, `endedAt?`, `endReason?` (`GRADUATION`, `RESIGNATION`, `PERMANENCE`, `OTHER`) | Una por persona; al terminar, el perfil pasa a egresado y se depura lo que no es historia ([ADR-030](adr/ADR-030-perfil-de-egresado.md)) |
| `MembershipEvent` | `membershipId`, `from`, `to`, `reason`, `actorId`, `at` | Historial de estados |
| `Committee` | `slug` único, `name`, `status`, `color`, `logoKey`, `presentation`, `contactUrl`, `publicationStatus`, `legacyId?` | Los 27 logos viven en `public/logos/committees`; `legacyId` es el id en GHPOINTS |
| `CommitteeMembership` | `personId`, `committeeId`, `termId`, `roleCode` (`MIEMBRO` por defecto), `transferredIn`, `joinedAt?`, `leftAt?` | Unique por (persona, comité, término); 1 a 3 activas para activos; `transferredIn` marca una transferencia interna (umbral 70 % en ese comité); un solo `GENERAL` por comité y término |
| `CommitteeRole` | `code` único, `label`, `isLeadership`, `order` | Catálogo: `GENERAL` (líder), `FINANCIERO`, `PUBLICIDAD`, `RELACIONES_PUBLICAS`, `LOGISTICA`, `GESTION_HUMANA` (GH confirmó que son esos seis) más `MIEMBRO` por defecto; sigue siendo editable por si aparece otro |
| `MembershipTerm` | `personId`, `termId`, `probation`, `reason?`, `decidedById?` | Condición de la persona en el término: periodo de prueba (umbral 80 %) decidido en el cierre anterior |
| `Appointment` | `personId`, `kind` (`PRESIDENT`, `VP_GH`, `VP_PUBLIC_RELATIONS`, `VP_ADMIN`, `VP_FINANCE`, `GH_HEAD`, `GH_DIRECTOR`, `OTHER`), `committeeId?`, `termId`, `title?` | Cargo de junta o de GH, visible y con historia; el líder de comité no es un `Appointment` sino `CommitteeMembership.roleCode = GENERAL` ([ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md)); los cargos de junta lideran los comités de trabajo y los de GH evalúan grupos |
| `Consent` | `personId`, `purpose` (`MEMBERSHIP`, `COMMUNICATIONS`, `DIRECTORY_PHOTO`, `MEMORIAL`), `policyVersion`, `acceptedAt`, `source` (`FORM`, `IMPORT`, `ADMIN`, `SELF`), `ip?`, `revokedAt?` | Una fila por aceptación; revocar estampa `revokedAt`; un solo consentimiento vivo por persona y propósito; `MEMORIAL` habilita la galería de egresados |

### crm

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `Organization` | `name`, `kind`, `website?`, `notes?` | |
| `OrganizationContact` | `organizationId`, `personId`, `role`, `isPrimary` | Unique por (organización, persona) |
| `Pipeline` | `name`, `kind` (`ADMISSION`, `SPONSORSHIP`, `CUSTOM`), `isArchived` | |
| `PipelineStage` | `pipelineId`, `name`, `order`, `isWon`, `isLost` | |
| `Card` | `pipelineId`, `stageId`, `personId?`, `organizationId?`, `editionId?`, `ownerId?`, `title`, `fields` JSON, `amount?`, `dueAt?`, `enteredStageAt`, `closedAt?` | Exactamente uno de `personId` u `organizationId` |
| `Interaction` | `personId`, `organizationId?` (fase 5), `kind`, `occurredAt`, `actorId?`, `refType?`, `refId?`, `summary`, `body?`, `metadata` JSON, `editedAt?` | Automáticas inmutables, escritas por el handler `crm.timeline` a partir de los eventos del outbox con `refType = 'outbox'` y `refId` único (idempotencia); notas (`kind = NOTE`) editables por su autor |
| `Task` | `title`, `kind` (`GENERAL`, `DELETION_REQUEST`), `assigneeId?`, `dueAt?`, `status` (`OPEN`, `DONE`), `personId?`, `organizationId?` y `cardId?` (fase 5), `createdById`, `completedAt?`, `completedById?` | Una tarea sin responsable la ven todos los ADMIN; la solicitud de eliminación es una tarea con vencimiento a `privacy.deletionDays` días hábiles |
| `Tag` / `PersonTag` / `OrganizationTag` | `name` único (sin distinguir mayúsculas) | Las tablas `tag`, `person_tag` y `segment` viven en el esquema de `people`, porque el listado y los exportes de personas las necesitan y `people` no depende de `crm` ([ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md)); `OrganizationTag` llega en la fase 5 |
| `Segment` | `name`, `filter` JSON (etapas, estados, ingreso, comités, cargos, etiquetas, consentimiento, programa), `createdById` | El filtro se valida con Zod al leer y se evalúa en SQL sobre el término actual; el export de sus personas pasa por `/api/export/personas?segmento=` con step-up |
| `Request` | `personId`, `kind` (`LEAVE`, `RESIGNATION`, `COMMITTEE_CHANGE`, `TRANSFER`), `payload` JSON, `status` (`PENDING`, `APPROVED`, `REJECTED`, `WITHDRAWN`), `taskId`, `decidedById?`, `decidedAt?`, `reason?` | Aprobar ejecuta el comando de dominio correspondiente; nada cambia antes |
| `InternalCall` | `termId`, `groupId`, `formId`, `opensAt`, `closesAt`, `capacity?`, `selection` (`FIRST_COME`, `MANUAL`), `status` | La inscripción aceptada crea `WorkGroupMembership` |
| `OnboardingProgress` | `personId`, `termId`, `stepKey`, `doneAt?`, `source` (`AUTO`, `MANUAL`) | Unique por (persona, término, paso); los pasos viven en `AppConfig` (`onboarding.steps`, con la evidencia automática de cada uno); visible mientras la persona sea nueva |
| `Recognition` | `personId`, `kind` (`MEMBER_OF_MONTH`, `OTHER`), `committeeId?`, `termId`, `month?`, `title`, `announcementId?`, `grantedById` | Lo otorga el líder desde su tabla de permanencia o ADMIN; con consentimiento de directorio crea y publica en la misma transacción un anuncio de miembros con `committeeId` (cartelera del comité) e insignia en las tarjetas; sin consentimiento queda registrado sin publicarse; unique parcial por (término, comité, mes) para el destacado del mes ([ADR-036](adr/ADR-036-permanencia-fase-4.md)) |

### forms

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `Form` | `slug` único, `title`, `description`, `fields` JSON, `audience` (`PUBLIC`, `MEMBERS`), `opensAt?`, `closesAt?`, `maxSubmissions?`, `consentRequired`, `actions` JSON | Acciones: `createProspect`, `pipelineId`, `editionId`, `tags` |
| `Submission` | `formId`, `personId?`, `email`, `answers` JSON, `consentAcceptedAt?`, `ip`, `userAgent` | Vincula persona por correo normalizado |
| `EditionRegistration` | `editionId`, `personId`, `status`, `submissionId?` | Unique por (edición, persona) |

### events

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `Event` | `slug` único, `name`, `summary`, `description` Markdown, `audience`, `publicationStatus`, `coverAssetId?`, `sortOrder` | Identidad permanente; los cuatro macroeventos nacen publicados y sin ediciones en la migración `0003` ([ADR-033](adr/ADR-033-contenido-y-medios-fase-1.md)); `sortOrder` fija su orden en el inicio |
| `EventEdition` | `eventId`, `slug`, `name`, `description` Markdown, `startsAt`, `endsAt?`, `location`, `registrationUrl?`, `publicationStatus`, `coverAssetId?` | Unique por (evento, slug); `endsAt` posterior a `startsAt`; `registrationFormId` llega con los formularios (fase 5) |
| `EditionCommittee` | `editionId`, `committeeId` | Organizadores; unique por par |

### terms

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `Term` | `code` único (`2026-2`), `semester` (1 o 2, derivado del código), `startsOn`, `endsOn`, `pointsClosedAt?`, `permanenceClosedAt?`, `requiredOrdinaryAssemblies`, `permanenceGeneralNominal` (50), `permanenceCommitteeNominal` (60) | Módulo propio sin dependencias, para que `people`, `crm` y `participation` lo importen sin ciclos ([ADR-035](adr/ADR-035-participacion-y-gh-points-fase-3.md)). El actual se deriva de la fecha; en los términos de segundo semestre la elección de junta es obligatoria; los nominales solo sirven para avisar en el editor; `permanenceClosedAt` se estampa al aplicar el cierre de permanencia, después del de puntos ([ADR-036](adr/ADR-036-permanencia-fase-4.md)) |

### participation

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `Occasion` | `publicId` único (10 caracteres `[0-9a-z]`), `termId`, `kind` (`ACTIVITY`, `ASSEMBLY`, `EDITION_SESSION`), `assemblyKind?` (`ORDINARY`, `BOARD_ELECTION`, `RUNOFF`; solo en asambleas), `category` (`INTEGRATION`, `ATHLETIC_MATCH`, `COMMITTEE_MEETING`, `TALK`, `WORKSHOP`, `SOCIAL`, `OTHER`), `newMembersOnly`, `title`, `description` Markdown, `location`, `startsAt`, `endsAt?`, `checkInOpensAt`, `checkInClosesAt`, `points` (0 en asambleas), `approval` (`AUTO`, `MANUAL`), `requireRotatingCode` (apagado por defecto), `rotatingSecret?` (secreto por ocasión del que se deriva el código de 6 dígitos), `committeeId?`, `editionId?`, `status`, `cancelReason?`, `closedAt?`, `createdById`, `legacyId?` | `DRAFT → OPEN → CLOSED`; `CANCELLED` desde cualquiera con motivo revirtiendo los créditos vivos; fuera de `DRAFT` solo cambian título, descripción y lugar; un job cierra las abiertas 24 h después de vencida la ventana; `surveyFormId` llega con `forms` (fase 5) ([ADR-035](adr/ADR-035-participacion-y-gh-points-fase-3.md)) |
| `CheckIn` | `occasionId`, `personId`, `status` (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`), `source` (`SELF_QR`, `HOST`, `ADMIN`, `IMPORT`), `at`, `decidedById?`, `decidedAt?`, `reason?`, `legacyId?` | Unique por (ocasión, persona); `PENDING → APPROVED \| REJECTED`, `REJECTED → APPROVED`, `APPROVED → CANCELLED`; la IP queda en la auditoría, no aquí |
| `PointEntry` | `personId`, `termId`, `checkInId?`, `kind` (`CHECKIN`, `ADJUSTMENT`, `REVERSAL`, `LEGACY`), `points` (≠ 0), `reason`, `reversalOfId?` único, `createdById?`, `legacyType?`, `legacyId?` | Append-only; el `CHECKIN` nace en la misma transacción del check-in aprobado |
| `CommitteeParticipation` | `occasionId`, `committeeId`, `termId`, `eligible`, `present`, `rate`, `smoothedRate`, `frozenAt?`, `computedAt` | Unique por (ocasión, comité); cruda y suavizada con `k = 5` (ADR-024); solo comités con elegibles; `eligible` se congela al cerrar la ocasión |
| `TermStanding` | `termId` único, `topNew` JSON, `topVeteran` JSON, `topCommittees` JSON, `stats` JSON | Snapshot al cerrar puntos, con ids y nombre congelado (anonimizar lo reemplaza por T-223) |
| `AssemblyRequirement` | `termId`, `personId`, `requiredOrdinary`, `requiresBoardElection`, `requiresRunoff`, `adjustedReason`, `adjustedById?` | Unique por (término, persona); **solo se materializa para ajustes** (ADMIN con motivo): el requisito por defecto se deriva del término (una ordinaria; elección y segunda vuelta en segundo semestre); faltar a una obligatoria propone salida de la OE en el cierre |

### permanence

Módulo propio desde la fase 4 ([ADR-036](adr/ADR-036-permanencia-fase-4.md)): importa `terms`, `people`, `participation`, `system` y `events`; nadie lo importa (los efectos salen por outbox). Los pesos y valores son `numeric(6,2)`.

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `PermanenceRule` | `termId`, `scope` (`GENERAL`, `COMMITTEE`), `committeeId?`, `key`, `label`, `description`, `weight`, `appliesTo` (`ALL`, `NEW`, `VETERAN`), `computation` (`CHECKIN_COUNT`, `CHECKIN_THRESHOLD`, `CHECKIN_RATE`, `GROUP_EVALUATED`, `COMPOSITE`, `LEADER_SCORE`, `MANUAL`), `params` JSON, `sortOrder` | Unique por (término, clave) en la general y por (término, comité, clave) en las de comité; `params` se valida con un esquema Zod por `computation` (filtro de ocasiones con categoría, tipo, comité, solo nuevos, ocasiones y esperadas; por asistencia; mínimo; tipo de grupo y modo fijo, por grupo o por tramos; obligatorio); `weight` es el máximo del criterio; no se borra con puntajes o créditos |
| `PermanenceTable` | `termId`, `scope`, `committeeId?`, `lockedAt?`, `lockedById?`, `comment?`, `commentedById?`, `commentedAt?` | Bloqueo y comentario de GH por tabla; el líder no edita una tabla bloqueada, ADMIN sí; el editor avisa si la suma se aleja del nominal (50 general, 60 comité) sin bloquear |
| `LeaderScore` | `termId`, `personId`, `ruleId`, `value`, `note?`, `scoredById`, `scoredAt` | Para reglas `LEADER_SCORE`; `0 ≤ value ≤ weight`; nota obligatoria si el valor es menor al peso; escribe una interacción visible para la persona; unique por (regla, persona) |
| `WorkGroup` | `termId`, `kind` (`WORK_COMMITTEE`, `GT_MACROEVENT`, `GAP`, `GAP_OE`, `BARRA_BRAVA`, `NEW_MEMBER_TASK`), `name`, `code?` (CAP, CGH, CCM, CAE, CML, CAF, ATHLETIC), `editionId?`, `eventId?`, `leaderPersonId?`, `createdById?` | Los comités de trabajo son grupos, no `Committee`, y se siembran por término con líder por cargo de junta; el líder lo opera y los evaluadores evalúan al cerrar el semestre; unique parcial por (término, código) |
| `WorkGroupEvaluator` | `groupId`, `personId` | Director de GH del frente; GH principal para tareas de nuevos; capitán y DT para el Athletic; GH de turno para la barra brava; unique por par; da acceso a la bandeja de evaluaciones sin permiso técnico |
| `WorkGroupMembership` | `groupId`, `personId`, `joinedAt`, `leftAt?`, `evaluation` (`PENDING`, `GOOD`, `INSUFFICIENT`), `evaluatedById?`, `evaluatedAt?`, `note?` | Unique por (grupo, persona); `INSUFFICIENT` exige nota; la evaluación escribe una interacción |
| `ManualCredit` | `termId`, `personId`, `ruleId`, `value`, `reason`, `grantedById` | Solo para reglas `MANUAL`; `value ≤ weight`; upsert auditado por (regla, persona) |
| `PermanenceSnapshot` | `termId`, `personId`, `status`, `isNew`, `probation`, `generalTotal`, `generalMax`, `general` JSON (criterios generales con logrado, posible y detalle), `results` JSON (por comité: condición, umbral, parte del comité, total, posible, margen, estado abierto, estado final y criterios), `mandatory` JSON (requeridas, firmadas, cumplidas, perdidas, próximas), `computedAt`, `frozenAt?` | Unique por (término, persona); recalculado por outbox con clave por término o por persona y lock por término; un resultado por comité, sin comité principal; ids sin nombres; se congela al aplicar el cierre. La vista propia del miembro se calcula en vivo con la misma función mientras el término está abierto |
| `PermanenceDecision` | `termId`, `personId`, `committeeId?`, `proposed`, `decision` (`CONTINUES`, `PROBATION`, `EXIT_COMMITTEE`, `EXIT_OE`), `reason?`, `decidedById`, `decidedAt`, `appliedAt?` | Solo decisiones confirmadas por GH (las propuestas se derivan del snapshot); una fila por comité y una por persona con `committeeId` nulo; `reason` obligatorio si difiere de la propuesta; `EXIT_OE` ejecuta "dar de baja", `PROBATION` escribe el `MembershipTerm` siguiente y `EXIT_COMMITTEE` estampa `leftAt`; las aplica un job reanudable |

### content

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `Page` | `slug` único, `title`, `body` Markdown, `status`, `audience` | La OE, Unirse y Privacidad nacen en borrador en la migración `0003`; una página en borrador muestra su título y "en preparación" |
| `Announcement` | `title`, `body` Markdown, `audience`, `committeeId?`, `publishedAt?`, `pinned`, `pushSentAt?`, `createdById?` | Cartelera; es público cuando `audience = PUBLIC` y `publishedAt` ya pasó; fijados primero; con `committeeId` vive solo en la cartelera interna de ese comité ([ADR-036](adr/ADR-036-permanencia-fase-4.md)) |
| `MediaAsset` | `visibility` (`PUBLIC`, `PRIVATE`), `objectKey` único, `originalFilename`, `contentType`, `byteSize`, `width?`, `height?`, `variants` JSON, `uploadedById?`, `status` (`PENDING`, `READY`, `FAILED`), `error?` | Sin bytes en la base; un solo bucket privado, la visibilidad decide la caché al servir; `variants` guarda las WebP de 480, 960 y 1600 px (`variants/<id>/w<ancho>.webp`); `FAILED` cuando el objeto no es una imagen decodificable ([ADR-033](adr/ADR-033-contenido-y-medios-fase-1.md)) |
| `Document` | `title`, `kind` (`ESTATUTOS`, `REGLAMENTO`, `ACTA`, `OTRO`), `fileKey` único (`documents/<id>.pdf`), `originalFilename`, `byteSize`, `sha256?`, `version`, `audience`, `status`, `uploadedById?` | El PDF es un objeto propio del bucket privado (no un `MediaAsset`); se abre por enlace a una URL prefirmada de 10 minutos ([ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md)) |
| `DocumentArticle` | `documentId`, `articleKey`, `chapterKey`, `chapterTitle`, `number`, `title`, `body`, `pages` JSON, `sortOrder`, `search` (`tsvector` generado en español) | Unique por (documento, clave); cargado desde el JSON del extractor; la búsqueda usa `websearch_to_tsquery` y `ts_headline` sobre el índice GIN |

### comms

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `EmailTemplate` | `slug` único, `subject`, `body` Markdown con variables | |
| `Campaign` | `templateId`, `segmentId`, `status`, `scheduledAt?`, `sentCount`, `createdById` | Fan-out a `Message` por el scheduler |
| `Message` | `personId`, `channel` (`EMAIL`, `PUSH`), `campaignId?`, `subject`, `status`, `providerId?`, `error?`, `sentAt?` | Registro de todo envío |
| `PushSubscription` | `personId`, `endpoint` único, `keys` JSON, `userAgent`, `lastSeenAt` | |
| `NotificationPreference` | `personId` único, `emailCampaigns`, `pushAnnouncements`, `pushPoints`, `pushReminders` | |

### system

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `AuditLog` | `actorId?`, `action`, `entityType`, `entityId`, `before` JSON, `after` JSON, `ip?`, `legacy` | Misma transacción que la mutación |
| `AppConfig` | `key` único, `value`, `updatedById?` | `committees.min = 1`, `committees.max = 3`, `assemblies.requiredOrdinary = 1`, `permanence.assembliesForCredit = 3`, `score.shrinkK = 5`, `checkin.rotatingCodeDefault = false`, `permanence.threshold.active = 60`, `permanence.threshold.new = 80`, `permanence.threshold.probation = 80`, `permanence.threshold.transfer = 70`, `permanence.probationMargin = 10`, `permanence.evaluationWindowDays = 14`, `permanence.warningDays = 21`, versión de la política |
| `Outbox` | `eventType`, `payload` JSON, `dedupeKey?`, `attempts`, `nextAttemptAt`, `processedAt?`, `deadLetterAt?`, `lastError?` | Un pendiente por `dedupeKey` |
| `ImportJob` | `type` (`ROSTER`, `GHPOINTS`), `status` (`PREVIEW`, `APPLIED`, `DISCARDED`, `FAILED`), `filename`, `fileKey?` (`imports/AAAA/MM/<id>.<ext>`), `termId?`, `mapping` JSON, `payload` JSON (filas validadas y diff de la vista previa), `summary` JSON, `createdById?`, `appliedAt?` | Roster por término (formato en [13-importacion-del-roster.md](13-importacion-del-roster.md)) y migración; el archivo original queda en el bucket privado como objeto propio, no como `MediaAsset` |
| `LegacyAlias` | `path` único, `targetType` (`OCCASION`), `targetId` | `/asamblea/{publicId}` de GHPOINTS y los `publicId` retirados de sus historiales (`/a/…` y `/asamblea/…`); los `publicId` vigentes no necesitan alias porque `/a/{publicId}` es la misma URL |

## Restricciones que no negocia el esquema

Uniques parciales declarados en el esquema de cada módulo (`uniqueIndex().on().where(sql)`), de modo que salen en la migración SQL y `db:release` verifica que existan:

| Índice | Regla |
| --- | --- |
| `PointEntry(checkInId) WHERE kind = 'CHECKIN'` | Una entrada de crédito por check-in |
| `PointEntry(reversalOfId)` único | Una reversión por entrada |
| `Membership(personId)` único | Una membresía por persona |
| `Permission(personId, code) WHERE committeeId IS NULL` y `(personId, code, committeeId) WHERE committeeId IS NOT NULL` | Sin permisos duplicados |
| `CommitteeMembership(personId, committeeId, termId)` único | Una pertenencia por término |
| `CommitteeMembership(committeeId, termId) WHERE roleCode = 'GENERAL' AND leftAt IS NULL` | Un General por comité y término |
| `CheckIn(occasionId, personId)` único | Un check-in por persona y ocasión |
| `Outbox(dedupeKey) WHERE processedAt IS NULL AND deadLetterAt IS NULL` | Un pendiente por clave |
| `LegacyAlias(path)` único | Un destino por ruta antigua |
| `Occasion(termId) WHERE assemblyKind = 'BOARD_ELECTION' AND status <> 'CANCELLED'` y lo mismo para `RUNOFF` | Una elección de junta y una segunda vuelta por término |
| `Occasion(publicId)` único | Una URL de check-in por ocasión |
| `CommitteeParticipation(occasionId, committeeId)` único | Un score por comité y ocasión |
| `TermStanding(termId)` único | Un cierre por término |
| `AssemblyRequirement(termId, personId)` único | Un ajuste por persona y término |
| `Occasion(legacyId)`, `CheckIn(legacyId)` y `PointEntry(legacyId)` únicos `WHERE legacyId IS NOT NULL` | Una fila por registro migrado de participación |
| `Page(slug)`, `Event(slug)` únicos; `EventEdition(eventId, slug)` único | Una URL por página, evento y edición |
| `MediaAsset(objectKey)` único | Un registro por objeto del bucket |
| `EditionCommittee(editionId, committeeId)` único | Un comité organiza una edición una sola vez |
| `Card`: check `(personId IS NULL) <> (organizationId IS NULL)` | Un solo sujeto por tarjeta |
| `Consent(personId, purpose) WHERE revokedAt IS NULL` | Un consentimiento vivo por persona y propósito |
| `Person(legacyId)` y `Committee(legacyId)` únicos `WHERE legacyId IS NOT NULL` | Una fila por registro migrado de GHPOINTS |
| `MembershipTerm(personId, termId)` único | Una condición por persona y término |
| `Interaction(refType, refId) WHERE refId IS NOT NULL` | Una interacción automática por evento del outbox |
| `Tag(lower(name))` único; `PersonTag(personId, tagId)` único | Sin etiquetas repetidas |
| `OnboardingProgress(personId, termId, stepKey)` único | Un avance por paso |
| `Document(fileKey)` único; `DocumentArticle(documentId, articleKey)` único | Un registro por PDF y un artículo por clave |
| `PermanenceRule(termId, key) WHERE scope = 'GENERAL'` y `(termId, committeeId, key) WHERE scope = 'COMMITTEE'` | Una clave por tabla |
| `PermanenceTable(termId) WHERE scope = 'GENERAL'` y `(termId, committeeId) WHERE scope = 'COMMITTEE'` | Un bloqueo y comentario por tabla |
| `WorkGroup(termId, code) WHERE code IS NOT NULL` | Un comité de trabajo por código y término |
| `WorkGroupEvaluator(groupId, personId)` y `WorkGroupMembership(groupId, personId)` únicos | Sin evaluadores ni miembros repetidos |
| `LeaderScore(ruleId, personId)` y `ManualCredit(ruleId, personId)` únicos | Un puntaje y un crédito por criterio y persona |
| `PermanenceSnapshot(termId, personId)` único | Un snapshot por persona y término |
| `PermanenceDecision(termId, personId, committeeId) WHERE committeeId IS NOT NULL` y `(termId, personId) WHERE committeeId IS NULL` | Una decisión por comité y una por persona |
| `Recognition(termId, committeeId, month) WHERE kind = 'MEMBER_OF_MONTH'` | Un destacado por comité y mes |

Reglas que viven en el dominio y se prueban en integración: tope de 3 comités por término para activos, `APPROVED ⇔ una entrada CHECKIN viva`, término derivado de la fecha, ledger cerrado tras `pointsClosedAt`, transiciones de etapa y de ocasión, `params` válidos por tipo de cálculo, nota obligatoria en evaluaciones insuficientes y puntajes por debajo del peso, motivo obligatorio al cambiar una propuesta, permanencia cerrada tras `permanenceClosedAt`.
