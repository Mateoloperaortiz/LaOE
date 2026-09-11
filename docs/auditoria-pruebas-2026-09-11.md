# Auditoría de pruebas · 2026-09-11

El [inventario original](auditoria-pruebas-2026-09-11.json) conserva los conteos y hashes de la auditoría inicial. La sección siguiente registra la corrección posterior; después se conserva la foto inicial para explicar los hallazgos.

## Corrección posterior: R1–R3 resueltos

El drenaje ya rechaza tanto fallos nuevos como trabajos con un error guardado y un reintento aplazado. Se ejecuta antes de las limpiezas y automáticamente al terminar cada escenario. El launcher crea, migra y siembra una base local desechable por corrida y la elimina incluso si Playwright falla. La base autenticada se restaura antes de cada caso en los 53 specs. Normativa, permanencia y Wallet preparan sus propios documentos, evaluaciones y mensajes; los recorridos de varias etapas permanecen agrupados con `test.step`.

El semestre actual y el anterior se calculan en Bogotá y se adaptan solo en la base E2E, conservando las relaciones por ID. Selectores, CSV y fechas de actividades y licencias usan ese calendario. También se trasladan las entradas y salidas de las pertenencias sintéticas para evitar salidas anteriores al ingreso. Los términos cerrados de 2019 y las versiones históricas de documentos siguen siendo históricos. Decisión y límites operativos: [ADR-052](adr/ADR-052-aislamiento-y-fallos-de-las-pruebas-e2e.md).

| Verificación posterior | Resultado |
| --- | --- |
| `npm run check` | 385 unitarias, 309 de integración, 11 de Python y build aprobados; controles estáticos en verde. |
| Primera corrida E2E completa | 169/169; cero reintentos, omitidos, inestables o fallos del outbox. |
| Repetición completa consecutiva | 169/169 con el mismo resultado. |
| Archivos en orden inverso | Los mismos 169/169; de `wordle.spec.ts` a `acceso.spec.ts`, con los 53 specs presentes. |
| Lectores aislados de sus antiguos productores | 7/7: dos autenticaciones, dos lectores de normativa, el lector de evaluaciones y los dos casos SEO. |
| Fallo deliberado de un handler real | Playwright termina con código 1 por el drenaje automático, aunque el cuerpo del test termina bien. Un fallo esperado y dos autenticaciones aprobadas; prueba de control externa a la suite habitual. |
| Ejecución directa sin launcher | Se rechaza con código 1 antes de arrancar el servidor o preparar datos. |
| Protección y limpieza de bases | Huellas de las 76 tablas de desarrollo idénticas antes y después; ninguna base `casa_e2e_<id>` restante. |
| Cambio de calendario | Cinco casos de integración con el reloj por defecto de `getCurrentTerm()`: fin de 2026, inicio de 2027, cambio de semestre de 2027 y 29 de febrero de 2028. También se verifican las relaciones de las pertenencias. |

La suite actual suma **874 casos en las cuatro familias que reportan casos individuales**, más el harness Bash ya aprobado en la auditoría inicial. Hay 172 archivos de prueba: se añadieron dos unitarios y uno de integración, con 25 casos de protección del entorno, drenaje y calendario. Los ensayos de fallo deliberado no se incluyen en ese total. La [evidencia posterior en JSON](verificacion-e2e-2026-09-11.json) conserva los resultados, el orden real de ejecución y hashes del soporte nuevo; los logs temporales están en `/tmp/laoe-e2e-repair.7BeTsl`.

Para repetir: `CI=true npm run test:e2e`, otra vez el mismo comando y `E2E_ORDER=reverse CI=true npm run test:e2e`. La preparación de base es automática; no hay que ejecutar `db:reset` contra desarrollo. Los ejemplos de casos aislados y puertos están en [Verificación](10-verificacion.md).

El reloj futuro se comprobó en integración, no adelantando todo Chromium. El almacenamiento sigue siendo Garage local compartido y se mantiene un worker. **R4 y la parte restante de R5 siguen abiertos**: continúan los mensajes de Next sobre streams cerrados, sin causa atribuida aquí, y quedan títulos y alcances por precisar. El título del líder de permanencia sí quedó ajustado a lo que verifica. Estos límites no se confunden con los fallos del outbox, que ahora son bloqueantes.

## Foto de la auditoría inicial

La suite original terminaba en verde con datos locales recién sembrados, pero no todas sus comprobaciones eran necesarias o suficientes tal como estaban escritas. Se reforzaron aserciones que admitían falsos positivos, se quitaron operaciones que solo comprobaban el montaje del test y se agruparon pasos dependientes de navegador. No hay evidencia para borrar un archivo de cobertura funcional completo.

**Resultado final de los runners: 849 casos aprobados, cero fallidos, omitidos o pendientes, más el harness de respaldo aprobado.** Esto no certifica que todo el comportamiento de la aplicación esté cubierto: la segunda ejecución E2E dejó errores de trabajos en sus logs sin hacer fallar Playwright. Ese hallazgo sigue abierto y se detalla en R1.

## Alcance y criterio

Revisión del repositorio en `f7546c2`, inicialmente sin cambios locales. Se inventariaron y leyeron los 168 archivos de prueba originales: 48 unitarios, 64 de integración, 53 specs E2E, un setup de autenticación, un módulo Python y un harness Bash. La protección añadida para la base de pruebas eleva el inventario final a 169 archivos. También se revisaron package.json, CI, configuración de runners, fixtures y helpers.

Se conserva un caso si protege una regla de negocio, un límite de permisos, una regresión concreta, un contrato de un adaptador, una restricción SQL o un recorrido de interfaz. Coincidir en tema entre unitario, integración y E2E no lo vuelve redundante: cada capa puede fallar por motivos distintos. Las matrices de roles, estados, anchos y temas representan condiciones distintas. La necesidad absoluta de cada línea no se puede demostrar solo con una ejecución verde; esta es una valoración de utilidad con evidencia de código y ejecución, no una prueba de minimalidad matemática.

El [inventario JSON](auditoria-pruebas-2026-09-11.json) contiene cada caso ejecutado, estado, archivo, propósito, decisión y hash SHA-256 del archivo revisado. Incluye los casos expandidos por parámetros y bucles. Los dos ingresos de `auth.setup.ts` cuentan como preparación, no como dos funcionalidades nuevas. El harness Bash informa sus diez comprobaciones por separado.

## Ejecución

| Capa | Antes | Después | Resultado |
| --- | ---: | ---: | --- |
| Unitarias | 356 / 48 archivos | 365 / 49 archivos | PASS; también con orden aleatorio |
| Integración | 304 / 64 archivos | 304 / 64 archivos | PASS; PostgreSQL y Garage locales; también con orden aleatorio |
| Navegador | 182 + 2 setup / 54 archivos | 167 + 2 setup / 54 archivos | PASS; Chromium, build de producción, cero reintentos |
| Extractor Python | 11 / 1 archivo | 11 / 1 archivo | PASS; PDFs sintéticos |
| Respaldo Bash | 1 harness | 1 harness | PASS; diez comprobaciones, incluida restauración real |
| Calidad y build | — | `npm run check` | PASS: Biome, sintaxis Bash, tipos, dependencias, knip, unitarias, Python, integración y build |

