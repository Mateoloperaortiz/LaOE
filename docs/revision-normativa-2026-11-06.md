# Revisión de producto de la normativa actualizada · 2026-11-06

**Sí: la banda de permanencia debe pasar del mínimo de 40 % al de 50 % para los activos. Producción todavía usa 40 %.** También deben actualizarse las referencias visibles a los artículos renumerados. El Reglamento añade reglas de mínimos y reactivación de macroeventos que requieren funcionalidad nueva si se incorporan a la app. Los demás cambios de postulaciones y elecciones afectan principalmente procedimientos humanos que la app no automatiza. Además aparecen diferencias anteriores entre norma, ADR y código que no deben atribuirse a esta actualización.

Esta nota es investigación de solo lectura del producto, sin decisión de política. Se consultaron únicamente cinco claves de configuración en producción mediante una transacción de solo lectura; no se modificaron código de la app, ADRs, configuración ni datos de negocio. No se usó navegador ni se crearon issues o commits. Los archivos auxiliares del cotejo y la evidencia permanecen fuera del checkout; este informe y su entrada de seguimiento son documentación.

## 1. Fuentes, versiones y límites

- Originales anteriores: [Estatutos][est-old] y [Reglamento][reg-old]. Nuevos originales: [Estatutos actualizados][est-new] y [Reglamento actualizado][reg-new]. Las páginas citadas corresponden a la página física del PDF, contando desde 1.
- Se usaron las lecturas cotejadas [estatutos.json][est-json] y [reglamento.json][reg-json], el [estado documental anterior][before], la [comparación por título][comparison] y el [cruce de numeración][mapping]. Se verificaron directamente con `pdftotext` los pasajes relevantes de los PDF, incluidos los requisitos de macroeventos, la reactivación y el art. 7.5 de Estatutos. No se reproducen documentos completos ni identidades personales.
- **Desplegado:** la referencia es el commit `16091bd02f11d50fa1b6cff69bd135700d88b9e8`, confirmado por `/api/health` al terminar la carga documental el mismo día a las 21:28 UTC. Las citas de código apuntan al archivo privado `runtime-src/`. Se cotejaron contra `git show` del commit las piezas principales de nombramientos, inhabilidades, convocatorias, macroeventos, viabilidad y permanencia. La configuración de permanencia se volvió a consultar a las 21:31:50 UTC: [evidencia de solo lectura][live-config].
- **Checkout:** el HEAD observado al iniciar fue `0c04afe287a8c5ea4e41e1e87008e82d8bd322ab`, con muchos cambios ajenos. No se usa como sinónimo de producción. Las guardas centrales de inhabilidades, los catálogos de macroeventos, convocatorias, viabilidad y cálculo de permanencia coinciden con el archivo desplegado. En `appointments.ts`, el checkout añade bloqueos al **retirar** un nombramiento: [desplegado, líneas 249–274][remove-runtime] frente a [checkout, líneas 250–280][remove-checkout]. Ese cambio no añade validaciones electorales al nombrar.
- Las ADR se citan desde el checkout. ADR-042, ADR-061 y ADR-064 coinciden con el commit desplegado. ADR-031 y ADR-060 tienen añadidos de inventario de ADR-150; sus reglas aquí citadas sobre elecciones, convocatorias, inhabilidades y permanencia no difieren. Las [pruebas de inhabilidades, líneas 45–69][tests-inhabilities] también se cotejaron y coinciden con el commit desplegado.

El cotejo cubre los documentos anteriores completos frente a los nuevos. La comparación independiente de palabras y cifras de los PDF anteriores contra su corpus guardado no encontró omisiones ni agregados; los nuevos ya tenían ese cotejo aprobado. Se excluyen índice, folios y rótulos digitales; los mismos bytes del organigrama evitan confundir cambios de descripción alternativa con una reforma. El foco de producto está en Estatutos 7.5 y los arts. 1, 3, 8, 13, 27, 28 y 41–46 del Reglamento. No es una auditoría integral de cada obligación histórica. «No modelado» se refiere a las estructuras y comandos examinados, no a que la organización incumpla el procedimiento fuera de la app.

## 2. Qué hace hoy la app

La distinción fundamental está documentada: las votaciones, el quórum, las mociones y las actas permanecen fuera de la automatización; la app registra los resultados de elecciones y aplica algunas guardas. Así lo dicen [ADR-060, líneas 12, 37 y 48][adr060] y [ADR-064, líneas 8–16][adr064]. La publicación documental tampoco convierte automáticamente artículos en reglas de otros módulos: [ADR-042, líneas 12–21][adr042].

