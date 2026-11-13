# ADR-172: El empalme entre semestres

- Estado: Aceptada (2026-11-13)
- Fecha: 2026-11-13
- Relacionadas: ADR-057, ADR-058, ADR-073, ADR-160

## Contexto

Cada semestre cambian las direcciones de los comités y, con ellas, se pierde lo que sabía quien se va: los contactos, los pendientes, cómo se hace cada cosa. El plan maestro (§7, ola 2) pide un **empalme entre semestres**: documentos con responsable por cargo, al estilo de las páginas verificadas de Notion, listos antes del cierre de 2027-1.

Los cargos de cada comité ya existen (ADR-057 y ADR-058): cada pertenencia de un semestre lleva sus cargos vivos, con titular y codirección.

## Decisión

1. **Un documento por cargo y por comité.** Cada comité tiene, por cada cargo, un documento de empalme en Markdown. No es por semestre: es el mismo documento que pasa de mano en mano, y la casa guarda quién lo editó por última vez y cuándo.
2. **El responsable es quien tiene el cargo.** Lo edita quien tiene ese cargo en el comité en el semestre actual, y ADMIN. Lo lee también la dirección del comité y quien tiene ese cargo en el semestre siguiente, que es quien recibe.
3. **Verificado.** El responsable lo marca como verificado cuando lo revisó, y la casa guarda quién y cuándo. Un documento editado después de su verificación vuelve a quedar sin verificar. Así quien recibe sabe si lo que lee está al día.
4. **Dónde se ve.** En Mi OE, «Yo» lleva a «Tu empalme», con los documentos de los cargos que la persona tiene o va a tener. En la Operación, el comité muestra cuáles cargos tienen su documento y si está verificado.

## Consecuencias

- **Migración aditiva.** Una tabla nueva, `handover_doc`, en `people`, única por comité y cargo.
- **Sin datos personales nuevos.** El documento es de trabajo del comité. Quien escribe sabe que lo lee quien lo recibe; no es un canal para datos de otras personas.
- **Pruebas.** Integración de editar con y sin el cargo, de verificar y de volver a sin verificar al editar, y de quién lo lee. E2E de editar y verificar desde Mi OE.
