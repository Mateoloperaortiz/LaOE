# ADR-120: Reglas de corrección del octavo ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-10
- Relacionadas: ADR-034, ADR-060, ADR-109, ADR-118, ADR-119
- Enmienda: ADR-119 (regla 19: a quien sigue de baja el roster tampoco le escribe la prueba del término, así que esa línea deja de contarse como cambio)

## Contexto

El octavo ciclo del refactor progresivo ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)) toma las filas diferidas del ledger que no esperan nada: ni una decisión del dueño, ni una mirada a producción, ni una spec de estructura (spec [#247](https://github.com/Mateoloperaortiz/LaOE/issues/247)). Son defectos y huecos chicos, leídos contra el código del cierre y no ejecutados: cada uno se reprodujo con una prueba en rojo antes de corregirlo, y lo que roza una decisión abierta conserva la conducta de hoy.

**El roster le escribía la prueba del término a quien sigue de baja (DT-286).** `applyRow` (`src/modules/people/domain/roster.ts`) hacía el upsert de la fila general de `membership_term` del término del roster con la prueba que decía la columna ESTADO, sin mirar si la persona quedaba adentro. A alguien expulsado que figura «Periodo de prueba» le quedaba `probation: true` en un término en el que no participa, y a quien se fue y sigue figurando «Retirado» se le borraba la prueba con la que salió y se le reescribía el motivo. [ADR-060](ADR-060-alineacion-con-la-normativa-2026.md) regla 3 dice que la fila de quien no vuelve conserva sus datos y su estado; [ADR-119](ADR-119-reglas-de-estructura-y-robustez-del-septimo-ciclo.md) regla 19 dejó esa escritura anotada y por eso seguía contando la fila como «actualizada». Quién lee `membership_term` de alguien sin membresía vigente: la ficha de la persona (`person-360.ts`), que lista la condición por término de cualquiera; `blockedBenefits` e `inhabilities.ts`, que solo se consultan para quien pide un beneficio o un cargo; la vista previa del propio roster; y permanencia, que la trae con las pertenencias del término, también las de quien salió (`people-reads.ts`), pero solo evalúa a quien está activo (`evaluated`, en `permanence-pure.ts`): la prueba de más llegaba a su snapshot como dato y no movía ningún umbral. El cierre (`term-outcomes.ts`) lee la fila solo para su propio upsert y su auditoría.

## Decisión

1. **A quien sigue de baja el roster no le escribe la fila del término.** `applyRow` hace el upsert de la fila general de `membership_term` solo si la persona no sigue de baja. La pregunta es `staysInactive`, la misma que ya decide el estado (ADR-119 regla 19) y los comités ([ADR-118](ADR-118-reglas-de-correccion-del-sexto-ciclo.md) regla 11), y se responde con la membresía que la transacción lee al aplicar, no con la de la vista previa. Quien fue expulsado y figura «Periodo de prueba», y quien se fue y sigue figurando «Retirado», conservan la prueba y el motivo que tuvieran en ese término. `diffRoster` deja de anotar esa línea: la fila sale «sin cambios», con su aviso T-2208 si lo tenía, y cuenta en `unchanged`.
   - **El límite.** «Sigue de baja» no es «queda de baja»: a quien esa misma fila da de baja, a quien nace de baja y a quien el roster reactiva se les escribe la fila del término como antes. Qué se le escribe a quien vuelve no se toca (decisiones abiertas 28 y 29).

## Consecuencias

- La fila del roster de alguien expulsado deja de contarse como «actualizada» en todos los casos: ni el estado, ni los comités, ni la prueba se le escriben. Las filas de `membership_term` que la conducta anterior ya dejó en producción no se limpian: son una condición de más en la ficha de alguien de baja y no se buscó cuántas hay.
- A quien sí tiene membresía el roster le sigue reescribiendo el motivo de la fila del término en cada importación que traiga ESTADO, aunque la prueba no cambie: el motivo que GH escribió al decidirla se pierde de la fila y queda solo en la auditoría (`membership-term.set`). Corregirlo cambia también lo que le queda escrito a quien el roster reactiva, que este ciclo no toca; queda anotado (DT-297).
- La regla 1 no trae textos nuevos ni migraciones.
