# ADR-063: Importación de asistencias a asambleas

- Estado: Implementada y verificada en producción; 400 asistencias cargadas y diez reservadas por instrucción de GH
- Fecha: 2026-09-14
- Relacionadas: ADR-024, ADR-028, ADR-035, ADR-036, ADR-060, ADR-062
- Enmienda: ADR-062 (asambleas sin crédito y procedencia por hoja)

## Contexto

GH entregó un libro de asistencias y pidió excluir su primera hoja, que consolida parte del contenido. Las otras cinco hojas corresponden a asambleas ordinarias de 2026-2. GH confirmó las identidades registradas desde cuentas de terceros y una firma tardía. Cuatro personas necesitan membresía; el equipo realizará sus altas. Los nombres, correos, filas originales y correcciones permanecen en el paquete privado.

El importador histórico existente admite partidos, juegos y decoración con crédito. Una asamblea debe entrar en el modelo de participación como `ASSEMBLY`, con su tipo explícito y cero puntos. Registrarla como actividad o crear un ajuste del ledger impediría que el cálculo de permanencia y el requisito de ordinarias leyeran la asistencia correctamente.

## Decisión

1. Extender de forma compatible el manifiesto `oe-ghpoints/2` con tipo `ASAMBLEA`, `assemblyKind` explícito (`ORDINARY`, `BOARD_ELECTION` o `RUNOFF`) y `sourceSheet` opcional para localizar la fila cuando la fuente sea un libro. El tipo de asamblea se rechaza en actividades y no se infiere de la fecha o del nombre de la hoja. Las asambleas no son exclusivas de nuevos y corresponden a un día.
2. Crear ocasiones históricas cerradas con `kind: ASSEMBLY`, `assemblyKind` confirmado, categoría `OTHER` y cero puntos. Un check-in aprobado de asamblea no tiene entrada de ledger. La reconsulta reconoce ese estado como existente y retiene cualquier crédito asociado incompatible.
3. Una asamblea existente en la misma fecha exige conciliación aunque su título sea distinto. La segunda vuelta mantiene la unicidad por término; se rechazan dos en el lote o una existente sin conciliar. Reutilizar exige que coincidan tipo, fecha y metadatos. El cierre de permanencia también impide importar asambleas.
4. Mantener ADMIN, fuentes por hash, plan revisado, reconsulta y transacción de ADR-062. La auditoría conserva archivo, hoja, fila e identidad normalizada; los eventos `checkin.approved` informan `kind: ASSEMBLY`, `source: IMPORT` y cero puntos. El motor existente recalcula permanencia y requisitos; esta carga no cambia sus reglas ni emite decisiones de cierre.
5. Deduplicar por persona confirmada y asamblea, después de conciliar cuentas compartidas. Los registros repetidos permanecen en el archivo de origen y en el detalle privado, con referencia a la fila conservada. Una membresía pendiente retiene la asistencia; no crea automáticamente una persona ni la reclasifica como invitada.

## Consecuencias

No cambia el esquema de la base ni se crea una pantalla de importación. Las asambleas aportan el criterio vigente de permanencia —10% al alcanzar tres— sin aumentar GH Points. La regla de ordinarias obligatorias se conserva. GH autorizó después cargar únicamente las 400 asistencias conciliadas y reservar las diez pendientes. Se aplicó un manifiesto parcial con los mismos identificadores del lote completo; una alta concurrente no amplía automáticamente la selección autorizada. El lote completo se conserva para conciliar y revisar las diez restantes antes de otra carga.

## Verificación productiva · 2026-09-14

[PR 26](https://github.com/Mateoloperaortiz/LaOE/pull/26), versión `af58b9990bcc3f72cbdadfa9a5778fa6a622bb75`, publicada con CI y smoke en staging y producción. Importación `czwh3bv146xic194kjo8sjp4`: 400 asistencias aprobadas de 217 personas, cinco asambleas ordinarias, cero puntos y cero entradas de ledger. Reconsulta con 400 existentes y cero altas; exactamente diez registros excluidos. El 10% coincide para 48 personas evaluables y nueve personas conservan su exención. Auditoría por archivo/hoja/fila, dos objetos privados verificados y datos previos intactos. Detalle operativo en [el runbook](../15-runbook.md#carga-parcial-de-asambleas--2026-09-14).