| Capacidad desplegada | Evidencia y alcance real |
| --- | --- |
| Nombrar Junta Directiva | `addAppointment` aplica `assertNoInhabilities` para los seis tipos de junta y guarda el cargo. No recibe candidatura, avales, expediente electoral ni permiso de Asamblea: [líneas 175–218][board-command]. |
| Registrar la mesa de una edición | Valida cargo permitido para el evento, membresía `ACTIVE`, persona no repetida en la edición y plaza de titular/codirección no ocupada; luego aplica inhabilidades cruzadas: [líneas 378–458][macro-command]. No comprueba programa académico, género, experiencia, vueltas ni plan de trabajo. |
| Codirecciones | Hay un titular y una codirección por cargo y edición, y una sola plaza de esa mesa por persona. Lo sostienen el comando anterior y los índices de [schema.ts, líneas 129–165][appointments-schema]. Esto registra la composición; no acredita cómo la Asamblea la aprobó. |
| Topes e inhabilidad registrada | `OFFICE_BAN`, dos cargos como máximo, restricciones entre macroeventos y entre Generales/Financieros de comités, y codirección cuando hay dos cargos: [inhabilities-pure.ts, líneas 54–95][guards]. Las excepciones con motivo quedan auditadas: [inhabilities.ts, líneas 155–194][override]. La guarda de junta y la de nuevos tienen los límites indicados en §5. |
| Convocatorias internas | Son inscripciones a **grupos de trabajo**, con cupo y selección manual o por llegada; no son candidaturas electorales. El esquema exige `groupId`: [crm/schema.ts, líneas 304–355][calls-schema]; [ADR-031, regla 2, línea 14][adr031]. El cierre por ventana existe, pero pertenece a ese flujo: [calls-pure.ts, líneas 12–32][calls-pure] y [calls.ts, líneas 375–417][calls-command]. |
| Viabilidad de CIC/CE | Hay alertas por menos de tres direcciones y cargos obligatorios faltantes: [committee-viability-pure.ts, líneas 28–63][viability-pure]. La consulta recorre comités, no macroeventos, y cuenta códigos de cargo distintos: [committee-viability.ts, líneas 33–101][viability-query]. Además omite alertas cuando no encuentra miembros activos. No certifica toda mesa ni desactiva automáticamente. |
| Macroeventos y ediciones | `event` y `eventEdition` tienen estado de **publicación**, no estado institucional de habilitación ni expediente de reactivación: [events/schema.ts, líneas 10–59][events-schema]. El catálogo ofrece seis cargos en Inventiva, siete en EnFemenino y nueve en Días: [macroevents-pure.ts, líneas 1–21][macro-catalog]. |

## 3. Comparación de los cambios y efecto de producto

«Nueva funcionalidad» significa que no existe un control anterior equivalente que baste con ajustar. No es autorización para implementarla.