En la validación final habitual, unitarias tardó 1,06 s e integración 64,56 s; Playwright, aproximadamente 3,1 min. Son tiempos de esta máquina, sin deducir una mejora de rendimiento de la diferencia frente al inicio. Las ejecuciones aleatorias completas originales usaron semilla 20260910 y las finales 20260911; ambas pasaron. No se ejecutó una campaña exhaustiva de semillas ni de navegadores.

Entorno: Node 24.19, PostgreSQL 18, Garage 2.3, TZ UTC y fechas de negocio de Bogotá. La auditoría creó bases locales desechables distintas de la base de desarrollo y usó los valores sintéticos de .env.example. Los adaptadores de correo y push se mantuvieron en consola; Google usa transportes simulados y Apple claves de prueba. No se ensayaron servicios externos de producción.

La ejecución original partió de una base nueva. La final repitió sobre esa base, con el global setup existente: esa diferencia permitió detectar R1. El registro previo del roadmap sobre tres fallos de eventos/SEO en una base de desarrollo con comités DRAFT no queda desmentido por este PASS: el seed inserta PUBLISHED al crear el comité, pero en conflicto solo actualiza el logo. Por tanto, una base antigua puede conservar otro estado.

## Correcciones realizadas

| Hallazgo | Cambio y evidencia |
| --- | --- |
| El hash podía ser constante y pasar la prueba | `identity-pure` compara SHA-256 con un vector conocido y exige diferencia entre entradas. |
| La prueba de trabajo de contraseña aceptaba una función vacía | Comprueba invocación de scrypt con el costo acordado y que la promesa espere el callback; no depende de medir milisegundos. |
| La encuesta no verificaba que el orden ocultara la llegada | Compara el resultado al invertir y rotar las respuestas. |
| Campos inválidos combinados ocultaban validaciones ausentes | En admin-kit y forms-pure se mantiene válido el resto de la entrada al probar cada campo. |
| Veinticuatro comprobaciones de nulidad aceptaban undefined | Fechas exigen Date y valores vivos exigen existencia o tipo; una fila ausente ya no pasa por optional chaining. |
| Un if podía evitar comprobar el rechazo de un formulario | Se exige directamente el resultado fallido y sus errores. |
| Un array vacío satisfacía every al cerrar permanencia | Se exige el número esperado de snapshots antes de comprobar frozenAt. |
| RECOVERY solo comprobaba el tipo del enlace | Ahora parte de una contraseña anterior, consume el enlace y comprueba aceptación de la nueva y rechazo de la vieja. |
| Rechazos de step-up no demostraban ausencia de cambios | Se preparan sesiones realmente antiguas y se comparan antes y después de los rechazos. |
| El caso titulado como fallo de SES nunca hacía fallar SES | Se provoca cuota en el primario, fallo del secundario y se verifica recibo FAILED con proveedor SES. |
| Fechas relativas podían salirse del término de la fixture | Se usa día de Bogotá en ocasiones, fecha interior para series y ventana explícita para evaluaciones. |
| Operaciones sin poder de detección | Se quitan un runCommand vacío, un UPDATE que nunca encontraba filas y una comprobación que solo leía la licencia escrita por el propio test. |
| Títulos más amplios que las aserciones | Se precisan orden del outbox, borrado por salida de la OE y puestos empatados. No se cambia la semántica transaccional del producto. |
| Fases de un mismo flujo contadas como casos independientes | En ocho specs E2E, 24 casos pasan a nueve recorridos completos con test.step y contextos por identidad. Se conservan las comprobaciones; no se saltan pruebas. |
| Recibo de push que admitía Enviado o Fallido | Cartelera y recordatorios exigen Enviado para el transporte de consola; el dispositivo se elimina desde su dueño. |
| Entorno de integración dependiente del .env | El setup fija correo de consola, jobs manuales y OTP sintético. El helper de base rechaza destinos remotos, protocolo incorrecto y nombre ausente; nueve casos nuevos protegen ese límite destructivo. |

Las consolidaciones son: agenda 2→1, cartelera-push 3→1, recordatorios 2→1, campanas 2→1, convocatorias 4→1, solicitudes 3→1, admision 4→1 y formularios 4→2. El descenso neto de seis casos del total combina quince fases E2E menos con nueve casos nuevos de protección del entorno. No es un porcentaje de cobertura eliminada.

### Comprobación con regresiones deliberadas

Se usó una copia temporal del código, restaurando la fuente después de cada cambio. Solo se ejecutó la prueba pertinente de cada regresión.

| Mutación | Prueba original | Prueba reforzada |
| --- | --- | --- |
| hashToken devuelve siempre 64 ceros | PASS: no la detectaba | FAIL: la detecta |
| burnPasswordTime retorna sin trabajar | PASS: no la detectaba | FAIL: la detecta |
| Textos de encuesta conservan orden de llegada | PASS: no la detectaba | FAIL: la detecta |

Son tres demostraciones concretas de mejora, no una puntuación de mutación global ni una medida de cobertura de todo el producto.

## Hallazgos registrados y límites de la auditoría inicial

### R1 · Prioridad alta: el drenaje E2E puede ocultar fallos del outbox

En la ejecución final hubo **30 intentos fallidos de 15 trabajos distintos**, y Playwright terminó con 169/169. Los errores incluyen claves foráneas hacia personas sintéticas eliminadas al preparar la segunda corrida. Una consulta final confirmó que los 15 trabajos con error referenciaban una persona que ya no existía. La ejecución inicial con base nueva no registró esos fallos.

[tests/e2e/outbox.ts](../tests/e2e/outbox.ts) solo observa processed; nunca exige failed === 0. [global-setup.ts](../tests/e2e/global-setup.ts) borra personas y otros registros de la corrida anterior, pero conserva trabajos pendientes que las referencian. El resultado es un falso positivo del entorno de pruebas, no evidencia de entrega correcta de todos los eventos.

Trabajo pendiente: aislar completamente la base y el outbox E2E, o limpiar únicamente sus eventos sintéticos antes de borrar sus entidades, y hacer fallar el helper al encontrar fallos inesperados. No basta con ocultar los logs ni con borrar indiscriminadamente el outbox de la base de desarrollo. Esta auditoría deja el hallazgo abierto; no declara esa parte resuelta.

### R2 · Prioridad media: quedan dependencias entre casos y fixtures compartidas

[normativa.spec.ts](../tests/e2e/normativa.spec.ts) publica documentos que los casos lectores posteriores necesitan. [permanencia-evaluaciones.spec.ts](../tests/e2e/permanencia-evaluaciones.spec.ts) consulta como miembro la evaluación y el crédito creados en casos anteriores. Convocatorias comparte la identidad que solicitudes pone después en licencia; su comentario depende expresamente del orden alfabético. En permanencia-admin se deja un grupo con liderazgo del miembro global para casos posteriores.

