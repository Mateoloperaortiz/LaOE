# ADR-085: Plataforma OE Digital: un backend y frontends delgados

- Estado: Aceptada (enmendada por ADR-090)
- Fecha: 2026-09-19
- Relacionadas: ADR-001, ADR-011, ADR-012, ADR-021, ADR-039, ADR-047, ADR-051, ADR-080, ADR-084
- Enmienda: ADR-001 (el monolito modular pasa a ser el backend de varias aplicaciones), ADR-021 (un proyecto de Railway con más de un desplegable)

## Contexto

La casa digital sirve hoy un solo sitio, `oeeafit.com`, desde un solo desplegable. La OE quiere sumar cuatro aplicaciones en subdominios propios. El 2026-09-19 Mateo respondió las diez preguntas de producto de la [auditoría de código](../auditoria-codigo-2026-09-19.md) (sección 6), y sus respuestas fijan el alcance:

- **Tres macroeventos** —DÍAS (`dias.oeeafit.com`, identificador `dias-eafit`), Inventiva (`inventiva.oeeafit.com`) y Enfemenino (`enfemenino.oeeafit.com`)— como **aplicaciones web de evento**, no solo páginas. Una capa pública grande (landing, información, agenda, actividades, patrocinadores, invitados, galerías, preguntas frecuentes, inscripción) y funciones propias: inscripciones, check-in, retos, votaciones, puntos, rankings, seguimiento de actividades.
- **Subsidios-OE** (`subsidios.oeeafit.com`), que **no es un macroevento**: es una aplicación de gestión de procesos para los subsidios de alimentación y transporte, con un expediente por solicitud, entrevistas, evaluación del Comité Primario del CGH, permisos por rol y trazabilidad completa.
- El contenido es público; la sesión hace falta solo para administración, staff, check-in y funciones de integrantes. **Autenticación centralizada de la OE**, no una base de usuarios por aplicación.
- **Check-in de asistentes externos** sin que se vuelvan usuarios: inscripción, QR único, lectura por un operador autenticado.
- Contenido administrable desde `/admin` sin tocar código, con **bloques controlados** en lugar de un constructor libre. **Tema propio por macroevento**; la administración conserva la identidad de la OE.
- Cada subdominio es una marca permanente: muestra la edición vigente y conserva las anteriores en `/<año>`.
- Tráfico muy estacional: **un pico de un evento no debe afectar las funciones críticas de la casa**.
- Un **monorepo** de aplicaciones y paquetes, pensando en que futuros miembros de la OE continúen el proyecto.
- Seguir cerca de **US$20 al mes**: no cuatro o cinco servidores permanentes.

Con esas respuestas deja de valer la recomendación que la auditoría daba en su sección 6 («servir los micrositios por host desde casa-digital y no pasar a monorepo todavía»): suponía sitios de contenido más inscripción.

Queda una decisión de fondo, que Mateo tomó el mismo día: **cómo comparten las aplicaciones la plataforma**. Había dos caminos.

**Dominio en paquetes.** Cada aplicación importa `database`, `events`, `checkin` o `subsidies` y habla con la base por su cuenta. Se descarta, por hechos del código actual:

- Cada comando escribe la mutación, su auditoría y sus eventos en **una sola transacción** (`runCommand`, ADR-012). Esa garantía existe dentro de un proceso con la base, no entre cinco.
- Habría **un migrador para cinco desplegables**: cada migración tendría que ser compatible con cinco versiones en producción a la vez.
- Postgres vive en la **red privada de Railway** (ADR-021). Un frontend serverless en otro proveedor no llega a él sin exponerlo.
- Un expediente de subsidio debe tener **un solo camino** a sus datos, con autorización y auditoría, no credenciales de la base repartidas en varias aplicaciones.

**Un backend y frontends delgados.** Es lo que describen los propios requisitos: picos aislados, frontends que despliegan y escalan por separado, servicios centrales compartidos.

## Decisión

