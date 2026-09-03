# ADR-022: Medios: subida directa y entrega por URL prefirmada

- Estado: Aceptada
- Fecha: 2026-09-02
- Reemplaza: ADR-016
- Enmienda: ADR-021 (punto "Medios")

## Contexto

La documentación de Railway (verificada el 2026-09-02) fija cómo se trabaja con sus buckets: son privados y no existen buckets públicos; las URL prefirmadas duran hasta 90 días; el egreso del bucket es gratis pero el egreso del servicio cuesta US$0,05 por GB; el patrón recomendado para subir desde el navegador es un `POST` prefirmado con condiciones (tipo y tamaño) y **CORS configurable** con `aws s3api put-bucket-cors`; el patrón recomendado para servir es redirigir a una URL prefirmada; cada entorno (producción, PR, staging) tiene su propia instancia del bucket; no hay copias automáticas de buckets. ADR-016 dejaba la subida directa como "optimización si el bucket soporta CORS": lo soporta.

## Decisión

- **Subida directa desde el navegador.** ADMIN llama `POST /api/media/presign` con nombre y tipo; el servidor valida permisos y devuelve un `POST` prefirmado de 10 minutos con clave única y condiciones (`Content-Type` permitido, tamaño entre 5 KB y 20 MB). El navegador sube al bucket. `POST /api/media/confirm` comprueba el objeto con `HEAD`, registra `MediaAsset` en `PENDING` y encola `media.process`; el handler genera variantes con `sharp`, las escribe al bucket y marca `READY`. Scripts y jobs (migración, exportes) suben desde el servicio.
- **Entrega por redirección.** `GET /api/media/[id]` valida publicación y audiencia y responde `302` a una URL prefirmada: 7 días para lo publicado (con `Cache-Control` en la respuesta 302 para que el navegador la reutilice), 10 minutos para lo privado. Ningún archivo atraviesa la app. Las OG images generadas (carteles pequeños) sí las sirve la app.
- **CORS del bucket:** `AllowedOrigins` = dominio de producción y dominios de PR o staging; `AllowedMethods` = `PUT`, `POST`; se configura en la fase 0 y se documenta en el runbook.
- **Respaldo:** como no hay snapshots de buckets, la copia mensual externa (`scripts/backup.ts`) incluye los objetos del bucket, no solo la base.
- Las portadas sin foto siguen siendo carteles tipográficos generados.

## Consecuencias

- Cero egreso del servicio por medios y memoria del servicio estable en días de carga.
- Las URL en el HTML apuntan a `/api/media/[id]` (estables); el navegador sigue la redirección. Si algún día se pone Cloudflare delante, se cachea la respuesta 302 o se pasa a proxy para esas rutas.
- Toda subida se trata como no confiable: la confirmación valida tipo y tamaño y `media.process` descarta lo que no sea imagen o PDF.
