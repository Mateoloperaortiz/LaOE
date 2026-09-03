# Decisiones abiertas

Preguntas sin cerrar. Cuando una se decide, se anota la fecha y el resultado en la tabla de cerradas y pasa a [00-vision.md](00-vision.md) o a una ADR nueva.

## Abiertas

| # | Pregunta | Opciones | Quién decide | Cómo se cierra |
| --- | --- | --- | --- | --- |
| 1 | ¿Egresados con acceso de solo lectura a Mi OE? | Sí en v1.5 · No | OE (GH) | Decidir en la fase 2 según demanda |
| 2 | Código rotativo en QR | Siempre · Solo en ocasiones grandes · Opcional por ocasión (propuesta) | GH | Probar en la primera ocasión grande de la fase 3 |
| 3 | Tope y mínimo de comités por persona | 1 a 3 (propuesta) · otro | GH | Confirmación de GH; valor en `AppConfig` |
| 4 | Requisito de asambleas por término | 2 (propuesta) · otro; quién puede ajustarlo | GH | Confirmación de GH; valor en `AppConfig` |
| 5 | Fórmula de score de comité | Participación relativa simple (ADR-009) · Ponderada (60/20/10/10) | GH | Decidir con datos de un término completo |
| 6 | Anonimización de egresados: plazo | Lo que diga la política aprobada · 5 años si no lo dice | OE (junta) | Al recibir el texto de la política |
| 7 | ¿Se migran los badges de GHPOINTS? | No (derivar niveles del ledger) · Sí como `LEGACY` | GH | Antes del ensayo de migración |

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
| 2026-09-02 | Entornos de prueba en Railway | `staging` persistente desde la fase 0 siguiendo `main`; `production` desde la fase 6 con rama `production`; entornos de PR apagados ([ADR-023](adr/ADR-023-operacion-entornos-respaldo-correo.md)) |
| 2026-09-02 | Destino de la copia mensual cifrada | Bucket privado de Cloudflare R2, alimentado por un servicio cron de Railway ([ADR-023](adr/ADR-023-operacion-entornos-respaldo-correo.md)) |
| 2026-09-02 | Nombre del repositorio remoto en GitHub | `LaOE`; la carpeta local sigue siendo `casa-digital` |
| 2026-09-02 | Política de tratamiento de datos | Ya aprobada por la OE; falta subir el texto al repositorio ([11-contenido-pendiente.md](11-contenido-pendiente.md)) |
| 2026-09-02 | Umbral para pasar de Resend a SES | Desbordamiento automático a SES desde 95 correos diarios o ante error de cuota; campañas siempre por SES ([ADR-023](adr/ADR-023-operacion-entornos-respaldo-correo.md)) |
| 2026-09-02 | ¿Bajar a Railway Hobby después del cutover? | No: se sigue en Pro |
| 2026-09-02 | ¿CDN (Cloudflare) delante de Railway? | No por ahora; se revisaría ante spam, lentitud medida o cargos de egreso |
