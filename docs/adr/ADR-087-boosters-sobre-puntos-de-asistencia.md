# ADR-087: Boosters sobre los puntos de la asistencia

- Estado: Aceptada
- Fecha: 2026-09-22
- Relacionadas: ADR-007, ADR-035, ADR-067
- Enmienda: ADR-067, reglas 4 y 5

## Contexto

Una asistencia de 30 puntos con booster falla tanto desde el QR como desde el modo anfitrión: `reward_base_points_range` rechaza su base porque limita todos los premios a 20. La transacción revierte también la asistencia y el crédito base. Los retos sí tienen máximo 20, pero las ocasiones admiten hasta 1000 puntos en su formulario. Además, `point_entry_reward_range` rechaza un BOOST mayor de 20 aunque los topes configurados permitan entregarlo; por ejemplo, una asistencia de 30 con un booster del 100 % y cupo suficiente.

## Decisión

1. `reward.basePoints` conserva el rango 0 a 20 para `CHALLENGE`. Para `CHECKIN` acepta una base no negativa tomada de la ocasión, coherente con `occasion.points`.
2. El ledger conserva 1 a 20 para `CHALLENGE`. `BOOST` admite 1 a 1000, el máximo diario que ya admite `gamification.caps`. `computeReward` sigue calculando el extra sobre la base de la ocasión, limitándolo al cupo diario y semanal disponible; la asistencia base sigue fuera del cupo.
3. La migración `0037_boosters_asistencias` reemplaza solo esos dos checks. No cambia topes configurados, saldos, asistencias ni boosters existentes. Los intentos que revirtieron deben registrarse de nuevo por el flujo normal autorizado.

## Consecuencias y verificación

La reserva y el ledger aceptan los premios que el dominio ya calcula. Continúan la transacción conjunta, la auditoría, el único por asistencia y el consumo único del booster. Las pruebas de integración reproducen el fallo con datos sintéticos: 30 puntos por QR, anfitrión y administración con boosters del 50 % y 100 %, reintento sin duplicación y cupo de 20. También comprueban que un reto de 21, un BOOST negativo y uno mayor de 1000 siguen rechazados. La migración debe publicarse antes de reintentar los registros afectados.
