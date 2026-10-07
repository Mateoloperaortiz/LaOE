# ADR-010: Identidad por correo del roster con OTP

- Estado: Aceptada (enmendada por ADR-034, ADR-039, ADR-050, ADR-051, ADR-113)
- Fecha: 2026-09-02
- Relacionadas: ADR-002, ADR-011, ADR-015

## Contexto

Proyecto personal sin acceso al Entra de EAFIT. `eafit.edu.co` corre en Microsoft 365, así que Google no verifica el dominio. Solo deben entrar personas del roster. GHPOINTS llegó a tener tres canales de login (Clerk, OTP, Entra) y ese es el tipo de dispersión que se quiere evitar.

## Decisión

La identidad es el **correo institucional del roster**. Acceso por OTP de 6 dígitos: hash SHA-256 con secreto del servidor, 10 minutos de vigencia, 5 intentos, rate limit por correo (5 por 15 minutos) e IP (12 por 15 minutos) contando filas en Postgres; el correo se envía en el mismo request; la respuesta nunca enumera el roster. Sesión opaca en servidor: token de 32 bytes, hash en base, cookie HttpOnly `SameSite=Lax` `Secure`, 90 días con "recordar este dispositivo" y renovación al usarse. Sin proveedor de identidad externo. **Step-up:** acciones sensibles de admin (conceder permisos, exportes con datos personales, eliminación de datos) exigen un OTP verificado hace menos de 15 minutos. Passkeys quedan como mejora posterior.

## Consecuencias

- El buzón, protegido por Microsoft 365 y su MFA, es la credencial; no se guardan contraseñas.
- Volumen de correo bajo: unos dos OTP por persona y semestre; el día de evento se cubre con sesiones largas y modo anfitrión.
- Cambiar correo o estado destruye las sesiones en la misma transacción.

## Enmienda (2026-09-03, ADR-034)

`people` no puede llamar a `identity` (habría un ciclo), así que cambiar correo o estado estampa `person.sessionsRevokedAt` en la misma transacción y `resolveActor` rechaza toda sesión creada antes de esa marca; el borrado físico de sesiones y permisos lo hace un handler del outbox segundos después. El efecto es el mismo: ninguna request posterior al commit resuelve un actor. Además, el carnet (`/app/carnet`) es un token `oe1.<personId>.<vencimiento>.<HMAC-SHA256>` firmado con `SESSION_SECRET` y vigente 24 horas. Ver [ADR-034](ADR-034-personas-y-mi-oe-fase-2.md).

## Enmienda (2026-09-06, ADR-039)

El primer acceso real se habilita con el bootstrap privado y auditado de ADR-039: persona con membresía ACTIVE y permiso ADMIN, sin registro abierto ni consentimiento ficticio. El OTP sigue validando el buzón real y exige membresía elegible; el roster de los demás miembros llega luego desde la app. Ver [ADR-039](ADR-039-arranque-limpio-fase-7.md).

## Enmienda (2026-09-10, ADR-050)

El asunto del correo del código deja de incluirlo: guardarlo en `message.subject` lo dejaba legible en la administración y en el panel del proveedor. El código vive solo en el cuerpo, y el envío exitoso se registra con persona, transporte e identificador del proveedor, nunca con el secreto. Ver [ADR-050](ADR-050-correo-transaccional-del-codigo.md).

## Enmienda (2026-09-10, ADR-051)

**El buzón deja de ser la credencial y pasa a ser un identificador.** Check Point retiene los códigos en la cuarentena del tenant de EAFIT, así que la apuesta por un canal único no se sostiene: la credencial pasa a ser una contraseña propia, guardada como hash `scrypt`, y el consecuente "no se guardan contraseñas" deja de valer. El OTP no desaparece —queda como método alterno, con sus mismas reglas y límites— y la primera credencial la entrega la junta con un enlace de un solo uso, fuera del correo. Ver [ADR-051](ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md).

## Enmienda (2026-10-07, ADR-113)

**Pedir un código deja siempre un reto.** «La respuesta nunca enumera el roster» se cumplía al pedir el código y no al verificarlo: sin reto, un correo de afuera respondía «vencido» donde uno del roster respondía «no es, te quedan 4 intentos». Ahora un correo de afuera deja un reto señuelo, con un hash al azar que ningún código cumple y sin envío, que cuenta intentos y gasta límites como uno real. Ver [ADR-113](ADR-113-reglas-de-seguridad-e-integridad.md), regla 2.

**Tope acumulado de códigos equivocados.** Los límites de esta ADR contaban códigos pedidos, no códigos equivocados: repitiendo pedir y probar salían unos 2.400 intentos al día por cuenta. Se suma un tope de 15 códigos equivocados por correo en 24 horas. Al llegar, ese correo no recibe códigos nuevos hasta que la ventana corra, y el código que llega cerca del tope trae solo los intentos que quedan. Los demás límites no cambian, y el paso de seguridad por código queda fuera del tope. Ver [ADR-113](ADR-113-reglas-de-seguridad-e-integridad.md), regla 3.
