# ADR-195: Los avales de la junta

- Estado: Aceptada (2026-11-13); enmendada por ADR-197
- Fecha: 2026-11-13
- Enmienda: [ADR-059](ADR-059-presupuesto-del-comite.md) y [ADR-122](ADR-122-reglas-de-alcance-y-correccion-del-decimo-ciclo.md) regla 1 (quién decide el aval de evento); [ADR-123](ADR-123-reglas-de-verificacion-y-correccion-del-undecimo-ciclo.md) regla 7 (la prueba y el aval de evento); [ADR-060](ADR-060-alineacion-con-la-normativa-2026.md) reglas 6 y 11 (cuándo aplica una falta y el aval de la VP de GH para un nuevo); [ADR-150](ADR-150-inventario-reservas-y-operacion-logistica.md) (la reserva deja de nacer confirmada)
- Relacionadas: ADR-061, ADR-166, ADR-193, ADR-194

## Contexto

La normativa vigente (reforma del 8 de mayo de 2026) manda pedir ciertos avales a un cargo de la junta. Mateo eligió el 2026-11-13 llevarlos a la casa, y sumó los que piden la VP Administrativa y la VP Financiera:

| Cargo | Aval | Normativa | Hoy en la casa |
| --- | --- | --- | --- |
| Presidencia | De evento | Regl. art. 36 par. 1; Est. arts. 23.11 y 36.3 | Existe; lo decide quien tenga ADMIN |
| VP de Gestión Humana | Faltas que anotan las direcciones de GH | Regl. art. 70 par. 2 | La falta aplica al registrarse, sin aval |
| VP de Gestión Humana | Postulación a una mesa de quien no es activo | Regl. art. 27 par. 1 | Excepción de texto libre que pasa ADMIN |
| VP de Comunicaciones | Piezas hechas por un miembro o con un externo | Regl. art. 33.2 | No existe |
| VP Financiera | Reasignación de presupuesto | Est. arts. 38.10 y 38 par. 2 | El comité la registra sola, con el aval de evento |
| VP Financiera | Presupuesto extraordinario | Regl. art. 51.2 | Una fecha que registra ADMIN, sin nombre |
| VP Financiera | Contratos | Regl. art. 75 | No existe |
| VP Financiera | Compras y pagos | Est. art. 38.5 | Los gastos se registran sin aprobación |
| VP Administrativa | Instalaciones | Est. arts. 24.5 y 37.5 | No existe |
| VP Administrativa | Préstamo puntual de activos | Regl. art. 54 | La reserva nace confirmada (ADR-150) |
| VP Administrativa | Cruce de planes y reuniones | Est. art. 24.6 | No existe |

Hasta hoy ningún cargo de la junta decide nada por su nombramiento, salvo la VP Administrativa en el inventario (ADR-193). Lo demás lo decide quien tenga ADMIN.

## Decisión

1. **Qué es un aval.** Una solicitud que decide un cargo de la junta: la aprueba o la rechaza, y si la rechaza dice por qué. Queda quién la pidió, quién la decidió, en nombre de qué cargo y cuándo, y entra a la auditoría. Una vez decidida no se vuelve a decidir; para cambiarla se pide otra.
2. **Quién decide.** El cargo, por su nombramiento en el término vigente y con membresía activa, como en el inventario. No se presta ADMIN, y ADMIN deja de decidir avales.
   - Si falta una VP (vacante, en licencia o salida), decide la Presidencia, como en ADR-193.
   - Si falta la Presidencia, sus avales esperan hasta que haya una.
   - El aval guarda si lo decidió la titular o la Presidencia supliendo.
