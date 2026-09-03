# Permanencia

Cada semestre, Gestión Humana evalúa a cada miembro con **dos tablas de criterios ponderados**: la **general** (de la junta, la aplica GH a toda la OE) y la **de su comité** (la define cada comité). La persona obtiene un **resultado por cada comité** al que pertenece: lo que cumplió en la tabla general más lo que cumplió en la tabla de ese comité. Con ese resultado se decide su permanencia según su condición: vigente **60 %**, nuevo o en periodo de prueba **80 %**, transferencia interna a un comité **70 %** en ese comité. Hoy todo vive en hojas de cálculo y la persona se entera al final; en la casa digital es un tablero que cada miembro ve en tiempo real. Reglas en [ADR-025](adr/ADR-025-permanencia-scorecard.md), [ADR-026](adr/ADR-026-permanencia-por-comite.md) y [ADR-027](adr/ADR-027-permanencia-reglas-de-gh.md).

## Cómo funciona en la OE (respuestas de GH, 2026-09-02)

| Tema | Regla |
| --- | --- |
| Dos tablas | La general vale unos **50 puntos** y la del comité unos **60**; la suma no es 100 exacto (ronda 110 a 115). Los umbrales son puntos sobre esa suma, no una fracción del máximo |
| Resultado por comité | Para cada comité de la persona: total = general + tabla de ese comité. Ejemplo de GH: general 45 %; en Pixel cumplió 30 % de la tabla de Pixel, total en Pixel 75 %; en Cigma cumplió 50 %, total en Cigma 95 % |
| Umbrales fijos | Vigente: 60 %. Nuevo o en periodo de prueba: 80 %. Transferencia interna a un comité: 70 % en el comité al que se transfirió |
| Por debajo del umbral | Hasta 10 puntos por debajo de lo que debía cumplir: **periodo de prueba** (el término siguiente debe cumplir 80 %). Más de 10 puntos por debajo: **sale de ese comité**; si era su único comité, o no le queda otro donde cumpla o esté en prueba, **sale de la OE** |
| GT de macroeventos | Por cantidad de grupos de trabajo con buen desempeño: uno 4 %, dos 6 %, tres o más 8 % |
| Asambleas | Obligatorias: en primer semestre una ordinaria; en segundo semestre una ordinaria más la elección de junta (y la segunda vuelta si la hay). **Faltar a una obligatoria implica expulsión de la OE.** El 10 % de permanencia exige tres asistencias en el término (obligatorias más extras) |
| Quién evalúa y cuándo | El director de Gestión Humana de cada frente, **al cerrar el semestre**. Las tareas de nuevos las evalúa el GH principal (hoy Miguel Gaviria). En el Athletic, el capitán y el DT reportan quién jugó y quién no; la barra brava la evalúa el GH de turno con las asistencias a partidos como evidencia principal |
| Eventos del comité | Cada comité define el peso de sus eventos 1 y 2; A3 aún no lo definió |
| GH Points | Los puntos de cada actividad los define GH al crearla. Las reuniones de comité no dan puntos: solo cuentan en la tabla |

## Tabla general de 2026-2 (transcripción de las capturas de GH)

| Criterio | Cómo se cumple según GH | Peso | Aplica a | Evidencia en la app |
| --- | --- | --- | --- | --- |
| Integraciones | Asistir a las actividades de integración de la Vicepresidencia de GH: 2 % por actividad, máximo 10 % (5 de las 10 del semestre) | 10 % | Todos | Check-ins en ocasiones con categoría `INTEGRATION` |
| Asambleas generales | Tres asambleas en el término: las obligatorias más extras | 10 % | Todos | Check-ins en asambleas del término; las obligatorias se controlan aparte |
| GT Macroeventos | Grupos de trabajo de Inventiva, Días EAFIT o EnFemenino con buen desempeño: uno 4 %, dos 6 %, tres 8 % | 4 / 6 / 8 % | Veteranos | Grupos `GT_MACROEVENT` evaluados `GOOD`, por cantidad |
| GAP | Grupo de apoyo de un macroevento o de un evento de otro comité, con buen desempeño | 5 % | Todos | Grupo `GAP` + evaluación |
| GAP OE | Grupo de apoyo en eventos de la Junta Directiva: VTG y Assessment | 3 % + 3 % | Veteranos | Un grupo `GAP_OE` por evento + evaluación |
| Comité de trabajo | Pertenecer a uno de los seis comités de trabajo o al Athletic, con buen desempeño | 6 % | Veteranos | Grupo `WORK_COMMITTEE` + evaluación |
| Barra brava / Apoyo Athletic OE | Apoyar al Athletic OE en al menos 3 encuentros con involucramiento demostrable (carteleras, porras, implementos) | 5 % | Todos | Al menos 3 check-ins en ocasiones `ATHLETIC_MATCH` y evaluación del grupo `BARRA_BRAVA` |
| Decoración de oficina | Solo nuevos | 10 % | Nuevos | Grupo `NEW_MEMBER_TASK` evaluado por el GH principal |
| Integración solo nuevos | Solo nuevos | 5 % | Nuevos | Check-in en la integración marcada `newMembersOnly` |

