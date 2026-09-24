# ADR-093: En The Games, cada equipo juega todas las bases de la jornada

- Estado: Aceptada
- Fecha: 2026-09-24
- Relacionadas: ADR-089
- Enmienda: ADR-089 (regla 8: un equipo que repite base en la jornada deja de ser advertencia y pasa a ser error)

## Contexto

La OE fijó que en The Games cada equipo tiene que jugar todas las bases de la jornada. El prototipo de Lovable no lo respetaba: el equipo 1 jugaba siempre en la base 1 y los demás iban y volvían entre bases.

El calendario que genera la casa ya lo cumple por construcción (ADR-089 regla 8): con 30 equipos, 15 bases y 15 rotaciones, cada equipo pasa una vez por cada base de cada jornada. Pero la edición a mano de una rotación podía romperlo. El validador lo trataba como advertencia, y el operador podía guardarlo con «Guardar aunque haya advertencias».

## Decisión

Un equipo que juega dos veces en la misma base de una jornada es un **error** del validador, como un equipo que juega contra sí mismo. El cambio no se guarda, ni siquiera confirmando las advertencias. Las advertencias que quedan son el cruce repetido y el equipo que no juega en una rotación.

## Consecuencias

- Para mover un enfrentamiento de base, el operador tiene que elegir un intercambio en el que nadie repita base. El validador dice qué equipo y qué base quedarían repetidos.
- Un calendario generado no cambia: nunca repite base.
- Pruebas: unitaria del validador e integración de la edición de una rotación (un intercambio que repite base se bloquea y uno que no repite se guarda).
