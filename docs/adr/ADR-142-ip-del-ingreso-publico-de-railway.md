# ADR-142: IP del ingreso público de Railway

- Estado: Aceptada
- Fecha: 2026-10-24
- Relacionadas: ADR-014, ADR-039, ADR-082, ADR-113, ADR-114; DT-033

## Contexto

Los límites por IP y la auditoría compartían `ipFromHeaders`, que elegía el primer
valor de `X-Forwarded-For` antes de `X-Real-IP`. Esa posición no es un contrato del
proveedor. La revisión anterior dejó pendiente comprobar si un valor antepuesto
por el cliente sobrevive a Cloudflare y Railway; no se ejecutó esa comprobación.

Las [especificaciones públicas de Railway](https://docs.railway.com/networking/public-networking/specs-and-limits#technical-specifications),
consultadas el 2026-10-24, identifican `X-Real-IP` como la IP remota del cliente.
Esto permite abandonar la elección de un salto de la cadena sin inventar un
número de proxies ni confiar directamente en `CF-Connecting-IP`.

## Decisión

1. El único origen de la IP del request es `X-Real-IP`, recibido por el ingreso
   HTTP público de Railway. Se admite una sola dirección IPv4 o IPv6 válida,
   sin puerto, lista, nombre de host ni identificador de interfaz.
2. Si falta o es inválido, se devuelve `null`. No se usa `X-Forwarded-For`,
   `Forwarded` ni `CF-Connecting-IP` como respaldo. Una cabecera alternativa
   elegida por quien llama no debe recuperar una identidad para los topes.
3. La confianza está en el ingreso, no en el nombre de la cabecera: este contrato
   requiere que el listener de la aplicación solo reciba peticiones públicas a
   través del edge. Un servicio por la red privada o un listener expuesto por TCP
   puede fabricar todas las cabeceras y queda fuera de esta garantía. Cambiar el
   ingreso exige revisar el contrato antes de habilitarlo.
4. Las pruebas de requests simulan `X-Real-IP`. La regresión combina una IP real
   sintética con cadenas y cabeceras alternativas elegidas por el cliente, y
   comprueba también la ausencia y los formatos inválidos.

## Consecuencias

Sin migración, variables nuevas ni cambios en los topes por correo, persona o IP.
La auditoría histórica conserva sus valores. Sin cabecera válida no hay IP y los
controles por persona o correo siguen siendo necesarios; la IP no es identidad.

Se corrige la selección de la cabecera en la aplicación (DT-033). No se afirma
haber reproducido un bypass en el despliegue anterior ni haber medido el ingreso
actual: verificar su configuración y la cabecera efectiva al desplegar sigue
siendo una comprobación operativa pendiente, sin peticiones de prueba desde esta
revisión.
