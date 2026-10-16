# ADR-070: Podio de comités en GH Points

- Estado: Aceptada (enmendada por ADR-136)
- Fecha: 2026-09-15
- Relacionadas: ADR-009, ADR-024, ADR-035, ADR-044
- Enmienda: presentación del ranking de comités en Mi OE (ADR-009 y ADR-035).

## Contexto

La lista mostraba dos porcentajes redondeados a enteros sin rótulos cercanos. Mateo aprobó una propuesta con un podio inspirado en Kahoot y pidió implementarla: primero al centro, segundo a la izquierda, tercero a la derecha, y los demás puestos debajo.

## Decisión

- La pestaña Comités de `/app/gh-points` usa los datos de `rankCommittees`, conserva sus puestos de competición y el límite existente de diez comités. Los tableros de personas conservan su presentación.
- El porcentaje principal es el ajustado, con dos decimales y la misma precisión usada para ordenar el ranking. El porcentaje sin ajustar pasa al detalle accesible de cada comité, junto con la diferencia en puntos porcentuales y el número de actividades consideradas. La diferencia se presenta entre los valores redondeados visibles para que el desglose sea consistente.
- Los puestos 1, 2 y 3 forman el podio, con alturas por puesto y los tonos amarillo, azul claro y naranja suave institucionales. Todos los comités empatados en un puesto comparten escalón. No se inventan puestos vacantes; un único grupo ocupa el ancho disponible. El resto continúa en lista con su puesto real.
- El servidor consulta y formatea los resultados. Un componente cliente maneja selección, apertura/cierre y foco del detalle, con ayuda nativa desplegable. Se mantiene la pestaña elegida al cambiar de semestre y se limpia el detalle anterior.
- El diseño usa tokens locales, CSS Modules, ambos temas y distribución adaptable. Cuando el texto ampliado deja poco espacio, los escalones pasan a filas conservando sus puestos. Sin registros se mantiene el estado vacío existente.

## Consecuencias

No cambian la fórmula, los datos de participación, los permisos ni las reglas de cierre. El alcance es la presentación en Mi OE. La lectura accesible anuncia comité, puesto y porcentaje; abrir el detalle lleva el foco a su título y cerrarlo lo devuelve al comité.

## Enmienda (2026-10-16, ADR-136)

El indicador principal del nuevo podio es el puntaje combinado 50/50 de GH promedio por activo y participación normalizadas, no la participación ajustada sola. El detalle conserva esa participación y explica promedio GH, población y componentes. Los puestos compartidos/top 10 y las fotos históricas de participación mantienen su significado. Ver [ADR-136](ADR-136-comites-promedio-gh-y-participacion.md).
