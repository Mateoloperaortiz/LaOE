# Decisiones de arquitectura (resumen)

Las reglas del sistema viven en [adr/](adr/README.md), una por archivo. Esta tabla es el índice de lectura rápida. Una regla vieja no se edita: se reemplaza por una ADR nueva que la marca como reemplazada.

| ADR | Regla | Decisión en una línea |
| --- | --- | --- |
| [001](adr/ADR-001-monolito-modular-serverless.md) | Monolito modular sobre serverless | Una app Next.js con módulos internos y un solo Postgres; sin Redis, colas de terceros ni worker permanente |
| [002](adr/ADR-002-persona-como-eje.md) | La persona es el eje | `Person` es la raíz; la membresía es un ciclo de vida con historia; nadie se crea al hacer login |
| [003](adr/ADR-003-etapas-por-comando.md) | Etapas por comando | Prospecto → Postulante → Integrante → Egresado cambia solo por comandos que auditan y escriben la línea de tiempo |
| [004](adr/ADR-004-termino-como-reloj.md) | El término es el reloj | Comités, puntos, asambleas y rankings se agrupan por término; el actual se deriva de la fecha; el cierre de puntos es explícito |
| [005](adr/ADR-005-comites-por-termino.md) | Comités por término | Pertenencia (persona, comité, término), 1 a 3 para vigentes; el crédito usa el término de la ocasión |
| [006](adr/ADR-006-una-sola-asistencia.md) | Una sola asistencia | Ocasión + check-in para actividades, asambleas y sesiones; los puntos son una consecuencia configurada |
| [007](adr/ADR-007-ledger-append-only.md) | Ledger append-only | Aprobado ⇔ una entrada viva; corregir es revertir; totales por suma |
| [008](adr/ADR-008-tableros-derivados.md) | Tableros derivados | Nuevo = primer término igual al actual; sin bandera manual |
| [009](adr/ADR-009-score-de-comite.md) | Score de comité | Participación relativa por ocasión, recalculada por outbox con clave por ocasión |
| [010](adr/ADR-010-identidad-por-correo-y-otp.md) | Identidad por correo y OTP | El correo del roster es la identidad; OTP verifica el buzón; sesión larga en servidor; step-up para admin |
| [011](adr/ADR-011-autorizacion-en-servidor.md) | Autorización en servidor | El proxy solo redirige; `getActor()` decide; permisos técnicos separados de cargos visibles |
| [012](adr/ADR-012-outbox-transaccional.md) | Outbox transaccional | Mutación + auditoría + eventos en una transacción; `after()` y cron drenan; los efectos nunca revierten |
| [013](adr/ADR-013-formularios-en-la-app.md) | Formularios en la app | Toda respuesta vincula persona por correo y registra consentimiento; nunca crea puntos |
| [014](adr/ADR-014-privacidad-por-diseno.md) | Privacidad por diseño | Consentimiento versionado, mínimo en público, exportación y eliminación, retención de egresados |
| [015](adr/ADR-015-canales.md) | Canales | Cartelera + push web primero; correo transaccional y campañas segmentadas; WhatsApp solo enlaces |
| [016](adr/ADR-016-medios-en-r2.md) | Medios en R2 | Subida directa prefirmada; público desde dominio propio; privado por redirect prefirmado |
| [017](adr/ADR-017-admin-kit.md) | Admin kit | Recursos declarativos para lo simple; UI a medida solo donde hay flujo |
| [018](adr/ADR-018-migracion-desde-ghpoints.md) | Migración desde GHPOINTS | Script idempotente sobre dump, verificación de sumas, alias para QR impresos |
| [019](adr/ADR-019-infraestructura-vercel-neon-r2.md) | Infraestructura | Vercel Pro + Neon + R2 + Resend; respaldo propio nocturno; migraciones en el build |
| [020](adr/ADR-020-zona-horaria.md) | Zona horaria | UTC en base, America/Bogota en presentación |
