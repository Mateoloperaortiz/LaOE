# Decisiones abiertas

Preguntas sin cerrar. Cuando una se decide, se anota la fecha y el resultado en la tabla de cerradas y pasa a [00-vision.md](00-vision.md) o a una ADR nueva.

## Abiertas

| # | Pregunta | Opciones | Quién decide | Cómo se cierra |
| --- | --- | --- | --- | --- |
| 1 | ¿La OE tiene licencia de TT Bluescreens y NouvelR? | Usar las originales desde el mismo origen · Barlow Condensed + Manrope como adaptación | OE (comunicaciones) | Confirmación por escrito; archivos de fuente |
| 2 | Nombre del repositorio remoto en GitHub (la carpeta ya es `casa-digital`) | `casa-digital` · `oe-casa-digital` · `laoe` | Mateo | Al crear el remoto |
| 3 | Política de tratamiento de datos | Texto oficial de la OE · Plantilla propuesta en `/privacidad` | OE (junta) | Aprobación de la junta; versión 1.0 registrada en `AppConfig` |
| 4 | Umbral para pasar de Resend a SES | Mantener Resend gratis · SES cuando un día supere 100 correos | Mateo | Revisar el registro de mensajes tras el primer evento grande |
| 5 | ¿Egresados con acceso de solo lectura a Mi OE? | Sí en v1.5 · No | OE (GH) | Decidir en la fase 2 según demanda |
| 6 | Código rotativo en QR | Siempre · Solo en ocasiones grandes · Opcional por ocasión (propuesta) | GH | Probar en la primera ocasión grande de la fase 3 |
| 7 | Tope y mínimo de comités por persona | 1 a 3 (propuesta) · otro | GH | Confirmación de GH; valor en `AppConfig` |
| 8 | Requisito de asambleas por término | 2 (propuesta) · otro; quién puede ajustarlo | GH | Confirmación de GH; valor en `AppConfig` |
| 9 | Fórmula de score de comité | Participación relativa simple (ADR-009) · Ponderada (60/20/10/10) | GH | Decidir con datos de un término completo |
| 10 | Anonimización de egresados: plazo | 5 años (propuesta) · otro | OE (junta) | Junto con la política de datos |
| 11 | ¿Se migran los badges de GHPOINTS? | No (derivar niveles del ledger) · Sí como `LEGACY` | GH | Antes del ensayo de migración |
| 12 | Entornos de prueba en Railway | Entornos de PR (Pro, base vacía por PR) · un staging bajo demanda · solo local | Mateo | En la fase 0, al crear el proyecto |
| 13 | Subida de medios | A través de la app en streaming (propuesta) · directa al bucket con URL prefirmada si el bucket de Railway soporta CORS | Mateo | Probar CORS del bucket en la fase 1 |
| 14 | Destino de la copia mensual cifrada de la base fuera de Railway | Artefacto de GitHub Actions · Google Drive personal · otro proveedor de objetos | Mateo | En la fase 0 |
| 15 | ¿Bajar a Railway Hobby (US$5) después del cutover? | Seguir en Pro (PITR, entornos de PR) · Hobby | Mateo | Tras un mes de operación con la app nueva |
| 16 | ¿CDN gratis (Cloudflare) delante de Railway para el portal público? | Sin CDN · Cloudflare como proxy con caché | Mateo | Medir latencia y egreso tras la fase 1 |
| 17 | Isotipo solo como favicon e ícono de PWA (uso "condicionado" según el manual) | Isotipo · isotipo con anillo en color · versión especial aprobada | OE (comunicaciones) | Confirmar antes de la fase 1 |
| 18 | Archivos vectoriales de los elementos gráficos (estrellas, bucles, franjas) fuera de Canva | Exportar SVG desde Canva con los códigos del manual · redibujar en el repositorio | Mateo + OE | Antes de la fase 1 |

## Cerradas

| Fecha | Pregunta | Resultado |
| --- | --- | --- |
| 2026-09-02 | Nombre de la carpeta del repositorio | `Untitled` → `casa-digital` |
| 2026-09-02 | Neon Free vs Launch | Sin efecto: el hosting es Railway ([ADR-021](adr/ADR-021-infraestructura-railway.md)) |
| 2026-09-02 | Dominio propio para medios (`media.oeeafit.com`) | No se necesita: un bucket privado servido por la app |
| 2026-09-02 | Vercel Pro desde la fase 0 o Hobby | Sin efecto: Railway en el workspace Pro existente |
