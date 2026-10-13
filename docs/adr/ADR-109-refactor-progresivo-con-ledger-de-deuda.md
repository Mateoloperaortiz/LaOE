# ADR-109: Refactor progresivo con ledger de deuda técnica

- Estado: Aceptada (enmendada por ADR-116 y ADR-129)
- Fecha: 2026-10-07
- Relacionadas: ADR-079, ADR-080, ADR-081, ADR-082, ADR-083, ADR-084, ADR-085, ADR-108

## Contexto

La [auditoría de código del 2026-09-19](../auditoria-codigo-2026-09-19.md) dejó un plan en dos series: V (verificar) y R (refactor). Se cerraron R0 casi entero, R1-A, R2-A, R3 y R4-A. Después entraron 162 commits de funciones nuevas (The Games, Panal, boosters sobre asistencias, copy paisa) sin continuar la serie, y las métricas de `npm run audit:metrics` retrocedieron: de 99.554 a 116.434 líneas en `src`, de 155 a 179 funciones de más de 100 líneas y de 78 a 99 nombres de función repetidos.

El 2026-10-06 se hizo una segunda revisión, esta vez con el lente de módulos profundos: 37 oportunidades, de las que 18 pasaron por un verificador que intentó tumbarlas. Sobrevivieron como fuertes cinco, y la revisión sumó hechos medidos que la auditoría no tenía:

- Siete módulos de dominio (`comms`, `events`, `forms`, `identity`, `participation`, `people`, `system`) forman una sola componente circular, cerrada por dos imports de un archivo. La regla `sin-ciclos` solo mira archivos.
- `participation` exporta 384 símbolos y 203 no los importa nadie de afuera; knip toma cada `index.ts` como entrada y no lo ve.
- 82 archivos de prueba insertan filas a mano y 147 importan `@/db` directo: las pruebas no entran por la interfaz de los módulos.
- Hay defectos de conducta, no solo de forma: una excusa sobre una asistencia pendiente deja viva la reserva del premio, «hoy» sale en UTC en dos sitios y la regla de alcance de las sanciones del comité no vive en el comando.

Ese mismo día Mateo fijó el objetivo: llevar el repo a un estado sólido, mantenible, testeable y seguro con una refactorización progresiva y verificable, sin reescritura total, y con un registro persistente de la deuda.

## Decisión

1. **Sin reescritura total.** El trabajo va en ciclos cortos: descubrir, priorizar, especificar, partir en tickets, probar, implementar, revisar, verificar y volver a escanear. Un ciclo que no cierra en verde no se da por hecho.
2. **El ledger de deuda es [docs/20-deuda-tecnica.md](../20-deuda-tecnica.md).** Cada hallazgo tiene una fila con su origen, su evidencia y su estado. Un hallazgo termina en uno de cuatro estados: `RESOLVED` (corregido y verificado), `ACCEPTED` (se conoce y se decide convivir con él, con la razón escrita), `DEFERRED` (se hará, con la condición que lo destraba) o `NOT_APPLICABLE` (se investigó y no era deuda). Mientras tanto puede estar `OPEN`, `IN_PROGRESS` o `BLOCKED`.
3. **Orden de prioridad:** corrección, seguridad, integridad de datos, simplicidad, mantenibilidad, testabilidad, observabilidad y rendimiento.
4. **Código viejo no es código inútil.** Antes de eliminar, consolidar o cambiar una conducta se rastrean los llamadores, las dependencias, las pruebas, el historial de git, la documentación, la persistencia y los contratos públicos (rutas, eventos de dominio, API pública v1). Lo que se encuentra queda en el ticket.
5. **Pruebas de caracterización primero.** Una zona crítica sin cobertura suficiente se fija con pruebas que describen lo que hace hoy antes de tocarla. Un defecto se reproduce con una prueba en rojo antes de corregirlo.
6. **Cada refactor importante tiene spec y tickets**, como issues de GitHub ([ADR-108](ADR-108-los-issues-de-github-son-la-cola-de-trabajo.md)). Un ciclo va en una rama de integración creada desde `origin/main`, con un commit por ticket, y sale por un solo PR que nombra sus tickets con `Refs`.
7. **Mezclar y promover siguen siendo de Mateo.** Un ciclo termina con su PR abierto y verificado; no se mezcla a `main` ni se promueve a `production` sin su autorización explícita.
8. **Verificación de cada ciclo:** `npm run check` completo, las E2E de las pantallas tocadas y una revisión de código antes de abrir el PR. Al cerrar se corre `npm run audit:metrics` y su tabla se anota en el ledger.
9. **La serie R queda absorbida por el ledger.** Sus tramos pendientes (R1-B, R2-B, R4-B, R5, R6, R7) y la serie V conservan su nombre como origen de las filas que les corresponden; el informe de la auditoría no se edita.
10. **Lo que ya es profundo no se toca.** `runCommand`, el catálogo tipado de eventos, el admin kit, el kit de actions, `src/app/_authz`, la línea de tiempo de crm, `permanence-pure.ts`, los motores de los juegos y los adaptadores de correo, bucket y Google Wallet pasaron la prueba de borrado. Partir un archivo solo por su tamaño no es un refactor de este plan.
11. **Una profundización se propone solo donde algo varía.** Un seam nuevo necesita dos adaptadores reales; con uno solo es una indirección y no entra.

