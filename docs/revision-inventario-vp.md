# Revisión del inventario con la VP administrativa

Esta versión está en la rama `feat/inventario-vp-administrativa`, para revisar con datos ficticios en [staging](https://web-staging-53f6.up.railway.app/app/inventario).

Las cuentas de demostración y sus contraseñas aleatorias se entregan en un archivo privado, fuera del repositorio. Hay una VP, una dirección logística de comité, una persona del CML que también puede recoger como delegada, una dirección de macroevento, un miembro con carnet pendiente y ADMIN para revisar remisiones. No se envían invitaciones ni correos a personas reales.

## Recorrido

1. **Miembro:** abrir Inventario y consultar fechas, materiales disponibles, reservante y comité o macroevento. Revisar el aviso del carnet pendiente y completar cuatro pares hexadecimales en Ajustes; por ejemplo, `AA BB CC DD`.
2. **VP:** abrir Gestión de inventario. Crear un material por cantidades y otro por unidades; indicar ubicación y caja. Abrir e imprimir las etiquetas de barras. Probar el alta y retiro de Logística, y habilitar o revocar su permiso para reservar. El General y los demás cargos se conservan.
3. **Dirección logística:** reservar un material disponible, con inicio futuro y devolución posterior. En un comité se puede indicar una persona delegada del mismo comité; en un macroevento recoge quien reservó. Comprobar nombre y frente en el calendario, y que la cantidad reservada deje de ofrecerse durante ese horario.
4. **CML:** entrar a Entradas y salidas una vez iniciado el horario de la reserva. Seleccionar el préstamo y escanear los códigos impresos, o escribirlos manualmente. Revisar material, ubicación, caja y cantidades antes de confirmar. Escanear varias veces el mismo código no confirma otra salida.
5. **Devolución:** devolver parte de los materiales y registrar daño con una nota. Comprobar que lo pendiente siga afuera y lo dañado quede en cuarentena. La demostración ya incluye un préstamo devuelto y otro parcial con novedad.
6. **VP:** registrar la gestión de la novedad. Remitirla para revisión y comprobar, con la cuenta ADMIN, que aparece una sola tarea enlazada a la incidencia y Persona 360. Remitir no impone un llamado de atención.

## Comprobaciones en el lugar

- [ ] Leer etiquetas impresas con Android y con Safari de iPhone, con iluminación y distancias de uso normales.
- [ ] Comprobar el tamaño de impresión, enfoque y legibilidad del texto del implemento.
- [ ] Rechazar el permiso de cámara y usar el código manual.
- [ ] Interrumpir la conexión antes de confirmar y comprobar que se conservan las cantidades y notas para reintentar.
- [ ] Revisar en celular el calendario, la agenda y las filas de códigos largos, en temas claro y oscuro.

Registrar los ajustes de la VP en el PR borrador. Al terminar la ventana de revisión, se restaura la imagen y conexión habituales de staging y se retira la base temporal, según ADR-150.
