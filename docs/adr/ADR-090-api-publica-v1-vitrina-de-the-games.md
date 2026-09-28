# ADR-090: API pública v1: la vitrina de The Games para DÍAS

- Estado: Aceptada (enmendada por ADR-095 y ADR-096); implementación en curso
- Fecha: 2026-09-23
- Relacionadas: ADR-014, ADR-020, ADR-021, ADR-080, ADR-085, ADR-089, ADR-091
- Enmienda: ADR-085 (regla 5 y «Orden de trabajo»: la primera porción de la API llega antes del monorepo, como piloto de DÍAS)

## Contexto

La OE quiere que la tabla de The Games, la rotación en curso y los anuncios se vean en vivo en `dias.oeeafit.com`, el frontend estático de DÍAS (D-001 de `dias`), que es el piloto de ADR-085. La API que describe esa ADR no existe: la casa no expone ninguna lectura a otro origen, no tiene CORS y su orden de trabajo pone el monorepo antes de las capacidades. The Games empieza el 2026-10-01 y no da tiempo de montar el monorepo antes.

Lo que la vitrina necesita es poco y todo es público: posiciones, enfrentamientos, reloj, anuncios y un resumen de las apuestas. Nada exige sesión ni datos personales.

## Decisión

1. **La primera porción de la API es una lectura pública.** `GET /api/v1/the-games/<slug>` responde un JSON versionado (`version: 1`) con:
   - `serverNow`;
   - la competencia: slug, nombre, estado, si es de ensayo y las jornadas;
   - las posiciones: general, jornada 1 y jornada 2;
   - la rotación en curso y la siguiente, con sus enfrentamientos (base con nombre, tipo y lugar; equipos con número, nombre y color; estado y desenlace);
   - los anuncios activos;
   - las apuestas públicas: título, estado, cierre, opciones, bolsa y ganador.

   El esquema es Zod y vive en el dominio de `competition`. La ruta valida su propia respuesta antes de enviarla. Una competencia en `DRAFT`, o que no existe, responde 404 en JSON.
2. **Sin datos personales ni sesión.** El JSON no lleva correos, nombres de personas, ids de persona ni respuestas de formulario, y una prueba lo verifica. La ruta no lee cookies y no está en las rutas protegidas del proxy.
3. **Caché corta.** `Cache-Control: public, max-age=5, s-maxage=5, stale-while-revalidate=30`; un 404 se cachea 30 segundos y un error no se cachea. El proceso guarda en memoria el último resultado durante 3 segundos y comparte la consulta en curso entre peticiones simultáneas, de modo que 500 pantallas sondeando cada 12 segundos cuestan una consulta cada 3. `serverNow` se estampa en cada respuesta, para que el reloj del cliente no dependa de su hora.
4. **CORS con origen fijo.** Los orígenes permitidos salen de `PUBLIC_API_ORIGINS`, validada en `src/env.ts`. En producción es un solo origen, `https://dias.oeeafit.com`, y `Access-Control-Allow-Origin` lo devuelve siempre fijo, porque Cloudflare cachea sin respetar `Vary: Origin`. Con varios orígenes (staging y local) se devuelve el que coincida y `Vary: Origin`. Solo se permiten `GET` y `OPTIONS`, sin credenciales. La función vive en `src/shared/lib/cors.ts` y no conoce módulos.
5. **Sin límite por IP.** El campus sale por NAT: un límite por IP castigaría a todos los que miran desde la universidad. La carga la absorbe la regla 3. Si hace falta, se pone una Cache Rule o un límite en Cloudflare, documentado en el runbook.
6. **Cliente copiado y temporal.** Mientras no exista `packages/` (ADR-085 regla 4), `dias` copia el tipo de la respuesta y lo verifica con una guarda escrita a mano, sin Zod, para cuidar su presupuesto de peso. Un cambio incompatible sube `version`, y `dias` rechaza una versión que no conoce.
7. **Enmienda al orden de ADR-085.** Esta lectura pública se adelanta al monorepo porque la fecha la fija el evento. No cambia las demás reglas: la API sigue siendo del backend, las escrituras siguen dentro de `/admin` y la autenticación entre aplicaciones sigue pendiente. Queda decidido el estilo de esta porción, REST de solo lectura bajo `/api/v1/`. La forma de las escrituras la define su propia ADR.

## Consecuencias

- `dias` abre su `connect-src` a `https://oeeafit.com` (D-037 de `dias`). La CSP de la casa no cambia, porque la ruta responde JSON.
- `PUBLIC_API_ORIGINS` se declara en la infraestructura como código y **se carga antes de promover** a producción.
- El smoke suma una petición a un slug inexistente: debe responder 404 en JSON con el `Access-Control-Allow-Origin` esperado.
- Un backend caído deja a la vitrina con lo último que recibió. `dias` lo dice en pantalla y no inventa datos.

## Verificación requerida

- **Unitarias:** el esquema y la ausencia de datos personales; `cors` con uno y con varios orígenes; `env`; la ruta (200, 404, OPTIONS y encabezados); el proxy deja pasar `/api/v1`.
- **E2E:** la respuesta con CORS desde el origen de `dias` en local.

## Enmienda (2026-09-28, ADR-095)

Regla 2: la vitrina puede llevar los nombres de los capitanes de cada equipo, en `captains: [{ number, names }]`, solo cuando el ADMIN prende la publicación de la competencia. Mateo confirmó que la inscripción autorizó publicarlos. Apagada, lleva `captains: []`. Sigue sin llevar correos, celulares, ids de persona ni respuestas de formulario, y una prueba lo verifica. Es un campo nuevo, así que la vitrina sigue en `version: 1`. Ver [ADR-095](ADR-095-capitanes-de-the-games-desde-la-hoja-de-la-oe.md).

## Enmienda (2026-09-28, ADR-096)

Regla 7: la primera escritura de la API v1 es el hub de capitanes, en `/api/v1/the-games/hub`. Sirve para entrar con el código del equipo, apostar y salir. La autoriza una sesión firmada del equipo, no una cuenta ni la sesión de una persona. Usa CORS con credenciales solo para el origen de DÍAS, y las escrituras desde otro origen responden 403. La vitrina no cambia: sigue sin credenciales. Ver [ADR-096](ADR-096-hub-de-apuestas-de-los-capitanes.md).