Corrección de la atribución original: [seo.spec.ts](../tests/e2e/seo.spec.ts) obtiene la edición `prueba` de `scripts/seed.ts`, no de `eventos.spec.ts`. Su dependencia era del contenido inicial. La restauración por escenario conserva ese contenido publicado.

Funcionan en el orden probado, con un worker; ejecutar un lector aislado, reordenar specs o reintentar después de una escritura parcial no ofrece la misma garantía. Las ocho consolidaciones reducen el problema, pero no lo eliminan globalmente. Conviene preparar datos propios por escenario y separar las identidades mutables. No se recomienda borrarlos: protegen flujos distintos.

### R3 · Prioridad media: calendario fijo en E2E

El global setup crea 2026-2 entre 2026-07-13 y 2026-12-05; muchos specs seleccionan ese código mientras la aplicación calcula el término actual con el reloj real. Fuera de esa ventana, ciertas pruebas dejarán de representar un término vigente. Es un riesgo deducido del código; no se adelantó el reloj de todo el servidor durante esta auditoría. Las mejoras de fechas de integración no corrigen ese contrato global.

La reparación requiere un reloj coherente para servidor, navegador y datos, o fixtures de término actual calculadas de forma uniforme. Las fechas históricas usadas para migración y cierres deben seguir siendo históricas: sustituir todos los literales 2026 sería incorrecto.

### R4 · El verde del navegador no significa logs de servidor limpios

El servidor emitió The destination stream closed early (17 veces en la corrida inicial y 9 en la final), sin fallos reportados por Playwright. No se atribuye aquí una causa comprobada ni se asegura que sean inocuos. Las pruebas actuales validan sus aserciones y no establecen una condición general de ausencia de errores en logs. Conviene distinguir errores esperados por interrupciones simuladas de errores inesperados antes de convertir esa observación en un criterio de fallo.

### R5 · Precisión pendiente de algunos escenarios

En fase5-base, el caso de unicidad por convocatoria añade una consulta vacía de editionRegistration que no prueba unicidad por edición. El título del rechazo de admisión incluye «sin comités», pero no ejecuta una entrada con committeeIds vacío. En permanencia-admin, el título promete agregar a alguien por nombre y el cuerpo solo comprueba navegación y ámbito. Algunos casos del portal y eventos se titulan como visitante, pero usan storageState de ADMIN: prueban esa página con sesión, no acceso anónimo. Se conservan por las comprobaciones que sí hacen, con esta cobertura acotada; deben precisarse títulos o completar sus escenarios.

### R6 · Límites de cobertura, no fallos de ejecución

Las pruebas no validan una entrega real de Resend/SES, recepción push en un dispositivo, instalación de un pase en Wallet nativo, Firefox, Safari ni iOS real. Los archivos visuales comprueban tamaños, foco, contenido y accesibilidad; no usan toHaveScreenshot como comparación de píxeles. Las capturas son evidencia auxiliar, no un oráculo visual automático. Axe comprueba las reglas configuradas, no toda la accesibilidad posible.

No se midió cobertura de líneas o ramas ni se hizo mutación exhaustiva. Pasar 500 registros concurrentes de asistencia demuestra ese caso de concurrencia; no es una prueba de carga general. Las pruebas de migración y sus parsers siguen justificadas mientras los comandos de migración/importación existan y deban poder repetirse; su retiro debe acompañar el retiro de esas herramientas.

## Reproducción y operación

En un entorno local sintético preparado según [Verificación](10-verificacion.md):

`npm run check` ejecuta controles estáticos, unitarias, Python, integración y build. `npm test` por sí solo ejecuta únicamente unitarias. Para cubrir lo restante se necesitan `CI=true npm run test:e2e -- --retries=0` sobre un build preparado para el mismo origen y `npm run test:backup`. CI ya tiene jobs para las cinco familias.

La auditoría no utilizó db:reset sobre la base de desarrollo: creó una base local desechable, aplicó migraciones y seed allí y pasó su DATABASE_URL al build y a Playwright. Integración usa otra base con sufijo _test. Para repetir el ensayo aleatorio: `npm test -- --sequence.shuffle --sequence.seed=20260911` y `npm run test:integration -- --sequence.shuffle --sequence.seed=20260911`. Un pase con base nueva y otro sobre la misma base sirven para observar la diferencia de R1.

Los logs completos de esta sesión se conservaron temporalmente en `/tmp/laoe-test-audit.dXadxs`; el JSON adjunto conserva los resultados y el resumen de errores sin copiar sesiones, claves ni payloads. Al terminar se eliminaron las dos bases desechables creadas para esta auditoría. No se publicaron cambios ni se modificó código de producción.

## Decisión por archivo

«Conservar» significa que se identificó cobertura útil; no implica que todas sus aserciones sean irreducibles ni que las limitaciones R1–R6 estén resueltas. Los resultados detallados de cada caso están en el JSON.

### Unitarias

