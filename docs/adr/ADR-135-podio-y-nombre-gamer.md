# ADR-135: Podio gráfico y nombre visible «+ gamer»

- Estado: Aceptada
- Fecha: 2026-10-15
- Relacionadas: ADR-008, ADR-014, ADR-075, ADR-081, ADR-086, ADR-131, ADR-133, ADR-134
- Enmienda: ADR-131 reglas 2 y 17 (nombre visible); ADR-133 regla 9 (presentación); ADR-134 regla 1 (podio en Juegos)

## Contexto

Después de elegir Juegos con reto protagonista y Color, Mateo pidió un podio gráfico y cambiar el nombre visible de Más gamer a **+ gamer**. El pedido amplía la presentación de esa misma competencia. No pidió nuevos puntos, otra métrica o un cambio de puestos compartidos.

La lectura pública entrega como máximo diez personas con su `rank`, pero no el total de un empate ni una señal de que el último grupo esté completo. Un podio de «las primeras tres personas» rompería la igualdad existente: 1,1,3 se vería como si una de las primeras fuese segunda. Completar un grupo con más identidades de la base también ampliaría la privacidad ya acordada.

## Decisión

1. **El nombre visible es «+ gamer».** La competencia conserva su identidad `GamerRanking`, rutas, campos, métricas, origen de puntos y premio semestral. Los textos nuevos de interfaz usan el catálogo de copy; no se renombra el esquema, las claves JSON, eventos o identificadores internos. Las ADR anteriores conservan su título y texto y reciben esta enmienda, sin presentar el nombre nuevo como si hubiera sido el histórico.
2. **El podio representa puestos reales, no tres filas.** Agrupa las filas recibidas con `rank` 1, 2 o 3, y muestra todas las personas entregadas de cada grupo. No calcula un ranking denso, elige representantes, suma métricas ni usa nombre/ID como desempate. Los integrantes de un mismo rango tienen igual jerarquía; ninguna persona empatada recibe un peldaño inferior por el orden de su fila.
3. **El orden visual no inventa puestos.** Escritorio usa grupos 2–1–3, omitiendo los ausentes; el primero es protagonista como grupo. La lectura semántica y móvil mantiene 1–2–3 y etiquetas explícitas. Con 1,1,3 se muestran un grupo primero compartido y el tercero: no aparece segundo. Con cero, una o dos personas se representan sólo los rangos existentes; no hay siluetas, puestos vacíos o supuestos próximos ganadores. Los grupos pueden crecer hasta las diez filas recibidas sin esconder integrantes.
4. **Se conserva el top 10 visible y se declara su alcance.** No se amplía la consulta para completar empates ni se añade al podio el puesto propio que esté fuera de esas filas. Si llegan diez personas y la última tiene puesto 1, 2 o 3, el empate puede estar cortado, pero el DTO no permite saber si lo está o cuántos faltan. El podio sigue mostrando todas las filas recibidas de puestos 1–3, con una caption que explique ese alcance dentro del top 10 visible. No promete que estén todos los empatados ni anuncia un total de empate inventado. `totalPlayers` es población de la temporada, no tamaño de un grupo.
5. **La privacidad y la historia siguen siendo las de la proyección.** Se conserva nombre/anónimo y resaltado propio, sin enriquecer con fotos, correos o identidades no entregadas. El gráfico complementa la clasificación accesible y sus valores. Una foto `POINTS` sigue mostrando puntos; `PARTICIPATIONS` conserva su criterio, puntos nulos y puestos congelados. Una historia sin foto gamer no fabrica podio desde datos vivos. El cambio de nombre no recalcula ni reetiqueta la métrica histórica.
6. **Es presentación dentro de la identidad elegida.** Se integra al diseño de Juegos de ADR-134 con jerarquía, lectura móvil y claro/oscuro coherentes. Texto y estructura comunican puestos y empates; ni color ni altura son la única señal. No se agrega un backend, endpoint, tabla, migración, bandera, activación, efecto sobre ledger o premio nuevo. Los criterios puntos → participaciones → días y puesto compartido permanecen intactos.

## Consecuencias y verificación

- Puede haber más de tres personas en el podio y faltar un rango intermedio. Es la representación fiel de puestos de competición, no un defecto que la UI deba rellenar.
- Un empate mayor que el corte visible se representa parcialmente con alcance explícito. Sin ampliar el contrato no se puede prometer su completitud; conservar esa limitación es preferible a ampliar identidades o inventar totales.
- Pruebas de presentación con datos sintéticos cubren 0/1/2 personas, 1–2–3, 1–1–3, 1–2–2–4, diez primeros empatados, anónimos/nombres largos y las métricas históricas. La QA comprueba móvil/escritorio y claro/oscuro sin reducir el empate a un representante.
- No se cambia el algoritmo o sus pruebas de puntos, sólo la representación y los textos. El check y la revisión del candidato se registran cuando existan; esta ADR no acredita implementación, CI o publicación por sí misma.
