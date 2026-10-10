# ADR-020: UTC en base, America/Bogota en presentación

- Estado: Aceptada (enmendada por ADR-121)
- Fecha: 2026-09-02
- Relacionadas: ADR-004, ADR-006

## Contexto

Las ventanas de check-in, los cortes de término y los recordatorios dependen de la hora; mezclar zonas produce puntos acreditados el día equivocado.

## Decisión

Timestamps `timestamptz` en UTC y `TZ=UTC` en el proceso. Fechas de término como `date` sin hora. Ventanas de check-in comparadas con el reloj del servidor. Presentación, "hoy", "esta semana" y los recordatorios programados en `America/Bogota`. Colombia no tiene horario de verano, así que el desfase es fijo de −5 horas.

## Consecuencias

- Un test unitario fija el comportamiento de fechas límite (medianoche de Bogotá).
- Los exportes muestran la hora de Bogotá con el sufijo `-05:00`.

## Enmienda (2026-10-10, ADR-121)

Decía que «hoy» va en `America/Bogota`, sin excepciones. Para el cupo del día del correo, «hoy» es el día del proveedor, que Resend cuenta en UTC: la cuenta de lo enviado hoy, el corte por el cupo del día y «Enviados hoy» de la pantalla del cupo van de 7:00 p. m. a 7:00 p. m. de Colombia. Con la cuenta por el día civil de Colombia, una campaña que gastaba su cupo después de las 7:00 p. m. volvía a gastarlo a la medianoche, dentro del mismo día del proveedor. La pantalla del cupo lo dice (T-3259).

Todo lo demás sigue como estaba: la base en UTC, la presentación de fechas y horas en hora de Colombia, también en esas pantallas, los demás «hoy» y «esta semana» y los recordatorios programados. El corte por el cupo del mes sigue hasta el primer día del mes siguiente de Colombia (DT-184). Ver [ADR-121](ADR-121-reglas-de-estructura-y-pruebas-del-noveno-ciclo.md) regla 5.
