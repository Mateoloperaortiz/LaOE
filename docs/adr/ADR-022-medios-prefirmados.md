# ADR-022: Medios: subida directa y entrega por URL prefirmada

- Estado: Aceptada (enmendada por ADR-034, ADR-039)
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

## Enmienda (2026-09-03, ADR-034)

Dos excepciones acotadas: el archivo del roster (CSV o XLSX de menos de 5 MB) sí atraviesa la app, porque el servidor lo tiene que leer, y después se guarda original en el bucket; y los PDF de normativa se suben con un `POST` prefirmado propio a `documents/` sin pasar por `media_asset` ni por `media.process`, y se abren por enlace a una URL prefirmada de 10 minutos (no se embeben: la CSP no lo permite y no hace falta). Los miembros pueden pedir un `POST` prefirmado solo para su foto (`purpose = "photo"`, privada, hasta 5 MB). Ver [ADR-034](ADR-034-personas-y-mi-oe-fase-2.md).

## Enmienda (2026-09-06, ADR-039)

En Railway el bucket usa URLs virtual-hosted y `S3_FORCE_PATH_STYLE=false`. La CSP usa el origen efectivo `https://<bucket>.<host del endpoint>` y conserva el origen del endpoint para path-style local. CORS se aplica por entorno con `storage:init` mediante `railway run --no-local` con proyecto, servicio y entorno explícitos, sin cargar `.env` local. Los medios de producción se crean desde la app; no se copian de GHPOINTS. Ver [ADR-039](ADR-039-arranque-limpio-fase-7.md).
