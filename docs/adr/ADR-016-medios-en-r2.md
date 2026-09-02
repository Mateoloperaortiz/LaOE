# ADR-016: Medios en un bucket privado sin cargar la app

- Estado: Aceptada (enmendada por ADR-021)
- Fecha: 2026-09-02
- Relacionadas: ADR-014, ADR-021

## Contexto

Las portadas y los PDFs de normativa pesan varios MB. GHPOINTS servía las imágenes a través de la app tras autorizar. En la redacción original el hosting era Vercel, con un límite de 4,5 MB por función, y el almacenamiento era Cloudflare R2 con dos buckets; ver la enmienda.

## Decisión (vigente tras la enmienda)

- Un **bucket privado** en Railway. Ningún objeto es público por URL directa.
- **Subida a través de la app:** una ruta de streaming escribe al bucket (`@aws-sdk/lib-storage`), con tope de 20 MB y validación de tipo; la función registra `MediaAsset` en estado `PENDING`, genera variantes con `sharp` (escribiéndolas al bucket), y marca `READY`.
- **Entrega por `/api/media/[id]`:** valida publicación y audiencia; lo publicado se sirve con `Cache-Control: public, max-age` largo y `ETag`; lo privado se sirve tras sesión, o por redirect a una URL prefirmada de 10 minutos cuando el archivo es grande (PDFs).
- Las portadas sin foto se generan como cartel tipográfico rotando azul, amarillo, naranja y navy.

## Consecuencias

- Un `pg_dump` conserva referencias, no bytes: el bucket se respalda aparte (copia mensual junto con la base).
- Si el bucket de Railway soporta CORS, la subida directa con `PUT` prefirmado queda como optimización (decisión abierta); el contrato del adaptador `Storage` no cambia.

## Enmienda (2026-09-02, ADR-021)

Redacción original: dos buckets en R2 (público con dominio `media.oeeafit.com` y privado), subida directa del navegador con `PUT` prefirmado y CORS porque las funciones de Vercel limitan el cuerpo a 4,5 MB, y entrega de lo privado por redirect prefirmado. Con Railway no existe ese límite ni hace falta un bucket público: la decisión vigente es la de arriba. El archivo conserva su nombre por estabilidad de enlaces.
