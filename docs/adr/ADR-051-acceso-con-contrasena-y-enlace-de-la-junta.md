# ADR-051: Acceso con contraseña propia y enlace de un solo uso de la junta

- Estado: Aceptada
- Fecha: 2026-09-10
- Enmienda: ADR-010, ADR-011, ADR-014 (seguridad), ADR-050
- Relacionadas: ADR-012, ADR-023, ADR-034, ADR-038, ADR-047, ADR-048

## Contexto

Producción está viva con 453 personas cargadas desde el 9 de septiembre y ninguna puede entrar. [ADR-050](ADR-050-correo-transaccional-del-codigo.md) ya descartó la aplicación, el proveedor y la autenticación del dominio: los códigos quedan retenidos en la cuarentena de Check Point (Harmony Email & Collaboration), por encima del Microsoft 365 de EAFIT, sin rebote ni carpeta visible para la persona. La regla de permitidos que lo arregla de fondo solo la puede aplicar TI de EAFIT y no depende de la OE.

El daño no se limita al ingreso. El step-up de la administración también pide un OTP, y hoy solo funciona porque producción corre `7f95c8b`, donde el código todavía viaja en el asunto y se lee desde `/admin/mensajes`. Promover ADR-050 sin otro camino deja la administración sin step-up.

ADR-010 apostó todo a un solo canal: "el buzón, protegido por Microsoft 365 y su MFA, es la credencial". La apuesta era razonable y resultó frágil por una razón que la OE no controla. Lo que se corrige acá no es el proveedor de correo: es la dependencia de un canal único.

## Decisión

1. **La credencial es una contraseña propia.** Se entra a Mi OE con el correo institucional del roster y una contraseña que la persona elige y guarda. La contraseña se almacena solo como hash `scrypt` de `node:crypto`, en el formato `scrypt$N$r$p$<sal>$<hash>` para poder subir parámetros después sin migración. No se guarda en claro, no se registra en logs y no viaja por correo nunca.
2. **El OTP se conserva como método alterno**, sin cambios en sus reglas ni en sus límites. Vive en `/ingresar/codigo` y `/ingresar` lo ofrece como segundo camino. El día que TI aplique la regla de permitidos vuelve a ser útil sin trabajo adicional; mientras tanto no bloquea a nadie.
3. **La primera credencial y la recuperación llegan por un enlace de un solo uso que emite la junta**, fuera del correo: por WhatsApp, en persona o escaneando un QR en una asamblea o reunión de comité. El enlace vive **60 minutos**, sirve una sola vez y en base se guarda únicamente su SHA-256; el token en claro existe solo en la URL y en la pantalla de quien lo emite.
4. **Emiten ADMIN y BOARD**, con step-up, sobre una persona con membresía elegible. Nadie emite para sí mismo: para eso está cambiar la contraseña desde Ajustes. Emitir consume los enlaces vivos anteriores de esa persona, de modo que hay **un solo enlace vivo por persona**.
5. **Usar el enlace hace todo en una transacción:** fija la contraseña, consume el enlace con su IP, cierra las sesiones anteriores de la persona y abre la nueva. Las sesiones se **borran** con el `destroySessionsFor` que `identity` ya tiene, no se invalidan con la marca `person.sessionsRevokedAt` de ADR-034: ver la corrección más abajo. El destino después de entrar lo sigue decidiendo el guard de ADR-048.
6. **Modo activación secuencial.** Para las jornadas presenciales, la administración muestra **un QR vivo a la vez**: se elige comité, se elige persona, se muestra el QR, la persona lo escanea y se pasa a la siguiente. No hay hoja imprimible con varios enlaces: sería una pila de secretos sueltos con 60 minutos de vida cada uno.
7. **El step-up deja de depender del correo.** Las acciones sensibles piden la contraseña del actor y, al verificarla, estampan la misma marca de sesión que estampaba el OTP. La columna `session.otpVerifiedAt` conserva su nombre —renombrarla costaría una migración y tocaría demasiados sitios—; a partir de acá la estampa también una contraseña. El código al correo sigue disponible como alternativa.
8. **Ajustes crea y cambia la contraseña.** Cambiarla pide la actual y cierra las demás sesiones. **Cuando la persona todavía no tiene contraseña, la misma pantalla crea la primera pidiendo step-up en lugar de la contraseña actual**: ese es el camino de arranque de quien alcance a entrar por OTP, y el primero que se usa en producción.
9. **Los límites se cuentan en Postgres**, como los del OTP: 10 intentos fallidos por correo y 30 por IP en la misma ventana de 15 minutos, en una tabla propia `login_attempt`. Va en tabla propia y no en columnas de la credencial porque el límite tiene que funcionar también para correos que no existen.
10. **La respuesta nunca enumera el roster.** Correo que no existe, persona sin contraseña y contraseña equivocada devuelven el mismo mensaje. Cuando no hay credencial se corre igual un `scrypt` de descarte, para que el tiempo de respuesta tampoco distinga.
11. **Reglas de contraseña sin composición forzada** (NIST 800-63B): mínimo 10 caracteres, sin exigir mayúsculas ni símbolos y sin rotación obligatoria. Se rechazan las contraseñas de una lista corta versionada en el repositorio y las que contengan el correo o el nombre de la persona.
12. **Parámetros de `scrypt`: `N = 2^15`, `r = 8`, `p = 1`, `keylen = 32`, `maxmem` 64 MiB.** Es un punto medio deliberado entre la guía de OWASP, que pide más, y un contenedor de Railway que además atiende requests: `N = 2^17` reserva más de 128 MiB por hash y convierte el ingreso en un vector de agotamiento de memoria. Se revisa si el plan del contenedor cambia.
13. **La bienvenida deja de ser exclusiva del correo.** T-200 se muestra en la pantalla de activación, que es el primer contacto real de quien entra; el correo se conserva como mejor esfuerzo. T-202 y T-205 ya salían por push (ADR-038), así que no cambian.
14. **El enlace no se guarda ni se manda.** No pasa por `message`, no queda en `access_grant` en claro, no aparece en logs ni en exportes. Cada emisión y cada uso quedan auditados con quién emitió, para quién y cuándo.

