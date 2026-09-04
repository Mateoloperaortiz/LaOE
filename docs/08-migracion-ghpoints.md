# Migración desde GHPOINTS

GHPOINTS (Railway, PostgreSQL 18, Prisma) sigue en producción hasta el cutover. Sus datos se traen por script sobre un dump, nunca contra la base viva. Regla en [ADR-018](adr/ADR-018-migracion-desde-ghpoints.md). Como los dos proyectos viven en el mismo workspace de Railway, el dump, la copia de medios y el cambio de dominio se hacen desde un solo panel.

## Origen

`pg_dump` de la base de GHPOINTS tomado con `railway run pg_dump` desde el proyecto viejo, o un respaldo nativo restaurado en un servicio Postgres temporal. Se restaura en un PostgreSQL local para trabajar sin tocar producción. Los objetos del bucket `oe-media` se listan y copian al bucket `media` del proyecto nuevo.

## Herramientas

| Script | Qué hace |
| --- | --- |
| `scripts/migrate-ghpoints.ts` | Lee con `pg` desde `GHPOINTS_DATABASE_URL` (la restauración local del dump; la sesión se abre de solo lectura), escribe con Drizzle contra `DATABASE_URL`; idempotente por id de origen (tabla `ImportJob` tipo `GHPOINTS` + columna `legacyId` en cada modelo migrado). La fase 2 migra términos, comités, personas, membresías, pertenencias y permisos; la fase 3 agrega el resto ([ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md)) |
| `scripts/verify-migration.ts` | Conteos por tabla origen/destino y, desde la fase 3, pares (miembro, temporada) con `SUM(points)` idéntica, asistencias aprobadas con puntos con exactamente una entrada `CHECKIN` viva y alias; imprime diferencias (error) y advertencias (tasa cruda del score frente a las filas `frozen` viejas, reversiones sin original, ediciones sin mapa) |
| `scripts/copy-media.ts` | Copia objetos de bucket a bucket conservando `objectKey`; marca `MediaAsset` como `READY` |

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
| `Attendance` | `CheckIn` | `QR`/`LINK` → `SELF_QR`, `ADMIN` → `ADMIN`, `IMPORT`/`MICROSOFT_FORMS` → `IMPORT`; estado conservado; `at = registeredAt`, `decidedAt = approvedAt ?? cancelledAt`, `decidedById = approvedById`, `reason = cancelReason` |
| `PointTransaction` | `PointEntry` | Dos pasadas: primero las que no son `REVERSAL` por `createdAt`, después las `REVERSAL` con `reversalOfId` mapeado (si el original no existe: advertencia y `LEGACY` sin `reversalOfId`). `ACTIVITY→CHECKIN` con `checkInId` del `Attendance` (sin asistencia mapeable → `LEGACY`), `MANUAL_ADJUSTMENT`/`BONUS`/`PENALTY→ADJUSTMENT`, `FLASH`/`BOOST`/`WORDLE→LEGACY`, todos con `legacyType` y el motivo original; `createdAt` conservado; el término por `seasonId` |
| `Assembly`, `AssemblyAttendance` | `Occasion` `kind=ASSEMBLY` (0 puntos) + `CheckIn` | Conserva `publicId` y crea el alias `/asamblea/{publicId}`; `kind` → `assemblyKind`; ventana desde `registrationStart/End` o, si faltan, desde `startsAt` con la ventana por defecto; `CONFIRMED` → `APPROVED`, `CANCELLED` → `CANCELLED` con `decidedById = cancelledById` |
| `AssemblyRequirement` | `AssemblyRequirement` | Todas las filas de los términos ya cerrados (historia fiel a la regla vieja de dos ordinarias) y solo las ajustadas del término abierto, donde rige el requisito derivado del término ([ADR-035](adr/ADR-035-participacion-y-gh-points-fase-3.md)) |
| `CommitteeActivityScore` | `CommitteeParticipation` | No se migra: la migración encola `score.recompute` por cada ocasión con puntos y el handler recalcula con las pertenencias migradas; las filas `frozen` viejas se comparan solo en la tasa cruda como advertencia |
| `Event`, `EventEdition`, `EventEditionCommittee`, `MediaAsset` | Mismos modelos | Portadas copiadas al bucket nuevo con su visibilidad según publicación |
| `HallOfFameSeason` | `TermStanding` | Del término con `pointsClosedAt`: el JSON viejo queda bajo `stats.legacy` y las listas se recalculan del ledger migrado (con ids de persona) |
| `MemberBadge` | No se migra | Los niveles se derivan del ledger; se documenta la pérdida (decisión abierta) |
| `AuditLog` | `AuditLog` con `legacy=true` | Solo lectura |
| `IdentityAccount`, `Session`, `AuthChallenge`, `ClerkOperation`, `EmailAuthorization` | No se migran | La identidad nueva es el correo; todos vuelven a entrar por OTP |
| `/asamblea/{publicId}` y los `publicId` retirados | `LegacyAlias` | Los QR impresos siguen funcionando; `/a/{publicId}` vigente es la misma URL y no necesita alias |

## Ensayo de la fase 2

Contra la copia local de GHPOINTS (contenedor `ghpoints-db-1` en `127.0.0.1:5432`) y la base local reseteada: `GHPOINTS_DATABASE_URL=… npm run migrate:ghpoints && npm run migrate:verify`. El script no escribe en la base de origen y nada del resultado entra al repositorio; los conteos se anotan en el registro del roadmap.

## Verificación obligatoria

1. Conteos por tabla origen y destino (con las equivalencias de la tabla anterior).
2. `SUM(points)` por persona y término idéntico entre `PointTransaction` y `PointEntry`.
3. Toda `Attendance` `APPROVED` con exactamente una `PointEntry` `CHECKIN` viva.
4. Muestreo manual de 20 personas: nombre, comités por término, saldo, asambleas.
5. Todos los `publicId` de actividades resuelven en `/a/[publicId]` y los de asambleas en `/asamblea/[publicId]` (que redirige a `/a/…`).

## Cutover

1. Ensayo completo sobre un dump reciente; `verify-migration` en cero diferencias.
2. Aviso a la OE con una semana de antelación; banner de congelación en GHPOINTS.
3. Dump final, migración delta (solo filas nuevas por `legacyId`), verificación de nuevo; copia de los medios nuevos.
4. Dominio: quitar `oeeafit.com` del servicio GHPOINTS y agregarlo al servicio `web` del proyecto nuevo; actualizar el CNAME si el destino cambia. Comprobar OTP real, check-in real y una portada.
5. Una semana de monitoreo con GHPOINTS detenido pero no borrado.
6. Dump final cifrado fuera de Railway, conservado 90 días; eliminar el proyecto GHPOINTS; registrar el cierre en [09-roadmap.md](09-roadmap.md).

## Vuelta atrás

Si algo falla en las primeras 48 horas: devolver el dominio al servicio GHPOINTS y encenderlo (su base sigue intacta porque nunca se escribió sobre ella), anotar qué falló y repetir el ensayo. Los check-ins hechos en la app nueva durante ese lapso se exportan a CSV para no perderlos.
