# ADR-021: Infraestructura: Railway en el workspace Pro existente

- Estado: Aceptada (enmendada por ADR-022 en "Medios" y por ADR-023 en "Entornos", "Respaldos" y "Presupuesto")
- Fecha: 2026-09-02
- Reemplaza: ADR-019
- Enmienda: ADR-001, ADR-012, ADR-016

## Contexto

El mismo día en que se documentó Vercel + Neon + R2 (ADR-019), Mateo decidió volver a Railway: el workspace Pro ya se paga por GHPOINTS (US$20 al mes con US$20 de uso incluidos; consumo actual de unos US$3 a 5), así que la app nueva cabe sin gasto adicional. Railway además da lo que Vercel no: un proceso permanente para el worker, Postgres y bucket en el mismo proyecto, respaldos programados del volumen (diario 6 días, semanal 1 mes, mensual 3 meses, en todos los planes) y PITR ya configurado en el Postgres de GHPOINTS.

Hechos verificados en la documentación de Railway el 2026-09-02: Pro US$20/mes con US$20 de uso incluido; RAM US$10 por GB-mes; CPU US$20 por vCPU-mes; volumen US$0,15 por GB-mes; egreso US$0,05 por GB; buckets US$0,015 por GB-mes con operaciones y egreso gratis; Hobby US$5/mes con US$5 incluidos.

## Decisión

- **Un proyecto nuevo `casa-digital` en el workspace Pro existente**, con tres servicios: `web` (Next.js, Node 24, `npm run build`, `next start` en `0.0.0.0:$PORT`, healthcheck `GET /api/health` con timeout de 300 s, pre-deploy `npm run db:release` = migraciones + uniques parciales + verificación, reinicio por fallo con hasta cinco reintentos), `Postgres` (18, solo red privada, volumen de 2 GB con respaldos diario, semanal y mensual, PITR) y bucket `media` (privado, S3-compatible, variables enlazadas por referencia). Misma región que GHPOINTS.
- **Worker en el mismo proceso.** `instrumentation.ts` arranca, cuando `JOBS_ENABLED=true`, el poller del outbox (cada 3 s, `SELECT … FOR UPDATE SKIP LOCKED`, lotes de 50) y el scheduler de programados (`croner`). Una réplica; si se escala, los locks transaccionales evitan duplicar trabajo. Un servicio `worker` aparte (misma imagen, `WORKER_ONLY=1`) solo si el uso medido lo pide.
- **Techos por servicio:** 1 vCPU y 1 GB de RAM, como GHPOINTS. El límite duro de uso del workspace (hoy US$18) se revisa porque conviven dos apps; subirlo a US$20 si hace falta.
- **Medios:** un solo bucket privado. Subida a través de la app (streaming al bucket, tope 20 MB); entrega por `/api/media/[id]` con validación de audiencia y `Cache-Control` para lo publicado; URL prefirmada de 10 minutos para descargas grandes. Cloudflare gratis delante como CDN es opcional.
- **Correo:** Resend. **Push:** VAPID. **Respaldos:** nativos de Railway + copia mensual cifrada fuera de Railway (`scripts/backup.ts`, destino en decisiones abiertas) + restauración ensayada en local.
- **Entornos:** producción desde `main`; entornos de PR de Railway o un staging bajo demanda (decisión abierta); desarrollo local con Postgres en Docker y emulador S3, sin credenciales de producción.
- **Presupuesto:** US$0 adicionales durante la convivencia (uso combinado ≈ US$8 a 10, dentro de los US$20 incluidos). Tras el cutover, los mismos US$20. Bajar a Hobby (US$5) es posible si se acepta perder PITR y entornos de PR.

## Consecuencias

- Vuelve el proceso permanente: los efectos del outbox salen en segundos sin `after()` ni crons externos (enmienda a ADR-012).
- Desaparece el límite de 4,5 MB: la subida pasa por la app; la subida directa prefirmada queda como optimización si el bucket soporta CORS (enmienda a ADR-016).
- Una sola instancia y una región; latencia desde Medellín de 60 a 90 ms. El healthcheck y los reinicios cubren fallos del proceso; la alta disponibilidad no es objetivo.
- Todo vive en un solo panel: app, base, bucket, variables, logs, respaldos.

## Enmienda (2026-09-02, ADR-022)

El punto "Medios" queda como lo define [ADR-022](ADR-022-medios-prefirmados.md): subida directa desde el navegador con `POST` prefirmado y CORS, entrega por redirección a URL prefirmada; la app no transmite archivos. El resto de esta ADR no cambia.

## Enmienda (2026-09-02, ADR-023)

Entornos: `staging` persistente desde la fase 0 y `production` desde la fase 7; entornos de PR apagados. Respaldos: la copia externa la hace un servicio `backup` con cron de Railway hacia Cloudflare R2. Presupuesto: se sigue en Pro después del cutover. Ver [ADR-023](ADR-023-operacion-entornos-respaldo-correo.md).

## Frente a ADR-019

Vercel + Neon + R2 costaba lo mismo (US$20) pero repartía la infraestructura en tres paneles, obligaba a diseñar sin worker y dependía del tope de 100 CU-horas de Neon Free. Se descartó por preferencia explícita de usar lo que ya se paga.
