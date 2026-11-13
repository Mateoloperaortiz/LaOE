# ADR-191: El inventario entra al rediseño

- Estado: Propuesta
- Fecha: 2026-11-13
- Enmienda: [ADR-150](ADR-150-inventario-reservas-y-operacion-logistica.md) (las pantallas y la salida), [ADR-168](ADR-168-el-modo-de-campo-de-la-operacion.md) regla 6 (entregar y recibir inventario) y [ADR-169](ADR-169-calendario-panoramas-y-ficha-de-la-persona.md) regla 1 (la capa de reservas)
- Relacionadas: ADR-058, ADR-151, ADR-159, ADR-160, ADR-164, ADR-166, ADR-167, ADR-182, ADR-192

## Contexto

El inventario de la VP administrativa ([ADR-150](ADR-150-inventario-reservas-y-operacion-logistica.md)) se construyó y probó el 2026-10-29 en `feat/inventario-vp-administrativa`, con el PR 392 en borrador. Cubre lo que pidió la VP: el carnet en la base con un formato fijo, los cargos de Logística que ella maneja, el inventario para toda la OE con reservas solo para direcciones logísticas habilitadas, el calendario con quién reservó, la sección del CML con lector de códigos y las novedades con su gestión.

Mientras tanto, [ADR-164](ADR-164-el-rediseno-sale-de-una-vez.md) decidió que el rediseño sale de una vez desde `feat/rediseno`, y el rediseño le dejó un lugar al inventario: la capa de reservas del Calendario ([ADR-169](ADR-169-calendario-panoramas-y-ficha-de-la-persona.md) regla 1), entregar y recibir en el modo de campo ([ADR-168](ADR-168-el-modo-de-campo-de-la-operacion.md) regla 6) y el registro sin señal ([ADR-182](ADR-182-registro-sin-senal.md)).

La rama del inventario no se puede mezclar tal como está. Su PR está en conflicto, su base es del 29 de octubre, lleva encima tres commits que no son del inventario y que ya llegaron a `main` por sus propios PR, y sus cuatro pantallas son del diseño anterior.

## Decisión

1. **El inventario sale con el rediseño.** Entra a `feat/rediseno` y sale con todo lo demás. No se mezcla su rama: se porta por tramos.
   - I0: mezclar `main` y escribir esta ADR.
   - I1: dominio, datos y pruebas.
   - I2: el carnet.
   - I3: la Operación de la VP.
   - I4: el Calendario.
   - I5: Mi OE.
   - I6: el modo de campo del CML.
   - I7: los avisos.
   - I8: la revisión y la salida.
2. **El dominio no cambia.** Se conservan el módulo `inventory`, el carnet en `person` y las ocho reglas de ADR-150, con sus pruebas. La migración se genera de nuevo con el número que le toca después de las del rediseño.
3. **La Operación de la VP.** `/admin/inventario` usa los patrones de escritorio ([ADR-167](ADR-167-patrones-de-escritorio-de-la-operacion.md)):
   - la tabla de trabajo con vista dividida para los implementos, sus unidades, su ubicación y su caja;
   - los permisos para reservar, como acción sobre la lista de direcciones logísticas;
   - las novedades abiertas, como un grupo de la Mesa;
   - las etiquetas para imprimir, como hasta ahora.
4. **El Calendario.** Las reservas son una capa de `/admin/calendario`, con quien reservó y su comité o macroevento. `/admin/inventario` suma una línea de tiempo: una fila por implemento y una columna por día, con cada reserva como una barra.
5. **Mi OE.** `/app/inventario` se piensa para el celular:
   - eliges las fechas;
   - ves lo disponible;
   - armas la reserva como un carrito y la confirmas.

   Toda la OE consulta. Reserva solo quien tiene el permiso de la VP. Lo que tienes que recoger o devolver aparece en «Te toca» de Hoy.
6. **El CML entra al modo de campo.** La Operación suma un rol: operar el inventario, para quien tiene pertenencia viva al comité CML (ADR-150 regla 5). Ese rol solo ve el modo de campo y la consola de entregas y devoluciones; no ve el resto de la Operación.

   La consola usa el lector de la casa:
   - la cámara a pantalla completa;
   - lo leído sube en una hoja con el implemento, su ubicación y su caja;
   - lecturas seguidas y código a mano;
   - el borrador se guarda en el teléfono hasta confirmar. Si se cae la señal, la confirmación se reintenta con la misma clave cuando vuelve.

   `/app/cml` deja de existir.
7. **Un solo lector.** Lee el QR del carnet y el Code 128 de las etiquetas. Usa el lector nativo del navegador donde existe y una librería donde no, como en Safari de iPhone.
8. **Los avisos.** Quien reservó recibe un aviso antes de la devolución y otro si se venció, por el centro de avisos ([ADR-166](ADR-166-el-centro-de-avisos-de-mi-oe.md)) y push. Un préstamo vencido aparece también en la Mesa de la VP. Ninguno de los dos avisos sanciona.
9. **Los números.**
   - La ADR-150 conserva el suyo.
   - La ADR-152 de la rama no se trae: ella misma dice que la reemplazó la [ADR-151](ADR-151-repositorio-publico-y-colaboracion-protegida.md), que ya está en `main`.
   - La ADR-153 de la rama pasa a ser la [ADR-192](ADR-192-revision-temporal-de-rama-en-staging.md), porque en `main` la 153 es otra. Sigue rigiendo la revisión que todavía está en staging.
10. **Lo que no entra.** Kits, fotos, tiempo de colchón, pendientes que frenan reservas, conteo de bodega y calendario exportable quedan fuera. Cada una pide su propia decisión con la VP.

## Consecuencias

- **Una sola salida.** El inventario no está en producción hasta que salga el rediseño. Si la VP lo necesita antes, hace falta otra decisión.
- **El PR 392 y su rama se quedan quietos** hasta que el dominio viva en `feat/rediseno`. Cerrarlos es decisión de Mateo.
- **Staging sigue con la revisión de la rama vieja** hasta que se restaure según [ADR-192](ADR-192-revision-temporal-de-rama-en-staging.md) regla 6.
- **La revisión con la VP y la prueba en teléfonos reales** pasan a hacerse sobre `feat/rediseno`, en el tramo I8.
