# Decisiones abiertas

Preguntas sin cerrar. Cuando una se decide, se anota la fecha y el resultado en la tabla de cerradas y pasa a [00-vision.md](00-vision.md) o a una ADR nueva.

## Abiertas

| # | Pregunta | Opciones | Quién decide | Cómo se cierra |
| --- | --- | --- | --- | --- |
| 4 | Presupuesto del comité: ¿rubros estándar, año calendario o semestre, aprobación de la Vicepresidencia Financiera para los traslados, soportes y topes por rubro? | Se implementa con presupuesto anual, sin aprobación previa ni soportes, y se ajusta con la respuesta | Finanzas y la junta | Enmienda a [ADR-059](adr/ADR-059-presupuesto-del-comite.md) al implementarla |
| 3 | ¿Qué datos ligan organizaciones y patrocinios a un comité para el área Aliados? | (a) `Card.committeeId` en las tarjetas de patrocinio; (b) `Organization.committeeId`; (c) ambos | Mateo con Relaciones Públicas | Una ADR que llene el área Aliados de [ADR-058](adr/ADR-058-direccion-del-comite-por-areas.md) |
| 2 | Cuando el correo a `eafit.edu.co` vuelva a llegar, ¿el OTP vuelve a ser el método principal? | (a) Volver a dejar el código en `/ingresar` y la contraseña detrás del enlace; (b) dejar la contraseña como principal y el código como alterno, como está hoy; (c) que cada persona elija y recordar su preferencia | Mateo con la junta | Mateo lo pidió el 2026-09-10, con el correo todavía sin llegar. Se decide cuando haya **evidencia sostenida** de entrega, no cuando TI lo anuncie: la primera vez que lo anunciaron, el código seguía sin llegar. El cambio es barato —los dos caminos ya existen y solo se intercambia cuál vive en `/ingresar`—, pero conviene pesar que volver a un canal único es exactamente lo que dejó a 453 personas afuera; se registra en una enmienda a [ADR-051](adr/ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md) |
| 1 | ¿Se paga el Apple Developer Program y a nombre de quién? | Activar Apple con cuenta/certificado válidos o mantenerlo apagado; confirmar costo y titular al contratar | Mateo con la junta | Registrar titular, aprobación de gasto y cuenta operativa; no bloquea Google ni las pruebas sin secretos (ADR-040) |

## Cerradas

