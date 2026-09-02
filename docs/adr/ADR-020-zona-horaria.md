# ADR-020: UTC en base, America/Bogota en presentación

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-004, ADR-006

## Contexto

Las ventanas de check-in, los cortes de término y los recordatorios dependen de la hora; mezclar zonas produce puntos acreditados el día equivocado.

## Decisión

Timestamps `timestamptz` en UTC y `TZ=UTC` en el proceso. Fechas de término como `date` sin hora. Ventanas de check-in comparadas con el reloj del servidor. Presentación, "hoy", "esta semana" y los crons de recordatorio en `America/Bogota`. Colombia no tiene horario de verano, así que el desfase es fijo de −5 horas.

## Consecuencias

- Un test unitario fija el comportamiento de fechas límite (medianoche de Bogotá).
- Los exportes muestran la hora de Bogotá con el sufijo `-05:00`.
