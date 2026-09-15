# ADR-068: Correcciones de gamificación antes de producción

- Estado: Aceptada
- Fecha: 2026-09-15
- Enmienda: ADR-067, reglas 3, 6, 9, 12 y 14
- Relacionadas: ADR-007, ADR-012, ADR-022

## Contexto

La revisión de la rama `feat/gamificacion` reprodujo ocho defectos: sobrescritura de WebP procesados mediante el POST original, premios automáticos con la bandera apagada, pérdida de una asistencia válida al competir por un booster, reaprobación presencial fallida por duplicado, premios sin revertir tras cancelar su reto o apagar la bandera, reintentos con contenido distinto aceptados y posiciones destacadas retenidas por insignias revocadas. Mateo pidió corregirlos y dejar la entrega preparada para un despliegue posterior.

## Decisión

1. **Objetos de evidencia separados.** `challenge_evidence_file.objectKey` conserva la clave de la subida; el resultado sin metadatos vive en `evidence/processed/<fileId>.webp`, una dirección que nunca se firma para escritura del cliente. La ruta privada sirve exclusivamente ese resultado cuando la fila está READY. El procesamiento bloquea la fila y confirma su estado antes de borrar el original; la anonimización bloquea las mismas filas y elimina ambos objetos. Los fallos de eliminación se reintentan. La migración 0032 oculta y reencola las evidencias READY de una instalación anterior para moverlas al almacenamiento protegido.
2. **Activación y corrección.** Con la bandera apagada, el recálculo automático y manual no crea nuevos logros ni sus boosters; las ediciones especiales tampoco se otorgan. La conciliación histórica explícita sigue disponible sin premios ni notificaciones. Confirmar, liberar y revertir reservas existentes sigue permitido mientras el término esté abierto. Una anulación presencial encuentra su participación incluso si el reto fue cancelado o cambió la membresía del participante.
3. **Una asistencia válida sobrevive a la carrera.** El selector del check-in valida la propiedad del booster, toma los bloqueos en orden persona → booster y continúa sin la parte personal si otra entrega propia ya lo reservó o consumió, conservando `requestedPersonalPercent` en su premio. Un identificador ajeno o inexistente sigue rechazado. La reaprobación presencial reutiliza la participación REJECTED y su premio RELEASED, recalculando cupo y extras vigentes; un reto cancelado no vuelve a otorgar premios.
4. **Reintentos por contenido.** Un advisory por reto y persona serializa los envíos concurrentes. El replay exige el mismo `requestId` y las mismas respuestas, o el mismo texto sin espacios exteriores y las mismas claves de imágenes en orden (sin duplicados). No consulta nuevamente el bucket ni recalifica. Funciona después del cierre o de apagar la bandera; un contenido distinto devuelve INVALID_INPUT. El único de base de datos se conserva como respaldo.
5. **Posiciones destacadas.** Revocar un logro libera su posición; la migración 0032 repara posiciones retenidas. Destacar usa el mismo advisory por persona que el recálculo y repetir el estado deseado es idempotente.

## Consecuencias

Se conserva el esquema, el índice `(rewardId, kind)`, el snapshot `requestedPersonalPercent`, los topes y el copy de ADR-067. La migración 0032 solo repara datos y encola trabajo; no activa la bandera ni publica retos. El cambio de dirección de evidencias invalida la suposición anterior de que `objectKey` identifica el archivo final. El recálculo sigue revocando logros que pierden sus fuentes aunque la experiencia esté apagada.

Las pruebas de regresión cubren los ocho defectos, las reservas decididas con membresía cambiada, los reintentos concurrentes y tras procesamiento/cierre, y la reparación 0032 sobre filas anteriores. La validación completa y el procedimiento de despliegue se registran en `10-verificacion.md`, `09-roadmap.md` y `15-runbook.md`.
