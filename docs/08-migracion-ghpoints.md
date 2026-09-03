# Migración desde GHPOINTS

GHPOINTS (Railway, PostgreSQL 18, Prisma) sigue en producción hasta el cutover. Sus datos se traen por script sobre un dump, nunca contra la base viva. Regla en [ADR-018](adr/ADR-018-migracion-desde-ghpoints.md). Como los dos proyectos viven en el mismo workspace de Railway, el dump, la copia de medios y el cambio de dominio se hacen desde un solo panel.

## Origen

`pg_dump` de la base de GHPOINTS tomado con `railway run pg_dump` desde el proyecto viejo, o un respaldo nativo restaurado en un servicio Postgres temporal. Se restaura en un PostgreSQL local para trabajar sin tocar producción. Los objetos del bucket `oe-media` se listan y copian al bucket `media` del proyecto nuevo.

## Herramientas

| Script | Qué hace |
| --- | --- |
| `scripts/migrate-ghpoints.ts` | Lee con `pg` desde el dump local, escribe con Drizzle contra la base nueva; idempotente por id de origen (tabla `ImportJob` + columna `legacyId` en cada modelo migrado) |
| `scripts/verify-migration.ts` | Conteos por tabla origen/destino y `SUM(points)` por persona y término; imprime diferencias y sale con error si hay alguna |
| `scripts/copy-media.ts` | Copia objetos de bucket a bucket conservando `objectKey`; marca `MediaAsset` como `READY` |

## Mapeo

| GHPOINTS | Casa digital | Notas |
| --- | --- | --- |
| `Member` | `Person` (`kind=STUDENT`) + `Membership` | `status` se conserva; `stage` = `MEMBER` para activos, licencia y honorarios, `ALUMNI` para retirados. `firstTermId` desde el CSV de la OE (semestre de ingreso) o, si falta, la evidencia más antigua (`MemberCommittee.joinedAt`, `createdAt`) |
| `MemberCommittee` (`joinedAt`, `leftAt`) | `CommitteeMembership` por término | Una fila por cada término que solapa el rango; `joinedAt`/`leftAt` se copian cuando caen dentro del término |
| `MemberRole` | `Permission` + `Appointment` | `ADMIN` → permiso; `COMMITTEE_LEADER` → permiso con comité y cargo visible en el término actual |
| `Committee` | `Committee` | Presentación, contacto, color y publicación se conservan; `logoKey` desde el slug |
| `Season` | `Term` | `2026-1`, `2026-2` con sus fechas; `CLOSED` → `pointsClosedAt = endDate` |
| `Activity` | `Occasion` `kind=ACTIVITY` | Conserva `publicId`; `PROCESSED` y `CLOSED` → `CLOSED`; `attendanceTokenHash` no se migra (el código rotativo es nuevo) |
| `Attendance` | `CheckIn` | `QR`/`LINK` → `SELF_QR`, `ADMIN` → `ADMIN`, `IMPORT`/`MICROSOFT_FORMS` → `IMPORT`; estado y fechas se conservan |
| `PointTransaction` | `PointEntry` | `ACTIVITY→CHECKIN`, `MANUAL_ADJUSTMENT`/`BONUS`/`PENALTY→ADJUSTMENT`, `REVERSAL→REVERSAL` (conservando `reversalOfId`), `FLASH`/`BOOST`/`WORDLE→LEGACY` con `legacyType` y el motivo original |
| `Assembly`, `AssemblyAttendance` | `Occasion` `kind=ASSEMBLY` (0 puntos) + `CheckIn` | Conserva `publicId`; `CONFIRMED` → `APPROVED` |
| `AssemblyRequirement` | `AssemblyRequirement` | Igual, con motivo de ajuste |
| `CommitteeActivityScore` | `CommitteeParticipation` | Se recalcula desde los check-ins migrados; los snapshots viejos sirven solo para verificar |
| `Event`, `EventEdition`, `EventEditionCommittee`, `MediaAsset` | Mismos modelos | Portadas copiadas al bucket nuevo con su visibilidad según publicación |
| `HallOfFameSeason` | `TermStanding` | Snapshot copiado tal cual |
| `MemberBadge` | No se migra | Los niveles se derivan del ledger; se documenta la pérdida (decisión abierta) |
| `AuditLog` | `AuditLog` con `legacy=true` | Solo lectura |
| `IdentityAccount`, `Session`, `AuthChallenge`, `ClerkOperation`, `EmailAuthorization` | No se migran | La identidad nueva es el correo; todos vuelven a entrar por OTP |
| `/a/{publicId}`, `/asamblea/{publicId}` | `LegacyAlias` | Los QR impresos siguen funcionando |

## Verificación obligatoria

1. Conteos por tabla origen y destino (con las equivalencias de la tabla anterior).
2. `SUM(points)` por persona y término idéntico entre `PointTransaction` y `PointEntry`.
3. Toda `Attendance` `APPROVED` con exactamente una `PointEntry` `CHECKIN` viva.
4. Muestreo manual de 20 personas: nombre, comités por término, saldo, asambleas.
5. Todos los `publicId` resuelven en `/a/[publicId]`.

## Cutover

1. Ensayo completo sobre un dump reciente; `verify-migration` en cero diferencias.
2. Aviso a la OE con una semana de antelación; banner de congelación en GHPOINTS.
3. Dump final, migración delta (solo filas nuevas por `legacyId`), verificación de nuevo; copia de los medios nuevos.
4. Dominio: quitar `oeeafit.com` del servicio GHPOINTS y agregarlo al servicio `web` del proyecto nuevo; actualizar el CNAME si el destino cambia. Comprobar OTP real, check-in real y una portada.
5. Una semana de monitoreo con GHPOINTS detenido pero no borrado.
6. Dump final cifrado fuera de Railway, conservado 90 días; eliminar el proyecto GHPOINTS; registrar el cierre en [09-roadmap.md](09-roadmap.md).

## Vuelta atrás

Si algo falla en las primeras 48 horas: devolver el dominio al servicio GHPOINTS y encenderlo (su base sigue intacta porque nunca se escribió sobre ella), anotar qué falló y repetir el ensayo. Los check-ins hechos en la app nueva durante ese lapso se exportan a CSV para no perderlos.