| Archivo | Casos antes → después | Decisión | Qué protege / alcance |
| --- | ---: | --- | --- |
| [activacion-progreso.test.ts](../tests/unit/activacion-progreso.test.ts) | 6 → 6 | Conservar | Contar personas elegibles para acceso, incluidas las que no tienen comité, sin duplicar pertenencias. |
| [admin-kit.test.ts](../tests/unit/admin-kit.test.ts) | 5 → 5 | Conservar con comprobaciones reforzadas o corregidas | Escapar CSV y validar identificadores, fechas y datos administrativos; entradas inválidas ahora separadas. |
| [admin-navigation.test.ts](../tests/unit/admin-navigation.test.ts) | 2 → 2 | Conservar | Elegir el destino activo por segmentos y especificidad, sin confundir Inicio con sus descendientes. |
| [admin-resource-actions.test.ts](../tests/unit/admin-resource-actions.test.ts) | 4 → 4 | Conservar | Autorizar escrituras y conservar valores inmutables aunque el cliente los manipule. |
| [admin-resource-page.test.ts](../tests/unit/admin-resource-page.test.ts) | 6 → 6 | Conservar | Respetar capacidades del recurso, identificadores y navegación de los paneles. |
| [agenda-pure.test.ts](../tests/unit/agenda-pure.test.ts) | 1 → 1 | Conservar | Construir el calendario personal con identificadores estables, enlaces y texto plano. |
| [apple-wallet-link.test.ts](../tests/unit/apple-wallet-link.test.ts) | 4 → 4 | Conservar | Elegir navegación compatible con el modo de instalación y volver a comprobarlo al activar el enlace. |
| [backup-status.test.ts](../tests/unit/backup-status.test.ts) | 4 → 4 | Conservar | Leer la marca vigente del respaldo sin mostrar una caché vieja como estado actual. |
| [bucket-origin.test.ts](../tests/unit/bucket-origin.test.ts) | 4 → 4 | Conservar | Resolver el origen del bucket con y sin acceso por ruta; matriz de configuraciones distintas. |
| [calendar-token-access.test.ts](../tests/unit/calendar-token-access.test.ts) | 5 → 5 | Conservar | Restringir consulta, emisión y rotación del enlace privado según el estado del actor. |
| [carnet-pure.test.ts](../tests/unit/carnet-pure.test.ts) | 4 → 4 | Conservar | Formato, firma, vencimiento y manipulación de capacidades del carnet. |
| [comms-pure.test.ts](../tests/unit/comms-pure.test.ts) | 8 → 8 | Conservar | Preferencias por canal, elegibilidad de destinatarios, plantillas y límites de campañas. |
| [content-pure.test.ts](../tests/unit/content-pure.test.ts) | 3 → 3 | Conservar | Transformar contenido a texto y validar las entradas del portal. |
| [crm-fase5-pure.test.ts](../tests/unit/crm-fase5-pure.test.ts) | 7 → 7 | Conservar | Etapas de pipelines, solicitudes y selección de convocatorias sin depender de la base. |
| [crm-pure.test.ts](../tests/unit/crm-pure.test.ts) | 4 → 4 | Conservar | Normalizar filtros y construir el texto de los eventos de la historia de una persona. |
| [document-publication-action.test.ts](../tests/unit/document-publication-action.test.ts) | 5 → 5 | Conservar | Autorizar publicación y exigir revisión de la versión exacta del contenido. |
| [documents-pure.test.ts](../tests/unit/documents-pure.test.ts) | 14 → 14 | Conservar | Validar artículos, secciones, tablas e imágenes y derivar el texto buscable. |
| [download-redirects.test.ts](../tests/unit/download-redirects.test.ts) | 4 → 4 | Conservar | Conservar destino y origen público al exigir sesión para descargas; aserciones en helper. |
| [env.test.ts](../tests/unit/env.test.ts) | 23 → 23 | Conservar | Rechazar configuraciones incoherentes y validar activación de servicios y credenciales. |
| [events-pure.test.ts](../tests/unit/events-pure.test.ts) | 4 → 4 | Conservar | Generar ICS, plegar por octetos y convertir fechas de Bogotá sin perder caracteres. |
| [forms-pure.test.ts](../tests/unit/forms-pure.test.ts) | 8 → 8 | Conservar con comprobaciones reforzadas o corregidas | Validar campos, respuestas y ventana del formulario; cada campo de identidad inválido se prueba por separado. |
| [identity-pure.test.ts](../tests/unit/identity-pure.test.ts) | 20 → 20 | Conservar con comprobaciones reforzadas o corregidas | Redirecciones seguras, OTP, tokens y contraseñas; hash conocido y trabajo scrypt ahora comprobados. |
| [jobs-pure.test.ts](../tests/unit/jobs-pure.test.ts) | 4 → 4 | Conservar | Backoff, vencimiento y selección de proveedor de correo por cuota. |
| [leave-access.test.ts](../tests/unit/leave-access.test.ts) | 2 → 2 | Conservar | Mantener acceso de consulta en licencia sin habilitar operaciones por permisos heredados. |
| [mail-retry.test.ts](../tests/unit/mail-retry.test.ts) | 8 → 8 | Conservar | Reintentar transporte conservando cuerpo, cabeceras y límites; tiempos controlados. |
| [media-pure.test.ts](../tests/unit/media-pure.test.ts) | 6 → 6 | Conservar | Tipos, tamaños, claves y variantes de imagen, y clasificación de errores de procesamiento. |
| [normativa-import.test.ts](../tests/unit/normativa-import.test.ts) | 5 → 5 | Conservar | Integridad del manifiesto y decisión de importación de un PDF ya revisado. |
| [participation-pure.test.ts](../tests/unit/participation-pure.test.ts) | 15 → 15 | Conservar | Códigos, transiciones, ventanas, puntos, rankings, requisitos y suavizado de participación. |
| [permanence-groups-pure.test.ts](../tests/unit/permanence-groups-pure.test.ts) | 3 → 3 | Conservar | Parsear correos de grupos y generar CSV sin duplicados ni entradas ambiguas. |
| [permanence-pure.test.ts](../tests/unit/permanence-pure.test.ts) | 29 → 29 | Conservar | Calcular criterios, estados, posibilidades restantes y propuestas de cierre con ejemplos de negocio. |
| [person-details.test.ts](../tests/unit/person-details.test.ts) | 4 → 4 | Conservar | Conservar ceros, distinguir omisión de borrado y validar documentos y datos personales. |
| [privacy-policy-action.test.ts](../tests/unit/privacy-policy-action.test.ts) | 13 → 13 | Conservar | Autorizar cambios de política y vincular la versión declarada al documento publicado. |
| [privacy-policy.test.ts](../tests/unit/privacy-policy.test.ts) | 10 → 10 | Conservar | Distinguir una versión publicada explícita de los marcadores pendientes. |
| [proxy.test.ts](../tests/unit/proxy.test.ts) | 6 → 6 | Conservar | Conservar el protocolo de autenticación de Server Actions y las redirecciones de navegación. |
| [railway-config.test.ts](../tests/unit/railway-config.test.ts) | 5 → 5 | Conservar | Validar el contrato de configuración y separación de entornos; no comprueba un despliegue real. |
| [reminders-pure.test.ts](../tests/unit/reminders-pure.test.ts) | 5 → 5 | Conservar | Seleccionar recordatorios en los bordes horarios y de día de Bogotá. |
| [roster-file.test.ts](../tests/unit/roster-file.test.ts) | 1 → 1 | Conservar | Evitar una regresión del parser XLSX ante un celular inválido. |
| [roster-pure.test.ts](../tests/unit/roster-pure.test.ts) | 10 → 10 | Conservar | Parsear CSV, reconocer comités y cargos, normalizar campos y calcular el diff de importación. |
| [settings-sections.test.ts](../tests/unit/settings-sections.test.ts) | 1 → 1 | Conservar | Renderizar datos propios aunque se omita el bloque de calendario. |
| [smoke.test.ts](../tests/unit/smoke.test.ts) | 8 → 8 | Conservar | Verificar el comprobador HTTP de release contra un servidor local controlado, incluidos SHA, robots y CSP. |
| [surveys-pure.test.ts](../tests/unit/surveys-pure.test.ts) | 3 → 3 | Conservar con comprobaciones reforzadas o corregidas | Validar calificaciones y preservar agregados y anonimato; el orden de textos ya no puede revelar llegada. |
| [test-database.test.ts](../tests/unit/test-database.test.ts) | 0 → 9 | Añadida: protección del entorno destructivo | Proteger el borrado de esquemas de integración: solo PostgreSQL local, nombre explícito y sufijo idempotente. |
| [wallet-adapters.test.ts](../tests/unit/wallet-adapters.test.ts) | 9 → 9 | Conservar | Archivos de Apple y protocolo OAuth/HTTP de Google con claves y transportes sintéticos. |
| [wallet-apple-route.test.ts](../tests/unit/wallet-apple-route.test.ts) | 4 → 4 | Conservar | Autorizar la ruta Apple, manejar la función apagada y evitar caché de una respuesta personal. |
| [wallet-google-route.test.ts](../tests/unit/wallet-google-route.test.ts) | 4 → 4 | Conservar | Autorizar la ruta Google, manejar la función apagada y evitar caché de una respuesta personal. |
| [wallet-page.test.ts](../tests/unit/wallet-page.test.ts) | 14 → 14 | Conservar | Mostrar acciones y estados de billeteras coherentes con permisos, licencia e historial. |
| [wallet-pure.test.ts](../tests/unit/wallet-pure.test.ts) | 5 → 5 | Conservar | Construir datos de pases y objetos sin inventar información del miembro. |
| [wordle-dictionary.test.ts](../tests/unit/wordle-dictionary.test.ts) | 33 → 33 | Conservar | Conservar integridad editorial, unicidad y cobertura del diccionario español usado por el juego. |
| [wordle-pure.test.ts](../tests/unit/wordle-pure.test.ts) | 4 → 4 | Conservar | Normalizar tildes y Ñ, consumir letras repetidas correctamente y resolver el resultado del intento. |

