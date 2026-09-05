# ADR-033: Contenido editable y medios del portal público (fase 1)

- Estado: Aceptada (enmendada por ADR-036 y ADR-037)
- Fecha: 2026-09-03
- Relacionadas: ADR-001, ADR-011, ADR-012, ADR-014, ADR-017, ADR-020, ADR-022, ADR-023, ADR-032

## Contexto

La fase 0 dejó el código base corriendo en local: Drizzle con esquema por módulo, acceso por OTP, outbox con poller en proceso, admin kit declarativo con Comités, Términos y Permisos, la línea gráfica y el diccionario de textos. La fase 1 tiene que dejar que la OE publique el portal sin tocar código: páginas La OE, Unirse y Privacidad; cartelera; los cuatro macroeventos con sus ediciones; fichas de los 27 comités; portadas subidas directo al bucket; imágenes para compartir; SEO e ICS. Hay reglas previas que condicionan el diseño: los medios no atraviesan la app (ADR-022), la CSP lleva nonce por request (ADR-011, `src/proxy.ts`), `staging` no se indexa (ADR-023), el kit se mide en esta fase y una entidad simple que necesite más de una excepción pasa a UI a medida (ADR-017), y ningún dato personal es público (ADR-014).

Hechos verificados el 2026-09-03 en la documentación de Next 16.3 incluida en `node_modules/next/dist/docs`: `opengraph-image`, `sitemap` y `robots` son route handlers aparte del layout raíz y se cachean en build salvo que usen una API de request o `dynamic = "force-dynamic"`; `ImageResponse` (`next/og`) solo acepta fuentes TTF, OTF o WOFF y no interpreta ejes variables; el navegador valida `img-src` contra la URL final tras una redirección.

## Decisión

1. **Módulos.** `content` (`page`, `announcement`, `media_asset`) y `events` (`event`, `event_edition`, `edition_committee`), como prevé `01-arquitectura.md`. `Committee` sigue en `people` con sus lecturas públicas. Enum compartido `audience` (`PUBLIC`, `MEMBERS`) en `src/db/enums.ts`. `Document` (normativa) espera a la fase 2 porque no tiene consumidor.
2. **Ajustes al modelo** (`03-modelo-de-datos.md`): `media_asset` suma `status = FAILED`, `error` y `originalFilename`; `event` suma `sortOrder`; `event_edition` suma `description` en Markdown y deja `registrationFormId` para la fase 5.
3. **Catálogo por migración.** `drizzle/0003_contenido_y_eventos.sql` crea las seis tablas e inserta, idempotentemente y con el precedente de `0001_catalogos_y_trgm.sql`, las tres páginas fijas (`la-oe`, `unirse`, `privacidad`, en borrador) y los cuatro macroeventos (nombres de T-039, publicados, sin ediciones). El cuerpo sembrado de La OE solo trae lo que el manual aprueba (misión y visión) y la historia como propuesta; COM y JUNTA completan y publican desde el admin. Los datos sintéticos de prueba siguen en `scripts/seed.ts`, que nunca corre en producción.
4. **Markdown sin HTML crudo.** Los cuerpos (`page.body`, `announcement.body`, `event.description`, `event_edition.description`, `committee.presentation`) se renderizan en el servidor con `react-markdown` y `remark-gfm`; el HTML embebido se descarta, no hay `dangerouslySetInnerHTML`, los estilos de prosa viven en `tokens.css`.
5. **Medios, tal como fija ADR-022.** `POST /api/media/presign` (solo ADMIN; `image/jpeg`, `image/png` o `image/webp`; 5 KB a 20 MB; clave `uploads/AAAA/MM/<cuid>.<ext>`), subida directa del navegador al bucket, `POST /api/media/confirm` (HEAD, `media_asset` en `PENDING`, evento `media.process`). El handler descarga el original, lee sus dimensiones con `sharp`, escribe variantes WebP de 480, 960 y 1600 px de ancho sin agrandar en `variants/<id>/w<ancho>.webp` (claves deterministas: un reintento sobrescribe y no deja huérfanos) y marca `READY`. Un error permanente (el objeto no es una imagen decodificable) marca `FAILED` con su motivo y no relanza; un error transitorio (bucket inalcanzable) relanza y usa el backoff del outbox. Se acepta que el handler corra dentro de la transacción del poller reteniendo una conexión unos segundos: el volumen es de pocas subidas al día.
6. **Entrega.** `GET /api/media/[id]?w=<ancho>` elige la variante más grande que no supere `w` (o el original) y responde 302 a una URL prefirmada. La caché del 302 es siempre menor que la vigencia de la firma: lo público firma 7 días y responde `Cache-Control: public, max-age=518400`; lo privado firma 10 minutos, exige sesión y responde `private, max-age=300`. Las imágenes públicas van en `<img srcset sizes width height loading="lazy">`; no se usa `next/image` porque su optimizador haría pasar los bytes por la app. Las portadas sin imagen siguen siendo el `Cartel` tipográfico.
7. **CSP.** `img-src` y `connect-src` incluyen el origen de `S3_ENDPOINT` (con `S3_FORCE_PATH_STYLE=true` las URL prefirmadas comparten ese origen): el navegador valida la URL final tras el 302 y la subida es un `fetch` cross-origin al bucket.
8. **Render dinámico, sin ISR.** El nonce de la CSP ya obliga a renderizar cada request; a este volumen no hace falta caché de páginas. Las lecturas públicas se comparten entre `generateMetadata` y la página con `React.cache`. `sitemap.ts`, `robots.ts` y todo `opengraph-image.tsx` que lea la base declaran `dynamic = "force-dynamic"`, así `next build` (que en CI corre sin base) no los prerrenderiza; los OG que solo usan textos del inventario sí se prerrenderizan.
9. **Imágenes para compartir.** `ImageResponse` con un `CartelOG` propio de estilos en línea (Satori no entiende Tailwind ni SVG anidado; el isotipo viaja como `data:` URI). Se agregan al repositorio dos instancias estáticas de las fuentes sustitutas, subseteadas a latín (Sofia Sans Extra Condensed 900 y Plus Jakarta Sans 600, OFL), generadas con `fonttools` desde los WOFF2 existentes y leídas una sola vez en el ámbito del módulo.
10. **SEO.** `metadataBase` sale de `APP_URL`. La variable `PUBLIC_INDEXING` (booleana, `false` por defecto) decide `robots.txt` y la meta `robots` global: `staging` y cualquier entorno sin ella quedan con `noindex`, como pide ADR-023; producción la enciende en el cutover. `sitemap.xml` lista solo lo publicado con audiencia pública.
11. **ICS.** `GET /api/ics/publico.ics` se genera a mano (plegado a 75 octetos, escape de RFC 5545, `UID` por edición) con las ediciones públicas publicadas; sin librería.
12. **Admin kit.** Extensiones aditivas y genéricas: `rows` en textareas, tipo `multiselect` (usa `getAll` solo en ese tipo), tipo `datetime` interpretado en `America/Bogota` (ADR-020), celdas con enlace, y `ResourcePage` con `basePath` y `fixedFilters` opcionales para montar el recurso `ediciones` bajo `/admin/eventos/[id]/ediciones` (los filtros fijos prellenan la creación y las acciones revalidan la ruta de retorno). El selector de portada es un `select` con opciones asíncronas sobre los medios listos; las miniaturas se evalúan después. El subidor de medios es UI a medida desde el inicio. Si el recurso anidado pide una segunda excepción, pasa a UI a medida.
13. **Rutas.** `/admin/cartelera` es la única vista de anuncios: el `/admin/anuncios` de Comunicaciones sale del mapa y la fase 6 agrega el push en la misma pantalla. Se agrega `/cartelera/[id]` (un anuncio con su imagen para compartir; es la URL que usará el push).

