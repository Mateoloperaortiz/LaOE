# Recorridos de avales para la Junta de 2027

La nueva Junta hará los once recorridos y dejará su decisión en el acta de su sesión. Cada cargo entra con una cuenta ficticia propia. Las solicitudes, los avisos, los archivos y las decisiones pasan por la aplicación. La prueba de navegador se puede repetir por separado. [Alcance de los avales](adr/ADR-195-los-avales-de-la-junta.md)

## Preparar la sesión

Desde el checkout de la casa, usar las dependencias y el archivo `.env` de desarrollo local. El ensayo necesita PostgreSQL y el bucket de medios del entorno local.

```sh
npm run db:up
npm run junta:ensayo -- preparar
```

El segundo comando crea una base nueva y muestra una carpeta privada de sesión. Dentro están `acta.md`, `accesos.json`, tres PDF de respaldo y una pieza de ejemplo. El acta enlaza los expedientes de esa base e indica el semestre, las fechas del evento, la hora de retiro y la etiqueta del material. El comando admite una carpeta de destino fuera del checkout y un puerto como argumentos opcionales. El puerto habitual es 3650.

```sh
npm run junta:ensayo -- abrir "/ruta/a/la/carpeta/junta-…"
```

Al abrir se compila la revisión actual de la casa y se inicia el servidor en este equipo. Entrar desde el enlace de Mi OE del acta. Usar perfiles de navegador distintos para los cargos que trabajan a la vez, o cerrar sesión antes de cambiar de cuenta. `Ctrl+C` detiene el servidor. Volver a abrir la misma carpeta conserva la actividad y el acta.

En 2027, preparar la sesión el día de la revisión. El semestre, los nombramientos, los horarios que se cruzan y los vencimientos se calculan para ese día en Colombia. Una nueva preparación conserva las sesiones anteriores y las bases de desarrollo.

## Qué revisar por cargo

Quien solicita abre el expediente desde su área. Quien decide entra por **Operación → Mesa → Avales**. En cada caso, revisar también el estado que ve quien hizo la solicitud y el resultado en su centro de avisos de Mi OE. El expediente muestra quién intervino y cuándo. La Presidencia puede suplir a una VP ausente según la regla común. [Mesa, avisos y suplencia](adr/ADR-195-los-avales-de-la-junta.md)

| Recorrido | Qué hacer y qué resultado buscar |
| --- | --- |
| A1 · Evento | Presidencia abre «Encuentro pendiente de Presidencia» en su Mesa y lo devuelve con una observación. Dirección General responde desde Finanzas del comité y Presidencia decide sobre la nueva versión. Revisar el historial del aval. «Jornada del comité de ensayo» ya tiene aval para los ejercicios de Finanzas y Logística. |
| A2 · Falta | GH del comité abre Permanencia del comité, elige a «Miembro del comité de ensayo» y registra una falta leve con fecha, causal y referencia. Hasta la decisión queda pendiente. La VP de GH puede rechazarla con motivo. Para probar una aprobación, presentar otra y comprobar su efecto en la permanencia. |
| A3 · Postulación | El miembro nuevo entra en **Mi OE → Comités → Postulaciones**, elige el comité de ensayo y el cargo de Logística. La VP de GH decide. Volver como postulante y comprobar el resultado para ese cargo y semestre. El nombramiento es un paso posterior. |
| A4 · Reasignación | Finanzas del comité propone mover 20.000 pesos de Escenario a Materiales para «Jornada del comité de ensayo». La reasignación se hace antes del evento y dentro del mismo año presupuestal. Revisar los dos saldos antes y después de la decisión de la VP Financiera. |
| A4 · Extraordinario | Finanzas envía «Taller adicional de ensayo» desde el área del comité. La VP Financiera revisa rubros y monto en su Mesa y decide. Si se prueba también la apertura, Operación registra la aprobación ficticia de Desarrollo Estudiantil y abre el presupuesto. |
| A5 · Compra y pago | Finanzas registra la presolicitud del mes y pide una compra de 10.000 pesos con cargo a Materiales. La VP Financiera aprueba esa compra. Finanzas registra el pago con fecha de hoy y comprueba que el rubro registra un solo gasto. Toda compra pasa por la VP, cualquiera sea el monto. |
| A5 · Contrato | Finanzas adjunta `contrato.pdf`, `revision-juridica.pdf` y `visto-bueno.pdf` en sus campos. La VP Financiera o Presidencia abre los tres archivos y registra su propia firma de ensayo. Volver como comité y revisar la persona, el cargo y la fecha de la decisión. |
| A6 · Pieza | Mercadeo, la VP de Comunicaciones y el CCM completan el recorrido de publicación descrito abajo. Repetir con la cartelera de Mi OE para ver la pieza como miembro del comité. |
| A7 · Préstamo | Logística, la VP Administrativa y el CML siguen la lista del evento hasta la devolución parcial. |
| A8 · Cruces | Las dos direcciones de macroevento y la del comité elevan los dos cruces de la semana. Verificar quién resuelve cada uno y quién aplica el acuerdo. |
| A8 · Espacio | La VP Administrativa carga un espacio de ensayo y decide sobre dos solicitudes de Logística para la misma franja. |