### Integración

| Archivo | Casos antes → después | Decisión | Qué protege / alcance |
| --- | ---: | --- | --- |
| [access-grant.test.ts](../tests/integration/access-grant.test.ts) | 9 → 9 | Conservar con comprobaciones reforzadas o corregidas | Emitir, consumir y revocar enlaces de acceso con auditoría, vencimiento y cambio real de credencial. |
| [admin-resources.test.ts](../tests/integration/admin-resources.test.ts) | 3 → 3 | Conservar | Aplicar validación, permisos, auditoría y restricciones de los recursos administrativos con PostgreSQL. |
| [agenda.test.ts](../tests/integration/agenda.test.ts) | 3 → 3 | Conservar con comprobaciones reforzadas o corregidas | Persistir y resolver el enlace privado de calendario y sus permisos; se quitó una lectura del dato recién escrito por el propio test. |
| [alumni.test.ts](../tests/integration/alumni.test.ts) | 1 → 1 | Conservar | Exponer egresados según permisos y consentimientos y conservar su información permitida. |
| [autorizacion.test.ts](../tests/integration/autorizacion.test.ts) | 2 → 2 | Conservar | Resolver y registrar autorizaciones de ingreso contra estado real de membresía y política. |
| [bootstrap-access.test.ts](../tests/integration/bootstrap-access.test.ts) | 5 → 5 | Conservar con comprobaciones reforzadas o corregidas | Emitir enlaces desde el bootstrap autorizado; RECOVERY ahora demuestra el reemplazo de una contraseña previa. |
| [bootstrap-admin.test.ts](../tests/integration/bootstrap-admin.test.ts) | 7 → 7 | Conservar | Crear el primer acceso administrativo de forma controlada e idempotente. |
| [calls.test.ts](../tests/integration/calls.test.ts) | 3 → 3 | Conservar | Aplicaciones, cupo, espera, selección y materialización de convocatorias en grupos. |
| [campaigns.test.ts](../tests/integration/campaigns.test.ts) | 2 → 2 | Conservar | Preparar y procesar campañas respetando elegibilidad, lotes y deduplicación. |
| [carnet-token.test.ts](../tests/integration/carnet-token.test.ts) | 10 → 10 | Conservar | Resolver capacidades opacas del carnet, rotación, revocación y concurrencia. |
| [comms-events.test.ts](../tests/integration/comms-events.test.ts) | 4 → 4 | Conservar con comprobaciones reforzadas o corregidas | Convertir eventos reales del outbox en notificaciones con preferencias, destinatarios y deduplicación. |
| [comms.test.ts](../tests/integration/comms.test.ts) | 3 → 3 | Conservar con comprobaciones reforzadas o corregidas | Persistir recibos y desbordar de Resend a SES; el caso de fallo de SES ahora hace fallar ese proveedor. |
| [consents.test.ts](../tests/integration/consents.test.ts) | 2 → 2 | Conservar | Registrar, consultar y revocar consentimientos vivos sin duplicar autorizaciones. |
| [content.test.ts](../tests/integration/content.test.ts) | 3 → 3 | Conservar | Persistir contenido con auditoría y limitar las lecturas públicas a lo publicado. |
| [crm.test.ts](../tests/integration/crm.test.ts) | 3 → 3 | Conservar con comprobaciones reforzadas o corregidas | Escribir interacciones y tareas derivadas de eventos, conservando referencias e historial. |
| [dashboard.test.ts](../tests/integration/dashboard.test.ts) | 2 → 2 | Conservar | Calcular bloques y métricas del tablero a partir de datos reales de varios módulos. |
| [documents.test.ts](../tests/integration/documents.test.ts) | 9 → 9 | Conservar | Subir, validar, publicar y consultar documentos con acceso e historial de versiones. |
| [events.test.ts](../tests/integration/events.test.ts) | 2 → 2 | Conservar | Persistir eventos y ediciones, validar sus fechas y resolver la programación pública. |
| [fase5-base.test.ts](../tests/integration/fase5-base.test.ts) | 9 → 9 | Conservar | Restricciones SQL de CRM y admisión, vínculo por correo, etiquetas y término siguiente; quedan dos títulos demasiado amplios (R5). |
| [forms.test.ts](../tests/integration/forms.test.ts) | 7 → 7 | Conservar con comprobaciones reforzadas o corregidas | Validar y persistir envíos, personas y efectos derivados; el rechazo de respuestas inválidas ya no depende de un if. |
| [health.test.ts](../tests/integration/health.test.ts) | 1 → 1 | Conservar | Consultar salud de dependencias reales y distinguir fallos del estado sano. |
| [identity-cleanup.test.ts](../tests/integration/identity-cleanup.test.ts) | 3 → 3 | Conservar | Eliminar credenciales, enlaces y accesos al salir o anonimizar, por handlers reales. |
| [identity-prune.test.ts](../tests/integration/identity-prune.test.ts) | 3 → 3 | Conservar | Eliminar material de autenticación vencido conservando los datos todavía utilizables. |
| [leave-access.test.ts](../tests/integration/leave-access.test.ts) | 3 → 3 | Conservar | Resolver actores en licencia y proteger operaciones aunque conserven concesiones de permisos. |
| [media.test.ts](../tests/integration/media.test.ts) | 3 → 3 | Conservar | Procesar imágenes reales en Garage, generar variantes y rechazar objetos inválidos o inaccesibles. |
| [migrate-ghpoints.test.ts](../tests/integration/migrate-ghpoints.test.ts) | 2 → 2 | Conservar mientras exista la migración; aserciones reforzadas | Migrar una base legada sintética completa, verificar balances e idempotencia; conservar mientras exista la herramienta de migración. |
| [normativa-import.test.ts](../tests/integration/normativa-import.test.ts) | 4 → 4 | Conservar | Importar documentos y objetos sintéticos con verificación de integridad e idempotencia. |
| [notifications.test.ts](../tests/integration/notifications.test.ts) | 5 → 5 | Conservar | Registrar dispositivos, preferencias y envíos push con transporte simulado y estado persistido. |
| [organizations.test.ts](../tests/integration/organizations.test.ts) | 3 → 3 | Conservar | Gestionar organizaciones, contactos y sus relaciones con autorización y auditoría. |
| [otp.test.ts](../tests/integration/otp.test.ts) | 11 → 11 | Conservar con comprobaciones reforzadas o corregidas | Persistir límites, vencimiento, intentos y sesiones sin enumerar personas. |
| [outbox.test.ts](../tests/integration/outbox.test.ts) | 6 → 6 | Conservar con comprobaciones reforzadas o corregidas | Bloqueo entre pollers, deduplicación, reintentos y efectos; el título ya no promete una transacción común de handlers. |
| [own-data.test.ts](../tests/integration/own-data.test.ts) | 4 → 4 | Conservar | Actualizar, exportar y solicitar supresión de datos propios respetando sesión y consentimiento. |
| [participation-assemblies.test.ts](../tests/integration/participation-assemblies.test.ts) | 3 → 3 | Conservar | Requisitos de asambleas y pertenencias por término, incluida elegibilidad histórica. |
| [participation-checkin.test.ts](../tests/integration/participation-checkin.test.ts) | 6 → 6 | Conservar con comprobaciones reforzadas o corregidas | Registrar asistencia y ledger exactamente una vez, incluida la ráfaga de 500 personas y rechazos repetidos. |
| [participation-closing-concurrency.test.ts](../tests/integration/participation-closing-concurrency.test.ts) | 5 → 5 | Conservar | Impedir carreras entre cierre de puntos y operaciones que generan o revierten créditos. |
| [participation-host.test.ts](../tests/integration/participation-host.test.ts) | 4 → 4 | Conservar | Registrar asistencia por anfitrión con carnet válido y rechazar capacidades inválidas o vencidas. |
| [participation-leader.test.ts](../tests/integration/participation-leader.test.ts) | 4 → 4 | Conservar con comprobaciones reforzadas o corregidas | Limitar al líder a su comité y generar series dentro del término; fecha de serie ahora explícitamente interior. |
| [participation-occasions.test.ts](../tests/integration/participation-occasions.test.ts) | 7 → 7 | Conservar con comprobaciones reforzadas o corregidas | Crear y cambiar ocasiones con límites de calendario y permisos; fixtures ahora usan el día de Bogotá. |
| [participation-rankings.test.ts](../tests/integration/participation-rankings.test.ts) | 3 → 3 | Conservar con comprobaciones reforzadas o corregidas | Calcular rankings y empates con los datos persistidos; título corregido al resultado 1, 1, 3, 3. |
| [password-login.test.ts](../tests/integration/password-login.test.ts) | 7 → 7 | Conservar | Ingreso por contraseña, errores indistinguibles y límites por correo e IP. |
| [password-selfservice.test.ts](../tests/integration/password-selfservice.test.ts) | 7 → 7 | Conservar con comprobaciones reforzadas o corregidas | Step-up y cambio de contraseña; rechazos ahora verifican que las sesiones anteriores no se alteren. |
| [people-membership.test.ts](../tests/integration/people-membership.test.ts) | 4 → 4 | Conservar con comprobaciones reforzadas o corregidas | Cambiar membresías, correo y comités y revocar acceso y consentimientos cuando corresponde. |
| [permanence-board.test.ts](../tests/integration/permanence-board.test.ts) | 1 → 1 | Conservar | Resolver cargos y atribuciones de junta sobre el término y ámbito correctos. |
| [permanence-closing.test.ts](../tests/integration/permanence-closing.test.ts) | 3 → 3 | Conservar con comprobaciones reforzadas o corregidas | Aplicar decisiones y congelar snapshots; ahora exige tres filas antes de comprobar sus fechas. |
| [permanence-evaluations.test.ts](../tests/integration/permanence-evaluations.test.ts) | 5 → 5 | Conservar con comprobaciones reforzadas o corregidas | Evaluar grupos, puntajes y créditos con ventana temporal y permisos; ventana negativa preparada explícitamente. |
| [permanence-facts.test.ts](../tests/integration/permanence-facts.test.ts) | 5 → 5 | Conservar | Hacer cumplir restricciones SQL de reglas, tablas, grupos, evaluaciones y decisiones. |
| [permanence-groups.test.ts](../tests/integration/permanence-groups.test.ts) | 3 → 3 | Conservar con comprobaciones reforzadas o corregidas | Crear grupos, importar miembros y administrar líderes y evaluadores con autorización. |
| [permanence-rules.test.ts](../tests/integration/permanence-rules.test.ts) | 4 → 4 | Conservar | Editar criterios y tablas según permisos, bloqueo y estado del término. |
| [permanence-snapshot.test.ts](../tests/integration/permanence-snapshot.test.ts) | 4 → 4 | Conservar | Construir hechos de permanencia y conservar el resultado congelado para consultas posteriores. |
| [person-details.test.ts](../tests/integration/person-details.test.ts) | 3 → 3 | Conservar | Persistir cambios de ficha, auditoría y separación entre campos omitidos y borrados. |
| [pipelines.test.ts](../tests/integration/pipelines.test.ts) | 4 → 4 | Conservar con comprobaciones reforzadas o corregidas | Crear y mover tarjetas, resolver etapas ganadas o perdidas y registrar sus efectos. |
| [privacy-policy-settings.test.ts](../tests/integration/privacy-policy-settings.test.ts) | 2 → 2 | Conservar | Vincular configuración de política con publicación e invalidar estados que dejan de ser válidos. |
| [privacy-policy.test.ts](../tests/integration/privacy-policy.test.ts) | 11 → 11 | Conservar con comprobaciones reforzadas o corregidas | Bloquear consentimientos y operaciones cuando falta una política aprobada, incluso con páginas abiertas antes. |
| [reminders.test.ts](../tests/integration/reminders.test.ts) | 3 → 3 | Conservar | Crear recordatorios y eventos una sola vez con destinatarios y ventanas reales. |
| [requests.test.ts](../tests/integration/requests.test.ts) | 4 → 4 | Conservar | Crear, retirar y decidir licencias, retiros y cambios de comité con efectos y autorización. |
| [roster.test.ts](../tests/integration/roster.test.ts) | 5 → 5 | Conservar con comprobaciones reforzadas o corregidas | Importar CSV y XLSX, actualizar solo campos presentes, detectar errores y conservar idempotencia. |
| [schema-constraints.test.ts](../tests/integration/schema-constraints.test.ts) | 8 → 8 | Conservar | Verificar extensiones, índices y restricciones que las funciones puras no pueden imponer a PostgreSQL. |
| [storage.test.ts](../tests/integration/storage.test.ts) | 2 → 2 | Conservar | Subir, consultar y leer objetos contra Garage mediante URLs firmadas y restricciones reales. |
| [surveys.test.ts](../tests/integration/surveys.test.ts) | 2 → 2 | Conservar | Invitaciones, acceso por token, respuestas únicas y agregados privados de encuestas. |
| [wallet-apple.test.ts](../tests/integration/wallet-apple.test.ts) | 3 → 3 | Conservar | Emitir y reutilizar pases Apple con datos y capacidades persistidas; firma con claves de prueba. |
| [wallet-base.test.ts](../tests/integration/wallet-base.test.ts) | 4 → 4 | Conservar | Persistir y consultar el estado común de billeteras respetando la elegibilidad de la persona. |
| [wallet-google.test.ts](../tests/integration/wallet-google.test.ts) | 9 → 9 | Conservar | Crear y actualizar objetos Google con transporte simulado y estado persistido. |
| [wallet-jobs.test.ts](../tests/integration/wallet-jobs.test.ts) | 10 → 10 | Conservar | Actualizar o revocar pases por eventos y evitar efectos duplicados. |
| [wordle.test.ts](../tests/integration/wordle.test.ts) | 22 → 22 | Conservar | Persistir intentos, concurrencia, reanudación y premio único por término y persona. |

