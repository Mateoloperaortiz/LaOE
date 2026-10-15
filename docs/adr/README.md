# Registro de decisiones de arquitectura (ADR)

Cada archivo es una decisión: qué se decidió, por qué y qué consecuencias acepta. Formato MADR reducido: estado, fecha, relacionadas, contexto, decisión, consecuencias y, cuando aplica, qué cambia frente a GHPOINTS.

## Cómo agregar una

1. Copiar la plantilla de abajo a `ADR-0NN-titulo-corto.md` con el siguiente número libre.
2. Estado `Propuesta` mientras se discute; `Aceptada` con fecha al cerrarla.
3. Si reemplaza a otra, marcar la vieja como `Reemplazada por ADR-0NN` sin borrar su texto. Si solo cambia una parte, la nueva ADR **enmienda** a la vieja: la vieja conserva su texto, cambia su estado a `Aceptada (enmendada por ADR-0NN)` y cierra con una sección "Enmienda".
4. Agregar la fila en [../04-decisiones.md](../04-decisiones.md).

## Índice

| ADR | Título | Estado |
| --- | --- | --- |
| [ADR-131](ADR-131-gh-points-y-mas-gamer-con-rachas-separadas.md) | GH Points y Más gamer con rachas separadas | Aceptada; implementada y verificada en local, revisión y publicación pendientes |
| [ADR-130](ADR-130-fotos-privadas-en-mi-oe.md) | Fotos privadas en Mi OE y carga reanudable de DÍAS 2026 | Aceptada |
| [ADR-129](ADR-129-reglas-de-consolidacion-del-decimoseptimo-ciclo.md) | Reglas de consolidación del decimoséptimo ciclo del refactor | Aceptada |
| [ADR-128](ADR-128-reglas-de-correccion-del-decimosexto-ciclo.md) | Reglas de corrección del decimosexto ciclo del refactor | Aceptada (enmendada por ADR-129) |
| [ADR-127](ADR-127-reglas-de-correccion-del-decimoquinto-ciclo.md) | Reglas de corrección del decimoquinto ciclo del refactor | Aceptada (enmendada por ADR-128 y ADR-129) |
| [ADR-126](ADR-126-reglas-de-las-etiquetas-por-valor-del-decimocuarto-ciclo.md) | Reglas de las etiquetas por valor del decimocuarto ciclo del refactor | Aceptada (enmendada por ADR-128) |
| [ADR-125](ADR-125-reglas-de-la-interfaz-de-los-modulos-del-decimotercer-ciclo.md) | Reglas de la interfaz pública de los módulos del decimotercer ciclo del refactor | Aceptada (enmendada por ADR-127) |
| [ADR-124](ADR-124-reglas-de-la-base-de-pruebas-del-duodecimo-ciclo.md) | Reglas de la base de pruebas del duodécimo ciclo del refactor | Aceptada (enmendada por ADR-127 y ADR-128) |
| [ADR-123](ADR-123-reglas-de-verificacion-y-correccion-del-undecimo-ciclo.md) | Reglas de verificación y corrección del undécimo ciclo del refactor | Aceptada (enmendada por ADR-127 y ADR-129) |
| [ADR-122](ADR-122-reglas-de-alcance-y-correccion-del-decimo-ciclo.md) | Reglas de alcance y corrección del décimo ciclo del refactor | Aceptada (enmendada por ADR-123) |
| [ADR-121](ADR-121-reglas-de-estructura-y-pruebas-del-noveno-ciclo.md) | Reglas de estructura y pruebas del noveno ciclo del refactor | Aceptada (enmendada por ADR-122 y ADR-123) |
| [ADR-120](ADR-120-reglas-de-correccion-del-octavo-ciclo.md) | Reglas de corrección del octavo ciclo del refactor | Aceptada (enmendada por ADR-121, ADR-122, ADR-123, ADR-127 y ADR-129) |
| [ADR-119](ADR-119-reglas-de-estructura-y-robustez-del-septimo-ciclo.md) | Reglas de estructura y robustez del séptimo ciclo del refactor | Aceptada (enmendada por ADR-120, ADR-123, ADR-124, ADR-125, ADR-127 y ADR-129); enmendada por ADR-131 |
| [ADR-118](ADR-118-reglas-de-correccion-del-sexto-ciclo.md) | Reglas de corrección del sexto ciclo del refactor | Aceptada (enmendada por ADR-119, ADR-120, ADR-121, ADR-122, ADR-123 y ADR-127) |
| [ADR-117](ADR-117-db-release-comprueba-que-el-diario-quedo-aplicado.md) | `db:release` comprueba que el diario de migraciones quedó aplicado | Aceptada |
| [ADR-116](ADR-116-reglas-de-correccion-privacidad-y-permisos.md) | Reglas de corrección, privacidad y permisos del quinto ciclo del refactor | Aceptada (enmendada por ADR-118, ADR-119, ADR-120, ADR-121, ADR-123 y ADR-124); enmendada por ADR-131 |
| [ADR-115](ADR-115-reglas-de-campanas-y-tareas-de-gh.md) | Reglas de campañas de correo y tareas de GH del cuarto ciclo del refactor | Aceptada (enmendada por ADR-116, ADR-120 y ADR-121) |
| [ADR-114](ADR-114-reglas-de-seguridad-privacidad-e-integridad.md) | Reglas de seguridad, privacidad e integridad del tercer ciclo del refactor | Aceptada (enmendada por ADR-116) |
| [ADR-113](ADR-113-reglas-de-seguridad-e-integridad.md) | Reglas de seguridad e integridad del segundo ciclo del refactor | Aceptada (enmendada por ADR-114, ADR-116, ADR-119 y ADR-120) |
| [ADR-112](ADR-112-toda-sancion-declara-su-alcance.md) | Toda sanción se registra con su alcance declarado | Aceptada (enmendada por ADR-114 y ADR-116) |
| [ADR-111](ADR-111-una-excusa-aceptada-libera-el-premio-reservado.md) | Una excusa aceptada libera el premio reservado y cierra el reto presencial pendiente | Aceptada |
| [ADR-110](ADR-110-el-grafo-de-modulos-de-dominio-no-tiene-ciclos.md) | El grafo de módulos de dominio no tiene ciclos | Aceptada |
| [ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md) | Refactor progresivo con ledger de deuda técnica | Aceptada (enmendada por ADR-116 y ADR-129) |
| [ADR-108](ADR-108-los-issues-de-github-son-la-cola-de-trabajo.md) | Los issues de GitHub son la cola de trabajo de las skills de ingeniería | Aceptada |
| [ADR-107](ADR-107-la-tabla-se-puede-ocultar-mientras-se-juega.md) | La tabla de posiciones se puede ocultar mientras se juega | Aceptada |
| [ADR-106](ADR-106-la-base-empieza-con-la-rotacion.md) | La base empieza con la rotación y el líder confirma poderes y resultado | Aceptada |
| [ADR-105](ADR-105-seguimiento-del-registro-de-resultados.md) | Seguimiento del registro de resultados de The Games | Aceptada |
| [ADR-104](ADR-104-las-apuestas-suman-a-la-tabla-general.md) | Los puntos de apuestas suman a la tabla general de The Games | Aceptada |
| [ADR-103](ADR-103-calificacion-de-the-challenge-por-jurados.md) | Calificación de The Challenge por jurados | Aceptada |
| [ADR-102](ADR-102-apoyo-de-la-base-en-licencia.md) | El apoyo de la base puede estar en licencia | Aceptada |
| [ADR-101](ADR-101-personal-de-the-games-desde-la-hoja-del-gap.md) | Personal de The Games desde la hoja del GAP | Aceptada (enmendada por ADR-102) |
| [ADR-100](ADR-100-puntos-de-the-challenge-y-del-macro-reto.md) | Puntos de The Challenge y del Macro reto | Aceptada (enmendada por ADR-103) |
| [ADR-099](ADR-099-instrucciones-del-hub-de-capitanes.md) | Instrucciones del hub de capitanes | Aceptada (enmendada por ADR-104) |
| [ADR-098](ADR-098-poderes-de-the-games.md) | Poderes de The Games | Aceptada (enmendada por ADR-106) |
| [ADR-097](ADR-097-recorrido-de-cada-equipo.md) | Recorrido de cada equipo en la vitrina y en el hub | Aceptada (enmendada por ADR-098) |
| [ADR-096](ADR-096-hub-de-apuestas-de-los-capitanes.md) | Hub de capitanes en DÍAS con la API de la casa | Aceptada (enmendada por ADR-097, ADR-098 y ADR-099) |
| [ADR-095](ADR-095-capitanes-de-the-games-desde-la-hoja-de-la-oe.md) | Capitanes de The Games desde la hoja de la OE | Aceptada |
| [ADR-094](ADR-094-calendario-de-the-games-desde-la-hoja-de-la-oe.md) | El calendario de The Games se importa desde la hoja de la OE | Aceptada |
| [ADR-093](ADR-093-cada-equipo-juega-todas-las-bases.md) | En The Games, cada equipo juega todas las bases de la jornada | Aceptada |
| [ADR-092](ADR-092-panal-corto-y-premios-por-avance.md) | Panal corto y premios por avance desde el 24 de septiembre | Aceptada; en producción desde el 24 a las 08:30 de Colombia; enmendada por ADR-131 |
| [ADR-091](ADR-091-apuestas-de-the-games.md) | Apuestas de The Games con puntos virtuales | Aceptada (enmendada por ADR-096, ADR-104 y ADR-118); implementación en curso |
| [ADR-090](ADR-090-api-publica-v1-vitrina-de-the-games.md) | API pública v1: la vitrina de The Games para DÍAS | Aceptada (enmendada por ADR-095, ADR-096, ADR-097, ADR-098 y ADR-107); implementación en curso |
| [ADR-089](ADR-089-the-games-competencia-por-equipos.md) | The Games: competencia por equipos de Días EAFIT | Aceptada (enmendada por ADR-093, ADR-094, ADR-095, ADR-096, ADR-098, ADR-100, ADR-101, ADR-104, ADR-106 y ADR-118); implementación en curso |
| [ADR-088](ADR-088-panal-diario-en-espanol.md) | Panal diario en español y premio por rango Genio | Aceptada; enmendada por ADR-092 y ADR-119; publicación pendiente; enmendada por ADR-131 |
| [ADR-087](ADR-087-boosters-sobre-puntos-de-asistencia.md) | Boosters sobre los puntos de la asistencia | Aceptada |
| [ADR-086](ADR-086-copy-paisa-y-parchado.md) | Copy paisa y parchado | Aceptada |
| [ADR-085](ADR-085-plataforma-oe-digital-un-backend-y-frontends-delgados.md) | Plataforma OE Digital: un backend y frontends delgados | Aceptada (enmendada por ADR-090) |
| [ADR-084](ADR-084-catalogo-tipado-de-eventos-de-dominio.md) | Catálogo tipado de eventos de dominio | Aceptada |
| [ADR-083](ADR-083-lo-compartido-no-vive-en-la-carpeta-de-una-pantalla.md) | Lo compartido no vive en la carpeta de una pantalla | Aceptada |
| [ADR-082](ADR-082-un-kit-para-las-server-actions-y-auditoria-con-ip.md) | Un kit para las server actions, y la auditoría siempre con IP | Aceptada (enmendada por ADR-114, ADR-116 y ADR-121) |
| [ADR-081](ADR-081-el-catalogo-de-textos-no-viaja-entero-al-navegador.md) | El catálogo de textos no viaja entero al navegador | Aceptada (enmendada por ADR-126) |
| [ADR-080](ADR-080-la-arquitectura-documentada-es-la-del-codigo.md) | La arquitectura documentada es la del código | Aceptada (enmendada por ADR-110 y ADR-125) |
| [ADR-079](ADR-079-limites-de-espera-y-esquema-verificado-desde-el-esquema.md) | Ninguna espera es indefinida, y lo que se verifica sale de su fuente | Aceptada (enmendada por ADR-117, ADR-118 y ADR-119) |
| [ADR-078](ADR-078-sudoku-con-solucion-en-el-servidor.md) | Sudoku con la solución en el servidor | Aceptada; en producción; enmendada por ADR-131 |
| [ADR-077](ADR-077-el-lanzador-e2e-suma-su-origen-al-cors-del-bucket.md) | El lanzador E2E suma su origen al CORS del bucket local | Aceptada |
| [ADR-076](ADR-076-biblioteca-de-iconos.md) | Biblioteca de iconos detrás de una fachada propia | Aceptada; en producción |
| [ADR-075](ADR-075-biblioteca-de-juegos-y-2048.md) | Biblioteca de juegos y 2048 con replay verificado | Aceptada; enmendada por ADR-078, ADR-088 y ADR-122; en producción; enmendada por ADR-131 |
| [ADR-074](ADR-074-aviso-diario-del-wordle.md) | Aviso diario del Wordle | Aceptada; en producción; enmendada por ADR-131 |
| [ADR-073](ADR-073-un-comite-inactivo-sale-de-la-app.md) | Un comité inactivo sale de la app | Aceptada; en producción |
| [ADR-072](ADR-072-alcance-autorizado-en-el-dominio.md) | El alcance autorizado se verifica en el dominio | Aceptada (enmendada por ADR-112 y ADR-122); en producción |
| [ADR-071](ADR-071-gt-de-macroevento-cumple-gap.md) | El GT de macroevento cumple el criterio GAP | Aceptada; en producción |
| [ADR-070](ADR-070-podio-de-comites-en-gh-points.md) | Podio de comités en GH Points | Aceptada |
| [ADR-069](ADR-069-directorio-de-comites-de-mi-oe.md) | Directorio de comités de Mi OE | Implementada en local; publicación pendiente |
| [ADR-068](ADR-068-correcciones-de-gamificacion.md) | Correcciones de gamificación antes de producción | Aceptada |
| [ADR-067](ADR-067-retos-boosters-y-coleccion.md) | Retos relámpago, boosters y colección de insignias | Aceptada; enmendada por ADR-068, ADR-075, ADR-078, ADR-087, ADR-111, ADR-113, ADR-118 y ADR-122; enmendada por ADR-131 |
| [ADR-061](ADR-061-verificacion-y-correcciones-de-normativa-2026.md) | Verificación y correcciones de normativa 2026 | Aceptada (enmendada por ADR-118) |
| [ADR-062](ADR-062-importacion-de-asistencias-y-evidencias-gh.md) | Importación histórica de asistencias y evidencias de GH | En producción; enmendada por ADR-063 |
| [ADR-063](ADR-063-importacion-de-asambleas.md) | Importación de asistencias a asambleas | Implementada en local; altas pendientes |
| [ADR-064](ADR-064-gestion-de-macroeventos.md) | Gestión de macroeventos, cargos y GT por semestre | Implementación y verificación (enmendada por ADR-089) |
| [ADR-066](ADR-066-cargos-vigentes-e-historial.md) | Cargos vigentes e historial por semestre y ámbito | Aceptada; verificada en producción |
| [ADR-065](ADR-065-areas-y-participacion-gt-gap.md) | Áreas y participación en GT y GAP | Aceptada; enmendada por ADR-071 |
| [ADR-060](ADR-060-alineacion-con-la-normativa-2026.md) | Alineación de la casa digital con los Estatutos y el Reglamento Interno 2026 | Aceptada; enmendada por ADR-061, ADR-073, ADR-111, ADR-112, ADR-118 y ADR-129; en curso por tramos |
| [ADR-059](ADR-059-presupuesto-del-comite.md) | Presupuesto del comité por rubros, gastos y traslados | Propuesta; enmendada por ADR-060 |
| [ADR-058](ADR-058-direccion-del-comite-por-areas.md) | La dirección del comité por áreas: capacidades por cargo, cargos múltiples y codirección | Aceptada (enmendada por ADR-060 y ADR-115); promovida a producción, verificación con la dirección real pendiente |
| [ADR-057](ADR-057-vicepresidencia-de-comunicaciones-y-publicidad.md) | Vicepresidencia de Comunicaciones y Publicidad como cargo de junta | Aceptada; en producción |
| [ADR-056](ADR-056-alta-y-condicion-del-semestre-desde-la-persona-360.md) | Alta y condición del semestre desde la Persona 360 | Aceptada; verificada en producción |
| [ADR-055](ADR-055-cuatro-particiones-e2e-integracion-en-dos-runners-y-lista-documental.md) | Cuatro particiones E2E, integración en dos runners y lista documental ampliada | Aceptada; validada en remoto |
| [ADR-054](ADR-054-reutilizacion-del-ci-en-promocion-y-particiones-e2e-balanceadas.md) | Reutilización del CI en la promoción y particiones E2E balanceadas | Aceptada (enmendada por ADR-055); validada en remoto |
| [ADR-052](ADR-052-aislamiento-y-fallos-de-las-pruebas-e2e.md) | Aislamiento, calendario y fallos de las pruebas E2E | Aceptada (enmendada por ADR-077 y ADR-116) |
| [ADR-053](ADR-053-ci-en-paralelo-y-verificacion-del-despliegue.md) | CI en paralelo, inventario obligatorio y smoke posterior | Aceptada (enmendada por ADR-054, ADR-055 y ADR-120) |
| [ADR-051](ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md) | Acceso con contraseña propia y enlace de un solo uso de la junta | Aceptada (enmendada por ADR-113, ADR-114, ADR-116, ADR-118) |
| [ADR-050](ADR-050-correo-transaccional-del-codigo.md) | Forma del correo transaccional del código de acceso | Aceptada (enmendada por ADR-051) |
| [ADR-049](ADR-049-navegacion-entre-mi-oe-y-administracion.md) | Navegación entre Mi OE y Administración | Aceptada |
| [ADR-048](ADR-048-autorizacion-en-el-primer-ingreso.md) | La autorización de membresía se da en el primer ingreso | Aceptada; implementada y verificada en local |
| [ADR-047](ADR-047-politica-de-datos-y-habilitacion.md) | Política de datos, su versión y el respaldo de las autorizaciones | Aceptada; borrador entregado, publicación pendiente |
| [ADR-046](ADR-046-integracion-roster-y-acceso-en-licencia.md) | Integración del roster y acceso de consulta en licencia | Implementada y verificada; carga pendiente por política (enmendada por ADR-047) |
| [ADR-001](ADR-001-monolito-modular-serverless.md) | Monolito modular con un solo Postgres | Aceptada (enmendada por ADR-021, ADR-032, ADR-080 y ADR-085) |
| [ADR-002](ADR-002-persona-como-eje.md) | La persona es el eje; la membresía es un ciclo de vida | Aceptada |
| [ADR-003](ADR-003-etapas-por-comando.md) | Etapas explícitas por comando | Aceptada (enmendada por ADR-039) |
| [ADR-004](ADR-004-termino-como-reloj.md) | El término académico es el reloj universal | Aceptada (enmendada por ADR-118) |
| [ADR-005](ADR-005-comites-por-termino.md) | Pertenencia a comité por término | Aceptada (enmendada por ADR-039) |
| [ADR-006](ADR-006-una-sola-asistencia.md) | Una sola mecánica de asistencia | Aceptada (enmendada por ADR-024 y ADR-035) |
| [ADR-007](ADR-007-ledger-append-only.md) | Ledger append-only por término | Aceptada (enmendada por ADR-041); enmendada por ADR-131 |
| [ADR-008](ADR-008-tableros-derivados.md) | Tableros nuevos/veteranos derivados | Aceptada |
| [ADR-009](ADR-009-score-de-comite.md) | Score de comité por participación relativa | Aceptada (enmendada por ADR-024, ADR-035 y ADR-070) |
| [ADR-010](ADR-010-identidad-por-correo-y-otp.md) | Identidad por correo del roster con OTP | Aceptada (enmendada por ADR-034, ADR-039, ADR-050, ADR-051, ADR-113, ADR-114) |
| [ADR-011](ADR-011-autorizacion-en-servidor.md) | Autorización en servidor | Aceptada (enmendada por ADR-051, ADR-058, ADR-072, ADR-082, ADR-089, ADR-112 y ADR-119) |
| [ADR-012](ADR-012-outbox-transaccional.md) | Outbox transaccional; efectos fuera del commit | Aceptada (enmendada por ADR-021, ADR-038, ADR-040, ADR-079, ADR-084, ADR-113 y ADR-118) |
| [ADR-013](ADR-013-formularios-en-la-app.md) | Todo formulario vive en la app | Aceptada (enmendada por ADR-037) |
| [ADR-014](ADR-014-privacidad-por-diseno.md) | Privacidad por diseño (Ley 1581 de 2012) | Aceptada (enmendada por ADR-030, ADR-039, ADR-040, ADR-047, ADR-048 y ADR-095) |
| [ADR-015](ADR-015-canales.md) | Canales de comunicación | Aceptada (enmendada por ADR-023 y ADR-038) |
| [ADR-016](ADR-016-medios-en-r2.md) | Medios en un bucket privado sin cargar la app | Reemplazada por ADR-022 |
| [ADR-017](ADR-017-admin-kit.md) | Admin kit declarativo | Aceptada (enmendada por ADR-080 y ADR-083) |
| [ADR-018](ADR-018-migracion-desde-ghpoints.md) | Migración desde GHPOINTS por script sobre dump | Aceptada (enmendada por ADR-034, ADR-039, ADR-050) |
| [ADR-019](ADR-019-infraestructura-vercel-neon-r2.md) | Infraestructura: Vercel Pro + Neon + R2 + Resend | Reemplazada por ADR-021 |
| [ADR-020](ADR-020-zona-horaria.md) | UTC en base, America/Bogota en presentación | Aceptada (enmendada por ADR-121) |
| [ADR-021](ADR-021-infraestructura-railway.md) | Infraestructura: Railway en el workspace Pro existente | Aceptada (enmendada por ADR-022, ADR-023 y ADR-032, ADR-039, ADR-040, ADR-085) |
| [ADR-022](ADR-022-medios-prefirmados.md) | Medios: subida directa y entrega por URL prefirmada | Aceptada (enmendada por ADR-034, ADR-039, ADR-050 y ADR-130) |
| [ADR-023](ADR-023-operacion-entornos-respaldo-correo.md) | Operación: entorno de pruebas, copia externa y correo con desbordamiento | Aceptada (enmendada por ADR-038, ADR-039, ADR-050, ADR-115 y ADR-116) |
| [ADR-024](ADR-024-reglas-de-participacion.md) | Reglas de participación confirmadas por la OE | Aceptada (enmendada por ADR-027, ADR-028, ADR-030 y ADR-035) |
| [ADR-025](ADR-025-permanencia-scorecard.md) | Permanencia como tablero de criterios configurable por término | Aceptada (enmendada por ADR-026, ADR-027 y ADR-036) |
| [ADR-026](ADR-026-permanencia-por-comite.md) | Permanencia en dos niveles: la OE y el comité | Aceptada (enmendada por ADR-027 y ADR-036) |
| [ADR-027](ADR-027-permanencia-reglas-de-gh.md) | Permanencia: reglas confirmadas por Gestión Humana | Aceptada (enmendada por ADR-028) |
| [ADR-028](ADR-028-permanencia-consecuencias.md) | Permanencia: consecuencias, asambleas obligatorias y evaluación al cierre | Aceptada (enmendada por ADR-036) |
| [ADR-029](ADR-029-cargos-de-comite-y-roster.md) | Cargos dentro del comité y formato del roster | Aceptada (enmendada por ADR-030 y ADR-058) |
| [ADR-030](ADR-030-perfil-de-egresado.md) | Perfil de egresado (memorial) en lugar de anonimización por plazo | Aceptada (enmendada por ADR-114, ADR-116 y ADR-118) |
| [ADR-031](ADR-031-autogestion-del-miembro.md) | Autogestión del miembro: solicitudes, convocatorias, datos propios, onboarding, reconocimientos, encuestas y panel de la junta | Aceptada (enmendada por ADR-036, ADR-037 y ADR-038) |
| [ADR-032](ADR-032-drizzle-y-esquema-por-modulo.md) | Drizzle como capa de datos y esquema por módulo en TypeScript | Aceptada (enmendada por ADR-079) |
| [ADR-033](ADR-033-contenido-y-medios-fase-1.md) | Contenido editable y medios del portal público (fase 1) | Aceptada (enmendada por ADR-036, ADR-037 y ADR-038, ADR-039, ADR-113, ADR-114, ADR-116) |
| [ADR-034](ADR-034-personas-y-mi-oe-fase-2.md) | Personas, CRM mínimo y Mi OE (fase 2) | Aceptada (enmendada por ADR-035, ADR-037 y ADR-038, ADR-039, ADR-040, ADR-057, ADR-058, ADR-066, ADR-113, ADR-115) |
| [ADR-035](ADR-035-participacion-y-gh-points-fase-3.md) | Participación y GH Points (fase 3) | Aceptada (enmendada por ADR-036, ADR-038, ADR-041, ADR-058, ADR-070, ADR-115, ADR-116, ADR-119 y ADR-122); enmendada por ADR-131 |
| [ADR-036](ADR-036-permanencia-fase-4.md) | Permanencia (fase 4) | Aceptada (enmendada por ADR-037, ADR-038, ADR-056, ADR-058, ADR-116, ADR-118, ADR-121 y ADR-123) |
| [ADR-037](ADR-037-admision-aliados-y-contactos-fase-5.md) | Admisión, aliados y contactos (fase 5) | Aceptada (enmendada por ADR-038, ADR-039, ADR-046, ADR-050, ADR-056, ADR-060, ADR-115, ADR-116 y ADR-118) |
| [ADR-038](ADR-038-comunicaciones-y-pwa-fase-6.md) | Comunicaciones y PWA (fase 6) | Aceptada (enmendada por ADR-039, ADR-074, ADR-113, ADR-115, ADR-116, ADR-118 y ADR-122) |
| [ADR-039](ADR-039-arranque-limpio-fase-7.md) | Arranque limpio en Railway y retiro de GHPOINTS (fase 7) | Aceptada; operación pendiente |
| [ADR-040](ADR-040-carnet-en-billeteras-fase-8.md) | Carnet en Apple Wallet y Google Wallet (fase 8) | Aceptada; implementación y activación pendientes de verificación |
| [ADR-041](ADR-041-wordle-diario-y-cierre-de-puntos.md) | Wordle diario y cierre transaccional de puntos | Aceptada (enmendada por ADR-074, ADR-075 y ADR-119); enmendada por ADR-131 |
| [ADR-042](ADR-042-normativa-completa.md) | Normativa completa y carga verificada de los originales | Aceptada |
| [ADR-043](ADR-043-experiencia-administrativa.md) | Experiencia administrativa adaptable | Aceptada (enmendada por ADR-049) |
| [ADR-044](ADR-044-experiencia-del-portal-y-mi-oe.md) | Experiencia del portal y Mi OE | Aceptada; implementación verificada (enmendada por ADR-049) |

| [ADR-045](ADR-045-alta-individual-de-integrante-existente.md) | Alta individual de un integrante existente con historial | Aceptada; operación verificada |


## Plantilla

```markdown
# ADR-0NN: Título

- Estado: Propuesta | Aceptada | Aceptada (enmendada por ADR-0MM) | Reemplazada por ADR-0MM
- Fecha: AAAA-MM-DD
- Relacionadas: ADR-0XX

## Contexto

## Decisión

## Consecuencias

## Frente a GHPOINTS (opcional)

## Enmienda (fecha, ADR-0MM) (solo si aplica)
```