## Consecuencias

- La OE publica páginas, anuncios, eventos, ediciones, fichas de comités y portadas desde el admin; el código no cambia por contenido.
- Nada personal sale al público: las fichas de comité no muestran roster, los anuncios y ediciones no llevan personas, `Recognition` (fase 4) exigirá consentimiento aparte.
- Un objeto subido y no confirmado queda en el bucket sin fila; el `prune` diario lo borra cuando tenga más de un día (fase 1 lo deja anotado en el handler; se implementa con la limpieza de `system.prune`).
- Cambiar el tamaño de las variantes obliga a reprocesar: `media.process` es idempotente y se puede reencolar desde `/admin/sistema/jobs`.
- `PUBLIC_INDEXING` es una variable más que difiere entre entornos; el runbook de `staging` la lista.
- Las fuentes TTF suman unos cientos de KB al repositorio, una sola vez.

## Frente a GHPOINTS

GHPOINTS guarda `MediaAsset` sin variantes y sirve las portadas por su propia ruta; aquí las variantes las genera el outbox y la entrega es una redirección prefirmada. Los modelos de evento y edición se conservan casi iguales (más `description` en la edición y `sortOrder` en el evento), así la migración de la fase 7 los copia sin transformar.

## Enmienda (2026-09-04, ADR-036)

`announcement` gana `committeeId?`: un anuncio de comité vive en la cartelera interna de ese comité (`/app/comites/[slug]`) y no en la cartelera general ni en el portal. Ver [ADR-036](ADR-036-permanencia-fase-4.md).

## Enmienda (2026-09-05, ADR-037)

`event_edition` no gana `registrationFormId`: la inscripción propia de una edición se resuelve por la acción `editionId` del formulario (`forms.findOpenRegistrationForm`), y la página pública muestra T-019 hacia `/f/[slug]` cuando ese formulario está abierto, además del enlace externo de `registrationUrl`. Ver [ADR-037](ADR-037-admision-aliados-y-contactos-fase-5.md).
