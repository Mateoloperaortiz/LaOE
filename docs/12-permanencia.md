# Permanencia

Cada semestre, la Vicepresidencia de Gestión Humana evalúa a cada integrante con una **tabla de criterios ponderados en porcentajes**. Quien alcanza al menos **60 %** permanece en la OE. Hoy la tabla vive en una hoja de cálculo y la persona se entera al final; en la casa digital se convierte en un tablero que cada integrante ve en tiempo real y que GH configura por término. Regla en [ADR-025](adr/ADR-025-permanencia-scorecard.md).

## La tabla de 2026-2 según las capturas de GH

Transcripción de las cuatro capturas recibidas el 2026-09-02. Los textos entre paréntesis "(no solo hacer parte, sino tener un buen desempeño en las actividades y responsabilidades asignadas antes, durante y después)" aplican a todos los criterios de grupo.

| Criterio | Cómo se cumple según GH | Peso | Aplica a | Evidencia en la app |
| --- | --- | --- | --- | --- |
| Integraciones | Asistir a las actividades de integración de la Vicepresidencia de GH: 2 % por actividad, máximo 10 % (5 de las 10 del semestre) | 10 % | Todos | Check-ins en ocasiones con categoría `INTEGRATION` |
| Asambleas generales | Asistir a dos o más asambleas del grupo (la captura dice "3 o más" en amarillo: por confirmar) | 10 % | Todos | Check-ins en asambleas del término |
| GT Macroeventos | Hacer parte de un grupo de trabajo de Inventiva, Días EAFIT o EnFemenino, con buen desempeño | 4 % / 6 % / 8 % (por confirmar a qué corresponde cada cifra) | Veteranos | Pertenencia a un grupo `GT_MACROEVENT` de la edición + evaluación del líder |
| GAP | Participar como Grupo de Apoyo de un macroevento o de un evento de otro comité distinto a los propios, con buen desempeño | 5 % | Todos | Grupo `GAP` + evaluación |
| GAP OE | Grupo de Apoyo en eventos de la Junta Directiva: VTG y Assessment | 3 % + 3 % | Veteranos | Un grupo `GAP_OE` por evento + evaluación |
| Comité de trabajo | Pertenecer a uno de los seis comités de trabajo (CAP, CGH, CML, CCM, CAE, CAF) o al Athletic, con buen desempeño | 6 % | Veteranos | Grupo `WORK_COMMITTEE` + evaluación |
| Barra brava / Apoyo Athletic OE | Apoyar al Athletic OE en al menos 3 encuentros deportivos, con involucramiento demostrable (carteleras, porras, implementos), no solo asistencia | 5 % | Todos | Al menos 3 check-ins en ocasiones `ATHLETIC_MATCH` y evaluación del grupo `BARRA_BRAVA` |
| Decoración de oficina | Solo nuevos | 10 % | Nuevos | Grupo `NEW_MEMBER_TASK` + evaluación |
| Integración solo nuevos | Solo nuevos | 5 % | Nuevos | Check-in en la ocasión de integración marcada `newMembersOnly` |

GH aclara que los criterios de nuevos (quienes ingresan en 2026-2) **reemplazan** los de Grupos de Trabajo, Comités de Trabajo y GAP OE.

Sumas de lo capturado: veteranos hasta 50 % (con un solo GT) y nuevos hasta 45 %. Como el umbral es 60 %, la tabla completa tiene más criterios que no aparecen en las capturas. Está en [11-contenido-pendiente.md](11-contenido-pendiente.md).

## Cómo se modela

Tres ideas:

1. **Las reglas son datos, no código.** `PermanenceRule` guarda, por término, cada criterio con su peso, a quién aplica (todos, nuevos, veteranos), cómo se calcula y sus parámetros. GH copia la tabla del término anterior y ajusta pesos; el umbral (60 %) también es configuración por término.
2. **Todo criterio sale de hechos registrados.** Asistencias (check-ins con categoría de ocasión), pertenencia a **grupos de trabajo** con una **evaluación de desempeño** explícita, y créditos manuales auditados para lo que no encaje. "Buen desempeño" nunca se calcula: lo registra el líder del grupo o GH.
3. **La persona siempre ve dónde va.** Un snapshot por persona y término se recalcula solo (outbox) cada vez que cambia un hecho, con el desglose y lo que todavía puede sumar.

### Tipos de cálculo

