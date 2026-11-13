# ADR-177: Metas colectivas y recompensas por umbral

- Estado: Aceptada (2026-11-13)
- Fecha: 2026-11-13
- Enmienda: [ADR-067](ADR-067-retos-boosters-y-coleccion.md) (la gamificación suma metas de todos y recompensas por umbral)
- Relacionadas: ADR-017, ADR-075, ADR-158, ADR-175

## Contexto

El plan maestro (§7, ola 3) pide **metas colectivas**, como las misiones de Duolingo y los retos de clubes de Strava, y **recompensas por umbral**, como Starbucks Rewards. Las dos se apoyan en lo que la casa ya cuenta: asistencias, retos y partidas, y el saldo de GH Points del semestre.

Una meta colectiva no puede dar puntos a cada persona sin abrir otra puerta al libro de puntos, que ADR-067 cuida con reglas propias. Por eso, en esta primera versión, una meta celebra pero no paga.

## Decisión

1. **Una meta colectiva** es un número que se alcanza entre todos en un rango de fechas: asistencias aprobadas, retos completados o partidas de los juegos, de toda la OE o de un comité. La crea ADMIN desde la Operación, con su título.
   - El avance es la suma de todos, sin nombres, aunque la persona tenga la actividad apagada (ADR-175).
   - «Hoy» muestra la meta en curso más cercana a cumplirse, y el muro del comité las suyas.
   - Al cumplirse, la meta lo dice con el sello «¡OE OE OE!». No da GH Points: eso pediría su propia regla en ADR-067.
2. **Una recompensa por umbral** es algo que la OE entrega a quien llega a cierto saldo de GH Points en el semestre (una camiseta, un desayuno con la junta). La crea ADMIN desde la Operación, con su umbral, su título y su descripción.
   - En GH Points, la persona ve su camino a la siguiente recompensa y reclama las que ya alcanzó.
   - Reclamar no gasta puntos ni toca el libro de puntos: deja una solicitud de entrega que ADMIN marca como entregada desde la Operación.
   - Una recompensa se reclama una vez por persona.

## Consecuencias

- **Migración aditiva.** Tres tablas nuevas en `participation`: `collective_goal`, `threshold_reward` y `threshold_reward_claim`.
- **Kit del admin.** Las metas y las recompensas son recursos del kit, con sus permisos de ADMIN; las entregas se marcan como acción de fila, también en lote (ADR-170).
- **Pruebas.** Integración del avance de una meta por métrica y alcance, y de reclamar una recompensa con y sin saldo, una sola vez. E2E de la meta en «Hoy» y de reclamar en GH Points.