| Norma nueva y fuente anterior | Cambio comprobado | Impacto sobre el producto desplegado |
| --- | --- | --- |
| **Art. 1, par. 7**, pp. 6–7; anterior art. 1, pp. 6–7 ([antes][old-1], [ahora][new-1]) | Se añade permiso de postulación extemporánea por mayoría calificada. El ajuste de redacción del par. 5 no cambia inequívocamente un requisito. | **Procedimiento humano / nueva funcionalidad electoral.** El nombramiento de junta no está ligado a una convocatoria ni a una fecha de postulación [nombramiento de junta][board-command]. No abrir ni relajar por esto las convocatorias de GT/GAP [convocatorias de grupos][calls-schema]. Si se digitaliza, debe distinguirse permiso concedido de simple llegada fuera de plazo. |
| **Art. 3, par. 1**, p. 7 ([antes][old-3], [ahora][new-3]) | Quien no cumple el numeral 1 puede solicitar permiso a Asamblea si tiene al menos un semestre en el Comité Primario del CGH. El requisito ordinario de dos semestres y participación en Subsidios no desaparece. | **Nueva validación si se construye elegibilidad electoral.** `VP_GH` usa el nombramiento genérico [nombramiento de junta][board-command], sin esta evaluación. No cambiar un umbral global de antigüedad ni suponer permiso automático. |
| **Art. 8**, pp. 8–9; anterior p. 8 ([antes][old-8], [ahora][new-8]) | Desaparece el parágrafo que exigía permiso después de una renuncia válida en el último año. | **No hay bloqueo específico que retirar.** La guarda consume una inhabilidad registrada, no la condición «renuncia válida» [guardas de inhabilidades][guards]. Se mantienen los arts. 63–64, pp. 33–34, sobre inhabilidad por renuncia sin excusa válida o sin empalme ([texto actual][new-63]). Eliminar el permiso no autoriza a borrar `OFFICE_BAN`. |
| **Art. 13, par. 1**, pp. 10–11 ([antes][old-13], [ahora][new-13]) | La Asamblea puede objetar al moderador, votar por mayoría simple y elegir otro antes de la elección si no lo avala. | **Fuera del alcance electoral actual.** Actualiza la guía humana; no cambia la asistencia ni los nombramientos. Automatizar moderación o voto requiere ampliar el alcance fijado en [ADR-060, líneas 12 y 48][adr060]. |
| **Art. 27.2**, p. 17 ([antes][old-27], [ahora][new-27]) | Se elimina la mención expresa de cargos en Representantes Estudiantiles para aspirantes a mesas; se conserva la restricción de cargos en otros Grupos Estudiantiles. | **No hay una validación externa implementada que quitar**: el contexto lee cargos OE y sanciones [contexto de inhabilidades][leadership-context]. No trasladar la supresión a Junta Directiva: los arts. 1.1 y 8.2 conservan la referencia a Representante Estudiantil [art. 1 actualizado][new-1] [art. 8 actualizado][new-8]. |
| **Art. 27, pars. 6–8**, p. 18 ([ahora][new-27b]; inexistentes como tales en [la versión anterior][old-27b]) | A la segunda asamblea del año, Inventiva necesita dos direcciones electas; EnFemenino, tres; Días, cuatro, incluida The Games o Carnival. | **Nueva funcionalidad sustantiva** de viabilidad de macroeventos. No está implementada por el mínimo de tres de CIC/CE [consulta de viabilidad][viability-query]. Faltan estado institucional, origen electo/suplencia y definición del hito; ver §4. |
| **Art. 27, pars. 9–10**, p. 18 ([antes][old-27b], [ahora][new-27b]) | El antiguo par. 6 sobre responsabilidades en periodo especial pasa al 9 sin cambio material. El nuevo par. 10 exige permiso extemporáneo por mayoría calificada. | **Conservar la regla de periodo especial**; cambia su referencia documental. La autorización tardía corresponde al proceso electoral, no al `overrideReason` genérico de nombramientos ni a la ventana de GT/GAP [excepción auditada][override] [convocatorias de grupos][calls-schema]. |
| **Art. 28**, pp. 18–19 ([ahora][new-28]) | Nuevo proceso de reactivación: propuesta en el segundo semestre del año anterior, misión, integrantes con mesa completa y plan de trabajo; decide Junta e informa a Asamblea. | **Nueva funcionalidad**, si se adopta. No reutilizar la reactivación de comités ni su espera de dos meses: [ADR-061, regla 3, línea 16][adr061]. Los macroeventos tienen otro modelo [esquema de eventos][events-schema]. |
| **Art. 41.1**, p. 24; anterior art. 40, p. 23 ([antes][old-40], [ahora][new-41]) | La suplencia de vacantes por Junta se sitúa en la segunda asamblea del año, donde antes el texto decía «día 15 del año». | **Cambio de procedimiento no automatizado.** El nombramiento actual no tiene un disparador de suplencia por fecha o asamblea [nombramiento de mesa][macro-command]. Antes de modelarlo debe conciliarse con los mínimos del art. 27 y el 15 de febrero del art. 45. No interpretar el texto anterior como una fecha más precisa de la que realmente daba. |
| **Art. 41, par. 3**, p. 24; anterior art. 40, p. 23 ([antes][old-40], [ahora][new-41]) | En codirección basta que al menos una persona haya vivido el macroevento desde GT, GAP o mesa en las primeras dos vueltas. Sigue la excepción si no hubo candidatos en ambas. | **Regla electoral nueva respecto de la pareja**, no modificación de una guarda existente. El comando recibe una persona cada vez y no verifica experiencia ni vuelta [datos del nombramiento][macro-input] [nombramiento de mesa][macro-command]. Una futura validación debe evaluar la candidatura conjunta, sin exigir historial a ambas personas. |
| **Art. 43, par. 1**, p. 25; anterior art. 42, p. 24 ([antes][old-42], [ahora][new-43]) | En Inventiva, pertenecer a Ciencias Aplicadas e Ingeniería deja de exigirse a Logística; permanece para General, con al menos una persona que cumpla en codirección. | **Cambio normativo real sin lógica previa que relajar.** El catálogo permite Logística y el comando no consulta `Person.program` [catálogo de macroeventos][macro-catalog] [nombramiento de mesa][macro-command]. Una futura elegibilidad no debe reintroducir la restricción retirada. |
| **Art. 44, par. 1**, p. 25; anterior art. 43, p. 24 ([antes][old-43], [ahora][new-44]) | General de EnFemenino pasa de exigir candidatas mujeres a incluir al menos una mujer, junto con la formulación de Mercadeo y Agenda Académica. | **Cambio normativo real sin filtro actual.** La app no verifica esa composición [nombramiento de mesa][macro-command]; el esquema de persona no tiene un campo de género [esquema de persona][person-schema]. Antes de implementar, precisar el ámbito de «al menos una» y resolver la correspondencia del catálogo (§5–§6). No deducir género de nombres, fotos o tratamientos. |
| **Arts. 45.3 y 46.3**, pp. 25–27; anteriores 44.3 y 45.3, pp. 24–26 ([antes][old-44], [ahora][new-45]) | La exposición de motivos debe incluir el plan de trabajo. Se mantienen solicitud, firmas, aval, tiempos y exclusión de voto de las personas implicadas. | **Procedimiento humano / eventual expediente nuevo.** El nombramiento registra persona, edición, cargo y codirección; no recoge ese plan ni acredita aprobaciones [datos del nombramiento][macro-input] [esquema de cargos][appointments-schema]. La capacidad de añadir una codirección no demuestra que se cumplió el proceso. |

