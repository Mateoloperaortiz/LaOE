# ADR-042: Normativa completa y carga verificada de los originales

- Estado: Aceptada
- Fecha: 2026-09-08
- Enmienda: ADR-034, regla 9
- Relacionadas: ADR-022, ADR-032, ADR-039

## Contexto

El lector y la carga de PDF ya existen, pero el extractor confunde índices y referencias internas con artículos. Los originales de 2026 contienen capítulos con ordinales españoles, introducciones, convenciones, cierres, un organigrama, una tabla y un anexo que el modelo de artículos de texto no representa. Sus índices tienen diferencias con el cuerpo: la numeración y los títulos digitales deben salir del cuerpo, conservando la redacción original.

Mateo autorizó completar Normativa y cargar los originales en producción con la versión actual de la app, incluidos Wallet y Wordle. Producción continúa sin dominio público; este trabajo no inicia el lanzamiento ni convierte disposiciones en reglas de otros módulos.

## Decisión

1. **Formato portable.** `oe-normativa/2` exige `kind`, `source`, `pages`, `sha256` del PDF y `units` ordenadas. Cada unidad tiene `key`, `unitType` (`ARTICLE` o `SECTION`), capítulo, título, páginas y bloques. Solo ARTICLE lleva `number` y su clave sigue `art-n`; SECTION lleva número nulo. Los bloques son texto literal, tabla con encabezados/filas o imagen privada por `assetId` y alternativa textual. Se conserva la importación v1 como artículos con bloques de texto.
2. **Persistencia aditiva.** `document_article` conserva nombre, IDs, anclas y búsqueda española; añade `unit_type` y `blocks`, y permite número nulo solo en secciones. La migración convierte los cuerpos existentes en bloques de texto. `body` se deriva de los bloques, incluidas las relaciones entre celdas y la descripción de imagen, y alimenta el mismo índice GIN. `document.content_sha256` registra la huella normalizada del contenido cargado.
3. **Integridad.** Reemplazar y publicar bloquean la fila del documento con `FOR UPDATE`. La carga revalida el JSON y comprueba tipo, SHA del original, claves, páginas y medios PRIVATE/READY antes de borrar contenido anterior. Solo se reemplazan borradores. Estatutos y reglamento necesitan al menos un artículo para publicarse; ACTA/OTRO conservan la posibilidad anterior de publicar solo el PDF. La publicación puede recibir la huella revisada y rechaza una revisión obsoleta. Carga, cambios de estado y huellas quedan auditados.
4. **Lectura.** Un componente compartido sirve `/app/normativa/[id]` y `/admin/documentos/[id]`. La vista administrativa requiere ADMIN incluso para sus metadatos y no registra onboarding. La lista, el índice y la búsqueda distinguen artículos y secciones. Las imágenes usan el sistema existente de medios privados; el PDF conserva su objeto propio y enlace prefirmado, sin embeberlo ni cambiar CSP.
5. **Extracción y revisión.** El extractor se ejecuta fuera del build con Python/pdfplumber. Conserva párrafos, numerales, títulos completos y páginas, separa índices de contenido y permite perfiles privados para geometría ambigua. No inventa cuerpos. Los perfiles, originales, imagen extraída y JSON revisados permanecen fuera del repositorio; las pruebas versionadas usan únicamente documentos sintéticos. La revisión de 2026 exige 60 artículos/5 capítulos en estatutos y 74 artículos/12 capítulos en reglamento, más siete secciones entre ambos.
6. **Operación privada.** `normativa:import -- --input <manifiesto>` simula por defecto. `--apply --actor-id <ADMIN>` carga borradores; `--apply --publish` solo publica cargas previas idénticas, sin cargar ni reemplazar. El manifiesto declara PDF, JSON, título, versión, audiencia MEMBERS e imágenes por archivo/SHA. Los placeholders de imágenes del extractor se resuelven a medios privados. Se verifica todo el lote antes de escribir; se reutilizan documentos por tipo/versión/hash y medios por bytes. Se ejecuta una sola importación a la vez. No crea personas ni sesiones, no registra consentimientos y no envía mensajes.

## Consecuencias

- El corpus completo es consultable sin convertir el lector en un editor ni introducir un chat o LLM.
- Portadas y firmas gráficas permanecen en los PDF originales; el organigrama se extrae sin recrearlo y la tabla se transcribe como tabla accesible. Las erratas normativas no se corrigen silenciosamente.
- `npm run test:extractor` y CI verifican el parser con PDF sintéticos; pruebas de dominio, importador y navegador cubren integridad, permisos, búsqueda y publicación.
- El despliegue sigue CI → staging sintético → promoción del mismo SHA → carga real en producción y verificación privada. El dominio y los demás pendientes de lanzamiento siguen su seguimiento propio.
