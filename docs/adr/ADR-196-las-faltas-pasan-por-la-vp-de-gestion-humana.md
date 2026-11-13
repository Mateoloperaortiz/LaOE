# ADR-196: Las faltas pasan por la VP de Gestión Humana

- Estado: Propuesta
- Fecha: 2026-11-13
- Enmienda: [ADR-060](ADR-060-alineacion-con-la-normativa-2026.md) regla 6 (quién registra y cuándo aplica una falta); [ADR-116](ADR-116-reglas-de-correccion-privacidad-y-permisos.md) regla 11 (quién revoca); [ADR-195](ADR-195-los-avales-de-la-junta.md) tramo A2
- Relacionadas: ADR-061, ADR-072, ADR-112, ADR-114, ADR-127, ADR-193

## Contexto

El Reglamento dice que las faltas que anotan las direcciones de Gestión Humana de los comités deben ser avaladas por la Vicepresidencia de Gestión Humana (art. 70 par. 2). También dice que la VP de GH lleva los descargos y fija la duración de una suspensión (arts. 57 y 59).

Hoy, en la casa:
- una falta aplica apenas se registra;
- la dirección de un comité registra llamados de atención y faltas leves y graves;
- suspensiones, inhabilidades y revocaciones las registra ADMIN desde la Persona 360.

El 2026-11-13 Mateo decidió:
- ADMIN no pone faltas: él es el superadmin y no interviene en lo que decide la junta.
- Una falta anotada por una dirección de GH queda sin efecto hasta el aval de la VP de GH ([ADR-195](ADR-195-los-avales-de-la-junta.md) regla 5).
- Al avalarla, su suspensión y su año de vigencia cuentan desde el día del aval.
- La VP de GH registra suspensiones e inhabilidades y anula sanciones.

## Decisión

1. **Estado de una sanción.** Toda sanción tiene un estado: por avalar, avalada o rechazada.
   - Guarda quién la decidió, si fue como titular o como Presidencia supliendo, cuándo y el motivo.
   - Las sanciones que ya existen quedan avaladas: nada cambia para ellas.
2. **Solo lo avalado tiene efecto.** La suspensión de derechos y beneficios, la inhabilidad para cargos, la advertencia de expulsión del cierre y la puerta del aval de evento leen solo sanciones avaladas.
3. **La falta de un comité queda por avalar.** La dirección con la capacidad de permanencia anota, como hoy, un llamado de atención, una falta leve o una grave. Queda por avalar, y a quien decide por la VP de GH le llega el aviso.
4. **El aval de la VP de GH.**
   - Lo decide quien decide por la VP de GH: la titular o, si falta, la Presidencia (ADR-195 regla 2). Lo hace en «Avales», junto a los demás avales.
   - Al avalarla, la suspensión (7 días el llamado, 20 la leve) y el año de vigencia empiezan ese día.
   - Si la rechaza, escribe el motivo y la falta queda sin efecto.
   - En los dos casos, quien la anotó recibe un aviso.
5. **Lo que registra la VP de GH.** Por su cargo, desde «Faltas», registra cualquier sanción, también suspensiones e inhabilidades. Lo suyo queda avalado al registrarse y vale de una vez, con las fechas de siempre. También anula una sanción avalada, con motivo.
6. **ADMIN no registra, no avala ni anula sanciones.** La Persona 360 las muestra con su estado, sin botones.
7. **La historia y el recálculo.** El registro en la línea de tiempo y el recálculo de permanencia salen cuando la sanción toma efecto, al avalarse o al registrarla la VP de GH, y cuando se anula. Una falta por avalar o rechazada no entra a la línea de tiempo; queda en la auditoría.

## Consecuencias

- Mientras no haya quien decida por la VP de GH, las faltas de los comités esperan y nadie registra suspensiones.
- La decisión abierta 66 (si registrar y revocar desde la Persona 360 piden el paso de seguridad) deja de aplicar: ese camino ya no existe.
- Una suspensión explícita la registra la VP de GH con su fecha de fin, dentro del mes siguiente a la falta (Regl. art. 59), como hasta hoy.
