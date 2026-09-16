# ADR-065: Áreas y participación en GT y GAP

- Estado: Aceptada por Mateo e implementada el 2026-09-14 (enmendada por ADR-071)
- Enmienda: ADR-064 y ADR-036, regla 6

## Decisión

Cada macroevento ofrece Mesa directiva, GT, GAP y Ediciones. GT y GAP conservan un grupo por macroevento y semestre, con identidad independiente. El GAP OE de VTG/Assessment conserva su tipo y cálculo separados. La pertenencia al grupo no es un cargo de dirección ni concede permisos técnicos.

Las áreas se guardan como un conjunto de códigos en la pertenencia ya existente, único por persona y grupo. El catálogo de áreas es independiente de los cargos de mesa e incluye Publicidad. Incluye las seis áreas comunes y las especialidades de EnFemenino y Días EAFIT. Un integrante puede tener varias áreas, sin multiplicar sus hechos de permanencia. Los registros anteriores conservan sus evaluaciones y quedan con áreas por completar.

Registrar una participación deja desempeño pendiente. La opción explícita «Registrar y acreditar cumplimiento» registra pertenencia, áreas, evaluación GOOD, autor, auditoría y eventos de recálculo en una sola transacción. Solo ADMIN dispone de este alta combinada; los evaluadores GH conservan su bandeja y sus permisos existentes. Editar áreas no cambia la evaluación. Reincorporar a alguien retirado vuelve a pendiente y conserva la evidencia anterior en auditoría.

Persona 360 y el inicio de Mi OE muestran las participaciones vigentes del semestre con su evaluación. El directorio muestra tipo, área y macroevento de las personas que ya cumplen sus filtros de consentimiento y acceso, sin publicar evaluaciones de desempeño ni agregar datos de contacto. La lectura es por lote.

Se mantienen los porcentajes vigentes: GT 4/6/8 por 1/2/3 macroeventos distintos acreditados para antiguos; GAP 5% máximo; GAP OE 3% por VTG/Assessment hasta 6% para antiguos. El registro pendiente no acredita puntos ni desempeño. La tabla de nuevos mantiene sus sustituciones.

## Verificación

Unicidad de GT y GAP por separado; varias áreas con una sola pertenencia; alta pendiente; acreditación atómica y auditada; conservación de evaluación al editar; reincorporación pendiente; rechazo de especialidades ajenas, permisos insuficientes y semestre cerrado; visibilidad por término; recorrido de administración y perfil en escritorio y móvil.

## Enmienda (2026-09-15, ADR-071)

GT y GAP conservan grupos separados, identidad independiente y unicidad por macroevento y semestre, tal como quedó aquí. Lo que cambia es el cómputo de la tabla general: una participación GT acreditada cumple también el criterio GAP, declarado como `alsoCounts` en los parámetros de la regla. El GAP OE conserva su tipo y su cálculo separados y la tabla de nuevos conserva sus sustituciones.