Los cambios de los arts. 6 y 18, y del antiguo 39 → nuevo 40, son correcciones de redacción en la comparación suministrada; no se identificó un cambio de regla de producto en esos pasajes. El art. 28 insertado desplaza los antiguos arts. 28–74 a 29–75: usar [el cruce por título][mapping], no comparar únicamente números ni sustituir números globalmente.

## 4. Mínimos y reactivación de macroeventos: qué falta de verdad

**No se debe cambiar `MIN_DIRECTIONS = 3` por una regla global de 2/3/4.** Ese mínimo sigue perteneciendo a CIC/CE, y su norma no cambió: [Reglamento, art. 26, p. 17][new-26], [código, líneas 28–63][viability-pure]. Los nuevos mínimos del art. 27 son otra regla y tienen un momento de evaluación.

Para que la app los compruebe de forma fiel faltarían, como mínimo, estos conceptos:

1. **Dirección electa frente a suplencia de Junta.** `Appointment` guarda cargo, persona y codirección, pero no origen electoral ni carácter de suplencia [esquema de cargos][appointments-schema]. Contar filas puede contar dos personas de una misma dirección; contar todos los cargos puede incluir suplencias que la norma no llama electas.
2. **Hito de segunda asamblea y año del evento.** La fecha de la edición determina el término del nombramiento [término de la edición][edition-term]. Esto no equivale a conocer la segunda asamblea pertinente del año ni su momento de corte. Inventiva sigue descrita como semestral en el [art. 39, pp. 22–23][new-39], mientras el nuevo art. 27 habla del año de realización.
3. **Estado institucional y efectos.** Ocultar una ficha o dejarla en borrador no registra desactivación institucional [esquema de eventos][events-schema]. Si se añade ese estado, hay que definir por decisión humana qué ocurre con ediciones, cargos y GT existentes. La norma no da por sí sola una instrucción técnica para borrar historia.
4. **Reactivación con evidencia y decisión.** El art. 28 pide una mesa con persona en cada cargo, no solo el mínimo 2/3/4 de continuidad. El catálogo actual puede ayudar a preparar esa revisión, una vez conciliados sus nombres, pero no existen expediente, decisión ni control de ventana de reactivación [catálogo de macroeventos][macro-catalog] [esquema de eventos][events-schema].

Recomendación de producto para evaluar: si se incorpora, separar la comprobación informativa de requisitos del registro de la decisión institucional. Automatizar desactivaciones sin confirmación **ampliaría** el comportamiento humano conservado en [ADR-060, reglas 8, 9 y 14][adr060] y [ADR-061, línea 24][adr061]; no se desprende como una implementación ya autorizada de esta investigación.

## 5. Diferencias anteriores que no resuelve cambiar los PDF

### 5.1 Junta, macroeventos y nuevos: la guarda es más estrecha que la documentación

La [ADR-060, regla 11, línea 42][adr060] describe incompatibilidad de junta y mesa, y aval para nuevos. El [art. 11 del Reglamento, p. 10][new-11] incluye expresamente CIC, CE y macroeventos; no cambió en esta actualización. Los arts. 27.3 y 41 contemplan suplencias de Junta como situación especial.