Los criterios de nuevos reemplazan a GT, comités de trabajo y GAP OE. Máximos: veteranos 50 % (con tres GT) y nuevos 45 %, coherentes con los "unos 50 puntos" de GH. La frase "no solo hacer parte, sino tener un buen desempeño antes, durante y después" aplica a todos los criterios de grupo.

## Tabla del comité (ejemplo: A3)

| Criterio del comité | Detalle | Fechas | Peso | Evidencia en la app |
| --- | --- | --- | --- | --- |
| Asistencia a reuniones | Reuniones, eventos, equipos de planeación, subcomités | Cada 8 días | 15 % | Tasa de check-ins en las reuniones semanales del comité (`COMMITTEE_MEETING`) |
| Evento 1 | Lo define el comité | N/A | Pendiente | Check-in o grupo del evento del comité |
| Evento 2 | Lo define el comité | N/A | Pendiente | Igual |
| Subcomité, liderazgo o destacado | Pertenecer y trabajar en un subcomité, haber sido líder de un evento o ser miembro destacado del mes | N/A | 10 % | Puntaje del líder (`LEADER_SCORE`) |
| Obligatorio: convivencia | Convivencia, respeto, actitud, escucha y comunicación; si no se cumple el 5 %, especificar el porqué en observaciones | N/A | 5 % | Puntaje del líder con valor completo por defecto y observación obligatoria si baja |

La tabla de cada comité vale unos 60 puntos; A3 tiene 30 definidos y dos eventos pendientes.

## Comités de trabajo

Son distintos de los 27 comités de pertenencia. Se cargan como grupos de trabajo `WORK_COMMITTEE` con su líder de junta:

| Sigla | Nombre | Lo lidera |
| --- | --- | --- |
| CAP | Comité de Acompañamiento Presidencial | Presidente |
| CGH | Comité de Gestión Humana | Vicepresidente de Gestión Humana |
| CCM | Comité de Creatividad y Mercadeo | Vicepresidencia de Relaciones Públicas |
| CAE | Comité de Alianzas Estratégicas | Vicepresidencia de Relaciones Públicas |
| CML | Comité de Mejoramiento Logístico | Vicepresidencia Administrativa |
| CAF | Comité de Acompañamiento Financiero | Vicepresidencia Financiera |
| Athletic | Equipo deportivo Athletic OE | Capitán y DT (director técnico), que reportan a GH y evalúan |

## Cómo se modela

1. **Las reglas son datos, no código.** `PermanenceRule` guarda, por término, cada criterio con su ámbito (`GENERAL` o `COMMITTEE` con su comité), su peso, a quién aplica (todos, nuevos, veteranos), cómo se calcula y sus parámetros. GH copia la tabla general del término anterior; cada líder hace lo mismo con la de su comité. El editor muestra la suma de cada tabla frente a su valor nominal (50 y 60) y avisa si se aleja, sin bloquear, porque la suma no es exacta.
2. **Todo criterio sale de hechos registrados.** Check-ins con categoría de ocasión, pertenencia a grupos de trabajo con evaluación explícita del director de GH del frente, puntajes del líder de comité y créditos manuales auditados. "Buen desempeño" nunca se calcula: lo registra una persona.
3. **Un resultado por comité.** El snapshot por persona y término guarda la parte general y, por cada comité de la persona, la parte del comité, el total, el umbral que le aplica (60, 80 o 70) y el estado. No hay comité principal ni promedios.
4. **Umbral por condición.** `permanence.threshold.active = 60`, `permanence.threshold.new = 80`, `permanence.threshold.probation = 80`, `permanence.threshold.transfer = 70`, `permanence.probationMargin = 10`. Nuevo = primer término (ADR-008); en prueba = `MembershipTerm.probation`; transferencia = `CommitteeMembership.transferredIn`.
5. **La persona siempre ve dónde va**, con el desglose y lo que aún puede sumar.

