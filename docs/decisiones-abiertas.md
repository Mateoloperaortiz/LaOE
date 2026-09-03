# Decisiones abiertas

Preguntas sin cerrar. Cuando una se decide, se anota la fecha y el resultado en la tabla de cerradas y pasa a [00-vision.md](00-vision.md) o a una ADR nueva.

## Abiertas

| # | Pregunta | Opciones | Quién decide | Cómo se cierra |
| --- | --- | --- | --- | --- |
| 1 | Anonimización de egresados: plazo para borrar teléfono, notas y respuestas (nombre, comités y ledger se conservan) | Lo que diga la política aprobada · 5 años si no lo dice · otro | OE (junta) | Al recibir el texto de la política; mientras tanto el job `retention` queda apagado |

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
| 2026-09-02 | ¿Toda la infraestructura en Cloudflare? | No: sin Postgres gestionado (D1 es SQLite) ni proceso permanente, y Next.js vía OpenNext sin módulos nativos; se sigue en Railway ([01-arquitectura.md](01-arquitectura.md)) |
| 2026-09-02 | ¿Egresados con acceso de solo lectura? | No en v1: el correo institucional suele caducar al graduarse; se guarda correo personal opcional con consentimiento ([ADR-024](adr/ADR-024-reglas-de-participacion.md)) |
| 2026-09-02 | Código rotativo en QR | Opcional por ocasión, apagado por defecto ([ADR-024](adr/ADR-024-reglas-de-participacion.md)) |
| 2026-09-02 | Tope y mínimo de comités por persona | Mínimo 1, máximo 3 ([ADR-024](adr/ADR-024-reglas-de-participacion.md)) |
| 2026-09-02 | Requisito de asambleas por término | Dos ordinarias, más la elección de junta (y su segunda vuelta si la hay) obligatorias en el segundo semestre; ajustes solo ADMIN con motivo ([ADR-024](adr/ADR-024-reglas-de-participacion.md)) |
| 2026-09-02 | Fórmula de score de comité | Participación relativa con suavizado hacia la media (`k = 5`); cruda y suavizada guardadas ([ADR-024](adr/ADR-024-reglas-de-participacion.md)) |
| 2026-09-02 | ¿Se migran los badges de GHPOINTS? | No; niveles derivados del ledger ([ADR-024](adr/ADR-024-reglas-de-participacion.md)) |
