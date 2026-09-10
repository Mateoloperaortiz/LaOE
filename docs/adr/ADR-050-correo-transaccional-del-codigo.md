# ADR-050: Forma del correo transaccional del código de acceso

- Estado: Aceptada (enmendada por ADR-051)
- Fecha: 2026-09-10
- Relacionadas: ADR-010, ADR-012, ADR-014, ADR-023, ADR-038

## Contexto

Desde la publicación del dominio y la carga del roster, ninguna persona del roster recibió su código para entrar. El diagnóstico descartó la aplicación y al proveedor: no hay un solo fallo de envío en los logs de producción, y una prueba independiente del 10 de septiembre de 2026 califica el mensaje con 9,1/10, con SPF, DKIM y DMARC en `pass` y la IP de origen en lista blanca. El bloqueo ocurre en la capa de correo de EAFIT: su reporte de cuarentena del 9 de septiembre muestra los códigos retenidos por **Check Point** (Harmony Email & Collaboration), por encima de Microsoft 365, sin rebote ni carpeta visible para la persona. `oeeafit.com` se registró el 27 de agosto de 2026 y su nombre se parece a `eafit.edu.co`, dos señales que activan sus reglas antisuplantación. La corrección de fondo es una regla de permitidos en esa consola, que solo puede aplicar TI de EAFIT.

Al revisar el mensaje aparecieron además tres defectos propios. El asunto `T-053` incluye el código, que así queda guardado en `message.subject` y legible en `/admin/mensajes` y en el panel del proveedor: cualquiera con acceso a esa tabla puede entrar como cualquier persona. El pie `T-208` habla de recibir el correo «porque estás en el roster de la OE», lenguaje de correo masivo dentro de un mensaje transaccional. Y el cuerpo se arma como dos párrafos sueltos, sin el envoltorio con el que sale el resto de los correos.

## Decisión

1. **El asunto no lleva el código.** `T-053` pasa a nombrar el mensaje sin revelar el secreto. El código vive solo en el cuerpo, que no se guarda.
2. **El correo del código usa el envoltorio común** (`wrapEmail` de ADR-038) con un pie transaccional propio, `T-2092`, sin lenguaje de lista de correo ni enlace de baja. El pie legal `T-208` queda reservado para las campañas.
3. **El mensaje declara que es automático** con las cabeceras `Auto-Submitted: auto-generated` y `X-Auto-Response-Suppress: All`, por el campo `headers` que los dos transportes ya reenvían.
4. **El camino feliz de `requestOtp` deja rastro**: se registra persona, transporte e identificador del proveedor, y **nunca el código**. Sin esto no se puede responder si a una persona se le intentó enviar algo.

## Consecuencias

Enmienda a ADR-023 en la forma del correo transaccional y a ADR-010 en el contenido del asunto. No cambia el flujo de acceso, ni los límites por correo e IP, ni el esquema: `message` sigue guardando asunto, proveedor y estado, pero el asunto deja de ser un secreto.

Estas correcciones bajan las señales que empujan el mensaje a *bulk* y cierran la fuga, pero **no reemplazan la entrada de permitidos**: el bloqueo del tenant se resuelve con TI de EAFIT. Los códigos ya guardados en `message.subject` vencen a los diez minutos, así que no requieren corrección retroactiva.

El despliegue tiene una condición de orden: mientras el correo no llegue, leer el código del asunto es la única forma de completar el step-up en producción, así que este cambio se promueve **después** de comprobar un ingreso real con código recibido.

## Enmienda (2026-09-10, ADR-051)

La condición de orden del cierre queda resuelta por otro camino. [ADR-051](ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md) da a la administración un step-up que no depende del correo, así que leer el código del asunto deja de ser la única forma de completarlo: este cambio se promueve cuando exista una contraseña de ADMIN en producción, sin esperar a que un código llegue al buzón. Lo demás de esta decisión sigue vigente, incluida la regla de permitidos con TI de EAFIT, que es lo único que devuelve la utilidad del OTP.