El código desplegado restringe `BOARD` a roles `COMMITTEE` y `NEW_MEMBER` a nuevas asignaciones de comité, no de macroevento: [inhabilities-pure.ts, líneas 54–82][guards]. Los comandos de junta y macroevento llaman a esa misma función [nombramiento de junta][board-command] [nombramiento de mesa][macro-command]. El esquema no distingue la suplencia excepcional de una elección ordinaria [esquema de cargos][appointments-schema].

Se ejecutó **solo esa función pura del archivo desplegado**, con datos sintéticos en memoria, sin base de datos ni escrituras. Resultados relevantes:

| Caso aislado, sin otras inhabilidades | Resultado de `inhabilities()` |
| --- | --- |
| Persona de junta recibe cargo de macroevento | `[]` |
| Persona con cargo de macroevento recibe junta | `[]` |
| Persona de junta recibe dirección de comité | `["BOARD"]` |
| Persona nueva recibe cargo de macroevento | `[]` |
| Persona nueva recibe dirección de comité | `["NEW_MEMBER"]` |
| `OFFICE_BAN` viva, al nombrar junta o macroevento | `["OFFICE_BAN"]` |

No es un hallazgo de regresión nueva: las [pruebas existentes, líneas 45–69][tests-inhabilities] permiten explícitamente al nuevo dirigir un macroevento porque lo elige Asamblea, y permiten nombrar junta a quien tiene un cargo de macroevento. La ejecución aislada prueba la decisión de la función, no un nombramiento real extremo a extremo.

**Recomendación:** conciliar la interpretación y documentar la excepción exacta antes de estrechar o ampliar esas guardas. Una corrección que simplemente impida toda junta + macroevento también impediría las suplencias contempladas por la norma. La eliminación del parágrafo del art. 8 no resuelve esta diferencia ni autoriza a eliminar otras inhabilidades.

### 5.2 Catálogo: coincide la cantidad, no todos los nombres

El Reglamento nuevo conserva en las mesas **Mercadeo y Publicidad**, sin enumerar Relaciones Públicas: arts. 42–44, pp. 24–25 ([PDF][new-42]). El catálogo y [ADR-064, línea 10][adr064] ofrecen **Relaciones Públicas y Mercadeo**, y dejan Publicidad como histórico [catálogo de macroeventos][macro-catalog]. Esa diferencia ya existía: las listas anteriores eran iguales en ese aspecto ([arts. 41–43 anteriores, pp. 23–24][old-40]).

No presentar la coincidencia 6/7/9 como cumplimiento literal completo. Si se automatiza el requisito de EnFemenino o la mesa completa de reactivación, la OE debe confirmar qué cargo del catálogo corresponde a cada denominación normativa. Cambiar la nomenclatura vigente contradice ADR-064 y exigiría enmendarla; esta nota no decide cuál nomenclatura debe prevalecer.

### 5.3 Renuncia, remoción y sanción no son el mismo dato

La guarda ve `officeBan` derivada de sanciones, y cargos actuales por término; no calcula la fecha y causal de una renuncia o remoción [contexto de inhabilidades][leadership-context]. Al retirar un nombramiento se elimina la fila y se audita, pero el comando no recibe causal de remoción [retiro del cargo][remove-runtime]. Por tanto, no declarar implementados todos los requisitos del art. 8.3 o 27.3 únicamente porque exista `OFFICE_BAN`. Tampoco retirar esa sanción por haber desaparecido el permiso para renuncias válidas: los arts. 63–64 mantienen sus causas propias [arts. 63–64 actualizados][new-63].

## 6. Dudas normativas que sí afectan una futura implementación

Estas preguntas corresponden a Junta/GH y, cuando proceda, a Asamblea. No se resolvieron por inferencia del código.

