# ADR-123: Reglas de verificación y corrección del undécimo ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-11
- Relacionadas: ADR-053, ADR-054, ADR-077, ADR-109, ADR-121, ADR-122

## Contexto

El undécimo ciclo del refactor progresivo ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)) toma la cola de filas diferidas del ledger que no esperan nada, ni una decisión del dueño, ni una mirada a producción, ni mezclar la pila, y el arreglo de fondo de una regresión de las herramientas (spec [#286](https://github.com/Mateoloperaortiz/LaOE/issues/286)). Esta ADR reúne las reglas que cambian en el ciclo: cada ticket suma la suya.

**La E2E completa en local fallaba en frío (DT-338).** En local `npm run test:e2e` levantaba `next dev`, que compila cada ruta la primera vez que se visita y guarda lo compilado en `.next/dev`. Una corrida completa sin nada guardado, como la primera de un worktree, se atascaba hacia su minuto 8 y lo que caía ahí se quedaba sin tiempo: en el ciclo 10 fueron dos pruebas del Sudoku, y en los ciclos 8 y 9 la ventana había caído sobre la de The Games. La fila trae cinco corridas medidas y tres remedios que no alcanzaron, cada uno con su corrida completa en frío: 15 s de espera por comprobación, 8 GB de memoria para el servidor y las dos cosas juntas. Contra el build, la misma suite pasaba entera. El ciclo 10 lo aceptó y movió la E2E del cierre al build que deja `npm run check`, con `CI=true`; el comando sin más seguía fallando en un worktree nuevo.

El lanzador (`scripts/test-e2e.ts`) no decidía nada: `playwright.config.ts` elegía `npm run start` si había `CI` y `npm run dev` si no. Compilar quedaba a cargo de quien corría, que además tenía que acordarse de hacerlo con el origen del puerto de la corrida.

## Decisión

1. **Sin filtro, la E2E local corre contra el build; con filtro, contra dev.** `planE2eServer(env, args)` (`tests/e2e/server-mode.ts`) es una función pura que decide el servidor de una corrida y si el lanzador compila antes:
   - **En el CI, el build, sin compilar.** Lo compiló su paso «Build de producción para e2e». Vale también para `CI=true` en local, que sigue usando el build que ya esté.
   - **En local, sin filtro de archivos ni de nombre, el build, y el lanzador lo compila.** Es lo que prueba el CI.
   - **En local, con filtro, dev, sin compilar nada.** Filtro es `E2E_FILES`, un archivo posicional, `--grep` o `-g`. Dev sirve para iterar sobre unas pocas rutas sin esperar un build, y una corrida parcial no llega a atascarlo.
   - **`E2E_SERVER=build` o `E2E_SERVER=dev` fuerza cualquiera de los dos.** Vacía equivale a no escrita. Otro valor se rechaza antes de preparar nada.

   Lo demás que recorta una corrida (`--grep-invert`, `--last-failed`, `--shard`, `--project`) no cuenta como filtro: puede dejarla casi entera, y equivocarse hacia el build solo cuesta compilar. Para saber si un argumento es un archivo, la función conoce las opciones de `playwright test` que se llevan el argumento siguiente; su prueba la compara con el `--help` del Playwright instalado, así que una opción nueva con valor la pone en rojo en vez de mandar una corrida completa a dev.

   **El lanzador compila con el entorno de la corrida.** Corre `npm run build`, el mismo comando del CI, después de crear y sembrar la base desechable y antes de lanzar Playwright, con `e2eBuildEnvironment`: el entorno sintético de `createE2eEnvironment`, con su mismo `APP_URL`, más lo que fija el paso del CI, `NODE_ENV=production` y `OTP_FIXED_CODE` vacío. Vacío y no ausente, porque Next lee el `.env` al compilar y no pisa una variable que ya viene escrita. El `MAILER` va escrito por el entorno sintético, que es lo que [ADR-121](ADR-121-reglas-de-estructura-y-pruebas-del-noveno-ciclo.md) regla 9 pide con `NODE_ENV=production`. Si el build falla, la corrida falla con la salida del build a la vista, sin lanzar Playwright, y la base desechable se elimina igual.

   **Playwright no vuelve a decidir.** El lanzador deja el servidor escrito en `E2E_SERVER` y `playwright.config.ts` lo lee con `decidedE2eServer`: levanta `npm run start` o `npm run dev` según lo que diga, y sin esa marca no elige ninguno. `reporter` y `forbidOnly` siguen dependiendo de `CI`.

   **El OTP fijo sigue siendo solo del proceso de pruebas.** El build no lo recibe; lo admite el servidor que levanta Playwright, que corre con `NODE_ENV=test`, igual que en el CI.

## Consecuencias

- `npm run test:e2e` sin más pasa entera en un worktree nuevo: con `.next` borrado entero, 249 de 249 en 5,3 minutos (335 s contando la base, el build y la suite), la prueba de SEO en 0,7 s y las cinco del Sudoku entre 0,4 y 3,2 s. La misma suite, forzada a dev con `E2E_SERVER=dev` y `.next/dev` borrado, dio 248 de 249 en 9,1 minutos (550 s), con la firma de DT-338: la de SEO en 27 s, la primera del Sudoku sin tiempo (6 s contra 5) y la segunda en 23,2 s contra 30.
- La corrida completa en local ahora compila siempre, también justo después de `npm run check`, que ya dejó un build. Con la caché de Turbopack son unos segundos; sin nada compilado, 5,5 s de compilación y 9,3 s de TypeScript en la corrida medida. Quien quiera usar el build que ya está corre con `CI=true`, como antes, y tiene que haberlo compilado con el origen del puerto de la corrida.
- Una corrida parcial sigue arrancando en dev y no compila el build: `E2E_FILES=sudoku.spec.ts npm run test:e2e` en un worktree sin `.next` pasó sus 7 casos en 24 s y no dejó `.next/BUILD_ID`.
- El build queda en `.next` y lo de dev en `.next/dev`, y ninguno pisa al otro: con `E2E_SERVER=build E2E_FILES=sudoku.spec.ts`, los 538 archivos que dev había dejado en `.next/dev` quedaron iguales, con su tamaño y su fecha, después de compilar, y la corrida completa contra dev dejó el build donde estaba. Compilar tampoco deja cambios en el árbol.
- `--list` sigue sin preparar nada: ni base, ni build.
- Una corrida completa contra dev sigue pudiendo dejar pruebas sin tiempo. Ya no pasa sin pedirlo: hace falta `E2E_SERVER=dev`. Por qué `next dev` se atasca ahí sigue sin determinarse, y los límites de las pruebas no se ampliaron.
- En el CI no cambia nada: ni el workflow, ni el comando, ni el servidor.
- No hay migración ni texto nuevo.
- Pruebas: `tests/unit/e2e-server-mode.test.ts` (la corrida completa, cada tipo de filtro, cada modo forzado, el CI, el valor que no se reconoce, la lista de opciones contra el `--help` de Playwright y el entorno del build contra la validación de producción de `src/env.ts`).
