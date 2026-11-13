# ADR-179: Tiempo real con SSE

- Estado: Aceptada (2026-11-13)
- Fecha: 2026-11-13
- Relacionadas: ADR-011, ADR-035 (regla 16, la consola en vivo), ADR-089, ADR-164, ADR-183

## Contexto

La ola 4 del rediseño (plan maestro §8) es la de lo que pasa en vivo: el modo asamblea, The Games y la pantalla de presentación. Hoy la casa no tiene tiempo real: la consola de una ocasión pregunta cada 4 segundos por `/api/ocasiones/<id>/live` (ADR-035 regla 16). Con muchas pantallas abiertas a la vez, preguntar en bucle multiplica las consultas sin que nada cambie.

## Decisión

1. **Server-Sent Events.** Lo en vivo sale por SSE: una respuesta `text/event-stream` que el servidor mantiene abierta y por la que manda un evento cada vez que cambia lo que se mira. Es HTTP de una sola vía, pasa por el proxy y la CSP de siempre (ADR-011) y el navegador reconecta solo (`EventSource`).
2. **Una sola forma de servirlo.** `sseResponse` arma el flujo: lee el estado de quien lo pide con la misma lectura de la pantalla, lo manda si cambió, manda un latido cada 15 segundos para que nada intermedio corte la conexión, cierra a los 5 minutos para que el navegador reconecte con la sesión al día y se corta al irse la persona. Cada flujo vuelve a exigir el permiso de su pantalla al abrir.
3. **Sin infraestructura nueva todavía.** El flujo lee la base cada pocos segundos en el servidor. No hay cola de mensajes ni `LISTEN/NOTIFY` hasta medir (ADR-183): con las cifras de una asamblea real se decide si hace falta.
4. **Lo que va primero.** La consola de una ocasión, el modo asamblea, la tabla de The Games y la pantalla de presentación.
5. **El sondeo cuida la sesión.** Un flujo abierto no vuelve a leer la sesión en cada evento. Por eso la consola sigue sondeando, cada 10 segundos en vez de 4 mientras el flujo está abierto: si el sondeo es rechazado (sesión vencida, permiso retirado), la consola cierra el flujo, avisa como antes (ADR-035 regla 16) y vuelve al sondeo de siempre. Un flujo dura a lo sumo 5 minutos y al reconectar vuelve a exigir el permiso.

## Consecuencias

- **Sin migración.** Rutas nuevas bajo `/api/…/vivo`.
- **Despliegue.** Railway mantiene abiertas las respuestas largas; el cierre a los 5 minutos acota cuánto dura cada una.
- **Pruebas.** Unitarias del flujo (manda solo lo que cambió, el latido y el cierre). E2E de una pantalla que se actualiza sin recargar.