### Tipos de cálculo

| Tipo | Parámetros | Ejemplo |
| --- | --- | --- |
| `CHECKIN_COUNT` | categoría de ocasión, porcentaje por unidad, tope, filtro `newMembersOnly` | Integraciones: `INTEGRATION`, 2 % cada una, tope 10 % |
| `CHECKIN_THRESHOLD` | tipo de ocasión, mínimo de check-ins, peso | Asambleas: al menos 3 (ordinarias, elección y segunda vuelta cuentan), 10 % |
| `CHECKIN_RATE` | categoría de ocasión, comité | Reuniones de comité: 15 % multiplicado por la tasa de asistencia |
| `GROUP_EVALUATED` | tipo de grupo, peso fijo o por evento, o tramos por cantidad | Comité de trabajo 6 %; GAP OE 3 % por evento; GT por cantidad 1 → 4 %, 2 → 6 %, 3 o más → 8 % |
| `COMPOSITE` | umbral de check-ins más evaluación de grupo | Barra brava: 3 partidos `ATHLETIC_MATCH` y evaluación `GOOD` |
| `LEADER_SCORE` | peso, obligatorio o no | Subcomité, liderazgo o destacado (0 a 10 %); convivencia (5 % por defecto, observación obligatoria si baja) |
| `MANUAL` | peso, requiere motivo | Criterios que GH reconoce a mano |

### Grupos de trabajo y evaluaciones

`WorkGroup` por término con `kind` (`WORK_COMMITTEE`, `GT_MACROEVENT`, `GAP`, `GAP_OE`, `BARRA_BRAVA`, `NEW_MEMBER_TASK`), nombre, código, evento o edición asociada, quién lo lidera y quiénes lo **evalúan** (`WorkGroupEvaluator`: el director de GH de ese frente; en tareas de nuevos, el GH principal; en el Athletic, el capitán y el DT). Las evaluaciones se hacen al cerrar el semestre: la ventana se abre dos semanas antes del cierre. Las personas entran a los grupos por **convocatorias internas** desde Mi OE (formulario con cupo, ventana y selección) o por carga de GH ([ADR-031](adr/ADR-031-autogestion-del-miembro.md)). `WorkGroupMembership` une persona y grupo, con `evaluation` (`PENDING`, `GOOD`, `INSUFFICIENT`), quién evaluó, cuándo y una nota. Una evaluación pendiente se muestra como "pendiente" y al cerrar el término cuenta como no lograda salvo que GH la resuelva. Cada evaluación queda en la línea de tiempo de la persona.

### Estados del resultado en un comité

| Estado | Significado |
| --- | --- |
| `EN_CAMINO` | Término abierto; lo logrado más lo que aún es posible alcanza el umbral |
| `EN_RIESGO` | Término abierto; lo que queda posible apenas cubre el umbral (margen menor a 10 puntos) |
| `NO_ALCANZA` | Término abierto; ni sumando todo lo que falta se llega al umbral. GH lo ve de inmediato |
| `CUMPLE` | Término cerrado con total ≥ umbral |
| `PRUEBA` | Término cerrado con total entre el umbral y 10 puntos por debajo: periodo de prueba el término siguiente |
| `NO_CUMPLE` | Término cerrado con total más de 10 puntos por debajo del umbral: sale de ese comité; si no le queda otro donde cumpla o esté en prueba, sale de la OE |

"Lo que aún es posible" usa las ocasiones futuras del término (integraciones, partidos, reuniones) y los grupos abiertos. Las asambleas obligatorias se muestran aparte como "obligatorias: 1 de 2", con aviso antes de cada una: faltar implica retiro de la OE.

### Cierre del término