15. **Salir de la OE retira la credencial.** La baja y la anonimización borran la contraseña y los enlaces de esa persona, junto a lo que ya borraban (carnet, sesiones, permisos). Un hash de contraseña no es historia institucional y la anonimización existe para no dejar datos personales atrás (ADR-014, ADR-030). La licencia no lo toca: esa persona vuelve.

## Consecuencias

- Enmienda a **ADR-010**: el buzón institucional deja de ser la credencial y pasa a ser un identificador. El consecuente "no se guardan contraseñas" deja de valer.
- Enmienda a **ADR-011**: el step-up ya no equivale a "un OTP verificado hace menos de 15 minutos", sino a "una credencial propia verificada hace menos de 15 minutos". La ventana, los guards y las acciones que lo exigen no cambian.
- Enmienda a **ADR-050**: su condición de orden se resuelve acá. El código puede salir del asunto en cuanto exista un step-up que no dependa del correo.
- La OE gana una clase de secreto que hoy no tiene. A cambio deja de depender de un canal que no controla.
- El texto publicado de la política dice hoy que se entra "con un código de un solo uso enviado a tu correo institucional; no hay contraseñas que se puedan filtrar". **Esa frase queda falsa el día que las contraseñas lleguen a producción.** Corregirla exige un texto nuevo y una versión nueva, y la versión es la fecha en que la junta aprueba (ADR-047, punto 2), así que **la junta tiene que aprobar el texto antes de que esto se promueva**. Subir la versión no obliga a nadie a volver a autorizar (ADR-047, punto 5), de modo que el costo operativo es bajo, pero el paso no se puede saltar ni rellenar.

## Corrección de la regla 5 (2026-09-10, durante la implementación)

La primera redacción decía que usar el enlace revoca las sesiones anteriores estampando `person.sessionsRevokedAt`, como hace ADR-034, y que para eso `people` expondría el comando que tenía privado. **Eso no funciona.** La marca se escribe con `now()`, que dentro de una transacción es el instante en que la transacción empezó, y el `createdAt` de la sesión nueva toma ese mismo valor por defecto. `resolveActor` rechaza toda sesión cuyo `createdAt` sea **menor o igual** que la marca, así que la sesión recién creada quedaría invalidada en el acto: la persona elegiría su contraseña y saldría expulsada de inmediato.

El camino correcto es más simple y no cruza fronteras de módulo: acá quien ejecuta es `identity`, dueño de la tabla `session`, así que borra las filas con el `destroySessionsFor` que ya existe. La marca de ADR-034 sigue siendo la respuesta cuando quien corta el acceso es `people`, que no puede llamar a `identity`; acá no hace falta.

## Amenaza aceptada

**Quien emite el enlace lo ve, así que puede entrar como esa persona.** Es inherente a que la recuperación la haga un humano por fuera del sistema, y no se elimina: se acota. Un solo uso, 60 minutos, un enlace vivo por persona, auditoría con el emisor, revocación de las sesiones anteriores al usarlo y aviso por push a la persona. Queda registrada en [05-acceso.md](../05-acceso.md) junto a las demás.

La verificación de identidad previa a emitir la hace la junta por fuera del sistema y el código no puede validarla. El procedimiento va al runbook: en persona o por un canal ya conocido de esa persona, **nunca a partir de un mensaje entrante que pida el enlace**, que es exactamente la forma que toma la ingeniería social por WhatsApp.

## Lo que no entra

- **Passkeys.** Siguen siendo la mejora posterior que ADR-010 anotó y que `00-vision.md` tiene en el backlog. Suman una dependencia y una superficie de pruebas nueva, y no resuelven ni el arranque ni el dispositivo perdido.
- **El correo personal como canal de acceso.** `person.personalEmail` sigue siendo contacto y nunca identidad, como dice [13-importacion-del-roster.md](../13-importacion-del-roster.md).
- **El formulario público de activación.** Abriría una ruta pública de escritura más y trasladaría a la junta 453 aprobaciones en vez de 453 entregas.
- **Entrar en un dispositivo nuevo con un código mostrado en otro que ya tiene sesión.** Es la exclusión que más duele: reusaría la maquinaria HMAC del carnet y evitaría buena parte de las recuperaciones. Se revisa después de la primera jornada de activación, cuando se sepa cuántas recuperaciones llegan de verdad en vez de estimarlas.
- **WhatsApp Business API y SMS.** La primera está fuera de alcance desde `00-vision.md`; la segunda no cabe en el presupuesto de US$20 al mes.

## Frente a GHPOINTS

GHPOINTS llegó a tener tres canales de login (Clerk, OTP, Entra) y ADR-010 nació para evitar esa dispersión. Acá quedan dos —contraseña y OTP— y no es una recaída: el segundo existe porque el primero no cubre el caso de quien pierde el acceso a su dispositivo, y ninguno de los dos es un proveedor de identidad externo. La sesión sigue siendo una sola, opaca y en servidor.