| Tipo | Parámetros | Ejemplo |
| --- | --- | --- |
| `CHECKIN_COUNT` | categoría de ocasión, porcentaje por unidad, tope, filtro `newMembersOnly` | Integraciones: `INTEGRATION`, 2 % cada una, tope 10 % |
| `CHECKIN_THRESHOLD` | categoría o tipo, mínimo de check-ins, peso | Asambleas: al menos 2 (o 3), 10 % |
| `GROUP_EVALUATED` | tipo de grupo, pesos por grupo o por evento, ¿acumula? | Comité de trabajo 6 %; GT por macroevento 4/6/8 %; GAP OE 3 % por evento |
| `COMPOSITE` | umbral de check-ins más evaluación de grupo | Barra brava: 3 partidos `ATHLETIC_MATCH` y evaluación `GOOD` |
| `MANUAL` | peso, requiere motivo | Criterios que GH reconoce a mano |

### Grupos de trabajo y evaluaciones

`WorkGroup` por término con `kind` (`WORK_COMMITTEE`, `GT_MACROEVENT`, `GAP`, `GAP_OE`, `BARRA_BRAVA`, `NEW_MEMBER_TASK`), nombre, código (CAP, CGH, CML, CCM, CAE, CAF, ATHLETIC), evento o edición asociada y líder. `WorkGroupMembership` une persona y grupo, con `evaluation` (`PENDING`, `GOOD`, `INSUFFICIENT`), quién evaluó, cuándo y una nota. El líder evalúa al cerrar el evento o el término; GH puede corregir con motivo. Una evaluación pendiente se muestra como "pendiente" y, al cerrar el término, cuenta como no lograda salvo que GH la resuelva. Cada evaluación queda en la línea de tiempo de la persona.

Los seis comités de trabajo y el Athletic son distintos de los 27 comités con logo a los que pertenece cada integrante (1 a 3): se modelan como grupos de trabajo, no como `Committee` (por confirmar con GH).

### Estados del snapshot

| Estado | Significado |
| --- | --- |
| `EN_CAMINO` | Término abierto; lo logrado más lo que aún es posible alcanza el umbral |
| `EN_RIESGO` | Término abierto; lo que queda posible apenas cubre el umbral (margen menor a 10 %) |
| `NO_ALCANZA` | Término abierto; ni sumando todo lo que falta se llega al umbral. GH lo ve de inmediato |
| `CUMPLE` | Término cerrado con total ≥ umbral |
| `NO_CUMPLE` | Término cerrado con total < umbral |

"Lo que aún es posible" se calcula con las ocasiones futuras del término (integraciones y partidos programados) y los grupos abiertos.

### Cierre del término

El cierre produce `PermanenceDecision` por persona (`CONTINUES`, `CONTINUES_WITH_COMMITMENT`, `EXIT`) tomada por ADMIN con motivo; `EXIT` ejecuta "dar de baja" ([ADR-003](adr/ADR-003-etapas-por-comando.md)). No hay sanciones automáticas: la app muestra y registra, GH decide.

## Lo que ve el integrante (`/app/permanencia`)

- Encabezado: "Vas en 38 %. Necesitás 60 % para permanecer. Todavía podés sumar 34 %." Barra de progreso con el umbral marcado y el estado.
- Una tarjeta por criterio: logrado / máximo, qué cuenta, cómo sumar más ("asististe a 2 de 5 integraciones; quedan 6 este semestre, la próxima es el jueves"), evaluaciones pendientes ("tu GAP en Inventiva espera la evaluación del líder").
- Historial: qué sumó y cuándo, desde la línea de tiempo.
- En el inicio de Mi OE, una barra compacta con el porcentaje.
- Avisos por push o correo: a mitad de término, tres semanas antes del cierre si está por debajo, y el resumen al cerrar.

## Lo que ve GH (`/admin/permanencia`)

- **Reglas** del término: copiar del anterior, editar pesos y parámetros, vista previa del impacto sobre el roster.
- **Grupos**: crear grupos de trabajo del término, asignar líder e integrantes; importar desde CSV.
- **Evaluaciones**: bandeja de pendientes por grupo y líder; recordatorios automáticos.
- **Cumplimiento**: roster con porcentaje, estado, nuevo o veterano; filtros "por debajo de 60 %" y "no alcanza"; export.
- **Cierre**: decisiones por persona, con motivo, y registro.
- **Persona 360**: pestaña Permanencia con el mismo desglose que ve la persona.

Los líderes de grupo evalúan a los integrantes de sus grupos desde `/admin/permanencia/grupos/[id]`; no ven el resto del roster.

## Relación con GH Points

Comparten los hechos (check-ins, asambleas) pero no se mezclan: los puntos son reconocimiento y ranking; la permanencia es el requisito. Un check-in de integración suma puntos y suma 2 % al mismo tiempo. Los puntos no afectan la permanencia ni al revés.

## Preguntas para GH

Están en [decisiones-abiertas.md](decisiones-abiertas.md): la tabla completa y su total, qué significan 4/6/8 % en GT y si acumulan, si asambleas exige 2 o 3, quién evalúa cada grupo y cuándo, qué pasa por debajo de 60 %, si el umbral cambia por término, y si los comités de trabajo son distintos de los 27 comités.
