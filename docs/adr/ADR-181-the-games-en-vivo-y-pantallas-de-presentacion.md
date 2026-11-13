# ADR-181: The Games en vivo y las pantallas de presentación

- Estado: Propuesta
- Fecha: 2026-11-13
- Relacionadas: ADR-035, ADR-089, ADR-104, ADR-158, ADR-159 (regla 5), ADR-179, ADR-180

## Contexto

El plan maestro (§5.4 y §7, ola 4) pide **The Games en vivo con una sala de operación**, al estilo de las gráficas de la F1, y una **pantalla de presentación**: la consola de una ocasión, una asamblea o la tabla de The Games, abierta en otra ventana para el proyector. Hoy la mesa de control de The Games se refresca sola cada 15 segundos recargando la página entera (ADR-089), y la consola de la ocasión muestra el QR dentro de la pantalla de la Operación, con todo lo demás alrededor.

## Decisión

1. **La sala de operación de The Games.** En el área de posiciones de la mesa de control, la tabla general se actualiza en vivo por SSE (ADR-179) cada pocos segundos, sin recargar. La ve el personal de la competencia (operadores y jueces), también cuando la tabla está oculta al público (ADR-104): la pantalla lo dice.
2. **Las pantallas de presentación** viven en `/presentar/…`, fuera del marco de la Operación y de Mi OE, en la capa de marca (ADR-158): fondo navy, letra grande y nada que distraiga.
   - `/presentar/ocasion/<id>`: el QR de registro, el código rotativo y cuántos van registrados. Nunca nombres: está a la vista de todos.
   - `/presentar/asamblea/<id>`: las consultas abiertas y cerradas con sus resultados en vivo; las secretas abiertas solo cuentan votos (ADR-180).
   - `/presentar/the-games/<id>`: la tabla general en vivo.

   Cada una exige el permiso de su pantalla de siempre (operar la ocasión o ser personal de la competencia) y la Operación las abre en otra ventana con «Abrir en el proyector».
3. **Sin índice.** Las pantallas de presentación no se indexan y no tienen enlaces hacia afuera.

## Consecuencias

- **Sin migración.** Leen lo que ya existe con las rutas en vivo de ADR-179.
- **Pruebas.** E2E de la consola en el proyector (el QR y el conteo, sin nombres) y de la asamblea, que cambia sin recargar cuando alguien vota desde el celular.
