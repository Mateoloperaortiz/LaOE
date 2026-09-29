# ADR-100: Puntos de The Challenge y del Macro reto

- Estado: Aceptada
- Fecha: 2026-09-29
- Relacionadas: ADR-089, ADR-098
- Enmienda: ADR-089, regla 7: The Challenge da puntos por puesto, no por rúbrica, y se suma el Macro reto.

## Contexto

ADR-089, regla 7, llevaba la rúbrica de The Challenge a 100 y le daba a cada equipo ese total × 10: hasta 1000 puntos en la jornada 1. Mateo lo decidió el 2026-09-24 a partir de la hoja de la OE.

El instructivo de capitanes de la OE dice otra cosa. En la página 4 pone «Ganador The Challenge son 2.000 puntos», y en la página 6 menciona un «Macro reto 2.000» que la casa no modelaba.

El 2026-09-29, Mateo le preguntó a la OE y esto fue lo que respondió:

- **The Challenge:** el primer puesto suma 2.000, el segundo 1.000 y el tercero 500.
- **Macro reto:** es otra competencia, entre todos los equipos, y la gana un solo equipo.

## Decisión

1. **The Challenge da puntos por puesto:** 2000 al primero, 1000 al segundo y 500 al tercero. Los demás equipos no suman. El podio lo decide la organización. Si hay empates, también los resuelve ella: la casa no aplica ninguna regla de desempate propia.
2. **El Macro reto** suma 2000 al único equipo que lo gana, según el instructivo.
3. **Los dos se registran como competencias extra de puntos directos** (ADR-089, regla 7), en la jornada en que se juegan. Cuando se conoce el resultado, la Dirección fija el total de cada equipo del podio o del ganador. Fijar un total inserta solo la diferencia, así que repetir la orden no suma dos veces. No hay cambio de código.
4. **La rúbrica no se usa en `the-games-2026`.** Sigue en el código y en el ensayo, pero si se cargaran notas ahí, cada equipo sumaría hasta 1000: eso ya no es la regla. Si la organización quiere usar la rúbrica para ordenar el podio, la consolida en su hoja.

## Consecuencias

- **Operación, el jueves:** en Extras, crear «The Challenge» (puntos directos, jornada 1) y registrar el podio cuando se decida.
- **Operación, el día que se juegue:** crear «Macro reto» (puntos directos, en esa jornada) y registrar al ganador.
- **Queda sin decidir:** si la organización quisiera que la casa arme el podio sola a partir de la rúbrica, haría falta código y una regla de empates. Hoy no se pide.

## Verificación requerida

No hay código nuevo. Los puntos directos ya tienen pruebas de integración: fijar el total inserta la diferencia y no duplica.
