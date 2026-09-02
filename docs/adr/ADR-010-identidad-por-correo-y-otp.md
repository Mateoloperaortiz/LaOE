# ADR-010: Identidad por correo del roster con OTP

- Estado: Aceptada
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
