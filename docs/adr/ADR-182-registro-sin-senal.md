# ADR-182: El registro sin señal

- Estado: Aceptada (2026-11-13)
- Fecha: 2026-11-13
- Relacionadas: ADR-035 (regla 8, el modo anfitrión), ADR-168, ADR-179

## Contexto

El plan maestro (§5.6 y ola 4) pide un **registro sin señal** para el modo de campo: en un auditorio o en una cancha la red se cae justo cuando llega la gente, y el modo anfitrión (ADR-035 regla 8) necesita la red para mandar cada carnet escaneado. Hoy, sin señal, el lector muestra el error y el anfitrión tiene que volver a escanear después.

## Decisión

1. **Se guarda en el teléfono.** Si el modo anfitrión escanea un carnet sin señal (el navegador dice que está sin conexión o el envío no llega), guarda el carnet en el teléfono (`localStorage`, por ocasión) y lo dice: «quedó guardado y sube solo cuando vuelva la red». El mismo carnet dos veces cuenta una, y la cola no pasa de 300.
2. **Sube solo.** Cuando vuelve la señal, o al abrir de nuevo el modo anfitrión con señal, los carnets guardados suben uno a uno con la misma acción de siempre, que vuelve a leer el carnet y registra con su comando y su auditoría. Lo que el servidor responda, registrado o no, saca al carnet de la cola; si el envío vuelve a fallar, se queda para el siguiente intento.
3. **La hora es la de la casa.** La asistencia queda con la hora en que llega a la casa, no con la del teléfono, que no es confiable. Si la ocasión cerró mientras tanto, la casa lo rechaza como siempre y ADMIN la registra a mano en la ocasión cerrada.
4. **Solo el carnet.** La cola guarda el token del carnet y la hora en que se escaneó, para mostrarla. No guarda nombres ni nada más de la persona, y se borra al subir.

## Consecuencias

- **Sin migración.** Todo vive en el navegador del anfitrión.
- **Limitación.** Si el anfitrión borra los datos del navegador antes de que vuelva la señal, lo guardado se pierde; la pantalla lo cuenta mientras espera, para que nadie se vaya sin subirlo.
- **Pruebas.** Unitarias de la cola (repetidos, tope y lo que no tiene forma). E2E de una cola que sube y se vacía al volver la señal.
