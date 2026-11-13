# ADR-165. Bonos de permanencia por criterio

- Estado: Aceptada
- Fecha: 2026-11-13
- Relacionadas: ADR-025, ADR-028, ADR-036, ADR-143
- Enmienda: ADR-036, reglas 1, 4, 5 y 8

## Contexto

GH pidió reconocer contribuciones como ayudar a decorar la oficina. Mateo confirmó el flujo: GH elige a la persona y los criterios, indica un total de puntos porcentuales y escribe un motivo visible para la persona. El sistema muestra cuánto falta y acepta únicamente el total que cubre los faltantes elegidos. Si faltan 7 puntos en Barra brava y 3 en GT Macroeventos, solo se acepta 10, con 7 y 3 en los respectivos criterios.

## Decisión

1. En **Permanencia → Cumplimiento**, ADMIN puede dar un bono a un miembro activo con pertenencia vigente a un comité de un semestre con permanencia abierta. El selector muestra los criterios de la tabla general y de sus comités que le aplican y tienen puntos por completar. El faltante de cada criterio es su peso menos los puntos ya logrados. Se trabaja con dos decimales, la precisión de los pesos y puntajes existentes.
2. El servidor vuelve a calcular los faltantes antes de guardar. Los criterios seleccionados deben ser distintos y tener faltante. El total debe coincidir con la suma de esos faltantes y el motivo es obligatorio. Si la selección quedó desactualizada, GH puede consultar el reparto actualizado. Una operación guarda todas sus asignaciones juntas. Repetir el mismo envío devuelve el resultado del primero.
3. El bono se guarda como `PermanenceBonus`, con sus asignaciones por criterio, fecha, autor y motivo. La auditoría registra los importes de la operación. Los puntos se aplican después del puntaje obtenido por el criterio y hasta su peso. Si ese puntaje aumenta después, el desglose conserva el importe otorgado, muestra cuánto sigue contando y conserva el motivo. Las asistencias, el requisito de asambleas obligatorias, las evaluaciones de grupos y GH Points siguen sus flujos respectivos. Los créditos manuales de criterios `MANUAL` conservan su operación.
4. El guardado comparte el candado del término con el recálculo y el cierre. Ambos leen los hechos, incluida la configuración, mediante las APIs de cada módulo y la misma transacción. La vista previa y el guardado calculan sobre una foto coherente de la base. Al guardar se toman, en orden, el candado de snapshots, la fila del término, el ciclo de membresía y los criterios elegidos. El guardado actualiza el snapshot de la persona en la misma operación y reintenta si la base detecta un cambio concurrente incompatible. Los snapshots del cierre conservan el reparto y la explicación. Los de semestres anteriores se leen con el mismo contrato. Mi OE y la Persona 360 muestran el detalle bajo cada criterio. El exporte propio incluye las asignaciones numéricas y la referencia de auditoría, con el tratamiento de motivos libres de ADR-143.

## Consecuencias

Un bono puede completar criterios que se calculan por asistencia, evaluación, puntaje del líder o crédito manual. El resultado general y el de cada comité incorporan sus respectivos criterios. El cierre congela el resultado que incluye los bonos vigentes y conserva las decisiones de GH como operación aparte.
