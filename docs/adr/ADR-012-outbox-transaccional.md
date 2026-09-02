# ADR-012: Outbox transaccional; efectos fuera del commit

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-001, ADR-009, ADR-019

## Contexto

Vercel no tiene procesos permanentes y sus crons corren como mucho cada minuto. Los efectos de una mutación (correo, push, línea de tiempo, recomputes, revalidación) no pueden bloquear al usuario ni perderse si la función termina.

## Decisión

Un comando es una transacción con la mutación, su `AuditLog` y sus filas de `Outbox`. El drenaje tiene dos caminos: (1) `after()` de `next/server` intenta procesar el outbox apenas se envía la respuesta; (2) el cron `/api/cron/drain` cada minuto recoge lo pendiente. Los handlers son idempotentes, cortos (menos de 60 s) y procesan por lotes; reintentos con backoff (1 min, 5 min, 30 min, 2 h, 12 h) y `deadLetterAt` tras cinco fallos, visibles en `/admin/sistema/jobs` con opción de reintentar. Un fallo de efecto nunca revierte ni falsea la mutación. El OTP se envía inline, no por outbox, porque la persona lo está esperando.

## Consecuencias

- Correos, push, línea de tiempo, recomputes y revalidaciones son eventualmente consistentes.
- `dedupeKey` con unique parcial evita duplicar trabajos pendientes para la misma ocasión.
- Sin Vercel Pro, el cron solo correría una vez al día y el drenaje dependería de `after()`.
