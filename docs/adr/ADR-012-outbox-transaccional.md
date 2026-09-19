# ADR-012: Outbox transaccional; efectos fuera del commit

- Estado: Aceptada (enmendada por ADR-021, ADR-038, ADR-040 y ADR-079)
- Fecha: 2026-09-02
- Relacionadas: ADR-001, ADR-009, ADR-021

## Contexto

Los efectos de una mutación (correo, push, línea de tiempo, recomputes, revalidación) no pueden bloquear a la persona ni perderse si el proceso muere. En la redacción original el hosting era Vercel, sin procesos permanentes y con crons de un minuto; ver la enmienda.

## Decisión

Un comando es una transacción con la mutación, su `AuditLog` y sus filas de `Outbox`. Los handlers son idempotentes, cortos (menos de 60 s) y procesan por lotes; reintentos con backoff (1 min, 5 min, 30 min, 2 h, 12 h) y `deadLetterAt` tras cinco fallos, visibles en `/admin/sistema/jobs` con opción de reintentar. Un fallo de efecto nunca revierte ni falsea la mutación. El OTP se envía inline, no por outbox, porque la persona lo está esperando. `dedupeKey` con unique parcial evita duplicar trabajos pendientes para la misma ocasión.

Redacción original del drenaje: (1) `after()` de `next/server` intentaba procesar el outbox apenas se enviaba la respuesta; (2) un cron `/api/cron/drain` cada minuto recogía lo pendiente.

## Consecuencias

- Correos, push, línea de tiempo, recomputes y revalidaciones son eventualmente consistentes.
- El estado de la cola vive en Postgres: se inspecciona con SQL y se reintenta desde el admin.

## Enmienda (2026-09-02, ADR-021)

El drenaje lo hace un **poller en el mismo proceso** cada 3 segundos (`SELECT … FOR UPDATE SKIP LOCKED`, lotes de 50), arrancado desde `instrumentation.ts` cuando `JOBS_ENABLED=true`. Los programados (`campaigns`, `reminders`, `prune`, `retention`, `backup-check`) los dispara un **scheduler en proceso** (`croner`) que encola filas de outbox; un lock transaccional por nombre de job evita duplicados si hay más de una réplica. `after()` queda como optimización opcional para bajar la latencia de un check-in a menos de un segundo; ya no hay rutas `/api/cron/*` ni dependencia de crons externos.

## Enmienda (2026-09-05, ADR-038)

Los programados ganan `campaigns` (cada minuto, encola `comms.campaign-tick`) y `notices` (diario a las 09:00, encola `permanence.notices`), y `reminders` suma `participation.reminders`. Los efectos hacia personas viajan por un único evento `notification.requested` con destinatarios, textos, URL y `dedupeKey`; el handler de `comms` es idempotente por persona gracias al unique parcial `(personId, dedupeKey)` de `message`. Ver [ADR-038](ADR-038-comunicaciones-y-pwa-fase-6.md).

## Enmienda (2026-09-06, ADR-040)

Wallet traduce cada evento fuente de nombre, comités, membresía, rotación o anonimización a un `wallet.sync` con deduplicación por evento fuente y persona. El trabajo relee el estado vigente, conserva pendientes sin credenciales y separa el lock corto de membresía del lock que serializa la red de Google. Un programado a las 00:05 de Bogotá concilia por lotes de 100 el cambio de término y las limpiezas pendientes. No se crea el primer pase ni el primer token desde un job. Ver [ADR-040](ADR-040-carnet-en-billeteras-fase-8.md).

## Enmienda (2026-09-19, ADR-079)

La transacción del poller solo sostiene el bloqueo de la fila: los handlers trabajan con sus propias conexiones, no dentro de ella. Todos los handlers de un evento comparten un límite de último recurso (`JOBS_HANDLER_TIMEOUT_MS`, 10 minutos): al vencer, el intento se registra como fallido con su backoff, la cola sigue y la cadena abandonada no arranca los handlers que le faltaban. Cada adaptador de red tiene su propio límite, y la base espera más que el poller para que el intento siempre quede registrado. Detalle en [ADR-079](ADR-079-limites-de-espera-y-esquema-verificado-desde-el-esquema.md).
