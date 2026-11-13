# Revisión del inventario con la VP administrativa

El inventario ([ADR-150](adr/ADR-150-inventario-reservas-y-operacion-logistica.md)) entró al rediseño por tramos ([ADR-191](adr/ADR-191-el-inventario-entra-al-rediseno.md)). Esta guía sirve para revisarlo con la VP con datos ficticios, en local o en una revisión temporal de staging ([ADR-192](adr/ADR-192-revision-temporal-de-rama-en-staging.md)).

## Cómo se prepara

- **Datos.** `npm run inventory:review:seed -- --access-file /ruta/privada/accesos.json` siembra cuentas y materiales ficticios. Solo corre contra una base `inventory_review_<identificador>` vacía y ya migrada, nunca contra la habitual de staging ni contra producción. Si la base ya tiene personas, no la toca.
- **En local.** El script no lee el `.env`, para que en staging solo use lo que entrega Railway. En local se corre con `node --conditions=react-server --env-file=.env --import tsx scripts/seed-inventory-review.ts`, con `DATABASE_URL` apuntando a la base de revisión y `APP_URL=http://localhost:<puerto>`. La base se prepara antes con `npm run db:migrate`. En local, el lector usa la cámara del computador, y lo de sin señal se prueba cortando la red del navegador. Un teléfono solo abre la cámara con HTTPS, así que las etiquetas impresas se leen en staging o después de la salida.
- **Cuentas.** Hay una VP, una dirección logística de comité, una persona del CML que también puede recoger como delegada, una dirección de macroevento, un miembro con el carnet pendiente y ADMIN, para revisar las remisiones.
- **Contraseñas.** Se entregan en un archivo privado, fuera del repositorio.
- **Sin envíos reales.** No se mandan invitaciones ni correos a personas reales.

## Recorrido

1. **Miembro.**
   - En «Hoy», «Te toca» pide el UID del carnet; el enlace lleva a Ajustes. Completa cuatro pares hexadecimales, por ejemplo `aa bb cc dd`; quedan en mayúsculas.
   - Desde «Yo», abre Inventario. Cambia las fechas y revisa lo disponible y las reservas de esas fechas, con quién reservó y para qué comité o macroevento.
2. **VP.**
   - Entra a la Operación. Como lidera el grupo del CML, llega primero a ese grupo; «Inventario», en el menú, abre «Administrar inventario».
   - En Materiales, agrega un material por cantidades y otro por unidades, con su ubicación y su caja. Abre uno y ajusta sus existencias.
   - En Etiquetas, imprime las de un material.
   - En Logística, nombra y retira una dirección logística, y habilita o quita su permiso para reservar.
3. **Dirección logística.**
   - En Mi OE, Inventario arma la reserva como un carrito, con botones de más y menos y la barra de abajo con cuánto lleva.
   - En un comité puede elegir a alguien del mismo comité para recoger; en un macroevento recoge quien reservó.
   - La reserva aparece en sus reservas y, cuando falta un día, en «Te toca» de «Hoy».
4. **VP.**
   - En Préstamos, la línea de tiempo muestra la reserva como una barra; al tocarla se abre a la derecha.
   - En la Operación, el Calendario con la capa «Reservas de inventario» la muestra en su día.
5. **CML.**
   - Entra a la Operación: llega al modo de campo, con el bloque «Inventario de hoy».
   - «Entregar» abre la consola. Escanea la etiqueta con la cámara, o escribe el código.
   - La hoja «Última lectura» dice el material, su ubicación y su caja. Escanear de nuevo no suma.
   - Confirma la salida.
6. **Sin señal.**
   - Con el teléfono en modo avión, confirma una entrega: la consola dice que quedó guardada.
   - Al volver la señal, se confirma sola. Recargar la página no borra lo escaneado.
7. **Devolución.**
   - Recibe una parte, marca daño y deja una nota.
   - Lo que falta sigue afuera, lo dañado queda en revisión y la novedad aparece en la Mesa de la VP.
8. **VP.**
   - Desde la Mesa, gestiona la novedad y la remite.
   - Con la cuenta ADMIN, comprueba que hay una sola tarea enlazada a la novedad y a la Persona 360. Remitir no impone un llamado de atención.
9. **Avisos.** Un día antes de la devolución, y otra vez si se vence, quien reservó y quien recoge reciben un aviso en el centro de avisos y por push. El préstamo vencido aparece en la Mesa de la VP.

## Comprobaciones en el lugar

- [ ] Leer etiquetas impresas con Android (Chrome, lector nativo) y con Safari de iPhone (lector de respaldo), con la luz y la distancia de uso normales.
- [ ] Comprobar el tamaño de impresión, el enfoque y que el texto del material se lea.
- [ ] Rechazar el permiso de cámara y usar el código escrito.
- [ ] Confirmar una entrega sin señal y comprobar que sale sola al volver la conexión.
- [ ] Revisar en el celular la consola, el carrito, la línea de tiempo y «Hoy», en tema claro y oscuro.

Los ajustes que pida la VP se anotan en el roadmap. Si la revisión se hace en staging, al terminar la ventana se restaura staging según [ADR-192](adr/ADR-192-revision-temporal-de-rama-en-staging.md) regla 6.
