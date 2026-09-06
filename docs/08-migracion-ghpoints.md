# Migración desde GHPOINTS: referencia histórica

La fase 7 **no migra datos de GHPOINTS**. Mateo confirmó el 2026-09-06 que aquel sistema nunca estuvo en producción para la OE y aprobó empezar de cero ([ADR-039](adr/ADR-039-arranque-limpio-fase-7.md)). Producción se inicializa con migraciones SQL y el bootstrap de su acceso real; el roster nuevo se carga después desde la app. El retiro con respaldo está en [15-runbook.md](15-runbook.md).

Las secciones siguientes conservan el trabajo de migración ensayado en las fases 2 y 3. No son instrucciones de lanzamiento ni autorizan su ejecución sobre producción.

## Origen

`pg_dump` de la base de GHPOINTS tomado con `railway run pg_dump` desde el proyecto viejo, o un respaldo nativo restaurado en un servicio Postgres temporal. Se restaura en un PostgreSQL local para trabajar sin tocar producción. Los objetos del bucket `oe-media` se listan y copian al bucket `media` del proyecto nuevo.

## Herramientas

| Script | Qué hace |
| --- | --- |
| `scripts/migrate-ghpoints.ts` | Lee con `pg` desde `GHPOINTS_DATABASE_URL` (la restauración local del dump; la sesión se abre de solo lectura), escribe con Drizzle contra `DATABASE_URL`; idempotente por id de origen (tabla `ImportJob` tipo `GHPOINTS` + columna `legacyId` en cada modelo migrado). Pasos 1 a 5 (fase 2): términos, comités, personas, membresías, pertenencias y permisos; pasos 6 a 11 (fase 3, en `scripts/lib/migrate-participation.ts`): ocasiones, alias, check-ins, ledger en dos pasadas, requisitos y standing. Una temporada `CLOSED` cierra los puntos del término aunque ya existiera. Al terminar drena el outbox para que `score.recompute` deje calculado el score de cada ocasión migrada ([ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md), [ADR-035](adr/ADR-035-participacion-y-gh-points-fase-3.md)) |
| `scripts/verify-migration.ts` | Conteos por tabla origen/destino y, desde la fase 3, pares (miembro, temporada) con `SUM(points)` idéntica, asistencias aprobadas con puntos con exactamente una entrada `CHECKIN` viva y alias; imprime diferencias (error) y advertencias (tasa cruda del score frente a las filas `frozen` viejas, reversiones sin original, ediciones sin mapa) |

## Mapeo

