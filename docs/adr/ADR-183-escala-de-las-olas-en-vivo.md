# ADR-183: La escala de las olas en vivo

- Estado: Aceptada (2026-11-13)
- Fecha: 2026-11-13
- Relacionadas: ADR-074, ADR-085 (P2), ADR-164, ADR-179, ADR-180, ADR-181

## Contexto

El roadmap pide medir antes de las olas con picos y escribir después una ADR técnica: el aviso del Wordle de las 9:00, las consultas de ranking y de «Te toca», las conexiones en vivo de una asamblea y las inscripciones por minuto en una apertura. La ola 4 trae justamente lo que más pesa: cada pantalla en vivo vuelve a leer la base cada pocos segundos (ADR-179), y una asamblea puede tener cientos de celulares abiertos a la vez.

## Medición de base

`scripts/medir-escala.ts` cronometra las lecturas calientes contra la base de `DATABASE_URL`. La primera corrida fue contra la base local de desarrollo (datos de semilla, 30 vueltas por lectura), el 2026-11-13:

| Lectura | p50 | p95 |
| --- | --- | --- |
| Ranking de GH Points (veteranos) | 0,9 ms | 1,2 ms |
| Consola en vivo (`buildLiveSnapshot`) | 0,7 ms | 1,0 ms |
| Consultas de una asamblea (`listPolls`) | 0,2 ms | 0,3 ms |
| Tabla de The Games (`listStandings`) | 1,5 ms | 1,7 ms |
| Metas colectivas en curso (`listActiveGoals`) | 0,2 ms | 0,2 ms |

Con esas cifras, una asamblea de 300 celulares conectados lee la base unas 150 veces por segundo (una cada 2 segundos por conexión) y pasa menos de 50 ms por segundo en la base. La base local no tiene el volumen de producción, así que esto es un piso, no la respuesta.

## Decisión

1. **Nada nuevo todavía.** El tiempo real sale con el flujo SSE de ADR-179, que lee la base en cada intervalo, sin cola, sin `LISTEN/NOTIFY` y sin tablas precalculadas.
2. **La medición que decide.** Antes de la primera asamblea en vivo y antes de que DÍAS inscriba en la casa (P2 de ADR-085), el guion se corre en staging con una copia anonimizada del volumen de producción, más una prueba de carga de conexiones abiertas a la vez. Las cifras se suman a esta ADR.
3. **Los umbrales.** Si en staging la p95 de una lectura en vivo pasa de 50 ms, o las conexiones a la base pasan del 70 % del pool durante la prueba de carga:
   - primero, una sola lectura por canal y por intervalo, repartida en memoria a todas las conexiones de ese canal;
   - después, `LISTEN/NOTIFY` para mandar solo cuando algo cambia;
   - y para el aviso del Wordle y las inscripciones, el envío escalonado y un límite de tasa con cola de espera.

## Consecuencias

- **Sin migración.** Un guion y esta decisión.
- **Pendiente.** La corrida en staging queda como condición antes de la primera asamblea en vivo (roadmap).
