# Decisiones abiertas

Preguntas sin cerrar. Cuando una se decide, se anota la fecha y el resultado en la tabla de cerradas y pasa a [00-vision.md](00-vision.md) o a una ADR nueva.

## Abiertas

| # | Pregunta | Opciones | Quién decide | Cómo se cierra |
| --- | --- | --- | --- | --- |
| — | Ninguna por ahora. Lo pendiente es contenido, no decisiones: ver [11-contenido-pendiente.md](11-contenido-pendiente.md) | | | |

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
| 2026-09-02 | Entornos de prueba en Railway | `staging` persistente desde la fase 0 siguiendo `main`; `production` desde la fase 7 con rama `production`; entornos de PR apagados ([ADR-023](adr/ADR-023-operacion-entornos-respaldo-correo.md)) |
| 2026-09-02 | Destino de la copia mensual cifrada | Bucket privado de Cloudflare R2, alimentado por un servicio cron de Railway ([ADR-023](adr/ADR-023-operacion-entornos-respaldo-correo.md)) |
| 2026-09-02 | Nombre del repositorio remoto en GitHub | `LaOE`; la carpeta local sigue siendo `casa-digital` |
| 2026-09-02 | Política de tratamiento de datos | Ya aprobada por la OE; falta subir el texto al repositorio ([11-contenido-pendiente.md](11-contenido-pendiente.md)) |
| 2026-09-02 | Umbral para pasar de Resend a SES | Desbordamiento automático a SES desde 95 correos diarios o ante error de cuota; campañas siempre por SES ([ADR-023](adr/ADR-023-operacion-entornos-respaldo-correo.md)) |
| 2026-09-02 | ¿Bajar a Railway Hobby después del cutover? | No: se sigue en Pro |
| 2026-09-02 | ¿CDN (Cloudflare) delante de Railway? | No por ahora; se revisaría ante spam, lentitud medida o cargos de egreso |
| 2026-09-02 | ¿Toda la infraestructura en Cloudflare? | No: sin Postgres gestionado (D1 es SQLite) ni proceso permanente, y Next.js vía OpenNext sin módulos nativos; se sigue en Railway ([01-arquitectura.md](01-arquitectura.md)) |
| 2026-09-02 | ¿Egresados con acceso de solo lectura? | No: el correo institucional caduca al graduarse; el perfil queda como egresado con su historia ([ADR-030](adr/ADR-030-perfil-de-egresado.md)) |
| 2026-09-02 | Código rotativo en QR | Opcional por ocasión, apagado por defecto ([ADR-024](adr/ADR-024-reglas-de-participacion.md)) |
| 2026-09-02 | Tope y mínimo de comités por persona | Mínimo 1, máximo 3 ([ADR-024](adr/ADR-024-reglas-de-participacion.md)) |
| 2026-09-02 | Requisito de asambleas por término | Obligatorias: una ordinaria en primer semestre; una ordinaria más la elección de junta (y su segunda vuelta) en segundo semestre. Faltar a una obligatoria implica expulsión. El 10 % exige tres asistencias ([ADR-028](adr/ADR-028-permanencia-consecuencias.md)) |
| 2026-09-02 | Fórmula de score de comité | Participación relativa con suavizado hacia la media (`k = 5`); cruda y suavizada guardadas ([ADR-024](adr/ADR-024-reglas-de-participacion.md)) |
| 2026-09-02 | ¿Se migran los badges de GHPOINTS? | No; niveles derivados del ledger ([ADR-024](adr/ADR-024-reglas-de-participacion.md)) |
| 2026-09-02 | Tabla de permanencia completa de GH | Es la general (unos 50 puntos); el resto lo pone la tabla de cada comité (unos 60); la suma no es 100 exacto ([ADR-027](adr/ADR-027-permanencia-reglas-de-gh.md)) |
| 2026-09-02 | GT Macroeventos 4/6/8 % | Por cantidad de GT con buen desempeño: uno 4, dos 6, tres o más 8 |
| 2026-09-02 | Quién evalúa el buen desempeño y cuándo | El director de GH de cada frente, al cerrar el semestre; las tareas de nuevos, el GH principal (Miguel Gaviria); el Athletic, su capitán y su DT; la barra brava, el GH de turno con las asistencias a partidos ([ADR-028](adr/ADR-028-permanencia-consecuencias.md)) |
| 2026-09-02 | Qué pasa por debajo del umbral | Hasta 10 puntos por debajo: periodo de prueba con umbral 80 % el término siguiente. Más de 10: sale de ese comité; si no le queda otro donde cumpla o esté en prueba, sale de la OE ([ADR-028](adr/ADR-028-permanencia-consecuencias.md)) |
| 2026-09-02 | ¿Umbral y pesos cambian por término? | Umbrales fijos: activo 60 %, nuevo o en prueba 80 %, transferencia interna 70 % en ese comité |
| 2026-09-02 | Comités de trabajo vs 27 comités | Distintos: CAP, CGH, CCM, CAE, CML, CAF y Athletic, liderados por cargos de junta ([12-permanencia.md](12-permanencia.md)) |
| 2026-09-02 | Presupuesto de cada ámbito | Nominal: general 50, comité 60; los umbrales son puntos sobre la suma |
| 2026-09-02 | Quien está en varios comités | Un resultado por comité: general más la tabla de ese comité; sin comité principal. Cumplir en uno y no en otro: sale solo del comité donde no cumplió |
| 2026-09-02 | Eventos 1 y 2 de la tabla del comité | Cada comité define su peso; pendientes en A3 |
| 2026-09-02 | ¿La tabla del comité decide la permanencia en el comité? | La permanencia se define con el total por comité |
| 2026-09-02 | Puntos por tipo de actividad | Los define GH al crear cada actividad; las reuniones de comité no dan puntos |
| 2026-09-02 | Consecuencia de faltar a una asamblea obligatoria | Expulsión de la OE; la app avisa antes de cada obligatoria y propone la salida en el cierre |
| 2026-09-02 | Vocabulario de `ESTADO` en el roster | GH confirmó: `Activo`, `Licencia`, `Honorario`, `Retirado`, `Prueba` |
| 2026-09-02 | Lista de cargos dentro del comité | GH confirmó que son seis: General, Financiero, Publicidad, Relaciones Públicas, Logística, Gestión Humana; `CARGO` llega en una segunda entrega ([13-importacion-del-roster.md](13-importacion-del-roster.md)) |
| 2026-09-03 | ¿`General` otorga el permiso de líder sin confirmación? | No: la importación lo propone marcado y el ADMIN confirma ([ADR-030](adr/ADR-030-perfil-de-egresado.md)) |
| 2026-09-03 | Anonimización de egresados: plazo | No hay plazo: al salir, el perfil queda como egresado (memorial) con su historia institucional según consentimiento; se depura lo que no es historia; la eliminación a pedido anonimiza de inmediato ([ADR-030](adr/ADR-030-perfil-de-egresado.md)) |