| Duda | Por qué cambia la implementación |
| --- | --- |
| ¿«Direcciones electas» cuenta cargos distintos o personas? ¿Cómo cuenta una codirección sin titular? | Art. 27, pars. 6–8 [art. 27 actualizado][new-27b]. Determina el conteo; los nombramientos tienen dos plazas por cargo [esquema de cargos][appointments-schema]. |
| ¿Cuál es la segunda asamblea del año y el momento de evaluar: antes o después de sus elecciones? ¿Cómo se aplica a dos ediciones de Inventiva? | Arts. 27, 39 y 41 [art. 27 actualizado][new-27b] [art. 39 actualizado][new-39] [art. 41 actualizado][new-41]. Determina hito, ámbito anual o por edición, y si una elección en esa sesión evita la deshabilitación. |
| ¿Cómo se ordenan deshabilitación por mínimos, suplencia por Junta y declaración de vacante ocupada? | Art. 27 y art. 41 usan la segunda asamblea; art. 45 mantiene el **15 de febrero** [arts. 45–46 actualizados][new-45]. El art. 39, par. 2, también conserva intervención de Asamblea por mesa incompleta [art. 39 actualizado][new-39]. No basta reemplazar una fecha. |
| ¿La composición de EnFemenino se exige por cada candidatura/cargo y se revalida cuando cambia una codirección? | Art. 44 [art. 44 actualizado][new-44]. La lectura operativa más natural es al menos una mujer en cada cargo señalado, pero el texto agrupa los tres y no describe el tratamiento posterior de renuncias. Conviene confirmarlo antes de bloquear registros. |
| ¿Qué permiso concreto cubre la excepción de VP de GH? | Art. 3, par. 1 [art. 3 actualizado][new-3] permite pedir permiso por el numeral 1 con un semestre, pero no fija una mayoría específica allí ni separa sus dos componentes: semestres y Subsidios. No copiar automáticamente la mayoría calificada del permiso extemporáneo. |
| ¿Qué referencias internas deben corregirse oficialmente? | El art. 8 remite al 37, que trata alimentación; el art. 45 remite al 39, distinto del procedimiento de elección del 41 [art. 8 actualizado][new-8] [art. 37 actualizado][new-37] [arts. 45–46 actualizados][new-45] [art. 41 actualizado][new-41]. Hay remisiones heredadas que el desplazamiento numérico no resuelve. Mantener el texto original en el lector y señalar la duda, conforme a [ADR-042, línea 26][adr042]. |

La frase negativa del art. 8.3 también es defectuosa en ambas versiones. No convertir su literalidad aislada en una regla inversa de elegibilidad; requiere interpretación institucional [art. 8 anterior][old-8] [art. 8 actualizado][new-8].

## 7. Permanencia: cambio confirmado en producción

Se confirmó directamente y con inspección visual de la página 8 de ambos PDF el cambio de **40 % a 50 %** para entrar en prueba, con **60 %** para conservar activo, en Estatutos art. 7.5 ([antes][old-est7], [ahora][new-est7]). Los umbrales de nuevos y personas ya en prueba (80 %) y de transferencia (70 %) no cambiaron.

La [ADR-060, regla 1, línea 20][adr060] todavía fija margen activo 20 y banda 40–59. El código no fija 40 como constante: carga umbral y márgenes de configuración [carga de configuración][facts-config]; para el resultado final compara `total >= threshold - probationMargin` [cálculo del resultado][final-state]. Con umbral 60, la regla nueva corresponde a margen activo **10**, conservando 60 para cumplir. Por ejemplo, 45 pasa de prueba a no cumplir y 50 permanece en prueba. No implica cambiar el umbral de quien ya está en prueba ni la banda informativa `RISK_BAND`, que tiene otra función [márgenes por condición][margins].

La consulta de solo lectura a producción confirmó `permanence.probationMargins = { active: 20, new: 0, probation: 0, transfer: 0 }`, y umbrales activo 60, nuevo 80, prueba 80 y transferencia 70. La evidencia es [production-config.json][live-config]; no contiene datos personales. Se ejecutó la función pura con 39,99/40/45/49,99/50/59,99/60, sin base ni escrituras. Solo los valores de 40 hasta menos de 50 cambian de `PRUEBA` a `NO_CUMPLE` al usar margen activo 10. No se estimó cuántas personas reales están en ese intervalo.

El efecto es una propuesta de salida **de ese comité**; si no queda otro donde cumpla o esté en prueba, el cierre propone salida de la OE. Es una salida por permanencia, no una expulsión disciplinaria automática: [propuestas y causal, líneas 1028–1075][closing-proposals]. La decisión de cierre sigue su confirmación humana.

**Esto cambia una decisión calculada existente, sin exigir reescribir la fórmula.** La implementación debe incluir una ADR que enmiende ADR-060 regla 1, una nueva migración o cambio auditado de configuración —sin reescribir la migración histórica 0016—, la actualización de `docs/12-permanencia.md` y pruebas de límites. Las [pruebas actuales, líneas 556–595][permanence-tests] fijan explícitamente que 40 y 45 quedan en prueba.

Antes de aplicar, definir con GH **desde qué semestre o fecha rige**. Ambos PDF conservan la fecha impresa de última reforma del 8 de mayo de 2026; no distingue la vigencia de esta corrección. La configuración se carga globalmente, no por término [carga de configuración][facts-config]; cambiarla afecta los cálculos futuros de términos abiertos que la lean. Si se requiere una vigencia por semestre, habrá que modelarla. Conservar los cierres anteriores: [snapshots.ts, líneas 101–140][snapshot-guard] ya evita recalcular términos cerrados o sobrescribir filas congeladas. Al aplicar a un término abierto, revisar sus propuestas y decisiones confirmadas, y coordinar el recálculo correspondiente; no ejecutar bajas por el simple cambio de configuración.

