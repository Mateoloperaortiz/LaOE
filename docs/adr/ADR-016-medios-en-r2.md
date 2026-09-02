# ADR-016: Medios en R2 sin pasar por funciones

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-014, ADR-019

## Contexto

Las funciones de Vercel limitan el cuerpo de request y de respuesta a 4,5 MB. Las portadas y los PDFs de normativa superan eso con facilidad. GHPOINTS servía las imágenes a través de la app tras autorizar.

## Decisión

Dos buckets en R2: **público** (`media.oeeafit.com`, portadas de contenido publicado, egreso gratis) y **privado** (PDFs, fotos de directorio, originales). La subida va directa del navegador a R2 con `PUT` prefirmado y CORS; la función registra `MediaAsset` en estado `PENDING`, confirma con `HEAD`, genera variantes con `sharp` (escribiéndolas a R2, no devolviéndolas) y marca `READY`. Publicar contenido copia la portada al bucket público; despublicar la retira. Lo privado se sirve por redirect a un `GET` prefirmado de 10 minutos tras validar sesión y audiencia. Las portadas sin foto se generan como cartel tipográfico rotando azul, amarillo, naranja y navy.

## Consecuencias

- Ningún archivo atraviesa una función; el límite de 4,5 MB no aplica.
- Un `pg_dump` conserva referencias, no bytes: el respaldo de R2 es aparte (versionado del bucket).
