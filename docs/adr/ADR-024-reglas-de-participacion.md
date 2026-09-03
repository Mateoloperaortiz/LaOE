# ADR-024: Reglas de participación confirmadas por la OE

- Estado: Aceptada (enmendada por ADR-027 en el punto 2, asambleas)
- Fecha: 2026-09-02
- Enmienda: ADR-006 (tipos de asamblea y código rotativo) y ADR-009 (suavizado del score)
- Relacionadas: ADR-002, ADR-004, ADR-005, ADR-010, ADR-014

## Contexto

Mateo respondió el 2026-09-02, en nombre de Gestión Humana, las reglas que seguían abiertas. También aportó un dato que cambia el trato a los egresados: el correo institucional suele caducar al graduarse, así que un egresado no podría entrar por OTP aunque se le diera acceso. Para el score de comité pidió "la mejor forma" con un criterio explícito: fair play entre comités que varían mucho en cantidad de integrantes.

## Decisión

1. **Comités.** Mínimo 1 y máximo 3 pertenencias activas por término para vigentes (`committees.min = 1`, `committees.max = 3` en `AppConfig`).
2. **Asambleas.** Por término, dos asambleas ordinarias obligatorias (`assemblies.requiredOrdinary = 2`). En los términos de segundo semestre (`code` que termina en `-2`) se suma la **elección de junta** del año siguiente, obligatoria para toda la OE; si hay **segunda vuelta**, también es obligatoria. `Occasion.assemblyKind` toma `ORDINARY`, `BOARD_ELECTION` o `RUNOFF`. Cumplimiento por persona en un término: ordinarias firmadas ≥ 2, firmó la elección si el término la tuvo, y firmó la segunda vuelta si existió. Ajustes individuales (ingreso tardío, licencia) solo por ADMIN con motivo, en `AssemblyRequirement`. Unique parcial: una sola `BOARD_ELECTION` no cancelada por término.
3. **Código rotativo.** Opcional por ocasión y apagado por defecto (`checkin.rotatingCodeDefault = false`); la consola sugiere encenderlo en ocasiones grandes.
4. **Score de comité.** Se mantiene la participación relativa por ocasión (`presentes / elegibles`), que ya normaliza por tamaño, y se agrega un **suavizado** hacia la media de la ocasión para que los comités pequeños no dominen por azar: `suavizada = (presentes + k·μ) / (elegibles + k)`, con `k = 5` (`score.shrinkK`) y `μ` la tasa media de esa ocasión entre todos los comités. El score del término es el promedio simple de las tasas suavizadas de las ocasiones cerradas con puntos. Se guardan y se muestran la tasa cruda y la suavizada. Una persona multicomité cuenta completo en cada uno de sus comités. Los insumos quedan en `CommitteeParticipation` por si GH pide después la fórmula ponderada (60 % participación, 20 % asistencia sostenida, 10 % objetivos, 10 % actividades especiales): la asistencia sostenida se deriva del ledger; objetivos y especiales exigirían captura manual.
5. **Medallas de GHPOINTS.** No se migran; los niveles se derivan del ledger.
6. **Egresados.** Sin acceso en v1. `Person.personalEmail` opcional, capturado al dar de baja o por formulario, con consentimiento `COMMUNICATIONS`, para mantener contacto. Un acceso futuro de egresados sería con correo personal verificado y es una decisión aparte.

## Consecuencias

- Ejemplos del suavizado con `μ = 40 %`: comité de 3 con 3 presentes pasa de 100 % a 62,5 %; comité de 3 con 1 presente, de 33 % a 37,5 %; comité de 30 con 30 presentes, de 100 % a 91 %; comité de 30 con 12 presentes se queda en 40 %. Los grandes conservan su tasa real; los pequeños se acercan a la media hasta que acumulan evidencia.
- El calendario de cada término necesita las fechas de las dos asambleas ordinarias y, en el segundo semestre, la de la elección de junta ([11-contenido-pendiente.md](../11-contenido-pendiente.md)).
- Queda abierta solo la anonimización de egresados (plazo), ligada a la política aprobada.

## Enmienda (2026-09-02, ADR-027)

GH precisó las asambleas: obligatorias son dos (una ordinaria más la elección de junta) y el criterio de permanencia del 10 % exige tres. El primer semestre, sin elección, está por confirmar. Ver [ADR-027](ADR-027-permanencia-reglas-de-gh.md).