### Preparación E2E

| Archivo | Casos antes → después | Decisión | Qué protege / alcance |
| --- | ---: | --- | --- |
| [auth.setup.ts](../tests/e2e/auth.setup.ts) | 2 → 2 | Conservar | Preparar sesiones ADMIN y MEMBER verificando el ingreso; prerrequisito compartido, no duplicado de un escenario de negocio. |

### Navegador

| Archivo | Casos antes → después | Decisión | Qué protege / alcance |
| --- | ---: | --- | --- |
| [acceso.spec.ts](../tests/e2e/acceso.spec.ts) | 1 → 1 | Conservar | Flujo completo de emisión por junta, activación, ingreso y cambio de contraseña con identidad desechable. |
| [admin-custom-ui.spec.ts](../tests/e2e/admin-custom-ui.spec.ts) | 4 → 4 | Conservar | Ficha y matrices de junta en móvil, teclado y conservación del formulario durante envío o error. |
| [admin-details-responsive.spec.ts](../tests/e2e/admin-details-responsive.spec.ts) | 9 → 9 | Conservar | Paneles de detalle y filtros en varios anchos y temas; combinaciones distintas de presentación. |
| [admin-inicio.spec.ts](../tests/e2e/admin-inicio.spec.ts) | 1 → 1 | Conservar | Acceso y enlaces reales de los bloques del tablero administrativo. |
| [admin-navigation-roles.spec.ts](../tests/e2e/admin-navigation-roles.spec.ts) | 1 → 1 | Conservar | Destinos visibles y activos del líder y del evaluador con permisos derivados. |
| [admin-responsive.spec.ts](../tests/e2e/admin-responsive.spec.ts) | 11 → 11 | Conservar | Navegación, paneles, zoom y destinos del admin en móvil, escritorio y ambos temas. |
| [admin.spec.ts](../tests/e2e/admin.spec.ts) | 3 → 3 | Conservar | Crear y editar comité, buscar en paleta y otorgar permiso con step-up. |
| [admision.spec.ts](../tests/e2e/admision.spec.ts) | 4 → 1 | Consolidada: conservar el flujo completo | Una sola prueba del flujo de formulario, postulación y alta; cuatro fases conservadas como pasos. |
| [agenda.spec.ts](../tests/e2e/agenda.spec.ts) | 2 → 1 | Consolidada: conservar el flujo completo | Una sola prueba de consulta, regeneración y revocación del enlace privado de calendario. |
| [ajustes-ux.spec.ts](../tests/e2e/ajustes-ux.spec.ts) | 13 → 13 | Conservar | Conservar datos, errores y preferencias; uso por teclado y rechazo de sesión vencida. |
| [area-switching.spec.ts](../tests/e2e/area-switching.spec.ts) | 6 → 6 | Conservar | Cambiar entre áreas conservando navegación y permisos correctos. |
| [autorizacion.spec.ts](../tests/e2e/autorizacion.spec.ts) | 2 → 2 | Conservar | Ingreso y consentimiento de miembro y tratamiento de autorización pendiente en navegador. |
| [campanas.spec.ts](../tests/e2e/campanas.spec.ts) | 2 → 1 | Consolidada: conservar el flujo completo | Una sola prueba de configuración, envío de campaña y baja del destinatario. |
| [carnet.spec.ts](../tests/e2e/carnet.spec.ts) | 7 → 7 | Conservar | Abrir carnet, consultar capacidades y operar billeteras según el estado disponible. |
| [cartelera-push.spec.ts](../tests/e2e/cartelera-push.spec.ts) | 3 → 1 | Consolidada: conservar el flujo completo | Una sola prueba de dispositivo, anuncio y recibo; ahora exige Enviado en el transporte de consola. |
| [checkin.spec.ts](../tests/e2e/checkin.spec.ts) | 1 → 1 | Conservar | Escanear o abrir el registro de asistencia y ver su resultado y restricciones. |
| [cierre.spec.ts](../tests/e2e/cierre.spec.ts) | 1 → 1 | Conservar | Cerrar puntos desde GH con step-up y consultar el standing congelado. |
| [consola.spec.ts](../tests/e2e/consola.spec.ts) | 1 → 1 | Conservar | Operar la consola de una ocasión y verificar asistencia, estado y acciones disponibles. |
| [convocatorias.spec.ts](../tests/e2e/convocatorias.spec.ts) | 4 → 1 | Consolidada: conservar el flujo completo | Una sola prueba de cupo y espera; conserva una dependencia con solicitudes sobre la identidad en licencia (R2). |
| [egresados.spec.ts](../tests/e2e/egresados.spec.ts) | 1 → 1 | Conservar | Visibilidad y filtros de la galería pública de egresados. |
| [encuesta.spec.ts](../tests/e2e/encuesta.spec.ts) | 1 → 1 | Conservar | Crear encuesta, registrar asistencia, cerrar, responder por invitación y ver el agregado. |
| [eventos.spec.ts](../tests/e2e/eventos.spec.ts) | 1 → 1 | Conservar | Crear y publicar edición, seguir su organizador y consultar calendario; autenticación del visitante requiere precisión (R5). |
| [formularios.spec.ts](../tests/e2e/formularios.spec.ts) | 4 → 2 | Consolidada: conservar el flujo completo | Dos pruebas completas: publicación y envío público, e inscripción de miembro en una edición. |
| [gh-points.spec.ts](../tests/e2e/gh-points.spec.ts) | 1 → 1 | Conservar | Ver rankings y detalle de puntos en Mi OE con datos y navegación reales. |
| [junta.spec.ts](../tests/e2e/junta.spec.ts) | 1 → 1 | Conservar | Limitar la navegación BOARD y mostrar su jornada de activación. |
| [ledger.spec.ts](../tests/e2e/ledger.spec.ts) | 1 → 1 | Conservar | Ajustar y revertir puntos desde el ledger con autorización y motivo. |
| [lider.spec.ts](../tests/e2e/lider.spec.ts) | 1 → 1 | Conservar | Ejercer acciones del líder y comprobar que no obtiene acceso general del administrador. |
| [login.spec.ts](../tests/e2e/login.spec.ts) | 4 → 4 | Conservar | Ingreso, rechazo, salida y redirecciones en navegador real. |
| [medios.spec.ts](../tests/e2e/medios.spec.ts) | 2 → 2 | Conservar | Subida y visualización de imágenes y conservación de archivo y metadatos tras errores. |
| [member-experience.spec.ts](../tests/e2e/member-experience.spec.ts) | 11 → 11 | Conservar | Navegación, presentación y accesibilidad del área de miembros en anchos y temas distintos. |
| [mi-oe.spec.ts](../tests/e2e/mi-oe.spec.ts) | 4 → 4 | Conservar con comprobaciones reforzadas o corregidas | Consultar estado propio, actualizar información y comprobar efectos persistidos; fecha de solicitud ahora no admite undefined. |
| [normativa.spec.ts](../tests/e2e/normativa.spec.ts) | 9 → 9 | Conservar | Subir, revisar y leer artículos, tablas e imágenes; los lectores dependen de publicaciones anteriores del archivo (R2). |
| [organizaciones.spec.ts](../tests/e2e/organizaciones.spec.ts) | 1 → 1 | Conservar | Administrar organizaciones y contactos desde la interfaz. |
| [permanencia-admin.spec.ts](../tests/e2e/permanencia-admin.spec.ts) | 2 → 2 | Conservar | Crear e importar grupos y limitar al líder; limpieza y título pendientes (R2, R5). |
| [permanencia-avisos.spec.ts](../tests/e2e/permanencia-avisos.spec.ts) | 1 → 1 | Conservar | Mostrar avisos de permanencia acordes a hechos y horizonte del término. |
| [permanencia-cierre.spec.ts](../tests/e2e/permanencia-cierre.spec.ts) | 1 → 1 | Conservar | Aplicar cierre de permanencia con step-up y ver la decisión desde la identidad afectada. |
| [permanencia-evaluaciones.spec.ts](../tests/e2e/permanencia-evaluaciones.spec.ts) | 4 → 4 | Conservar | Evaluar GAP, reconocer créditos y consultarlos como miembro; algunos casos dependen de los anteriores (R2). |
| [permanencia-reglas.spec.ts](../tests/e2e/permanencia-reglas.spec.ts) | 2 → 2 | Conservar | Editar reglas y tablas y respetar sus bloqueos desde el admin. |
| [permanencia.spec.ts](../tests/e2e/permanencia.spec.ts) | 2 → 2 | Conservar | Consultar criterios y estado de permanencia propios en navegador. |
| [personas.spec.ts](../tests/e2e/personas.spec.ts) | 2 → 2 | Conservar | Operar la Persona 360, crear miembros y comprobar cambios de estado y permisos. |
| [politica-datos.spec.ts](../tests/e2e/politica-datos.spec.ts) | 3 → 3 | Conservar | Consultar la política de datos y sus vínculos desde las superficies públicas y privadas. |
| [portal-ux.spec.ts](../tests/e2e/portal-ux.spec.ts) | 12 → 12 | Conservar | Navegación pública, cabecera y presentación en móvil y escritorio. |
| [portal.spec.ts](../tests/e2e/portal.spec.ts) | 4 → 4 | Conservar | Rutas y contenido publicado del portal; algunos casos titulados como visitante usan sesión ADMIN (R5). |
| [privacidad-pendiente.spec.ts](../tests/e2e/privacidad-pendiente.spec.ts) | 2 → 2 | Conservar | Mantener consulta y bloquear nuevas operaciones cuando la política cambia o queda pendiente. |
| [pwa.spec.ts](../tests/e2e/pwa.spec.ts) | 2 → 2 | Conservar | Servir manifest, iconos y service worker y gestionar dispositivos y preferencias. |
| [recordatorios.spec.ts](../tests/e2e/recordatorios.spec.ts) | 2 → 1 | Consolidada: conservar el flujo completo | Una sola prueba de dispositivo y recibo de actividad; exige Enviado y elimina el dispositivo desde su dueño. |
| [roster.spec.ts](../tests/e2e/roster.spec.ts) | 2 → 2 | Conservar | Importar con step-up y entrar con la persona creada; conservar selección durante reautenticación. |
| [segmentos.spec.ts](../tests/e2e/segmentos.spec.ts) | 1 → 1 | Conservar | Crear filtros, contar personas y exportar con step-up. |
| [seo.spec.ts](../tests/e2e/seo.spec.ts) | 2 → 2 | Conservar | Canonical, Open Graph, robots y sitemap sobre la edición `prueba` y los comités publicados del seed. |
| [solicitudes-ux.spec.ts](../tests/e2e/solicitudes-ux.spec.ts) | 7 → 7 | Conservar | Formularios de trámites, recuperación ante red, doble envío, retiro y sesión vencida sin mutaciones. |
| [solicitudes.spec.ts](../tests/e2e/solicitudes.spec.ts) | 3 → 1 | Consolidada: conservar el flujo completo | Una sola prueba de solicitud, aprobación de licencia y conservación de consulta. |
| [wallet-visual.spec.ts](../tests/e2e/wallet-visual.spec.ts) | 6 → 6 | Conservar | Anchos, temas, nombres largos, foco y enlaces de Apple Wallet; no es una prueba de píxeles ni de Wallet nativo. |
| [wordle.spec.ts](../tests/e2e/wordle.spec.ts) | 4 → 4 | Conservar | Jugar, reanudar entre pestañas y recuperar respuestas perdidas sin duplicar puntos. |

