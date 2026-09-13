# ADR-057: Vicepresidencia de Comunicaciones y Publicidad como cargo de junta

- Estado: Aceptada (enmendada por ADR-060); en producción desde el 2026-09-12 (`7d7594f`)
- Fecha: 2026-09-11
- Enmienda: ADR-034 (regla 13), 03-modelo (`Appointment.kind`) y 14-copy (T-444)
- Relacionadas: ADR-029, ADR-031, ADR-034, ADR-036

## Contexto

La junta de la OE tiene una Vicepresidencia de Comunicaciones y Publicidad que el catálogo de cargos (`appointment_kind`, ADR-034 regla 13) no incluía: el selector de cargos de la Persona 360 ofrecía Presidencia y cuatro vicepresidencias, así que ese cargo solo podía registrarse como «Otro» con título, sin etiqueta propia en la ficha, el directorio, la galería de egresados ni la línea de tiempo. Lo señaló Mateo el 2026-09-11.

## Decisión

1. `appointment_kind` gana `VP_COMMUNICATIONS`, entre `VP_FINANCE` y `GH_HEAD`, con la migración aditiva `0014_vicepresidencia_de_comunicaciones` (`ALTER TYPE … ADD VALUE`). `APPOINTMENT_KINDS` y el esquema de entrada lo incluyen en la misma posición, y T-444 suma «Vicepresidencia de Comunicaciones y Publicidad» en ese lugar, porque las etiquetas se resuelven por índice.
2. Nada más cambia: el cargo sigue sin otorgar permisos (ADR-034 regla 13), la 360 sigue ofreciendo `BOARD` con step-up al crearlo y el catálogo de comités de trabajo con su líder de junta (ADR-036) queda igual; si alguno lo lidera esta vicepresidencia, se anota cuando GH lo confirme.

## Consecuencias

- Los cargos ya guardados como «Otro» con ese título se vuelven a registrar con el tipo nuevo desde la ficha; no se migran solos, porque el título es texto libre.
- Una prueba unitaria fija que el catálogo y T-444 tengan el mismo largo y que el valor nuevo tenga su etiqueta; la migración se ejercita en las suites de integración y e2e, que recrean el esquema.

## Enmienda (2026-09-13, ADR-060)

El nombre del cargo es el del cuerpo de los Estatutos 2026 (art. 21.5 y 27): "Vicepresidencia de Comunicaciones y Mercadeo". Cambia solo la etiqueta de T-444; el código `VP_COMMUNICATIONS`, los permisos y los comités de trabajo no cambian. Ver [ADR-060](ADR-060-alineacion-con-la-normativa-2026.md) regla 4.