| Fecha | Pregunta | Resultado |
| --- | --- | --- |
| 2026-09-12 | ¿Quién gestiona los miembros de un comité además de GH? | La dirección del comité, por áreas: cada cargo declara sus capacidades y quien lo tiene ve y opera solo esa área de su comité; el General todas y es quien nombra cargos; quitar a alguien es un pedido a GH por tarea. Derivado del cargo, sin permiso técnico nuevo; `COMMITTEE_LEADER` queda como excepción ([ADR-058](adr/ADR-058-direccion-del-comite-por-areas.md)) |
| 2026-09-12 | ¿Cómo se modela la codirección y una persona con varios cargos en el mismo comité? | Tabla de cargos asignados por pertenencia con marca de codirección: un titular y una codirección por cargo, comité y término; `roleCode` queda como cargo principal derivado hasta retirarlo ([ADR-058](adr/ADR-058-direccion-del-comite-por-areas.md)) |
| 2026-09-12 | ¿Cómo se hace cumplir que un comité no exista sin General y Financiero? | Guarda para directores (primero nombran el reemplazo) y alerta para ADMIN en el tablero, la cabecera del comité y la importación; los demás cargos pueden estar vacíos ([ADR-058](adr/ADR-058-direccion-del-comite-por-areas.md)) |
| 2026-09-12 | ¿Qué lleva el Financiero de un comité? | El presupuesto anual del comité por rubros, los gastos y los traslados entre rubros, porque lo que sobra se pierde al año siguiente; la junta carga y abre el presupuesto ([ADR-059](adr/ADR-059-presupuesto-del-comite.md)) |
| 2026-09-10 | ¿Qué reemplaza al OTP por correo como credencial? | Contraseña propia con hash `scrypt`; el OTP se conserva como método alterno para cuando TI de EAFIT aplique la regla de permitidos. Passkeys siguen como mejora posterior ([ADR-051](adr/ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md)) |
| 2026-09-10 | ¿Cómo consiguen su primera credencial las 453 personas del roster? | Enlace de un solo uso que emite la junta, entregado por WhatsApp o en persona, más QR de activación en asamblea o reunión de comité. Se descartaron el correo personal como canal de acceso y el formulario público de activación ([ADR-051](adr/ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md)) |
| 2026-09-10 | ¿Quién puede emitir una recuperación de acceso para otra persona? | ADMIN y BOARD, con step-up y nunca para sí mismos. Los líderes de comité no emiten: escalaría mejor, pero le daría a cada líder la capacidad de entrar como cualquier miembro de su comité ([ADR-051](adr/ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md)) |
| 2026-09-10 | ¿Qué pasa con los correos críticos que tampoco llegan? | T-202 y T-205 ya salían por push, así que no cambian. T-200 era el único exclusivo del correo y va a alguien sin sesión: se muestra en la pantalla de activación y el correo queda como mejor esfuerzo ([ADR-051](adr/ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md)) |
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
| 2026-09-03 | ¿Cómo se lee un PDF de normativa en Mi OE? | Artículos guardados en Postgres con búsqueda; el PDF firmado se abre por enlace a una URL prefirmada. Sin cambios en la CSP ni en ADR-022 ([ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md)) |
| 2026-09-03 | ¿Se reutiliza el corpus de normativa de GHPOINTS? | No: los artículos se extraen de los PDF firmados con `scripts/normativa-extract.py`, escrito desde cero |
| 2026-09-03 | Semestres viejos en `ENTRADA A LA OE` que no existen | La vista previa los lista y al confirmar se crean con fechas por semestre calendario, editables en Términos |
| 2026-09-03 | ¿El roster también en Excel? | Sí: CSV y `.xlsx` (primera hoja) con `exceljs` |
| 2026-09-03 | ¿Qué puede hacer un líder de comité con las ocasiones de su comité? | Crea ocasiones de su comité y abre solo las de 0 puntos (reuniones); las que dan GH Points esperan a un ADMIN; no aprueba pendientes ni ajusta puntos ([ADR-035](adr/ADR-035-participacion-y-gh-points-fase-3.md)) |
| 2026-09-03 | ¿Qué ve un miembro en los rankings de GH Points? | Top 10 con nombres (foto solo con consentimiento de directorio) más el puesto y total propios; nadie ve el fondo de la tabla ([ADR-035](adr/ADR-035-participacion-y-gh-points-fase-3.md)) |
| 2026-09-03 | ¿Qué mejoras extra entran en la fase 3? | Escaneo del carnet con la cámara en modo anfitrión, ocasiones en serie semanal (adelantadas de la fase 4) y cierre automático de ocasiones ([ADR-035](adr/ADR-035-participacion-y-gh-points-fase-3.md)) |
| 2026-09-03 | ¿Exportes también en XLSX? | No en la fase 3: los exportes son CSV con step-up |
| 2026-09-04 | ¿Qué entra en la fase 4 además del núcleo de permanencia? | Todo lo del roadmap: panel de la junta con `BOARD`, reconocimientos (destacado del mes) e importación CSV de miembros a grupos ([ADR-036](adr/ADR-036-permanencia-fase-4.md)) |
| 2026-09-04 | ¿Por qué canal van los avisos de permanencia en la fase 4? | Solo en Mi OE; push y correo llegan en la fase 6 sobre los mismos avisos ([ADR-036](adr/ADR-036-permanencia-fase-4.md)) |
| 2026-09-04 | ¿El cierre de permanencia exige cerrar antes los puntos? | Sí: las propuestas se ven siempre, pero confirmar y aplicar exige `pointsClosedAt` ([ADR-036](adr/ADR-036-permanencia-fase-4.md)) |
| 2026-09-05 | ¿Qué entra en la fase 5? | Todo lo del roadmap: formularios, organizaciones y patrocinios, pipelines con dar de alta, solicitudes, convocatorias y tablero del admin ([ADR-037](adr/ADR-037-admision-aliados-y-contactos-fase-5.md)) |
| 2026-09-05 | ¿Correos transaccionales en la fase 5? | Sí, dos por outbox con el mailer que ya existe: bienvenida al dar de alta (T-200) y respuesta a una solicitud (T-205); push y campañas en la fase 6 ([ADR-037](adr/ADR-037-admision-aliados-y-contactos-fase-5.md)) |
| 2026-09-05 | ¿Cómo se mueven las tarjetas del kanban? | Botones y selector "Mover a…" más arrastrar y soltar nativo del navegador, sin librería ([ADR-037](adr/ADR-037-admision-aliados-y-contactos-fase-5.md)) |
| 2026-09-05 | ¿Qué significa pedir un cambio de comité? | Siempre para el semestre siguiente y como transferencia interna (umbral 70 %); los tipos de solicitud quedan licencia, retiro y cambio de comité. Un comité que cierra a mitad de semestre lo reasigna GH a mano ([ADR-037](adr/ADR-037-admision-aliados-y-contactos-fase-5.md)) |
| 2026-09-05 | ¿Cómo se guardan las respuestas de la encuesta tras la ocasión? | Anónimas por invitación: token propio por asistente, respuesta sin persona (solo ocasión y comité), textos libres visibles con 3 o más respuestas ([ADR-038](adr/ADR-038-comunicaciones-y-pwa-fase-6.md)) |
| 2026-09-05 | ¿Quién recibe una campaña por correo? | Activos, en licencia y honorarios por defecto con baja en un clic; egresados y externos solo con consentimiento `COMMUNICATIONS` vivo ([ADR-038](adr/ADR-038-comunicaciones-y-pwa-fase-6.md)) |
| 2026-09-05 | ¿Los avisos y recordatorios van también por correo? | Solo push; por correo salen únicamente los textos que existen: T-200, T-205 y el resultado de permanencia de quien cumple (T-202); T-203 y T-204 esperan el texto de GH ([ADR-038](adr/ADR-038-comunicaciones-y-pwa-fase-6.md)) |
| 2026-09-05 | ¿El service worker guarda algo para funcionar sin señal? | No: service worker propio solo para push y clic; el modo sin señal sigue en el backlog ([ADR-038](adr/ADR-038-comunicaciones-y-pwa-fase-6.md)) |
| 2026-09-06 | ¿Migrar GHPOINTS al lanzar? | No: Mateo confirmó que nunca estuvo en producción para la OE. Arranque limpio, archivo cifrado y retiro tras verificar, sin rollback de 48 horas (ADR-039) |
| 2026-09-06 | ¿Cómo habilitar el primer ADMIN sin roster ni política? | Bootstrap privado y auditado del acceso real de Mateo, sin consentimiento ni bienvenida; política y roster se cargan después desde la app (ADR-039) |
| 2026-09-06 | ¿Ensayo con datos reales en otro entorno? | No: solo staging con datos sintéticos y production con datos nuevos (ADR-039) |
| 2026-09-06 | ¿SES y proxy Cloudflare? | SES aplazado; Resend para todo el correo. Cloudflare conserva proxy, SSL Full, DNSSEC y www (enmienda ADR-039) |
| 2026-09-06 | ¿Retención de las copias mensuales y manuales? | 12 copias completas en total bajo casa-digital/; archivo de GHPOINTS separado por 90 días desde la eliminación verificada del proyecto GHPOINTS. Tope US$20/alerta US$15 sin aumento automático (ADR-039) |
| 2026-09-06 | ¿Qué billeteras entran y con qué contenido? | Apple Wallet y Google Wallet, cada una opcional por variables; nombre, comités, semestre e ingreso, sin foto, correo ni puntos (ADR-040) |
| 2026-09-06 | ¿Revocar retira el pase de una cuenta o cierra sesiones? | No: rota el QR de billetera fotografiado e invalida el anterior. El mismo objeto Google recibe el nuevo; Apple se agrega de nuevo. `oe1` y sesiones permanecen (ADR-040) |
| 2026-09-06 | ¿Cómo se actualiza el semestre sin otro evento del roster? | Conciliación diaria a las 00:05 de Bogotá en lotes de 100; Google por outbox, Apple por reemisión con aviso persistente (ADR-040) |
| 2026-09-06 | ¿Apple usa APNs o un servicio web de pases? | Fuera de la fase 8; vuelve a agregarse el mismo serial. Servicio web/APNs quedan en backlog (ADR-040) |
| 2026-09-06 | ¿Isotipo en el pase y token en claro? | Isotipo con nombre completo, badges oficiales; token opaco en base para reemitir, con generación/revisión. Mis datos y logs no exportan el secreto (ADR-040) |
| 2026-09-06 | ¿Qué pasa si Google falla o faltan credenciales al anonimizar? | La limpieza conserva la referencia local y el trabajo pendiente hasta respuesta exitosa o 404; nunca se declara supresión remota completada antes (ADR-040) |