### Extractor

| Archivo | Casos antes → después | Decisión | Qué protege / alcance |
| --- | ---: | --- | --- |
| [test_normativa_extract.py](../tests/python/test_normativa_extract.py) | 11 → 11 | Conservar | Extraer PDF sintético: orden, tablas, imágenes, índice, capítulos, integridad y rechazo de ambigüedades. |

### Respaldo

| Archivo | Casos antes → después | Decisión | Qué protege / alcance |
| --- | ---: | --- | --- |
| [run.sh](../tests/backup/run.sh) | 1 harness / 10 comprobaciones | Conservar | Demostrar recuperación real de PostgreSQL y medios cifrados, retención y conservación del respaldo ante fallos. |

### Infraestructura de pruebas

| Archivo o grupo | Decisión |
| --- | --- |
| vitest.config.ts y tests/integration/{global-setup,setup,db,test-database,factories}.ts | Conservar; crean y aíslan el esquema real, preparan casos y fijan servicios de prueba. Se añadió el guard de base local. |
| playwright.config.ts y tests/e2e/global-setup.ts | Conservar; controlan servidor, identidades y almacenamiento local. Requieren mejoras R1–R3. |
| tests/e2e/axe.ts | Conservar; las aserciones de accesibilidad delegadas son reales. |
| tests/e2e/outbox.ts | Conservar y corregir R1; necesario para los efectos diferidos con jobs deshabilitados. |
| tests/fixtures/ | Conservar los datos y materiales sintéticos referenciados; no son casos adicionales. |
| package.json y .github/workflows/ci.yml | Conservar las cinco familias; check y test no son sinónimos de suite completa. |
