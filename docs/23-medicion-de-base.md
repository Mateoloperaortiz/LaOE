# Medición de base del rediseño

Es el último paso de la ola 0 de [ADR-158](adr/ADR-158-la-marca-en-dos-capas.md) a [ADR-160](adr/ADR-160-la-navegacion-de-mi-oe.md). Mide cómo se usa la casa hoy, antes de la ola 1, para comparar después con las mismas tareas. La prueba se repite completa al cerrar la ola 1, y el cuestionario SUS se repite después de cada ola ([09-roadmap](09-roadmap.md)).

## Quiénes

| Grupo | Quiénes | Qué recorre | Dónde |
| --- | --- | --- | --- |
| Miembros | El comité GEMIS | Mi OE | En su celular |
| Operación | La junta | La Operación | En un computador, a 1280 px o más |

- **Primera tanda.** Las cinco personas que nombró Mateo el 2026-11-08 hacen la primera tanda, cada una en el grupo de su rol. Sus nombres, como los del resto, quedan en una lista fuera del repositorio, que es público.
- **Cuántas.** Al menos cinco personas por grupo.
- **Un solo recorrido.** Cada persona hace solo el recorrido de su grupo.
- **Quien conoce la casa por dentro**, porque la diseñó o la construyó, hace las tareas para probar el guion, pero sus resultados no entran a la base.

## Dónde

- **Entorno.** En staging, que solo tiene datos sintéticos ([01-arquitectura](01-arquitectura.md)), con `main` publicado. Nadie usa su cuenta real ni ve datos reales.
- **Cuentas.** Cada persona tiene su propia cuenta de demostración, con los permisos que piden sus tareas.
- **Datos.** Cada cuenta de la Operación tiene sus propios datos ficticios, porque varias tareas los cambian: la solicitud que una persona responde ya no está pendiente para la siguiente.

## Tareas

Se le lee cada tarea a la persona tal como está escrita, sin decirle dónde está. Una tarea termina cuando la persona llega al criterio o cuando se rinde, y tiene un tope de cinco minutos.

### Mi OE

| # | Tarea | Termina cuando | Qué pantalla mide |
| --- | --- | --- | --- |
| M1 | Registra tu asistencia a la ocasión que está abierta ahora, con el código que te damos. | Ve la confirmación del registro | Asistencia (ADR-160) |
| M2 | Averigua cuánto te falta para alcanzar la permanencia en tu comité. | Dice lo que le falta | «Hoy» y la permanencia |
| M3 | Dinos cuántos GH Points tienes y en qué puesto vas. | Dice el saldo y el puesto | «Hoy» y «Yo» |
| M4 | Inscríbete en la convocatoria que está abierta. | Queda inscrita o en lista de espera | «Te toca» |
| M5 | Pide una licencia hasta el último día de este mes. | La solicitud queda enviada | «Te toca» y «Yo» |

### La Operación

| # | Tarea | Termina cuando | Qué pantalla mide |
| --- | --- | --- | --- |
| O1 | Busca a la persona que te nombramos y dinos en qué comités está y cómo va su permanencia. | Dice los comités y el estado | Persona 360 |
| O2 | Responde la solicitud de licencia que está pendiente. | Queda aprobada o rechazada | Mesa |
| O3 | Revisa diez evidencias de retos pendientes y aprueba o rechaza cada una. | Las diez quedan resueltas | Mesa |
| O4 | Arma una campaña para los miembros de un comité, sin enviarla. | Queda guardada sin enviar | Tabla de trabajo |
| O5 | Crea una ocasión del comité para el próximo jueves a las 6 p. m., con registro por código. | La ocasión queda creada | Calendario |

El plan maestro proponía cerrar la permanencia de un comité, activar un lote de personas y reservar inventario. Esas tres tareas quedan fuera por estas razones:

- **Cierre de permanencia.** Se hace para todo el término, así que en staging las personas chocarían entre sí, y su pantalla queda sin rediseño propio ([22-inventario-de-pantallas](22-inventario-de-pantallas.md), hallazgo 6).
- **Activación.** Hoy es una jornada con un QR vivo en el celular, que corresponde al modo de campo y no al escritorio.
- **Inventario.** Todavía no está en `main`, y su tarea entra a la base cuando llegue.

## Qué se anota

Una persona modera la sesión, en persona o por videollamada con la pantalla compartida. El moderador no ayuda, salvo que la persona se lo pida o se cumplan los cinco minutos.

| Dato | Cómo |
| --- | --- |
| Tiempo | En segundos, desde que la persona termina de oír la tarea hasta que llega al criterio o se rinde |
| Resultado | Sola, con ayuda o no terminó. Cualquier ayuda cuenta como «con ayuda» |
| Errores | Cada vez que entra a una pantalla que no lleva a la tarea o tiene que deshacer algo |
| Comentario | Lo que dice en voz alta o lo que la confunde, en una línea |

## Cuestionario SUS

Al terminar sus cinco tareas, la persona responde las diez frases del SUS (*System Usability Scale*). Cada frase se califica de 1 (muy en desacuerdo) a 5 (muy de acuerdo). Donde dice «la app» se lee «Mi OE» o «la Operación», según el grupo.

1. Creo que me gustaría usar la app con frecuencia.
2. Encontré la app innecesariamente compleja.
3. Me pareció fácil de usar.
4. Creo que necesitaría ayuda de alguien técnico para poder usarla.
5. Las funciones de la app están bien integradas.
6. Encontré demasiadas inconsistencias en la app.
7. Imagino que la mayoría de la gente aprendería a usarla muy rápido.
8. La encontré muy engorrosa de usar.
9. Me sentí con mucha confianza al usarla.
10. Necesité aprender muchas cosas antes de poder manejarla.

**Puntaje.** En las frases impares se resta 1 a la respuesta. En las pares se resta la respuesta a 5. Se suman los diez valores y la suma se multiplica por 2,5, así que el puntaje va de 0 a 100. El promedio de referencia del SUS es 68.

## Mediciones sin personas

Las mismas diez pantallas se miden también con herramientas automáticas, contra el build con datos sintéticos, como pide la fila de calidad del plan:

- **Contraste y accesibilidad**, con axe (WCAG A y AA), como en las E2E.
- **Carga en un celular de gama media**, con Lighthouse en modo móvil, solo para las pantallas de Mi OE.

## Qué se publica

Aquí solo se publican agregados por grupo y por tarea. La hoja de cada persona queda fuera del repositorio.

| Tarea | Personas | Terminaron solas | Mediana del tiempo | Errores por persona |
| --- | --- | --- | --- | --- |
| M1 a M5 | — | — | — | — |
| O1 a O5 | — | — | — | — |

| Grupo | SUS promedio |
| --- | --- |
| Miembros | — |
| Operación | — |

## Lo que falta para correrla

- [ ] Cuentas de demostración en staging, una por persona, con sus permisos.
- [ ] Datos sintéticos para cada tarea:
  - una ocasión abierta con código;
  - una permanencia a medias, con saldo y puesto;
  - una convocatoria abierta;
  - y, por cada cuenta de la Operación, una persona para buscar, una solicitud de licencia pendiente, diez evidencias de retos y un comité con miembros.
- [ ] La hoja de registro, por persona y por tarea, fuera del repositorio.
- [ ] Las sesiones y, al final, los agregados en este documento.