1. **Un solo backend.** La casa digital de hoy pasa a ser el backend de la plataforma: es el **único desplegable que toca la base**. Conserva el dominio, `/admin`, Mi OE, los jobs y el outbox, y suma una API. Es responsable de autenticación y autorización, personas y roles, inscripciones, check-in, contenido administrable, archivos, notificaciones, auditoría, la lógica de Subsidios-OE y las integraciones externas.
2. **El dominio sigue siendo módulos dentro del backend** (`people`, `events`, `participation`, `content`… y un módulo nuevo para subsidios), con las fronteras que ya verifica `MODULE_DEPS` ([ADR-080](ADR-080-la-arquitectura-documentada-es-la-del-codigo.md)). No se extrae a paquetes. Separar un servicio más adelante sigue siendo posible —los módulos ya se hablan por contratos y eventos ([ADR-084](ADR-084-catalogo-tipado-de-eventos-de-dominio.md))— y no se paga esa complejidad desde hoy.
3. **Los frontends son delgados.** DÍAS, Inventiva, Enfemenino y Subsidios-OE se ocupan de la experiencia y de la lógica de presentación. **No acceden a la base ni importan el dominio**: consumen la API. Una regla de dependencias lo verificará cuando exista el primero.
4. **Monorepo.** `apps/` con el backend y un frontend por aplicación; `packages/` con lo que de verdad se comparte entre frontends: componentes de interfaz, temas, el cliente tipado de la API, el cliente de autenticación y la configuración común. El backend entra al monorepo primero y solo, sin cambio de comportamiento.
5. **La API es del backend y nace con contrato.** Versionada, con los esquemas compartidos con su cliente, lecturas públicas cacheables para el contenido y escrituras con límite de uso. Hoy no existe ninguna: no hay tokens ni CORS, y la CSP solo admite `connect-src 'self'`. Su forma concreta es la primera ADR de las capacidades (regla 12).
6. **Autenticación centralizada, sin cookie de dominio.** El backend es quien autentica. Un frontend que necesite sesión redirige al backend y recibe un código de un solo uso que canjea por **su propia sesión**, con cookie `__Host-` de su origen. No se usa una cookie con `Domain=.oeeafit.com`: le entregaría la sesión de un ADMIN a cualquier aplicación del dominio, y una aplicación de evento comprometida sería una puerta a la casa.
7. **Las herramientas de operación se quedan en el backend.** El lector de check-in, el editor de contenido y toda la administración viven en `/admin`. Por eso los sitios de evento casi no necesitan sesión al principio, y la regla 6 puede llegar después del primer piloto.
8. **Un asistente externo no es un usuario.** Su inscripción crea su registro —ya ocurre: `edition_registration` referencia siempre a una persona— y le entrega una **entrada con un código propio**, que un operador autenticado lee. No hay check-in anónimo hoy (`/a/[publicId]` exige sesión); sí existen el modo anfitrión, el lector de QR y los tokens por persona, que son la base de esta capacidad.
9. **Nada crítico depende de que un correo llegue a `@eafit.edu.co`.** El correo sale, pero el filtro que TI puso delante (Check Point) todavía se está ajustando con ellos (ADR-051). La entrada se muestra en pantalla y se puede guardar; un aviso por correo es un complemento, nunca la única vía.
10. **Subsidios-OE va al final y tiene dos condiciones previas.** Primera: que el correo a `@eafit.edu.co` sea confiable, porque sus postulantes no son miembros de la OE y no se les puede activar el acceso en persona como se hizo con el roster. Segunda: que la política de datos cubra la información socioeconómica y los documentos del expediente, aprobada por la junta como fija [ADR-047](ADR-047-politica-de-datos-y-habilitacion.md). Lleva permisos por rol y por caso —un entrevistador solo ve los suyos—, auditoría desde la primera línea, y ningún dato del expediente en tableros, registros ni correos.
11. **Costo.** Un solo backend permanente. Los frontends son estáticos o se regeneran bajo demanda detrás de una CDN, o duermen fuera de temporada (`sleepApplication`, que Railway ya ofrece); el staging de una aplicación es temporal. Antes de sumar el primer desplegable se mide el gasto real de hoy: la última medición documentada es del 2026-09-06, anterior a la carga del roster.
12. **Cada capacidad nueva entra con su ADR**, en este orden: la API y su cliente; temas por macroevento; contenido por bloques con ámbito de sitio y de edición, y ediciones archivadas en `/<año>`; entrada con código para asistentes externos; autenticación entre aplicaciones.
13. **El piloto es DÍAS**; después Inventiva, que ocurre dos veces al año al terminar el semestre; después Enfemenino. Subsidios-OE, según la regla 10.

## Orden de trabajo

1. **Terminar la serie R de la auditoría**, que es preparación directa: los contratos de eventos (R4) son la base de lo que la API expone; las piezas base de interfaz (R6) son el futuro paquete de componentes; el CI (R7) tiene que clasificar por aplicación, porque hoy cualquier cambio corre las once tareas.
2. **Mover el backend al monorepo**, solo y sin cambio de comportamiento: `APP_ROOT` en `scripts/ci/*`, directorio raíz del servicio en Railway, espacios de trabajo de npm.
3. **Las capacidades de la regla 12**, una ADR y un tramo cada una.
4. **DÍAS como piloto**, que es donde se prueba que un frontend delgado alcanza.
5. Inventiva y Enfemenino reutilizan lo anterior con su tema y sus bloques.
6. Subsidios-OE, cuando se cumplan sus dos condiciones.

## Consecuencias

- La casa digital deja de ser «la aplicación» y pasa a ser «el backend y la aplicación de la OE». Su monolito modular se conserva entero; lo que cambia es que gana una API y vecinos.
- El trabajo de R0 a R5 no se pierde ni se rehace: ordena justo lo que ahora va a sostener a cinco aplicaciones.
- Un pico de contenido de un evento lo absorbe la CDN de su frontend. Un pico de **escrituras** —la apertura de inscripciones— sí llega al backend: la API necesita límite de uso por origen y por persona, y el poller no puede seguir frenándose por un handler lento (R4-B).
- Un solo backend es también un solo punto de falla. Es el costo aceptado de la regla 11; los frontends estáticos siguen mostrando el contenido aunque el backend esté caído.
- Las reglas de `MODULE_DEPS`, el catálogo de eventos y la auditoría con IP (ADR-080, ADR-084, ADR-082) pasan a ser requisitos de plataforma, no solo higiene.

## Lo que esta ADR no decide

- Dónde se alojan los frontends (Cloudflare, que ya es el DNS; Railway con el servicio dormido; otro). Se decide con el piloto y con el gasto medido.
- El estilo de la API (REST o llamadas tipadas) y cómo se genera su cliente.
- Si los datos de Subsidios-OE viven en un esquema propio de Postgres, con su propio prefijo en el bucket.
- La fecha de DÍAS y el alcance mínimo de su primera edición en la plataforma: es un dato de la OE y fija el plazo del piloto.
- El modelo de permisos por rol de Subsidios-OE en detalle.

## Enmienda (2026-09-23, ADR-090)

La primera porción de la API se adelanta al monorepo: es la lectura pública `GET /api/v1/the-games/<slug>`, con caché corta y CORS de origen fijo para `dias.oeeafit.com`, que consume la vitrina de The Games de DÍAS. El cliente queda copiado en `dias` hasta que exista `packages/`. Las demás reglas y el resto del orden de trabajo no cambian. Ver [ADR-090](ADR-090-api-publica-v1-vitrina-de-the-games.md).