## Cuatro recorridos compartidos

1. **Pieza para Instagram.** Mercadeo abre Comunicación del comité, adjunta `pieza-de-ensayo.png`, elige el feed de Instagram y su propio nombramiento. La VP de Comunicaciones abre el archivo y aprueba. El comité simula la publicación y la registra manualmente en la casa. El ejercicio se completa sin usar una cuenta de Instagram. Desde **Mi OE → Acompañamiento de Mercadeo**, el CCM comenta la primera publicación. Mercadeo comprueba que ve el comentario en su pieza. [Aval de piezas](adr/ADR-202-aval-y-publicacion-de-piezas.md) · [Acompañamiento del CCM](adr/ADR-203-acompanamiento-de-mercadeo.md)
2. **Préstamo con devolución parcial.** La lista de Logística pide dos extensiones para un evento de dos días. La VP Administrativa abre el expediente, revisa el aval del evento, la referencia del acta, el motivo de la solicitud tardía y las fechas. Aprueba la lista. Logística entra en **Mi OE → Inventario** y confirma la reserva de ambas unidades. A partir de la hora de retiro del acta, el CML abre la entrega en **Operación → Campo**, ingresa la etiqueta del material y confirma. Vuelve a ingresar la etiqueta y registra una unidad devuelta en buen estado. Logística comprueba que debe una y que el plazo vence el quinto día después del final del evento. [Aval logístico](adr/ADR-204-aval-logistico-de-materiales.md)
3. **Cruces sin acuerdo.** Abrir la semana enlazada en el acta. GH de INVENTIVA registra qué intentó acordar con DÍAS. La VP de GH escribe la resolución. GH de DÍAS debe poder leerla. Dirección General del comité eleva el cruce de su planeación con INVENTIVA. La VP Administrativa registra la resolución y el comité la consulta. Las direcciones aplican los cambios en el calendario. [Coordinación de cruces](adr/ADR-205-coordinacion-de-cruces-y-espacios.md)
4. **Ocupación de un espacio.** En **Mi OE → Coordinación de horarios y espacios**, la VP Administrativa crea «Sala de ensayo». Logística envía dos solicitudes para el mismo día de la semana del acta de 10 a 11, cada una con su propósito. La VP aprueba la primera y comprueba que la app impide aprobar la segunda para esa franja. Registra el rechazo con su motivo. Logística revisa la ocupación de la semana y el resultado de ambas solicitudes. [Espacios de la OE](adr/ADR-205-coordinacion-de-cruces-y-espacios.md)

## Registrar la revisión y la salida

La Junta de 2027 completa una fila del acta por recorrido con el cargo que lo probó, la fecha, el resultado y la evidencia o el ajuste que pide. Si hay ajustes, anotar responsable, versión corregida y resultado al repetir el caso. Los once resultados parten como **Pendiente**.

Para repetir la batería de avales en una base desechable mientras desarrollo está abierto, usar `E2E_PORT=3652 E2E_SERVER=build npm run test:avales`. Para el control general se usa `npm run check`. Una sesión de la Junta ya abierta conserva su base y su copia de la aplicación durante estas verificaciones.

Los avales salen con las cinco olas del rediseño. Se repite la prueba de salida en staging con datos sintéticos. Mateo y GH fijan la fecha. Tras la autorización de Mateo para mezclar y promover, se comprueba el SHA de producción en `/api/health` y se anota en el acta. La referencia de recuperación es el SHA anterior. [Acuerdo de salida conjunta](adr/ADR-164-el-rediseno-sale-de-una-vez.md)
