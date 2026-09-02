# Decisiones abiertas

Preguntas sin cerrar. Cuando una se decide, se anota la fecha y el resultado, y pasa a [00-vision.md](00-vision.md) o a una ADR nueva.

| # | Pregunta | Opciones | Quién decide | Cómo se cierra | Estado |
| --- | --- | --- | --- | --- | --- |
| 1 | ¿La OE tiene licencia de TT Bluescreens y NouvelR? | Usar las originales desde el mismo origen · Barlow Condensed + Manrope como adaptación | OE (comunicaciones) | Confirmación por escrito; archivos de fuente | Abierta |
| 2 | ¿Neon Free alcanza o pasa a Launch? | Free con alerta · Launch por uso (≈ US$8 a 12) | Mateo | Medir CU-horas durante la fase 2 con datos reales | Abierta |
| 3 | Nombre de la carpeta y del repositorio | `Untitled` → `web`, `casa-digital` u `oe-eafit` | Mateo | Renombrar antes de crear el remoto en GitHub | Abierta |
| 4 | Política de tratamiento de datos | Texto oficial de la OE · Plantilla propuesta en `/privacidad` | OE (junta) | Aprobación de la junta; versión 1.0 registrada en `AppConfig` | Abierta |
| 5 | Umbral para pasar de Resend a SES | Mantener Resend gratis · SES cuando un día supere 100 correos | Mateo | Revisar el registro de mensajes tras el primer evento grande | Abierta |
| 6 | Dominio para medios y control del DNS | `media.oeeafit.com` en R2 · servir todo por Vercel | Mateo + quien administre el DNS | Acceso al DNS confirmado | Abierta |
| 7 | ¿Egresados con acceso de solo lectura a Mi OE? | Sí en v1.5 · No | OE (GH) | Decidir en la fase 2 según demanda | Abierta |
| 8 | Código rotativo en QR | Siempre · Solo en ocasiones grandes · Opcional por ocasión (propuesta) | GH | Probar en la primera ocasión grande de la fase 3 | Abierta |
| 9 | Tope y mínimo de comités por persona | 1 a 3 (propuesta) · otro | GH | Confirmación de GH; valor en `AppConfig` | Abierta |
| 10 | Requisito de asambleas por término | 2 (propuesta) · otro; quién puede ajustarlo | GH | Confirmación de GH; valor en `AppConfig` | Abierta |
| 11 | Fórmula de score de comité | Participación relativa simple (ADR-009) · Ponderada (60/20/10/10) | GH | Decidir con datos de un término completo | Abierta |
| 12 | ¿Vercel Pro desde la fase 0 o Hobby hasta la fase 3? | Pro desde el inicio (crons por minuto) · Hobby y subir al llegar el outbox | Mateo | Al crear el proyecto en Vercel | Abierta |
| 13 | Anonimización de egresados: plazo | 5 años (propuesta) · otro | OE (junta) | Junto con la política de datos | Abierta |
| 14 | ¿Se migran los badges de GHPOINTS? | No (derivar niveles del ledger) · Sí como `LEGACY` | GH | Antes del ensayo de migración | Abierta |