## 7.1. Referencias visibles que quedaron desactualizadas

El artículo nuevo 28 del Reglamento desplaza los antiguos 28–74 a 29–75. Además del lector actualizado, hay textos de la interfaz que todavía citan la numeración anterior: expulsión `61 → 62` (T-2206/T-2208), sanciones `69 → 70` (T-801/T-2238), beneficios `73 → 74` (T-2331/T-3265), aval de eventos `35 → 36` (T-2301), presupuesto `50 → 51` (T-2290/T-2305), inducción `47 → 48` (T-2318) y horario preferencial `72 → 73` (T-2324). Véase el [catálogo de textos][copy-citations] y el [cruce completo][mapping].

Actualizar el catálogo y ejecutar `copy:sync`; ajustar las referencias vigentes de código y documentación por título, sin sumar uno a citas de Estatutos ni reescribir ADRs, migraciones o revisiones históricas. Las remisiones erróneas **dentro del PDF** se conservan literalmente en el lector hasta corrección oficial (§6). El Anexo 1 no cambió entre los originales: pasó de pp. 39–43 a 40–44 por la inserción anterior; esta entrega no exige alterar excusas ni sanciones por un supuesto texto nuevo del anexo.

## 8. Prioridades y recomendaciones para decidir trabajo posterior

Las prioridades indican orden de revisión de producto, no autorizan implementación.

| Prioridad | Acción propuesta | Tipo |
| --- | --- | --- |
| **P1 · antes del próximo cierre al que aplique** | Resolver vigencia y cambiar el margen activo de 20 a 10, manteniendo umbral 60 y demás condiciones. Enmendar ADR-060, actualizar documentación y pruebas, y revisar propuestas antes de aplicar. La configuración anterior se confirmó en producción. | Cambio real de resultado; §7. |
| **P1 · antes del próximo proceso electoral** | Actualizar la revisión humana con permisos tardíos, excepción de VP de GH, experiencia por pareja, requisitos de Inventiva/EnFemenino y planes de trabajo. Conciliar junta–macroevento, nuevos y catálogo antes de afirmar cumplimiento automático. | Procedimiento humano y diferencias previas; §§3 y 5. |
| **P2 · decisión explícita de alcance** | Evaluar un flujo de estado institucional, mínimos y reactivación de macroeventos. Resolver primero los hitos, conteos y suplencias. Registrar la decisión sin borrar historia. | Funcionalidad nueva; §§4 y 6. |
| **P2 · solo si se decide digitalizar elecciones** | Diseñar candidatura conjunta, evidencia de requisitos, permiso extemporáneo, avales y plan de trabajo. No reutilizar GT/GAP como si fueran elecciones ni tratar `overrideReason` como constancia suficiente de una mayoría. | Ampliación del alcance de ADR-031/060/064. |
| **P2 · textos visibles y trazabilidad** | Corregir las citas de artículos en los mensajes de la app y la documentación vigente; regenerar copy. Conservar historia y erratas de fuente en el lector mientras no haya corrección oficial. | Corrección de interfaz y documentación; §7.1. |

Para una implementación futura, los casos de aceptación deberían cubrir los límites 49,99/50/59,99/60 de permanencia; mínimos de macroeventos contando cargo, codirección y suplencia por separado; Días con cuatro direcciones pero sin The Games/Carnival; reactivación con mesa incompleta; y candidatura conjunta donde solo una persona acredita el requisito. Son recomendaciones para cuando exista decisión de alcance, no pruebas ni cambios añadidos en esta tarea.

## Referencias

Los enlaces a PDF y al archivo desplegado salen del repo hacia la carpeta privada de trabajo. Los sufijos `#Lx-Ly` indican los rangos exactos examinados del archivo citado.

