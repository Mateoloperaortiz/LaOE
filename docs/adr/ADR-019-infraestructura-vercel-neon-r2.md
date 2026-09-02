# ADR-019: Infraestructura: Vercel Pro + Neon + R2 + Resend

- Estado: Reemplazada por ADR-021 (2026-09-02)
- Fecha: 2026-09-02
- Relacionadas: ADR-001, ADR-012, ADR-016

> Esta decisión estuvo vigente unas horas. Se conserva el texto original porque explica qué se evaluó y por qué el diseño sin worker permanente existió. La decisión vigente es [ADR-021](ADR-021-infraestructura-railway.md).

## Contexto

Presupuesto de un estudiante (~US$20/mes). Railway, en el workspace Pro que ya paga GHPOINTS, era la opción más simple para un worker permanente; se prefirió Vercel por la experiencia de desarrollo con Next.js, la CDN y las previews por PR, aceptando el diseño sin procesos permanentes. Hechos verificados el 2026-09-02: crons por minuto solo en Vercel Pro; cuerpo de 4,5 MB por función; Neon Free con 0,5 GB, 100 CU-horas al mes, suspensión a los 5 minutos y 6 horas de restauración; R2 con 10 GB y egreso gratis.

## Decisión

- **Vercel Pro**, un asiento, región `iad1`, crons por minuto, previews protegidas, `maxDuration` explícito en las rutas de cron y exportes.
- **Neon** en `us-east-1`: `DATABASE_URL` pooled para la app, `DIRECT_URL` para migraciones y scripts; integración oficial con Vercel para una rama por preview; alerta de uso; paso a Launch (pago por uso) si se supera el tope.
- **R2**: dos buckets (público con dominio propio, privado), CORS para subida directa, versionado activado.
- **Resend** gratis para transaccional; SES como alternativa del mismo adaptador.
- **Respaldo propio:** `pg_dump` nocturno cifrado a R2 desde GitHub Actions (`scripts/backup.ts`), verificado por el cron `backup-check` y restaurado en local una vez al mes.
- Migraciones en el build (`prisma migrate deploy && next build`); nunca seed en producción; secretos solo en variables de servidor.

## Consecuencias

- Sin worker: outbox + `after()` + cron (ADR-012). Sin streaming de archivos (ADR-016).
- Presupuesto: US$20/mes; hasta ≈ US$30 si Neon pasa a Launch. Durante la convivencia se sigue pagando Railway por GHPOINTS.
- Plan B: Vercel Hobby a US$0 con crons diarios y licencia de uso personal; no recomendado para el sitio oficial.
