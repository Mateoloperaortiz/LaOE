# ADR-066: Cargos vigentes e historial por semestre y ámbito

- Estado: Aceptada
- Fecha: 2026-09-14
- Relacionadas: ADR-030, ADR-034, ADR-058, ADR-060

## Contexto

La Persona 360 mostraba todos los nombramientos, incluso anteriores, bajo «Junta y GH». El mismo rótulo aparecía en el directorio y en egresados. Con las direcciones de macroeventos y los cargos históricos, el título daba una clasificación institucional incorrecta. Mateo confirma que GH se presenta dentro de Junta Directiva y solicita separar vigencia e historia.

## Decisión

1. La cabecera de la ficha y el directorio usan **Cargos vigentes**. La cabecera filtra el semestre actual y excluye cargos cerrados y membresías inactivas. Los permisos de consulta y operación en licencia no cambian.
2. **Historial de cargos** reúne los anteriores por semestre descendente y, dentro de cada semestre, por comité, edición de macroevento o ámbito institucional. Incluye las asignaciones de comité cerradas, sin confundir la pertenencia como Miembro con un cargo.
3. La pestaña Membresía mantiene la gestión de cargos vigentes y anteriores. Los nombramientos de semestres futuros aparecen en **Próximos cargos**. Sin semestre actual, no se atribuye vigencia.
4. Los cargos institucionales de GH se rotulan bajo **Junta Directiva**. Un comité o edición explícitamente vinculados conservan su propio ámbito. Esto corrige la presentación; no cambia tipos, atribuciones, inhabilidades ni permisos.
5. Un título histórico libre que ya expresa «cargo · ámbito» puede separar esas dos partes para mostrarlas. No se deducen relaciones con una edición o comité ni derechos a partir del texto. Sin ámbito, se conserva el título bajo **Otros cargos**.
6. La galería de egresados usa **Historial de cargos**, agrupado por semestre y ámbito. El formulario usa **Agregar cargo** y el campo **Cargo**. La fuente de los rótulos sigue siendo el catálogo de copy.

## Consecuencias

No requiere migraciones ni modificaciones a los nombramientos existentes. La lectura adicional de asignaciones cerradas evita perder cargos al abandonar una pertenencia. Los cálculos de permanencia, honorario, GH Points y las autorizaciones no cambian.