[est-old]: ../../informes/normativa-2026-11-06/previous/estatutos.pdf
[reg-old]: ../../informes/normativa-2026-11-06/previous/reglamento.pdf
[est-new]: ../../informes/normativa-2026-11-06/estatutos-2026-actualizado.pdf
[reg-new]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf
[est-json]: ../../informes/normativa-2026-11-06/estatutos.json
[reg-json]: ../../informes/normativa-2026-11-06/reglamento.json
[before]: ../../informes/normativa-2026-11-06/before.json
[comparison]: ../../informes/normativa-2026-11-06/comparison.diff.txt
[mapping]: ../../informes/normativa-2026-11-06/article-mapping.json
[old-1]: ../../informes/normativa-2026-11-06/previous/reglamento.pdf#page=6
[new-1]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=6
[old-3]: ../../informes/normativa-2026-11-06/previous/reglamento.pdf#page=7
[new-3]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=7
[old-8]: ../../informes/normativa-2026-11-06/previous/reglamento.pdf#page=8
[new-8]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=8
[old-13]: ../../informes/normativa-2026-11-06/previous/reglamento.pdf#page=10
[new-11]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=10
[new-13]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=10
[old-27]: ../../informes/normativa-2026-11-06/previous/reglamento.pdf#page=17
[old-27b]: ../../informes/normativa-2026-11-06/previous/reglamento.pdf#page=18
[new-26]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=17
[new-27]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=17
[new-27b]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=18
[new-28]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=18
[new-37]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=22
[new-39]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=22
[old-40]: ../../informes/normativa-2026-11-06/previous/reglamento.pdf#page=23
[new-41]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=24
[new-42]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=24
[old-42]: ../../informes/normativa-2026-11-06/previous/reglamento.pdf#page=24
[new-43]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=25
[old-43]: ../../informes/normativa-2026-11-06/previous/reglamento.pdf#page=24
[new-44]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=25
[old-44]: ../../informes/normativa-2026-11-06/previous/reglamento.pdf#page=24
[new-45]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=25
[new-63]: ../../informes/normativa-2026-11-06/reglamento-2026-actualizado.pdf#page=33
[old-est7]: ../../informes/normativa-2026-11-06/previous/estatutos.pdf#page=8
[new-est7]: ../../informes/normativa-2026-11-06/estatutos-2026-actualizado.pdf#page=8
[adr031]: adr/ADR-031-autogestion-del-miembro.md#L12-L26
[adr042]: adr/ADR-042-normativa-completa.md#L10-L28
[adr060]: adr/ADR-060-alineacion-con-la-normativa-2026.md#L10-L48
[adr061]: adr/ADR-061-verificacion-y-correcciones-de-normativa-2026.md#L14-L24
[adr064]: adr/ADR-064-gestion-de-macroeventos.md#L8-L24
[board-command]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/people/domain/appointments.ts#L175-L218
[macro-input]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/people/domain/appointments.ts#L79-L85
[macro-command]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/people/domain/appointments.ts#L378-L458
[remove-runtime]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/people/domain/appointments.ts#L249-L274
[remove-checkout]: ../src/modules/people/domain/appointments.ts#L250-L280
[edition-term]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/people/domain/appointments.ts#L360-L370
[guards]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/people/domain/inhabilities-pure.ts#L54-L95
[leadership-context]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/people/domain/inhabilities.ts#L47-L135
[override]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/people/domain/inhabilities.ts#L155-L194
[appointments-schema]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/people/schema.ts#L129-L165
[person-schema]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/people/schema.ts#L62-L90
[calls-schema]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/crm/schema.ts#L304-L355
[calls-pure]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/crm/domain/calls-pure.ts#L12-L32
[calls-command]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/crm/domain/calls.ts#L375-L417
[viability-pure]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/participation/domain/committee-viability-pure.ts#L28-L63
[viability-query]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/participation/domain/committee-viability.ts#L33-L101
[events-schema]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/events/schema.ts#L10-L59
[macro-catalog]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/events/domain/macroevents-pure.ts#L1-L21
[tests-inhabilities]: ../tests/unit/inhabilities-pure.test.ts#L45-L69
[facts-config]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/permanence/domain/facts.ts#L39-L50
[final-state]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/permanence/domain/permanence-pure.ts#L767-L775
[margins]: ../../informes/normativa-2026-11-06/runtime-src/src/modules/permanence/domain/permanence-pure.ts#L307-L342
[live-config]: ../../informes/normativa-2026-11-06/production-config.json
[closing-proposals]: ../src/modules/permanence/domain/permanence-pure.ts#L1028-L1075
[snapshot-guard]: ../src/modules/permanence/domain/snapshots.ts#L101-L140
[permanence-tests]: ../tests/unit/permanence-pure.test.ts#L556-L595
[copy-citations]: 14-copy-y-textos.md#L1813-L2009

## Decisión posterior a esta revisión

Mateo autorizó implementar las correcciones y confirmó el 2026-11-06 la vigencia desde 2026-2, con cierres anteriores conservados, y el conteo de cargos electos distintos después de las elecciones de la segunda asamblea. La implementación y sus límites se registran en [ADR-157](adr/ADR-157-normativa-actualizada-2026.md) y en el roadmap. Las observaciones anteriores describen el estado inspeccionado antes de esa implementación.
