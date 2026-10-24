# ADR-146: Límites de colecciones en la entrada

- Estado: Aceptada
- Fecha: 2026-10-24
- Relacionadas: ADR-034, ADR-036, ADR-037, ADR-058, ADR-067, ADR-145

## Contexto

La actualización de Zod de ADR-145 rechaza una colección sobredimensionada antes de validar sus elementos cuando el esquema declara `.max()`, `.length()` o `.size()`. No resuelve las colecciones sin cota: una lista de valores inválidos sigue generando un error por elemento. El tamaño máximo del cuerpo de una Server Action no evita esa amplificación dentro de un cuerpo admitido.

La solicitud de cambio de comité de Mi OE recibe `leaveCommitteeIds` y `joinCommitteeIds` desde `FormData.getAll`, sin restringir su cantidad al catálogo. También reciben listas controladas por el cliente las altas de personas y tarjetas (`committeeIds`), el admin kit de ediciones (`committeeIds`), cargos (`capabilities`) y segmentos (`stages`, `statuses`, `committeeIds`, `roleCodes`, `tagIds`), las campañas de puntos (`challengeIds`, `occasionIds`), los evaluadores del macroevento (`evaluatorIds`) y las decisiones del cierre de permanencia (`committees`). Los permisos de estas pantallas no convierten sus cuerpos en datos confiables.

El remapeo del roster usa además un número `columns` del formulario para construir el array antes de invocar al dominio. Limitar solamente el esquema que lee el mapeo guardado no detendría ese bucle. El mapeo admite columnas ignoradas y `null`, por lo que su longitud no se limita al número de columnas reconocidas.

## Decisión

1. **Acotar esas listas en sus esquemas de entrada compartidos.** Cada lista admite hasta **1.000 elementos recibidos**, antes de normalizar o eliminar duplicados. La cota va directamente sobre el array y antes de refinamientos o transformaciones, para aprovechar el rechazo temprano de Zod 4.6.6. La validación existente sigue decidiendo la selección válida, los comités resultantes, la existencia de referencias y los permisos.
2. **Usar un tope técnico generoso, sin sustituir las reglas del dominio.** Mil referencias por lista deja margen sobre los comités de una persona, los nueve tipos de capacidad, las cuatro etapas o estados y la selección habitual de objetivos, y permite catálogos y campañas mayores sin ligarlos a la población actual. No se reduce a tres la entrada de comités: la deduplicación y las reglas configuradas siguen donde estaban. La compatibilidad cambia solamente para envíos de más de mil elementos por lista, incluso repetidos; se rechazan completos, nunca se truncan silenciosamente.
3. **Conservar los errores de cada flujo.** Los nuevos rechazos usan el copy genérico existente `T-260` o el de selección de comité `T-887`, según el contrato del esquema. No se depende de la redacción ni del código concreto del error de una unión de Zod: el dominio debe seguir convirtiendo los rechazos en `DomainError`.
4. **No limitar contratos internos por semejanza sintáctica.** Las colecciones de snapshots de permanencia, participación, rachas y auditoría, los contratos de eventos y de salida de The Games, y la configuración escrita por código no reciben topes preventivos. Tampoco los arrays de cargos que las acciones construyen recorriendo el catálogo del servidor: el cliente solo marca casillas de esas filas y no controla su longitud. Un nuevo ingreso de datos requiere volver a evaluar esa frontera.
5. **Verificar el rechazo antes del recorrido con pruebas pequeñas.** Una lista dispersa declara el tamaño que supera la cota y tiene un único acceso instrumentado que falla si se lee. Así se reproduce el recorrido indebido sin construir ni ejecutar cargas de denegación de servicio. Las regresiones deben fallar antes del cambio, pasar después y conservar selecciones normales, valores por defecto y errores de dominio de las uniones ya acotadas.
6. **Validar antes de construir el mapeo del roster.** `columns` debe representar un entero entre cero y 1.000; se rechaza antes de leer los campos `col_*`. El comando de remapeo valida también el array recibido antes de leer el archivo o reconstruir la vista previa. El lector del mapeo histórico conserva su esquema, y se siguen aceptando columnas ignoradas. En macroeventos el máximo se aplica antes de validar cada id y antes de comprobar los miembros seleccionados.

## Consecuencias

La cota reduce la cantidad máxima de errores que puede producir cada colección expuesta; no limita el tamaño total del transporte ni convierte Zod en una protección general de recursos. Se conserva la validación de cada elemento dentro del límite. No cambia el formato de persistencia ni hay migración, truncado o reescritura de datos existentes. En segmentos se separa expresamente el esquema de entrada del lector de filtros guardados: rechazar uno histórico y reemplazarlo por el filtro vacío ampliaría su audiencia. Una solicitud de transferencia guardada con más de mil referencias también se rechaza al decidirla, porque comparte el contrato del payload; no se recorta para aprobarla.

Esta decisión completa la revisión de entradas concretas que ADR-145 dejó separada de la actualización de dependencias. No afirma que el aviso de Zod esté corregido para todos los usos posibles de la librería ni acredita un despliegue en producción.

## Fronteras verificadas

- `src/app/app/solicitudes/actions.ts` lleva los dos `getAll` al contrato de transferencia; `crm.createRequestAs` vuelve a validar el mismo payload y convierte sus rechazos a `DomainError`.
- Las altas de Persona 360 y del pipeline usan `admitInputSchema`. El admin kit convierte los campos multiselección con `formDataToInput`, conservando las listas recibidas, y aplica los esquemas de ediciones, cargos y segmentos. Las campañas de puntos reciben directamente los dos `getAll`.
- El macroevento valida `evaluatorIdsSchema` antes de leer miembros; `setEvaluators` reutiliza la validación antes de reemplazar las filas. El cierre individual de permanencia deriva `committees` de todas las claves `comite:*` recibidas y aplica `decisionInputSchema`.
- `remapAction` valida `columns` antes de su bucle; `remapRosterPreviewAs` comprueba el mapeo antes de consultar el trabajo o el archivo. El esquema de `previewPayloadSchema` sigue leyendo la vista previa guardada sin la cota nueva.
- `competition/route-pure.ts`, `showcase-pure.ts` y `hub-pure.ts` describen salidas construidas desde DB. `system` solo tiene escritores de migraciones para los arrays `onboarding.steps` y `points.levels`; los comandos HTTP actuales de configuración escriben otros valores escalares u objetos. No se identificaron usos de `z.map()` ni `z.set()`.
- Los arrays de formularios, normativa, retos, colección, rubros, parámetros de permanencia, áreas de macroevento y resultados de The Games ya tienen máximos anteriores a refinamientos o transformaciones. Se conserva su manejo de rechazos: `DomainError`, `safeParse` o la captura administrativa de `ZodError`, según el flujo existente. Una prueba de normativa confirma el `DomainError` de una tabla sobredimensionada dentro de la unión sin fijar la forma del error de Zod.

Las regresiones nuevas se ejecutaron en rojo antes del arreglo y luego en verde. La verificación enfocada terminó con 160 casos aprobados en diez archivos unitarios, incluidos contratos de entrada, acciones de roster y macroevento, rechazo de formularios y normativa, pruebas puras existentes y la interfaz pública de módulos. No se ejecutaron cargas de estrés, servicios externos, migraciones, build ni el check completo en este frente.