| GHPOINTS | Casa digital | Notas |
| --- | --- | --- |
| `Member` | `Person` (`kind=STUDENT`) + `Membership` | `status` se conserva; `stage` = `MEMBER` para activos, licencia y honorarios, `ALUMNI` para retirados (con `endedAt` = `updatedAt` y motivo `OTHER`). `fullName` se parte con una heurística (dos palabras: nombre y apellido; tres: un nombre y dos apellidos; cuatro: dos y dos; otra cantidad: todo en el nombre) que el roster de GH corrige después. `firstTermId` desde el CSV de la OE (semestre de ingreso) o, si falta, la evidencia más antigua (`MemberCommittee.joinedAt`, `createdAt`) |
| `MemberCommittee` (`joinedAt`, `leftAt`) | `CommitteeMembership` por término | Una fila por cada término que solapa el rango; `joinedAt`/`leftAt` se copian cuando caen dentro del término |
| `MemberRole` | `Permission` (+ `roleCode = GENERAL`) | `ADMIN` → permiso; `COMMITTEE_LEADER` → permiso con comité más `GENERAL` en la pertenencia del término actual (un segundo líder del mismo comité queda `MIEMBRO` con aviso). El cargo visible de líder no es un `Appointment` ([ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md)) |
| `Committee` | `Committee` | Se empareja por `slug` con los 27 ya sembrados y se guarda `legacyId`; presentación, contacto, color y publicación se conservan si en la base nueva están vacíos; `logoKey` desde el slug |
| `Season` | `Term` | Código derivado de `startDate` y `academicTerm` (`2026-1`, `2026-2`) con sus fechas; `CLOSED` → `pointsClosedAt = endDate` |
| `Activity` | `Occasion` `kind=ACTIVITY` | Conserva `publicId`; `PROCESSED` → `CLOSED`, y una `OPEN` de una `Season` `CLOSED` → `CLOSED`; `activityType` → `category` (SPORTS → ATHLETIC_MATCH, TALK, WORKSHOP, SOCIAL, el resto OTHER); ventana desde `registrationStart/End`; `individualPoints` → `points`; `approvalMode` → `approval`; el término por `seasonCode`; `eventEditionId` no se mapea (las ediciones no tienen `legacyId`) y deja advertencia; `attendanceTokenHash` no se migra (el código rotativo es nuevo) |
| `ActivityPublicIdHistory`, `AssemblyPublicIdHistory` | `LegacyAlias` | Los `publicId` retirados siguen resolviendo (`/a/<retirado>`, `/asamblea/<retirado>`) |
| `Attendance` | `CheckIn` | `QR`/`LINK` → `SELF_QR`, `ADMIN` → `ADMIN`, `IMPORT`/`MICROSOFT_FORMS` → `IMPORT`; estado conservado; `at = registeredAt`; `decidedAt` = `cancelledAt` en las anuladas, `approvedAt` en las aprobadas y `updatedAt` en las rechazadas; `decidedById = approvedById`, `reason = cancelReason`; una segunda asistencia de la misma persona en la misma actividad (dos miembros viejos con un mismo correo) deja advertencia y no se migra |
| `PointTransaction` | `PointEntry` | Dos pasadas: primero las que no son `REVERSAL` por `createdAt`, después las `REVERSAL` con `reversalOfId` mapeado (si el original no existe o ya fue revertido: advertencia y `LEGACY` sin `reversalOfId`). `ACTIVITY→CHECKIN` con `checkInId` del `Attendance` (sin asistencia mapeable o segundo crédito de la misma asistencia → `LEGACY`), `MANUAL_ADJUSTMENT`/`BONUS`/`PENALTY→ADJUSTMENT`, `FLASH`/`BOOST`/`WORDLE→LEGACY`, todos con `legacyType` y el motivo original; una transacción de 0 puntos no se migra (advertencia); `createdAt` conservado; el término por `seasonId` |
| `Assembly`, `AssemblyAttendance` | `Occasion` `kind=ASSEMBLY` (0 puntos) + `CheckIn` | Conserva `publicId` y crea el alias `/asamblea/{publicId}`; `kind` → `assemblyKind`; `startsAt` o, si falta, `registrationStart` o `createdAt`; ventana desde `registrationStart/End` o, si faltan, desde `startsAt` con la ventana por defecto; una segunda elección de junta no cancelada en el mismo término no se migra (advertencia); `CONFIRMED` → `APPROVED`, `CANCELLED` → `CANCELLED` con `decidedById = cancelledById` |
| `AssemblyRequirement` | `AssemblyRequirement` | Todas las filas de los términos ya cerrados (historia fiel a la regla vieja de dos ordinarias; las no ajustadas llevan el motivo T-677) y solo las ajustadas del término abierto, donde rige el requisito derivado del término ([ADR-035](adr/ADR-035-participacion-y-gh-points-fase-3.md)) |
| `CommitteeActivityScore` | `CommitteeParticipation` | No se migra: la migración encola `score.recompute` por cada ocasión abierta o cerrada con puntos y el handler recalcula con las pertenencias migradas (elegibles: activos con pertenencia viva al empezar la ocasión); las filas `frozen` viejas se comparan solo en la tasa cruda como advertencia. GHPOINTS contaba como presente a quien estaba en licencia sin contarlo como elegible; aquí presentes ⊆ elegibles, y esa es la diferencia esperada |
| `Event`, `EventEdition`, `EventEditionCommittee`, `MediaAsset` | Mismos modelos | Portadas copiadas al bucket nuevo con su visibilidad según publicación |
| `HallOfFameSeason` | `TermStanding` | Del término con `pointsClosedAt` (si el término sigue abierto: advertencia): el JSON viejo queda bajo `stats.legacy` y las listas se recalculan del ledger migrado (con ids de persona), fuera de la transacción principal porque leen el ledger ya confirmado |
| `MemberBadge` | No se migra | Los niveles se derivan del ledger; se documenta la pérdida (decisión abierta) |
| `AuditLog` | `AuditLog` con `legacy=true` | Solo lectura |
| `IdentityAccount`, `Session`, `AuthChallenge`, `ClerkOperation`, `EmailAuthorization` | No se migran | La identidad nueva es el correo; todos vuelven a entrar por OTP |
| `/asamblea/{publicId}` y los `publicId` retirados | `LegacyAlias` | Los QR impresos siguen funcionando; `/a/{publicId}` vigente es la misma URL y no necesita alias |

## Ensayo

Contra la copia local de GHPOINTS (contenedor `ghpoints-db-1` en `127.0.0.1:5432`) y la base local reseteada: `GHPOINTS_DATABASE_URL=… npm run migrate:ghpoints && npm run migrate:verify`. El script no escribe en la base de origen y nada del resultado entra al repositorio; los conteos se anotan en el registro del roadmap. Sobre la base con `db:seed` los denominadores del score incluyen a las personas sintéticas y casi todos los scores congelados difieren; para comparar el score con GHPOINTS el ensayo se hace sobre el esquema recién migrado sin seed (`drop schema public cascade` + `npm run db:migrate`). Después del ensayo, `npm run db:reset` devuelve la base de desarrollo a su estado.

## Verificación obligatoria

1. Conteos por tabla origen y destino (con las equivalencias de la tabla anterior): `migrate:verify` compara 14 filas y sale con error si alguna difiere.
2. `SUM(points)` por persona y término idéntico entre `PointTransaction` y `PointEntry` (fila "Pares (miembro, temporada) con SUM(points) idéntica").
3. Toda `Attendance` `APPROVED` de una actividad con puntos con exactamente una `PointEntry` `CHECKIN` viva.
4. Alias: `/asamblea/{publicId}` de cada asamblea y los `publicId` retirados de ambos historiales.
5. Advertencias aparte, sin bloquear: actividades que tenían edición, reversiones que quedaron como `LEGACY` y scores congelados cuya tasa cruda difiere (o que aún no tienen recompute).
6. Muestreo manual de 20 personas: nombre, comités por término, saldo, asambleas.
7. Todos los `publicId` de actividades resuelven en `/a/[publicId]` y los de asambleas en `/asamblea/[publicId]` (que redirige a `/a/…`).

## Lanzamiento y retiro vigentes

La migración final, delta, copia de medios y rollback por dominio quedan retirados por [ADR-039](adr/ADR-039-arranque-limpio-fase-7.md). No se importan personas, ledger, asistencias, eventos, medios, auditoría o alias. GHPOINTS se archiva en un respaldo cifrado descifrable, separado del backup de la app nueva, conservado 90 días desde la eliminación verificada del proyecto GHPOINTS. Solo después de verificar la app nueva y ese archivo se elimina el proyecto, se revocan sus integraciones y se archiva el repositorio. Los comandos y la evidencia van en [15-runbook.md](15-runbook.md).