Al cerrar, la app **propone** para cada persona y comité el estado según los umbrales y el margen de prueba, con la regla de GH: `NO_CUMPLE` en un comité es salida de ese comité; si a la persona no le queda ningún comité donde esté en `CUMPLE` o `PRUEBA`, salida de la OE; faltar a una asamblea obligatoria también propone salida de la OE. GH confirma o corrige con motivo y queda `PermanenceDecision` (`CONTINUES`, `PROBATION`, `EXIT_COMMITTEE`, `EXIT_OE`). `EXIT_OE` ejecuta "dar de baja" ([ADR-003](adr/ADR-003-etapas-por-comando.md)); `PROBATION` marca el término siguiente. Nada se aplica sin la confirmación de GH.

## Lo que ve el miembro (`/app/permanencia`)

- Encabezado por comité: "En Pixel vas en 75 %: cumplís (necesitás 60 %). En Cigma vas en 52 %: te faltan 8 %." Con el umbral que le aplica (60, 80 o 70) y su condición (vigente, nuevo, en prueba, transferencia).
- Bloque **general**: cada criterio con logrado / máximo, qué cuenta y cómo sumar más ("asististe a 2 de 5 integraciones; quedan 6 este semestre, la próxima es el jueves"). Asambleas obligatorias aparte.
- Bloque por **comité**: reuniones (asistencia y próximas), eventos, puntajes del líder y sus observaciones.
- Evaluaciones pendientes con quién debe evaluarlas.
- Si la persona es nueva, arriba aparece su lista de onboarding de la primera semana, ligada a sus criterios (integración de nuevos, decoración de oficina).
- Historial desde la línea de tiempo. Barra compacta en el inicio de Mi OE.
- Avisos por push o correo a mitad de término, tres semanas antes del cierre si está por debajo, y el resumen al cerrar.

## Lo que ve GH (`/admin/permanencia`)

- **Tabla general** del término: copiar del anterior, editar, vista previa del impacto sobre el roster.
- **Tablas de comité**: las 27 en una vista, con su suma frente a los 60 nominales, comentarios y bloqueo al iniciar el término.
- **Grupos**: crear grupos de trabajo del término con líder, evaluador e miembros; importar desde CSV; los seis comités de trabajo y el Athletic vienen sembrados.
- **Evaluaciones**: ventana que se abre dos semanas antes del cierre del término; bandeja de pendientes por evaluador; recordatorios.
- **Cumplimiento**: roster con resultado por comité, condición, umbral y estado; filtros "por debajo", "no alcanza", "en prueba", "nuevos"; export.
- **Cierre**: propuesta automática por persona y comité, confirmación con motivo, registro.
- **Persona 360**: pestaña Permanencia con el mismo desglose que ve la persona.

## Lo que ve el líder de comité (`/admin/comites/[slug]/permanencia`)

- **Tabla del comité**: criterios y pesos; suma frente a los 60 nominales; copiar del término anterior.
- **Reuniones**: crear la serie semanal como ocasiones `COMMITTEE_MEETING` sin puntos; pasar asistencia con el modo anfitrión.
- **Eventos del comité**: ocasiones con `committeeId` ligadas a los criterios de eventos.
- **Puntajes**: subcomité, liderazgo o destacado del mes (0 a 10 %) y convivencia (5 % por defecto); si baja el valor, la observación es obligatoria y la persona la ve.
- **Destacado del mes**: al asignarlo se publica en la cartelera del comité y como insignia en el perfil de la persona, si dio consentimiento de directorio.
- **Progreso de sus miembros** en su comité: resultado, quién no ha ido a reuniones, quién está en riesgo o en prueba.

## Lo que ve el director de GH de un frente

Bandeja con los grupos que evalúa (`WorkGroupEvaluator`), sus miembros y el botón de evaluación con nota, disponible desde dos semanas antes del cierre del término; sin acceso al resto del roster. El capitán y el DT del Athletic y el GH de turno para la barra brava usan la misma vista.

## Relación con GH Points

Comparten los hechos pero no se mezclan: una integración suma puntos (los que GH puso al crearla) y 2 % de permanencia; una reunión de comité suma 0 puntos y solo cuenta en la tabla. Los puntos no afectan la permanencia ni al revés.

## Preguntas pendientes

GH respondió todo lo que estaba abierto ([ADR-028](adr/ADR-028-permanencia-consecuencias.md)). Falta contenido, no decisiones: las tablas de los demás comités, los pesos de los eventos de cada comité, la lista de directores de GH por frente y los nombres del capitán y el DT del Athletic; GH los envía cuando termine de limpiar su base ([11-contenido-pendiente.md](11-contenido-pendiente.md)).
