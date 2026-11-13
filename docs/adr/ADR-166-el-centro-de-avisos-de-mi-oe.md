# ADR-166: El centro de avisos de Mi OE

- Estado: Aceptada el 2026-11-12
- Fecha: 2026-11-12
- Enmienda: [ADR-160](ADR-160-la-navegacion-de-mi-oe.md) (regla 3, «Persistencia»)
- Relacionadas: ADR-038, ADR-047, ADR-074, ADR-115, ADR-164

## Contexto

ADR-160 regla 3 pidió un centro de avisos en Mi OE: la campana de «Hoy» abre los avisos que llegaron por push o por correo, con leído y no leído y filtros por tipo. Dejó para una ADR propia qué se guarda y cuánto tiempo, porque guardar los avisos de cada persona es un dato nuevo y cae bajo la política de datos ([ADR-047](ADR-047-politica-de-datos-y-habilitacion.md)).

Hoy todo push sale por un solo camino, el bus de notificaciones (`notification.requested`, ADR-038), que `comms` entrega con `deliverNotification`. Por ahí pasan también los «momentos de la casa»: los puntos de una asistencia aprobada, el reto aprobado o rechazado y la insignia nueva. Las campañas salen por correo, una por persona, en `processCampaignBatch`. La tabla `message` deja constancia de cada envío, pero solo con el asunto: el texto no queda en ninguna parte y la persona no tiene dónde volver a leerlo.

El 2026-11-12 Mateo decidió:
- guardar cada aviso 90 días, leído o no;
- que entren los push, los correos de campañas y los momentos de la casa;
- que los códigos y enlaces de acceso nunca entren.

## Decisión

1. **Un aviso del centro** es una fila de `inbox_item`, en el módulo `comms`, que es dueño de todo lo que se le envía a una persona. Guarda:
   - la persona;
   - el tipo, con los mismos valores de `message_kind`;
   - el título y el texto, tal como salieron;
   - el enlace dentro de la casa, si lo tiene: el general del pedido, nunca el propio de cada persona, porque el de una encuesta lleva su token y la casa solo lo guarda cifrado;
   - cuándo llegó y cuándo se leyó.

   Una persona tiene un solo aviso por clave de deduplicación, la misma del envío (ADR-038 regla 2, ADR-115 regla 2), así que volver a entregar un pedido no duplica nada.
2. **Qué entra.**
   - **Lo del bus de notificaciones**, para cada persona, al entregarlo. Entra aunque la persona haya apagado ese push o no tenga ningún dispositivo: el centro es justamente donde lo lee igual.
   - **Las campañas**, para cada persona a la que se le envió el correo, con su asunto y su texto.
   - **Nunca un código ni un enlace de acceso.** Los códigos de entrada salen por `sendTransactionalEmail` y no pasan por aquí. El aviso de que se emitió un enlace de acceso sí va por el bus, así que su pedido lleva `inbox: false` y no entra. Todo pedido del bus entra salvo que diga lo contrario, también los transaccionales, como una solicitud respondida.
3. **Cuánto dura.** 90 días desde que llegó, leído o no. El trabajo diario de limpieza de las 3:00 borra lo vencido.
4. **Leído y no leído.**
   - Un aviso queda leído cuando la persona lo abre.
   - El centro tiene «Marcar todo como leído».
   - Nada más lo marca: ni que el push llegue ni que se abra el correo.
5. **Dónde se ve.**
   - La campana de «Hoy», con el número de no leídos.
   - `/app/avisos`, del más nuevo al más viejo, con filtros por tipo: Cartelera, Recordatorios (también las encuestas), Juegos, Puntos y logros, Trámites (lo transaccional, como una solicitud respondida) y Campañas.
6. **Preferencias.** Siguen en Ajustes ([ADR-074](ADR-074-aviso-diario-del-wordle.md)) y deciden solo si sale el push o el correo. Apagar un tipo no saca sus avisos del centro.
7. **Datos de la persona.**
   - Los avisos salen en «Mis datos».
   - Se borran al anonimizar a la persona, junto con sus mensajes.
   - Solo los ve la persona: ninguna pantalla de la Operación los muestra.

## Consecuencias

- **Migración.** Es aditiva: una tabla nueva. `message` no cambia.
- **Política de datos.** La próxima versión de la política ([ADR-047](ADR-047-politica-de-datos-y-habilitacion.md)) tiene que nombrar los avisos de Mi OE y sus 90 días; queda en [11-contenido-pendiente](../11-contenido-pendiente.md), porque su texto lo aprueba la junta.
- **Pruebas.** Integración del bus y de la campaña, que escriben el aviso una sola vez, con el enlace de acceso fuera. También de la limpieza a los 90 días y del borrado al anonimizar. E2E del centro: la campana, el filtro y leído.
