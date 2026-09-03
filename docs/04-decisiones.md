# Decisiones de arquitectura (resumen)

Las reglas del sistema viven en [adr/](adr/README.md), una por archivo. Esta tabla es el índice de lectura rápida. Una regla vieja no se edita: se reemplaza o se enmienda con una ADR nueva que la referencia.

| ADR | Regla | Decisión en una línea | Estado |
| --- | --- | --- | --- |
| [001](adr/ADR-001-monolito-modular-serverless.md) | Monolito modular | Una app Next.js con módulos internos y un solo Postgres; sin Redis ni colas de terceros; el worker vive en el mismo proceso | Enmendada por 021 |
| [002](adr/ADR-002-persona-como-eje.md) | La persona es el eje | `Person` es la raíz; la membresía es un ciclo de vida con historia; nadie se crea al hacer login | Aceptada |
| [003](adr/ADR-003-etapas-por-comando.md) | Etapas por comando | Prospecto → Postulante → Integrante → Egresado cambia solo por comandos que auditan y escriben la línea de tiempo | Aceptada |
| [004](adr/ADR-004-termino-como-reloj.md) | El término es el reloj | Comités, puntos, asambleas y rankings se agrupan por término; el actual se deriva de la fecha; el cierre de puntos es explícito | Aceptada |
| [005](adr/ADR-005-comites-por-termino.md) | Comités por término | Pertenencia (persona, comité, término), 1 a 3 para vigentes; el crédito usa el término de la ocasión | Aceptada |
| [006](adr/ADR-006-una-sola-asistencia.md) | Una sola asistencia | Ocasión + check-in para actividades, asambleas y sesiones; los puntos son una consecuencia configurada | Aceptada |
| [007](adr/ADR-007-ledger-append-only.md) | Ledger append-only | Aprobado ⇔ una entrada viva; corregir es revertir; totales por suma | Aceptada |
| [008](adr/ADR-008-tableros-derivados.md) | Tableros derivados | Nuevo = primer término igual al actual; sin bandera manual | Aceptada |
| [009](adr/ADR-009-score-de-comite.md) | Score de comité | Participación relativa por ocasión, recalculada por outbox con clave por ocasión | Aceptada |
| [010](adr/ADR-010-identidad-por-correo-y-otp.md) | Identidad por correo y OTP | El correo del roster es la identidad; OTP verifica el buzón; sesión larga en servidor; step-up para admin | Aceptada |
| [011](adr/ADR-011-autorizacion-en-servidor.md) | Autorización en servidor | El proxy solo redirige; `getActor()` decide; permisos técnicos separados de cargos visibles | Aceptada |
| [012](adr/ADR-012-outbox-transaccional.md) | Outbox transaccional | Mutación + auditoría + eventos en una transacción; un poller en proceso drena; los efectos nunca revierten | Enmendada por 021 |
| [013](adr/ADR-013-formularios-en-la-app.md) | Formularios en la app | Toda respuesta vincula persona por correo y registra consentimiento; nunca crea puntos | Aceptada |
| [014](adr/ADR-014-privacidad-por-diseno.md) | Privacidad por diseño | Consentimiento versionado, mínimo en público, exportación y eliminación, retención de egresados | Aceptada |
| [015](adr/ADR-015-canales.md) | Canales | Cartelera + push web primero; correo transaccional y campañas segmentadas; WhatsApp solo enlaces | Enmendada por 023 |
| [016](adr/ADR-016-medios-en-r2.md) | Medios en bucket privado | Subida por la app; entrega por la app con caché | Reemplazada por 022 |
| [017](adr/ADR-017-admin-kit.md) | Admin kit | Recursos declarativos para lo simple; UI a medida solo donde hay flujo | Aceptada |
| [018](adr/ADR-018-migracion-desde-ghpoints.md) | Migración desde GHPOINTS | Script idempotente sobre dump, verificación de sumas, alias para QR impresos | Aceptada |
| [019](adr/ADR-019-infraestructura-vercel-neon-r2.md) | Infraestructura (Vercel) | Vercel Pro + Neon + R2 + Resend | Reemplazada por 021 |
| [020](adr/ADR-020-zona-horaria.md) | Zona horaria | UTC en base, America/Bogota en presentación | Aceptada |
| [021](adr/ADR-021-infraestructura-railway.md) | Infraestructura (Railway) | Proyecto nuevo en el workspace Pro ya pagado: web con worker en proceso, Postgres con respaldos y PITR, bucket privado; US$0 extra | Enmendada por 022 y 023 |
| [022](adr/ADR-022-medios-prefirmados.md) | Medios prefirmados | Subida directa del navegador al bucket con `POST` prefirmado y CORS; entrega por redirección a URL prefirmada; la copia mensual incluye el bucket | Aceptada |
| [023](adr/ADR-023-operacion-entornos-respaldo-correo.md) | Operación | `staging` persistente y `production` en la fase 6; copia mensual cifrada a Cloudflare R2 por un servicio cron; Resend con desbordamiento automático a SES; seguir en Pro sin CDN | Aceptada |
