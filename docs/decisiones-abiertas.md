# Decisiones abiertas

Preguntas sin cerrar. Cuando una se decide, se anota la fecha y el resultado en la tabla de cerradas y pasa a [00-vision.md](00-vision.md) o a una ADR nueva.

## Abiertas

| # | Pregunta | Opciones | Quién decide | Cómo se cierra |
| --- | --- | --- | --- | --- |
| 1 | Nombre del repositorio remoto en GitHub (la carpeta ya es `casa-digital`) | `casa-digital` · `oe-casa-digital` · `laoe` | Mateo | Al crear el remoto |
| 2 | Política de tratamiento de datos | Texto oficial de la OE · Plantilla propuesta en `/privacidad` | OE (junta) | Aprobación de la junta; versión 1.0 registrada en `AppConfig` |
| 3 | Umbral para pasar de Resend a SES | Mantener Resend gratis · SES cuando un día supere 100 correos | Mateo | Revisar el registro de mensajes tras el primer evento grande |
| 4 | ¿Egresados con acceso de solo lectura a Mi OE? | Sí en v1.5 · No | OE (GH) | Decidir en la fase 2 según demanda |
| 5 | Código rotativo en QR | Siempre · Solo en ocasiones grandes · Opcional por ocasión (propuesta) | GH | Probar en la primera ocasión grande de la fase 3 |
| 6 | Tope y mínimo de comités por persona | 1 a 3 (propuesta) · otro | GH | Confirmación de GH; valor en `AppConfig` |
| 7 | Requisito de asambleas por término | 2 (propuesta) · otro; quién puede ajustarlo | GH | Confirmación de GH; valor en `AppConfig` |
| 8 | Fórmula de score de comité | Participación relativa simple (ADR-009) · Ponderada (60/20/10/10) | GH | Decidir con datos de un término completo |
| 9 | Anonimización de egresados: plazo | 5 años (propuesta) · otro | OE (junta) | Junto con la política de datos |
| 10 | ¿Se migran los badges de GHPOINTS? | No (derivar niveles del ledger) · Sí como `LEGACY` | GH | Antes del ensayo de migración |
| 11 | Entornos de prueba en Railway | Entornos de PR con seed sintético y sin staging permanente (propuesta) · un staging persistente · solo local | Mateo | En la fase 0, al crear el proyecto |
| 12 | Destino de la copia mensual cifrada (base + objetos del bucket) fuera de Railway | Bucket gratis de Cloudflare R2 o Backblaze B2 cifrado con `age` (propuesta) · OneDrive institucional · artefacto de GitHub Actions (caduca) | Mateo | En la fase 0 |
| 13 | ¿Bajar a Railway Hobby (US$5) después del cutover? | Seguir en Pro (PITR, entornos de PR) · Hobby | Mateo | Tras un mes de operación con la app nueva |
| 14 | ¿CDN gratis (Cloudflare) delante de Railway para el portal público? | Sin CDN (propuesta inicial) · Cloudflare como proxy con caché | Mateo | Medir latencia y egreso tras la fase 1 |

## Cerradas

| Fecha | Pregunta | Resultado |
| --- | --- | --- |
| 2026-09-02 | Nombre de la carpeta del repositorio | `Untitled` → `casa-digital` |
| 2026-09-02 | Neon Free vs Launch | Sin efecto: el hosting es Railway ([ADR-021](adr/ADR-021-infraestructura-railway.md)) |
| 2026-09-02 | Dominio propio para medios (`media.oeeafit.com`) | No se necesita: bucket privado y URL prefirmadas |
| 2026-09-02 | Vercel Pro desde la fase 0 o Hobby | Sin efecto: Railway en el workspace Pro existente |
| 2026-09-02 | Licencia de TT Bluescreens y NouvelR | La OE no tiene licencias. Sustitutos libres elegidos por comparación visual: Sofia Sans Extra Condensed (títulos) y Plus Jakarta Sans (contenido), ambas OFL ([07-marca.md](07-marca.md)) |
| 2026-09-02 | Isotipo solo como favicon e ícono de PWA | Aprobado por Mateo dentro del uso condicionado del manual |
| 2026-09-02 | Vectores de los elementos gráficos | Se redibujan como componentes SVG en el repositorio; los 27 logos de comités ya están en SVG monocromo en `LaOE/public/logos` |
| 2026-09-02 | Subida de medios | Directa al bucket con `POST` prefirmado y CORS, entrega por redirección prefirmada: Railway lo documenta ([ADR-022](adr/ADR-022-medios-prefirmados.md)) |
