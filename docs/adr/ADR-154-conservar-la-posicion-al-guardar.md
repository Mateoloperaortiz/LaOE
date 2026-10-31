# ADR-154: Conservar la posición de la página al guardar

- Estado: Aceptada (enmendada por ADR-155); publicada
- Fecha: 2026-10-30
- Relacionadas: ADR-022, ADR-043, ADR-044, ADR-080, ADR-082

## Contexto

Guardar desde una parte baja de la página devuelve a la persona al inicio. Se reprodujo en el editor lateral de Ocasiones y en un formulario particular sin panel: el dato se guarda, pero el desplazamiento pasa de más de 1.900 píxeles a cero. El cierre y la devolución del foco del diálogo conservan su posición; el salto aparece con la navegación posterior de la Server Action.

Next 16.4.1 permite desactivar el desplazamiento en una navegación del cliente, pero `redirect()` no ofrece esa opción. Corregir únicamente el panel dejaría fuera los formularios particulares.

## Decisión

1. Los formularios de la interfaz usan `ActionForm`, en `src/shared/ui/ActionForm.tsx`. Conserva las propiedades del formulario nativo y concentra la política de desplazamiento.
2. Al enviar una acción de función, captura la posición horizontal y vertical. Observa el envío con `useFormStatus` y restaura al terminar o desmontarse el formulario, después del commit de React y mediante `queueMicrotask`, antes de que el navegador pinte. Se sigue el evento `scroll` del documento durante la espera, incluida la barra o tecnología de asistencia; si la persona se mueve, se conserva esa posición nueva; un gesto dentro del diálogo no cambia la posición guardada del fondo.
3. Solo restaura si la ruta y el ancla siguen siendo las mismas. Los cambios de consulta de un guardado pueden conservar el lugar; abrir otra página o dirigirse a otra ancla mantiene su navegación habitual.
4. Si la validación enfoca un campo inválido o una alerta, se respeta ese foco y su desplazamiento. Los formularios GET y los envíos gestionados únicamente con `onSubmit` conservan su comportamiento nativo.
5. Las subidas que vuelven al mismo listado con `router.push` desactivan su desplazamiento solo si conservan origen, ruta y ancla. Un destino distinto mantiene la navegación habitual.
6. La posición vive en memoria durante el envío. No se guarda en cookies, almacenamiento persistente ni URL; tampoco se intercepta el transporte de las Server Actions.

## Consecuencias

La misma corrección cubre el admin kit y los formularios particulares de Administración y Mi OE, incluidos los guardados repetidos cuya URL ya contiene la confirmación. No requiere dependencias, migraciones, cambios de permisos ni textos nuevos.

Las regresiones de navegador deben comprobar guardado con y sin panel, repetición, celular y escritorio, errores de validación, desplazamiento durante el envío y navegación a otra página. Los resultados efectivos y la publicación se registran en el roadmap.

## Enmienda (2026-10-30, ADR-155)

La regla 4 dejaba los formularios GET con su comportamiento nativo. [ADR-155](ADR-155-conservar-la-posicion-al-cambiar-la-vista.md) amplía la conservación del desplazamiento a los GET hacia la misma página, sin ancla explícita y en el destino actual: actualizan la consulta sin recargar el documento. Otro origen o ruta, una ancla explícita o un `target` diferente conservan la navegación nativa. La restauración de las Server Actions y el foco de validación de esta ADR no cambian.