## Consecuencias

- El avance se lee en dos lugares con papeles distintos: el ledger dice el estado de cada hallazgo y el roadmap dice qué se entregó en cada ciclo.
- El ledger es un documento más que puede quedarse atrás. Lo sostiene la regla 8: cada ciclo lo actualiza antes de abrir su PR.
- Las decisiones de dominio que el código no puede tomar solo (qué instante es el fin del término, si un director en licencia conserva sus capacidades, si `competition` entra al refactor) van a [decisiones-abiertas.md](../decisiones-abiertas.md) y dejan su fila del ledger en `BLOCKED` o `DEFERRED`; el resto del ciclo sigue.
- Entre un ciclo y el siguiente puede haber PR abiertos sin mezclar. Un ciclo que dependa de otro sin mezclar se apila sobre su rama y lo dice en su PR.
- El trabajo de este plan convive con funciones nuevas. No se abre un ticket que mueva puntos, premios o el poller mientras haya una función en vuelo sobre el mismo módulo.

## Enmienda (2026-10-08, ADR-116)

Regla 6: pedía un commit por ticket. Desde el ciclo 4 un ticket junta varias filas del ledger y cada fila entra en su propio commit, con su prueba en rojo primero y en verde al final (regla 5): 8 commits para #143 en el ciclo 4 y 48 para los 10 tickets del ciclo 5. Ahora la regla dice lo que se hace: los commits de un ciclo son atómicos, cada uno deja las pruebas en verde y nombra su ticket con `Refs`, y no se aplastan por ticket. El ciclo sigue en una rama de integración y sale por un solo PR que nombra sus tickets. Ver [ADR-116](ADR-116-reglas-de-correccion-privacidad-y-permisos.md) regla 22.

## Enmienda (2026-10-13, ADR-129)

Regla 10: decía que lo que ya es profundo no se toca, y cuenta ahí a `permanence-pure.ts`. Ese archivo se tocó tres veces, cada una con su razón escrita en la ADR de su ciclo: el arreglo de un defecto en el ciclo 16 ([ADR-128](ADR-128-reglas-de-correccion-del-decimosexto-ciclo.md) regla 1) y, en el ciclo 17, la regla que ya era suya y tenía una segunda copia fuera del archivo, y el nombre de los valores que ya decidía ([ADR-129](ADR-129-reglas-de-consolidacion-del-decimoseptimo-ciclo.md) reglas 1 y 3). La letra dejó de describir lo que se hace, y ahora lo dice: lo que ya es profundo no se parte ni se reordena por este plan. Sí recibe tres cosas, y cada vez la ADR del ciclo dice cuál es: el arreglo de un defecto, con su prueba en rojo antes; la regla que ya era suya y estaba escrita otra vez fuera, que entra para que la copia de afuera se vaya; y el nombre de un valor que el archivo ya decidía. Su interfaz no cambia más que por lo que una de esas tres le pida. Lo demás de la regla sigue igual: partir un archivo solo por su tamaño no es un refactor de este plan.
