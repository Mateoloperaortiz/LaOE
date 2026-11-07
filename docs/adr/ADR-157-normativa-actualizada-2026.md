# ADR-157: Normativa actualizada desde 2026-2

- Estado: Aceptada; publicada y verificada en producción el 2026-11-06 (SHA `46b3ac98`)
- Fecha: 2026-11-06
- Enmienda: ADR-060 reglas 1 y 9; ADR-064
- Relacionadas: ADR-031, ADR-042, ADR-118

## Contexto

Los PDF actualizados entregados por Mateo cambian el mínimo para entrar en prueba de 40 % a 50 %, incorporan mínimos de mesa y reactivación de macroeventos, y modifican requisitos y permisos electorales. La comparación está en `docs/revision-normativa-2026-11-06.md`. Mateo autorizó implementar la actualización y confirmó dos criterios: vigencia desde **2026-2**, conservando cierres anteriores; conteo de **cargos electos distintos**, una codirección como un cargo, excluyendo suplencias de Junta, después de las elecciones de la segunda asamblea.

## Decisión

1. Permanencia selecciona la política por código del término: la configuración histórica `permanence.probationMargins` queda intacta; `permanence.probationMargins2026`, sembrada por una migración nueva, fija activo 10 y las otras condiciones 0 para 2026-2 y siguientes. Se mantienen umbrales 60/80/80/70 y la banda informativa de riesgo. El recálculo no modifica cierres ni filas congeladas y no ejecuta bajas. GH revisa propuestas y decisiones antes de aplicar el cierre.
2. Los mínimos de continuidad son anuales: Inventiva 2, EnFemenino 3 y DÍAS 4 cargos electos, estos últimos incluyendo The Games o Carnival (Reglamento art. 27). Las distintas ediciones del mismo año se reúnen por cargo. ADMIN registra el corte con fecha real, acta y confirmación de que finalizaron las elecciones y la mesa representa ese corte. No se inventan fechas de asamblea ni se ejecuta una deshabilitación por cronómetro.
3. Un nombramiento existente no prueba su origen. Se registra aparte una constancia de elección o suplencia, auditada y con responsable. Las constancias electivas verifican permisos tardíos por mayoría calificada, experiencia de al menos una persona de la candidatura conjunta o excepción de tercera vuelta, requisito de Escuela solo para General de Inventiva, composición de EnFemenino y planes de trabajo de elecciones extraordinarias. Se guarda la confirmación institucional, sin deducir ni recopilar el género personal. Si cambia la pareja de titular y codirección, sus constancias dejan de acreditar el conteo hasta revisarlas.
4. El corte se bloquea mientras existan nombramientos sin verificar. La mesa, las constancias y el corte comparten barrera por evento. El corte conserva los cargos contados y el resultado aunque la mesa cambie después; los cambios posteriores no reescriben esa historia. La publicación editorial y los permisos de cargos no cambian automáticamente por el registro institucional: una suplencia, retiro de cargos o cancelación de una edición conserva sus comandos propios.
5. La propuesta de reactivación pertenece a un evento y año: presentación en jornadas electorales del segundo semestre del año anterior, constancia de dichas jornadas, misión, plan y una persona activa distinta por cada cargo del catálogo. Se exige una deshabilitación anterior, no basta alcanzar el mínimo 2/3/4. Solo hay una propuesta pendiente o aprobada por año. ADMIN registra decisión de Junta y comunicación a Asamblea, con auditoría; una aprobación permite volver a evaluar ese año. Un rechazo conserva la propuesta y permite presentar otra. La aprobación no nombra personas automáticamente.
6. Junta, comités y macroeventos reciben la guía electoral actualizada: permiso tardío, excepción de VP de GH con al menos un semestre en CGH principal, retiro del permiso por renuncia válida, moderador objetable por mayoría simple y alcance de incompatibilidad con Representantes Estudiantiles. Se conserva la revisión humana de elecciones, quórum y requisitos documentales; no se convierte un `overrideReason` en evidencia de una votación.
7. Se actualizan citas visibles y documentación vigente por artículo. Los originales, erratas internas, migraciones y decisiones históricas conservan su texto. ADR-060 y ADR-064 se enmiendan sin reescribir sus reglas anteriores.

## Consecuencias

Un activo con 45 % pasa de propuesta de prueba a propuesta de salida del comité; desde 50 % hasta menos de 60 % queda en prueba. La expulsión disciplinaria sigue sus causales propias. Los nuevos, quienes ya están en prueba y las transferencias no reciben una banda nueva.

Los cargos anteriores requieren constancia antes del primer corte. El registro de reactivación requiere una mesa completa; el catálogo operativo de ADR-064 conserva sus nombres, incluida Relaciones Públicas, sin reinterpretar automáticamente la diferencia histórica entre Publicidad y Mercadeo. El art. 41 y el art. 45 tienen hitos distintos; la pantalla pide fundamento y no automatiza una suplencia al llegar una fecha.

El corte no se edita desde la pantalla: cualquier corrección institucional requiere una nueva decisión documentada. El estado informa en administración y conserva la historia editorial. No se despliega ni se considera vigente en producción hasta completar las verificaciones y el procedimiento de publicación del runbook.