3. **Dónde llegan.** Cada cargo ve en su Mesa una sección «Avales» con lo pendiente. Le llega un aviso cuando entra un aval, y a quien lo pidió le llega otro cuando se decide, por el centro de avisos y push ([ADR-166](ADR-166-el-centro-de-avisos-de-mi-oe.md)). Quien pide ve el estado de lo suyo.
4. **Cada aval vive con lo que avala.** El aval de evento sigue en finanzas, la falta en personas y la reserva en el inventario: ahí están sus efectos. Una sola regla de `people` dice quién decide por cada cargo; es la de ADR-193, generalizada a los cinco cargos.
5. **Lo que ya quedó decidido:**
   - El aval de evento lo decide la Presidencia. Una Dirección General en periodo de prueba sí puede pedirlo: el art. 74 habla de avales para cargos, calidad de miembro, reconocimientos y beneficios, y el de evento es del comité.
   - Una falta anotada por una dirección de GH queda pendiente y **no tiene efecto** (ni suspensión ni bloqueo de beneficios) hasta que la VP de GH la avale. Si la rechaza, se cae con su motivo.
   - La postulación de quien no es activo espera el aval de la VP de GH, en lugar de la excepción de texto libre.
   - Una reasignación no mueve plata hasta que la avale la VP Financiera.
   - El préstamo puntual hace que una reserva nazca pendiente hasta el aval de la VP Administrativa.
6. **Por tramos**, en `feat/rediseno`. Cada tramo lleva su check, su E2E y su commit local. Las preguntas que dependen de la OE se resuelven con Mateo antes de empezar el tramo. Los datos que no existen (lista de espacios, formatos de la Presidencia) van a [11-contenido-pendiente](../11-contenido-pendiente.md); no se inventan.
   - **A0.** La regla común de quién decide, la sección «Avales» de la Mesa y los avisos.
   - **A1.** Aval de evento, a la Presidencia.
   - **A2.** Faltas, a la VP de GH.
   - **A3.** Postulación de quien no es activo, a la VP de GH.
   - **A4.** Reasignación y presupuesto extraordinario, a la VP Financiera.
   - **A5.** Compras y pagos, y contratos, a la VP Financiera.
   - **A6.** Piezas, a la VP de Comunicaciones.
   - **A7.** Préstamo puntual, a la VP Administrativa.
   - **A8.** Instalaciones y cruce de planes, a la VP Administrativa.
   - **A9.** Revisión con la junta y salida con el rediseño.

## Preguntas que se resuelven antes de su tramo

- **A2.** ¿Una falta que registra ADMIN también espera el aval de la VP de GH, o solo las que anotan las direcciones de GH de los comités?
- **A5.** ¿Toda compra pide aval, o solo desde un monto? ¿Qué debe traer un contrato (documento, proveedor, monto, visto bueno del abogado) y quién lo firma: la VP Financiera, la Presidencia o cualquiera de las dos?
- **A6.** ¿Para qué canales se piden las piezas, y la pieza aprobada se publica sola o la publica el comité?
- **A7.** ¿Toda reserva pide aval, o solo las que la VP marque, por material o por cantidad?
- **A8.** ¿Qué espacios administra la OE? ¿«Cruce de planes» es un aviso cuando dos actividades caen a la misma hora, o un aval que pide quien agenda?

## Consecuencias

- ADMIN deja de decidir el aval de evento. Si en un semestre no hay Presidencia activa, los avales de evento esperan.
- Mientras una falta espera el aval, la persona conserva sus derechos y beneficios.
- La Mesa de cada cargo de la junta suma una sección. Una VP que hoy solo ve el panel de agregados entra a la Operación por sus avales.
- Las pantallas de finanzas que hoy decide ADMIN pasan a mostrar «lo decide la Presidencia» o «lo decide la VP Financiera».

## Enmienda (2026-11-13, ADR-197)

Regla 1: la Presidencia puede devolver el aval de evento con comentarios antes de decidirlo. Devolver no decide: el comité lo corrige y lo envía otra vez como una versión nueva, y queda la historia de versiones y comentarios. Aprobar o rechazar sigue siendo una sola vez ([ADR-197](ADR-197-las-herramientas-de-presidencia.md) regla 1).
