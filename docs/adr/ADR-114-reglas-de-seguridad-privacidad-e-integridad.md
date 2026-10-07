# ADR-114: Reglas de seguridad, privacidad e integridad del tercer ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-07
- Relacionadas: ADR-010, ADR-082, ADR-109, ADR-113
- Enmienda: ADR-082 (regla 4), ADR-113 (regla 10)

## Contexto

El tercer ciclo del refactor progresivo ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)) es de seguridad, privacidad e integridad. Sus defectos están en el [ledger](../20-deuda-tecnica.md), leídos en el código, y cada uno se reprodujo con una prueba en rojo antes de corregirlo. Esta ADR reúne las reglas que cambian en el ciclo: cada ticket suma la suya.

**Destinos de vuelta (DT-087).** Tres funciones decidían a dónde se vuelve dentro del origen, con tres durezas. `safeNextPath` filtra el destino después del ingreso y del paso de seguridad ([05-acceso.md](../05-acceso.md)) y el `returnTo` del kit del admin: aceptaba una ruta propia y descartaba `/ingresar` y `/api` mirando el prefijo del texto. `safeBack` es la vuelta de una action ([ADR-082](ADR-082-un-kit-para-las-server-actions-y-auditoria-con-ip.md) regla 4): exigía que el texto empezara por su área. `namedScreen` es la pantalla que nombra una descarga ([ADR-113](ADR-113-reglas-de-seguridad-e-integridad.md) regla 10), con una expresión por ruta, y era la única que rechazaba `..`. Las dos primeras decidían sobre el texto y no sobre la ruta que se termina pidiendo: `/app/../api/mis-datos` pasaba el filtro del ingreso y `/admin/../api/mis-datos` el de las actions, igual que sus formas codificadas (`%2e%2e`, `%252e%252e`, `..%2f`), las barras invertidas (`/app\..\api`) y un prefijo codificado (`/%61pi/mis-datos`). La norma de URL resuelve los segmentos de punto, también como `%2e`, y trata la barra invertida como barra: el destino real era una ruta de `/api` del mismo origen. Ni siquiera hacía falta el navegador: `withQuery`, que arma la redirección de una action con `new URL`, convertía la vuelta que `safeBack` dejaba pasar en `/api/mis-datos?guardado=1`.

## Decisión

1. **Una sola regla decide a dónde se vuelve, y decide sobre la ruta que el navegador va a pedir.** `internalPath(destino, área)` (`src/shared/lib/internal-path.ts`) es una función pura que devuelve el destino tal como llegó o `null`; quien llama pone su respaldo. Acepta solo un texto que empieza por `/`, sin espacios ni caracteres de control. Separa la ruta de la búsqueda y del fragmento, le deshace la codificación `%XX` capa por capa (hasta tres; con más no sigue y rechaza) y sobre esa ruta decodificada rechaza las barras invertidas, el `//` inicial y todo segmento `.` o `..`. El área se declara siempre con sus dos lados, sin valor por omisión: `within`, la ruta bajo la que tiene que quedar el destino (`/` es todo el origen), y `outside`, las rutas vedadas. Se exige a la ruta escrita y a la decodificada, así que un prefijo codificado ni entra a un área ni sale de una vedada; un área que no empieza por `/` no deja pasar nada. La búsqueda y el fragmento no se miran: ahí el navegador no resuelve puntos. La usan los tres sitios que deciden una vuelta, sin cambiar de firma:
   - `safeNextPath`, con el área `APP_SCREEN` (todo el origen menos `/ingresar` y `/api`) y su tope de 2.000 caracteres.
   - `safeBack`, con el área que le pasa la action y sin rutas vedadas; conserva encima sus caracteres seguros y su rechazo de `//` en cualquier parte, que son de ADR-082.
   - `namedScreen`, con `APP_SCREEN`, antes de la expresión con la que cada ruta de descarga reconoce sus pantallas.

## Consecuencias

- **Regla 1.** Sin migración, sin textos nuevos y sin cambios en rutas, eventos de dominio ni API pública. Las firmas de `safeNextPath`, `safeBack` y `namedScreen` y todos sus llamadores quedan como estaban.
- Deja de pasar, en el ingreso y en las actions: una ruta con un segmento `.` o `..`, escrito o codificado una o más veces; una barra invertida en cualquier parte de la ruta (antes solo se miraba `/\` al inicio); un `//` inicial codificado (`/%2fotro-sitio`); `/api` o `/ingresar` con el prefijo codificado; un carácter de control, que el navegador recorta antes de resolver; y una ruta con más de tres capas de codificación. En `namedScreen` no cambia nada: sus expresiones ya descartaban todo eso, y la regla común queda como piso para la ruta de descarga que venga.
- Siguen pasando los destinos que la aplicación arma: `/app`, `/admin`, `/a/<id>?c=…`, las pantallas con su búsqueda y la marca `descarga=1`, los fragmentos en el ingreso. Un punto dentro de un segmento (`acta.v2`, `..oculto`, `...`) no es un segmento de punto y pasa; los `..` y los `%2e` de la búsqueda también.
- Se acepta que una ruta con un segmento que sea exactamente `.` o `..` no puede ser destino, y que una con segmentos codificados más de tres veces tampoco: la aplicación no tiene ninguna.
- La decodificación es byte a byte y solo sirve para decidir: nunca se devuelve. Lo que se busca es ASCII, y un `%` suelto o mal formado se deja como está para que no esconda la capa de adentro (`/app/%252e%252e/100%25` se rechaza).
- No se averiguó si el enrutador decodifica `/%61pi/…` hasta `/api/…`: la regla falla cerrado y no depende de eso.
- Siguen siendo tres funciones, porque cada una pone lo suyo (el tope del ingreso, los caracteres de la action, la expresión de cada descarga), pero la decisión sobre la ruta vive en un solo lugar.
- Que la norma de URL resuelve esos destinos a `/api/mis-datos` se ejecutó con el `URL` de Node, que la implementa, y con `withQuery`; no se ejecutó en un navegador.
- Pruebas de la regla 1: `tests/unit/internal-path.test.ts` (24 destinos hostiles del ingreso y 13 vueltas hostiles de una action, que antes pasaban; los destinos que la aplicación arma hoy; que todo lo que pasa es lo que la norma de URL pide y nunca `/api` ni `/ingresar`; la redirección de la action con `withQuery`; `namedScreen` con una expresión que reconoce de más; las capas de codificación, el área escrita y decodificada, y el área mal declarada). Siguen en verde `tests/unit/identity-pure.test.ts`, `tests/unit/app-lib.test.ts`, `tests/unit/download-redirects.test.ts` y las de los dos pases de billetera.
