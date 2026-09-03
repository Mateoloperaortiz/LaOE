# Copy y textos de la app

Inventario de **todos los textos que la app necesita**, para que GH, comunicaciones, la junta y los comités pongan lo que quieran antes de que exista código. Cada texto tiene un código (`T-…`), dónde aparece, una propuesta escrita en la voz de la OE, quién es su dueño y su estado. Lo que diga "Propuesta" es un borrador de Mateo que se puede reemplazar; lo que diga "Aprobado" ya lo validó su dueño. Nada de esto se inventa en el código: el código lee de aquí.

Dueños: **GH** (Gestión Humana), **COM** (comunicaciones y relaciones públicas), **JUNTA**, **COMITÉ** (cada comité escribe lo suyo), **MATEO** (textos del sistema que no cambian el sentido institucional).

## 1. Voz y reglas

Según el manual de marca ([07-marca.md](07-marca.md)): cercana y "parchada", con **voseo**, lenguaje cotidiano; personalidad servicial, fraternal y versátil; cierre **¡OE OE OE!** en éxitos y celebraciones, nunca en errores ni en mensajes sensibles (permanencia, salida, expulsión). Frases cortas. Sin jerga administrativa donde lo lee un miembro.

Términos fijos en la interfaz (los usa el código tal cual):

| Término | Uso | Alternativa que hay que descartar o confirmar |
| --- | --- | --- |
| Miembro | Persona del roster | Decidido por Mateo el 2026-09-03, alineado con GH: la app dice "miembro" en todas partes; "integrante" no se usa |
| Activo | Estado de la membresía (`ACTIVE`) | Decidido el 2026-09-03: "activo" como GH, no "vigente". Los otros estados: en licencia, honorario, retirado |
| Mi OE | El espacio con sesión | |
| Cartelera | Anuncios | |
| GH Points | Puntos y rankings | |
| Permanencia | La tabla de GH y la del comité | GH la llama "tabla"; propuesta: "Permanencia" como título y "tu tabla" en el texto |
| Ocasión | Solo en el admin; para el miembro se dice actividad, asamblea, reunión o partido | |
| Check-in | Registrar asistencia | Propuesta para el miembro: "Registrá tu asistencia" |
| Egresados | Galería de quienes salieron | Mateo lo llama "memorial"; en la interfaz va "Egresados" |
| Comité | Los 27 comités | Comité de trabajo se escribe completo para no confundir |
| Término | Solo en el admin; para el miembro se dice semestre | |

Límites: título de push hasta 40 caracteres y cuerpo hasta 120; asunto de correo hasta 60; botones de una a tres palabras; mensajes de error que digan qué pasó y qué hacer.

## 2. Portal público

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-001 | Nombre del sitio (pestaña, buscadores) | Organización Estudiantil EAFIT | COM | Propuesta |
| T-002 | Inicio, titular del hero | Lo hacemos por vos | COM | Propuesta |
| T-003 | Inicio, texto bajo el titular | Desde 1987 somos el grupo estudiantil más grande de EAFIT: 27 comités, cuatro macroeventos y una comunidad que se organiza para hacer que las cosas pasen. | COM | Propuesta |
| T-004 | Inicio, botón principal | Entrá a Mi OE | COM | Propuesta |
| T-005 | Inicio, botón secundario | Conocé los comités | COM | Propuesta |
| T-006 | Inicio, título de la sección de macroeventos | Nuestros macroeventos | COM | Propuesta |
| T-007 | Inicio, título de la cartelera | Qué está pasando | COM | Propuesta |
| T-008 | Inicio, título del próximo encuentro | Próximo encuentro | COM | Propuesta |
| T-009 | Inicio, cuando no hay anuncios ni encuentros | Por ahora no hay nada programado. Volvé pronto. | MATEO | Propuesta |
| T-010 | La OE, historia | Texto del manual, sección "Nuestra historia": comienza en 1987… (transcrito en la migración `0003`, cuerpo de la página `la-oe`; se edita desde el admin) | COM | Aprobado por el manual |
| T-011 | La OE, misión | Texto del manual, sección "Identidad" (transcrito en la migración `0003`, cuerpo de la página `la-oe`) | JUNTA | Aprobado por el manual |
| T-012 | La OE, visión | Texto del manual, sección "Identidad" (transcrito en la migración `0003`, cuerpo de la página `la-oe`) | JUNTA | Aprobado por el manual |
| T-013 | La OE, contacto | Bloque 29, oficina 525 · oe@eafit.edu.co · redes | COM | Propuesta; confirmar redes |
| T-014 | Eventos, intro | Cuatro macroeventos que mueven a toda la universidad. Cada uno tiene su historia y su próxima edición. | COM | Propuesta |
| T-015 | Eventos, descripción de Días EAFIT | Por escribir | COM | Pendiente |
| T-016 | Eventos, descripción de Inventiva | Por escribir | COM | Pendiente |
| T-017 | Eventos, descripción de EnFemenino | Por escribir | COM | Pendiente |
| T-018 | Eventos, descripción de Subsidios-OE | Por escribir | COM | Pendiente |
| T-019 | Edición, botón de inscripción propia | Inscribite | COM | Propuesta |
| T-020 | Edición, botón de inscripción externa | Inscribite (te lleva a otro sitio) | MATEO | Propuesta |
| T-021 | Edición sin fecha confirmada | Fecha por confirmar | MATEO | Propuesta |
| T-022 | Comités, intro | 27 comités, 27 formas de vivir la OE. Encontrá el tuyo. | COM | Propuesta |
| T-023 | Comité, presentación (uno por comité) | Por escribir: 2 a 4 párrafos, qué hacen, cómo trabajan, cómo entrar | COMITÉ | Pendiente ×27 |
| T-024 | Comité, botón de contacto | Escribiles | COM | Propuesta |
| T-025 | Unirse, título | ¿Querés ser parte de la OE? | GH | Propuesta |
| T-026 | Unirse, texto del proceso | Por escribir: requisitos, fechas de convocatoria, qué pasa después de postularse | GH | Pendiente |
| T-027 | Unirse, botón | Postulate | GH | Propuesta |
| T-028 | Unirse, cuando no hay convocatoria abierta | Ahora no hay convocatoria abierta. Dejanos tu correo y te avisamos cuando abra. | GH | Propuesta |
| T-029 | Privacidad, título | Tratamiento de datos personales | JUNTA | Propuesta |
| T-030 | Privacidad, texto | Política aprobada por la OE (texto por entregar) | JUNTA | Pendiente |
| T-031 | Pie de página | Organización Estudiantil · Universidad EAFIT · desde 1987 | COM | Propuesta |
| T-032 | Página no encontrada | Esta página no existe. Volvé al inicio. | MATEO | Propuesta |
| T-033 | Error del servidor | Algo falló de nuestro lado. Ya nos enteramos; intentá de nuevo en un rato. | MATEO | Propuesta |
| T-034 | Botón de tema (etiqueta accesible), según el tema al que cambia | Cambiar a tema oscuro · Cambiar a tema claro | MATEO | Propuesta |
| T-035 | Enlace para saltar la navegación (lectores de pantalla y teclado) | Saltar al contenido | MATEO | Propuesta |
| T-036 | Nombre accesible del logotipo en cabecera y pie | Organización Estudiantil, Universidad EAFIT | COM | Propuesta |
| T-037 | Expresión de marca del manual, cierre de éxitos y estados vacíos | ¡OE OE OE! | COM | Aprobado por el manual |
| T-038 | Navegación del portal público | Inicio · La OE · Cartelera · Eventos · Comités · Unirse | COM | Propuesta |
| T-039 | Nombres de los cuatro macroeventos (identidades permanentes) | Días EAFIT · Inventiva · EnFemenino · Subsidios-OE | COM | Aprobado por el manual |

### Portal público · fase 1 (cartelera, eventos, comités, imágenes para compartir)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-300 | La OE, Unirse o Privacidad sin publicar todavía | Este contenido está en preparación. Volvé pronto. | MATEO | Propuesta |
| T-301 | Cartelera, título de la página | Cartelera | COM | Propuesta |
| T-302 | Cartelera sin anuncios | Todavía no hay anuncios. Volvé pronto. | MATEO | Propuesta |
| T-303 | Cartelera, insignia de un anuncio fijado | Fijado | MATEO | Propuesta |
| T-304 | Eventos, título de la página | Eventos | COM | Propuesta |
| T-305 | Evento, título de la lista de ediciones | Ediciones | COM | Propuesta |
| T-306 | Evento sin ediciones publicadas | Todavía no hay ediciones publicadas. | MATEO | Propuesta |
| T-307 | Edición, etiquetas de la ficha | Cuándo · Dónde · Organizan | MATEO | Propuesta |
| T-308 | Eventos y ediciones, enlace al calendario público (ICS) | Agregá los eventos de la OE a tu calendario | MATEO | Propuesta |
| T-309 | Comités, título de la página | Comités | COM | Propuesta |
| T-310 | Comité sin presentación | Este comité todavía no publicó su presentación. | MATEO | Propuesta |
| T-311 | Evento e inicio, insignia de la edición que viene | Próxima edición | MATEO | Propuesta |
| T-312 | Edición que ya ocurrió, insignia | Ya pasó | MATEO | Propuesta |
| T-313 | Anuncio, fecha de publicación | Publicado el {fecha} | MATEO | Propuesta |
| T-314 | Imagen para compartir (OG), texto alternativo | {título} · Organización Estudiantil EAFIT | MATEO | Propuesta |
| T-315 | Portada de un evento o edición, texto alternativo | Portada de {título} | MATEO | Propuesta |
| T-316 | Inicio y anuncio, enlace a la cartelera completa | Ver toda la cartelera | COM | Propuesta |
| T-317 | Inicio, enlace a todos los eventos | Ver todos los eventos | COM | Propuesta |
| T-318 | Edición, enlace de vuelta al evento | Volver a {evento} | MATEO | Propuesta |
| T-319 | Pie de página, enlace a la política de datos | Privacidad | MATEO | Propuesta |
| T-320 | Pie de página, enlace al calendario público | Calendario | MATEO | Propuesta |
| T-321 | La OE, título del bloque de contacto | Contacto | COM | Propuesta |
| T-322 | Calendario público (ICS), nombre del calendario | Eventos de la Organización Estudiantil EAFIT | COM | Propuesta |

## 3. Acceso

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-040 | Ingresar, título | Entrá a Mi OE | MATEO | Propuesta |
| T-041 | Ingresar, texto | Escribí tu correo institucional y te mandamos un código de seis dígitos. | MATEO | Propuesta |
| T-042 | Ingresar, campo | Correo @eafit.edu.co | MATEO | Propuesta |
| T-043 | Ingresar, botón | Enviame el código | MATEO | Propuesta |
| T-044 | Ingresar, respuesta siempre igual (no revela si el correo está en el roster) | Si tu correo está en el roster de la OE, el código te llega en un momento. Revisá también el correo no deseado. | MATEO | Propuesta |
| T-045 | Código, título | Escribí el código | MATEO | Propuesta |
| T-046 | Código, botón | Entrar | MATEO | Propuesta |
| T-047 | Código, casilla | Recordar este dispositivo por 90 días | MATEO | Propuesta |
| T-048 | Código vencido | Ese código ya venció. Pedí uno nuevo. | MATEO | Propuesta |
| T-049 | Código incorrecto | Ese código no es. Te quedan {n} intentos. | MATEO | Propuesta |
| T-050 | Demasiados intentos | Superaste los intentos. Esperá 15 minutos y volvé a pedir un código. | MATEO | Propuesta |
| T-051 | Sesión vencida | Tu sesión venció. Entrá de nuevo. | MATEO | Propuesta |
| T-052 | Cuenta en licencia o retirada (al intentar entrar) | Respuesta igual a T-044; nunca se dice el motivo | MATEO | Propuesta |
| T-053 | Correo del código, asunto | Tu código para entrar a Mi OE: {código} | MATEO | Propuesta |
| T-054 | Correo del código, cuerpo | Hola, {nombre}. Tu código es **{código}** y vence en 10 minutos. Si no fuiste vos, ignorá este correo. | MATEO | Propuesta |
| T-055 | Step-up (acción sensible de admin) | Esta acción pide un código nuevo. Te lo mandamos al correo. | MATEO | Propuesta |

## 4. Mi OE

### Inicio y navegación

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-060 | Saludo | Hola, {nombre preferido} | MATEO | Propuesta |
| T-061 | Pestañas de navegación | Inicio · Eventos · Comités · Personas · Egresados · GH Points · Permanencia · Normativa · Carnet · Ajustes | COM | Propuesta |
| T-062 | Agenda, título | Tu semana | MATEO | Propuesta |
| T-063 | Agenda vacía | No tenés nada esta semana. Mirá los eventos o pasá por tu comité. | MATEO | Propuesta |
| T-064 | Barra de permanencia en el inicio | Permanencia en {comité}: {n} % de {umbral} % | GH | Propuesta |
| T-065 | Saldo compacto de GH Points | {n} GH Points este semestre | GH | Propuesta |
| T-066 | Onboarding, título (solo nuevos) | Tu primera semana en la OE | GH | Propuesta |
| T-067 | Onboarding, pasos | 1. Leé los estatutos y el reglamento · 2. Conocé a tu comité · 3. Andá a tu primera integración · 4. Activá las notificaciones · 5. Decorá la oficina con los nuevos | GH | Propuesta; GH define los pasos |
| T-068 | Onboarding completado | Ya sos parte de esto. ¡OE OE OE! | COM | Propuesta |

### Personas y comités

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-070 | Directorio, título | Personas | COM | Propuesta |
| T-071 | Directorio, buscador | Buscá por nombre o comité | MATEO | Propuesta |
| T-072 | Ficha, cargo en el comité | General de {comité} · Logística de {comité} · Miembro | GH | Propuesta |
| T-073 | Comités internos, intro | Tus comités y los demás. Acá está lo que no se publica afuera. | COM | Propuesta |
| T-074 | Egresados, título | Egresados | COM | Propuesta |
| T-075 | Egresados, intro | Quienes pasaron por la OE y dejaron huella, año por año. | COM | Propuesta |

### GH Points

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-080 | Título | GH Points | GH | Aprobado |
| T-081 | Saldo | Tenés {n} puntos este semestre | GH | Propuesta |
| T-082 | Niveles (0, 100, 250, 500, 1000 puntos) | Recién llegado · Parchado · De planta · Pilar · Leyenda OE | GH | Propuesta; GH puede renombrar o cambiar los cortes |
| T-083 | Rankings, pestañas | Nuevos · Veteranos · Comités | GH | Propuesta |
| T-084 | Ranking de comités, nota de la tasa suavizada | El porcentaje de cada comité es su participación relativa, ajustada para que los comités chicos no dependan de un solo evento. | GH | Propuesta |
| T-085 | Movimientos, tipos | Asistencia · Ajuste · Reversión · Histórico | MATEO | Propuesta |
| T-086 | Sin movimientos | Todavía no tenés puntos. Tu primera asistencia los estrena. | COM | Propuesta |

### Registro de asistencia (QR)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-090 | Página del QR, título | {nombre de la actividad} | MATEO | Propuesta |
| T-091 | Botón | Registrar mi asistencia | GH | Propuesta |
| T-092 | Éxito con puntos | ¡Listo! Sumaste {n} GH Points. ¡OE OE OE! | COM | Propuesta |
| T-093 | Éxito sin puntos (asamblea, reunión) | ¡Listo! Quedaste registrado. | MATEO | Propuesta |
| T-094 | Pendiente de aprobación | Quedó registrado. GH lo revisa y te avisamos. | GH | Propuesta |
| T-095 | Ya registrado | Ya te habías registrado en esta actividad. | MATEO | Propuesta |
| T-096 | Ventana cerrada | El registro de esta actividad ya cerró. Si estuviste, hablá con quien la organizó. | GH | Propuesta |
| T-097 | Ventana no abierta | El registro abre el {fecha} a las {hora}. | MATEO | Propuesta |
| T-098 | Código rotativo, campo | Escribí el código que está en la pantalla | MATEO | Propuesta |
| T-099 | Código rotativo inválido | Ese código ya cambió. Mirá la pantalla y volvé a escribirlo. | MATEO | Propuesta |
| T-100 | Sin sesión | Para registrarte primero entrá a Mi OE. Volvés aquí solo. | MATEO | Propuesta |

### Permanencia

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-110 | Título | Permanencia | GH | Propuesta |
| T-111 | Intro | Así va tu semestre. Para seguir en la OE necesitás {umbral} % en cada comité: lo que sumás en la tabla general más lo que sumás en el comité. | GH | Propuesta |
| T-112 | Condición | Activo · Nuevo (necesitás 80 %) · En periodo de prueba (necesitás 80 %) · Transferencia a {comité} (necesitás 70 % ahí) | GH | Propuesta |
| T-113 | Resultado por comité | En {comité} vas en {n} % | GH | Propuesta |
| T-114 | Estado: en camino | Vas bien. Todavía podés sumar {n} %. | GH | Propuesta |
| T-115 | Estado: en riesgo | Ojo: te queda poco margen. Todavía podés sumar {n} %; no te pierdas lo que viene. | GH | Propuesta |
| T-116 | Estado: no alcanza | Con lo que queda del semestre ya no llegás al {umbral} % en {comité}. Hablá con GH cuanto antes. | GH | Propuesta; texto sensible |
| T-117 | Estado: cumple (cierre) | Cumpliste en {comité}. Seguís en la OE. ¡OE OE OE! | GH | Propuesta |
| T-118 | Estado: prueba (cierre) | Quedaste en periodo de prueba en {comité}: el próximo semestre necesitás 80 %. GH te va a escribir. | GH | Propuesta; texto sensible |
| T-119 | Estado: no cumple (cierre) | No alcanzaste el mínimo en {comité}. GH te va a contactar para explicarte qué sigue. | GH | Propuesta; texto sensible; el detalle lo da GH en persona |
| T-120 | Bloque general, título | Tabla general | GH | Propuesta |
| T-121 | Bloque del comité, título | Tabla de {comité} | GH | Propuesta |
| T-122 | Criterio, cómo sumar más (integraciones) | Fuiste a {n} de 5 integraciones. Quedan {m} este semestre; la próxima es el {fecha}. | GH | Propuesta |
| T-123 | Criterio, evaluación pendiente | Pendiente de evaluación por {evaluador} al cierre del semestre. | GH | Propuesta |
| T-124 | Asambleas obligatorias | Asambleas obligatorias: {n} de {total}. Faltar a una implica salir de la OE. | GH | Propuesta; texto sensible, confirmar tono |
| T-125 | Nombres de los criterios de la tabla general | Integraciones · Asambleas · Grupos de trabajo de macroeventos · GAP · GAP OE · Comité de trabajo · Barra brava · Decoración de oficina · Integración de nuevos | GH | Propuesta; salen de la hoja de GH |
| T-126 | Descripción corta de cada criterio (una línea) | Por escribir: qué cuenta y qué no, en una frase | GH | Pendiente |

### Normativa, carnet, ajustes, solicitudes y convocatorias

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-130 | Normativa, intro | Estatutos, reglamento y actas. Lo que rige la OE, buscable. | JUNTA | Propuesta |
| T-131 | Carnet, título | Tu carnet OE | COM | Propuesta |
| T-132 | Carnet, texto | Mostralo en la entrada de las actividades. Cambia solo cada 24 horas. | MATEO | Propuesta |
| T-133 | Ajustes, secciones | Mis datos · Notificaciones · Sesiones · Consentimientos · Mis datos y privacidad | MATEO | Propuesta |
| T-134 | Ajustes, editar datos | Podés cambiar tu foto, tu celular y tu correo personal. Tu correo institucional no se cambia: es tu identidad en la OE. | MATEO | Propuesta |
| T-135 | Descargar mis datos | Descargar todo lo que la OE guarda sobre mí | JUNTA | Propuesta |
| T-136 | Solicitar eliminación | Pedir que borren mis datos (GH responde en 15 días hábiles) | JUNTA | Propuesta; el plazo sale de la política |
| T-137 | Cerrar otras sesiones | Cerrar sesión en los demás dispositivos | MATEO | Propuesta |
| T-138 | Solicitudes, título | Solicitudes | GH | Propuesta |
| T-139 | Solicitudes, tipos | Pedir licencia · Cambiarme de comité · Transferirme a otro comité · Retirarme de la OE | GH | Propuesta |
| T-140 | Solicitud enviada | Tu solicitud llegó a GH. Te avisamos cuando la respondan. | GH | Propuesta |
| T-141 | Solicitud aprobada | GH aprobó tu solicitud de {tipo}. Ya está aplicada. | GH | Propuesta |
| T-142 | Solicitud rechazada | GH no aprobó tu solicitud de {tipo}: {motivo}. Si querés hablarlo, escribiles. | GH | Propuesta |
| T-143 | Retiro voluntario, confirmación | ¿Seguro querés retirarte de la OE? Tu historia se conserva, pero no vas a poder volver a entrar a Mi OE. | GH | Propuesta; texto sensible |
| T-144 | Convocatorias, título | Convocatorias | GH | Propuesta |
| T-145 | Convocatorias, intro | Grupos de trabajo, GAP y barra brava que están buscando gente. Inscribite desde acá. | GH | Propuesta |
| T-146 | Convocatoria, botón | Me apunto | COM | Propuesta |
| T-147 | Convocatoria con cupo lleno | Ya se llenó, pero podés quedar en lista de espera. | GH | Propuesta |
| T-148 | Inscripción aceptada | Quedaste en {grupo}. ¡OE OE OE! | COM | Propuesta |

### Consentimientos (se muestran al importar, al entrar por primera vez o en Ajustes)

| Código | Propósito | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-150 | Membresía (`MEMBERSHIP`) | Autorizo a la Organización Estudiantil de la Universidad EAFIT a tratar mis datos para gestionar mi participación en la OE, según su política de tratamiento de datos (versión {v}). | JUNTA | Propuesta; debe calzar con la política aprobada |
| T-151 | Comunicaciones (`COMMUNICATIONS`) | Quiero recibir avisos de la OE por correo y notificaciones, incluso después de salir. Puedo cambiarlo cuando quiera. | JUNTA | Propuesta |
| T-152 | Foto en el directorio (`DIRECTORY_PHOTO`) | Quiero que mi foto aparezca en el directorio de Mi OE y en los reconocimientos. | JUNTA | Propuesta |
| T-153 | Galería de egresados (`MEMORIAL`) | Cuando salga de la OE, quiero aparecer en la galería de egresados con mi nombre, mis comités y mis cargos. | JUNTA | Propuesta |
| T-154 | Formularios públicos, casilla | Acepto la política de tratamiento de datos de la OE. | JUNTA | Propuesta |

### Mi OE · fase 2 (inicio, directorio, comités internos, egresados, normativa, carnet, ajustes)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-370 | Directorio y comités internos, cargo dentro de un comité | {cargo} de {comité} | MATEO | Propuesta |
| T-371 | Directorio sin resultados | No encontramos a nadie con ese nombre. Probá con otro o filtrá por comité. | MATEO | Propuesta |
| T-372 | Directorio, etiqueta del filtro por comité | Comité | MATEO | Propuesta |
| T-373 | Directorio, opción sin filtro de comité | Todos los comités | MATEO | Propuesta |
| T-374 | Directorio, ficha y egresados: eyebrow de los cargos de junta y de GH | Junta y GH | GH | Propuesta |
| T-375 | Inicio y comités internos, título de los comités propios | Tus comités | COM | Propuesta |
| T-376 | Inicio, sin comité en el semestre | Todavía no tenés comité este semestre. GH te ubica en uno. | GH | Propuesta |
| T-377 | Onboarding, botón para marcar un paso | Marcar como hecho | MATEO | Propuesta |
| T-378 | Onboarding, paso pendiente | Pendiente | MATEO | Propuesta |
| T-379 | Onboarding, paso hecho | Hecho | MATEO | Propuesta |
| T-380 | Inicio, agenda: insignia de una edición solo para miembros | Solo miembros | MATEO | Propuesta |
| T-381 | Estados de la membresía (directorio, admin, egresados) | Activo · En licencia · Honorario · Retirado | GH | Propuesta |
| T-382 | Comités internos, título de los demás comités | Los demás comités | COM | Propuesta |
| T-383 | Comité interno, título del roster del semestre | Quiénes están este semestre | COM | Propuesta |
| T-384 | Comité interno sin roster en el semestre | Este semestre todavía no hay nadie registrado en este comité. | MATEO | Propuesta |
| T-385 | Comité interno, enlace de vuelta | Volver a los comités | MATEO | Propuesta |
| T-386 | Egresados sin nadie en la galería | Todavía no hay egresados en la galería. Cuando alguien salga de la OE y lo autorice, aparece acá. | COM | Propuesta |
| T-387 | Egresados, años en la OE | En la OE de {desde} a {hasta} | MATEO | Propuesta |
| T-388 | Directorio y egresados, texto alternativo de la foto | Foto de {nombre} | MATEO | Propuesta |
| T-389 | Normativa, título de la página | Normativa | JUNTA | Propuesta |
| T-390 | Normativa, campo de búsqueda | Buscá en los estatutos y el reglamento | MATEO | Propuesta |
| T-391 | Normativa, título de los resultados | Resultados para “{q}” | MATEO | Propuesta |
| T-392 | Normativa sin resultados | No encontramos nada con esas palabras. Probá con otras. | MATEO | Propuesta |
| T-393 | Normativa sin documentos publicados | Todavía no hay documentos publicados. | MATEO | Propuesta |
| T-394 | Normativa y admin, tipos de documento | Estatutos · Reglamento · Acta · Otro | JUNTA | Propuesta |
| T-395 | Normativa, versión de un documento | Versión {v} | MATEO | Propuesta |
| T-396 | Normativa, enlace al PDF firmado | Abrir el PDF original | MATEO | Propuesta |
| T-397 | Normativa, título de un artículo | Artículo {n} | MATEO | Propuesta |
| T-398 | Normativa, título del índice | Índice | MATEO | Propuesta |
| T-399 | Normativa, enlace de vuelta | Volver a la normativa | MATEO | Propuesta |
| T-400 | Carnet, texto alternativo del QR | Código QR de tu carnet | MATEO | Propuesta |
| T-401 | Carnet, vencimiento del código | Vence el {fecha} | MATEO | Propuesta |
| T-402 | Carnet y directorio, sin comité en el semestre | Sin comité este semestre | MATEO | Propuesta |
| T-403 | Ajustes, campo de la foto | Foto | MATEO | Propuesta |
| T-404 | Ajustes y admin, campo del celular | Celular | MATEO | Propuesta |
| T-405 | Ajustes y admin, campo del correo personal | Correo personal | MATEO | Propuesta |
| T-406 | Ajustes y admin, campo del correo institucional | Correo institucional | MATEO | Propuesta |
| T-407 | Ajustes, botón para subir la foto | Subir foto | MATEO | Propuesta |
| T-408 | Ajustes, ayuda de la foto | JPG, PNG o WebP de hasta 5 MB. Solo se muestra si autorizás la foto en el directorio. | MATEO | Propuesta |
| T-409 | Ajustes, quitar la foto | Quitar foto | MATEO | Propuesta |
| T-410 | Ajustes y admin, celular inválido | Ese celular no tiene un formato válido. Escribí 10 dígitos. | MATEO | Propuesta |
| T-411 | Consentimientos, estado autorizado | Autorizado el {fecha} (política versión {v}) | JUNTA | Propuesta |
| T-412 | Consentimientos, estado no autorizado | No autorizado | JUNTA | Propuesta |
| T-413 | Consentimientos, botones | Autorizar · Retirar la autorización | JUNTA | Propuesta |
| T-414 | Consentimientos, nota sobre el de membresía | El consentimiento de membresía lo registró la OE al importar el roster. Para retirarlo, pedí la eliminación de tus datos. | JUNTA | Propuesta |
| T-415 | Eliminación, confirmación | ¿Seguro? GH revisa tu solicitud y te contacta antes de borrar nada. Tu historia en la OE se conserva sin tu nombre. | JUNTA | Propuesta; texto sensible |
| T-416 | Eliminación, solicitud registrada | Tu solicitud quedó registrada el {fecha}. GH responde en {n} días hábiles. | JUNTA | Propuesta |
| T-417 | Eliminación, botón de confirmación | Sí, pedir la eliminación | JUNTA | Propuesta |
| T-418 | Ajustes, título de la página | Ajustes | MATEO | Propuesta |

## 5. Administración

Los textos del admin son funcionales y los escribe Mateo; GH solo revisa las confirmaciones de acciones sensibles y los mensajes de importación.

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-160 | Secciones | Personas · Organizaciones · Pipelines · Solicitudes · Convocatorias · Formularios · Comunidad · Contenido · Participación · Permanencia · Comunicaciones · Junta · Sistema | MATEO | Propuesta |
| T-161 | Confirmar cancelar una actividad | Vas a cancelar "{actividad}". Se revierten los puntos de {n} personas. Esto no se deshace. Escribí el motivo. | GH | Propuesta |
| T-162 | Confirmar dar de baja | Vas a dar de baja a {nombre}. Su historia se conserva y su perfil pasa a egresado. Escribí el motivo y confirmá los consentimientos. | GH | Propuesta |
| T-163 | Confirmar cerrar el semestre | Vas a cerrar {término}. Los puntos quedan congelados y se generan las propuestas de permanencia. Revisalas antes de aplicar. | GH | Propuesta |
| T-164 | Cierre, propuesta por persona | Propuesta: {estado}. Motivo automático: {detalle}. Podés cambiarla con motivo. | GH | Propuesta |
| T-165 | Importación, errores (uno por regla) | Correo repetido en el archivo · Correo fuera del dominio institucional · Comité "{sigla}" no existe, ¿quisiste decir "{sugerencia}"? · Más de 3 comités · Semestre de ingreso vacío o inexistente · Estado fuera de la lista · Cargo desconocido · Cargo sin comité (la persona tiene varios) · Dos Generales en {comité} · Faltan columnas obligatorias para una persona nueva | MATEO | Propuesta |
| T-166 | Importación, resumen | {n} personas nuevas, {m} con cambios, {k} sin cambios. Nada se aplica hasta que confirmes. | MATEO | Propuesta |
| T-167 | Evaluación, botones | Buen desempeño · Insuficiente (pide observación) | GH | Propuesta |
| T-168 | Evaluación, ventana abierta (aviso a evaluadores) | Se abrió la ventana de evaluación de {término}. Tenés {n} personas pendientes hasta el {fecha}. | GH | Propuesta |
| T-169 | Step-up en exportes | Este exporte tiene datos personales: pedimos un código nuevo y queda registrado. | MATEO | Propuesta |

### Admin kit (listados, paneles, exportes y paleta)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-250 | Listados: buscador y botón | Buscar | MATEO | Propuesta |
| T-251 | Listados: crear un registro | Nuevo | MATEO | Propuesta |
| T-252 | Listados: abrir un registro | Editar | MATEO | Propuesta |
| T-253 | Panel: guardar | Guardar | MATEO | Propuesta |
| T-254 | Panel: cerrar sin guardar | Cancelar | MATEO | Propuesta |
| T-255 | Listados: descargar el listado | Exportar CSV | MATEO | Propuesta |
| T-256 | Listados y paleta: sin resultados | Sin resultados para esta búsqueda. | MATEO | Propuesta |
| T-257 | Listados: paginación | Página {n} de {total} | MATEO | Propuesta |
| T-258 | Listados: navegación entre páginas | Anterior · Siguiente | MATEO | Propuesta |
| T-259 | Panel: confirmación tras guardar | Guardado. | MATEO | Propuesta |
| T-260 | Panel: hay errores de validación | Revisá los campos marcados. | MATEO | Propuesta |
| T-261 | Recurso comités (plural · singular) | Comités · Comité | MATEO | Propuesta |
| T-262 | Recurso términos (plural · singular) | Términos · Término | MATEO | Propuesta |
| T-263 | Recurso permisos (plural · singular) | Permisos · Permiso | MATEO | Propuesta |
| T-264 | Paleta ⌘K: campo de búsqueda | Buscá personas o comités | MATEO | Propuesta |
| T-265 | Permisos: quitar un permiso | Revocar | MATEO | Propuesta |
| T-266 | Permisos: regla del último ADMIN | No se puede retirar el último ADMIN. | MATEO | Propuesta |
| T-267 | Permisos: correo sin persona en el roster | Ese correo no está en el roster. | MATEO | Propuesta |
| T-268 | Permisos: duplicado | Ya tiene ese permiso. | MATEO | Propuesta |
| T-269 | Permisos: campo del correo | Correo de la persona | MATEO | Propuesta |
| T-270 | Permisos: campo del permiso | Permiso | MATEO | Propuesta |
| T-271 | Permisos: campo del comité | Comité (solo para líderes) | MATEO | Propuesta |
| T-272 | Comités: campo sigla | Sigla | MATEO | Propuesta |
| T-273 | Comités y términos: campo nombre | Nombre | MATEO | Propuesta |
| T-274 | Comités: campo estado | Estado | MATEO | Propuesta |
| T-275 | Comités: campo color | Color | MATEO | Propuesta |
| T-276 | Comités: campo logo | Logo | MATEO | Propuesta |
| T-277 | Comités: campo presentación | Presentación | MATEO | Propuesta |
| T-278 | Comités: campo enlace de contacto | Enlace de contacto | MATEO | Propuesta |
| T-279 | Comités: campo publicación | Publicación | MATEO | Propuesta |
| T-280 | Términos: campo código | Código del término (por ejemplo 2026-2) | MATEO | Propuesta |
| T-281 | Términos: campo inicio | Inicio | MATEO | Propuesta |
| T-282 | Términos: campo fin | Fin | MATEO | Propuesta |
| T-283 | Términos: asambleas ordinarias obligatorias | Asambleas ordinarias obligatorias | MATEO | Propuesta |
| T-284 | Términos: nominal de la tabla general | Puntos nominales de la tabla general | MATEO | Propuesta |
| T-285 | Términos: nominal de la tabla de comité | Puntos nominales de la tabla de comité | MATEO | Propuesta |
| T-286 | Términos: cierre de puntos | Puntos cerrados el | MATEO | Propuesta |
| T-287 | Comités: opciones de estado | Activo · Inactivo | MATEO | Propuesta |
| T-288 | Contenido: opciones de publicación | Borrador · Publicado | MATEO | Propuesta |
| T-289 | Permisos: opciones (ADMIN, líder, junta) | ADMIN · Líder de comité · Junta | MATEO | Propuesta |
| T-290 | Paleta ⌘K: tipos de resultado | Persona · Comité | MATEO | Propuesta |
| T-291 | Paleta y paneles: cerrar | Cerrar | MATEO | Propuesta |
| T-292 | Comités: sigla repetida | Ya existe un comité con esa sigla. | MATEO | Propuesta |
| T-293 | Términos: código repetido | Ya existe ese término. | MATEO | Propuesta |
| T-294 | Permisos: comité obligatorio solo para líderes | El líder necesita un comité; ADMIN y Junta no llevan comité. | MATEO | Propuesta |
| T-295 | Permisos: columnas de otorgamiento | Otorgado el · Otorgado por | MATEO | Propuesta |
| T-296 | Permisos: columna de la persona | Persona | MATEO | Propuesta |
| T-297 | Términos: columna semestre | Semestre | MATEO | Propuesta |
| T-298 | Términos: fechas invertidas | El fin debe ser posterior al inicio. | MATEO | Propuesta |
| T-299 | Paleta ⌘K: botón que la abre | Buscar (⌘K) | MATEO | Propuesta |

### Admin de Contenido (páginas, cartelera, eventos, ediciones y medios)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-330 | Recurso páginas (plural · singular) | Páginas · Página | MATEO | Propuesta |
| T-331 | Recurso cartelera (plural · singular) | Cartelera · Anuncio | MATEO | Propuesta |
| T-332 | Recurso eventos (plural · singular) | Eventos · Evento | MATEO | Propuesta |
| T-333 | Recurso ediciones (plural · singular) | Ediciones · Edición | MATEO | Propuesta |
| T-334 | Recurso medios (plural · singular) | Medios · Medio | MATEO | Propuesta |
| T-335 | Contenido: campo título | Título | MATEO | Propuesta |
| T-336 | Contenido: campo cuerpo | Cuerpo (Markdown) | MATEO | Propuesta |
| T-337 | Contenido: ayuda del campo cuerpo | Podés usar títulos, listas, negritas y enlaces. Las imágenes se suben en Medios. | MATEO | Propuesta |
| T-338 | Contenido: campo audiencia | Audiencia | MATEO | Propuesta |
| T-339 | Contenido: opciones de audiencia | Público · Solo miembros | MATEO | Propuesta |
| T-340 | Cartelera: campo fijado | Fijado arriba de la cartelera | MATEO | Propuesta |
| T-341 | Cartelera: columna y campo de la fecha de publicación | Publicado el | MATEO | Propuesta |
| T-342 | Cartelera: acción de publicar | Publicar | MATEO | Propuesta |
| T-343 | Cartelera: acción de despublicar | Despublicar | MATEO | Propuesta |
| T-344 | Eventos: campo resumen | Resumen (una o dos líneas) | MATEO | Propuesta |
| T-345 | Eventos y ediciones: campo descripción | Descripción (Markdown) | MATEO | Propuesta |
| T-346 | Eventos y ediciones: campo portada | Portada | MATEO | Propuesta |
| T-347 | Ediciones: campo evento | Evento | MATEO | Propuesta |
| T-348 | Ediciones: campo nombre | Nombre de la edición (por ejemplo 2026-2) | MATEO | Propuesta |
| T-349 | Páginas, eventos y ediciones: campo identificador en la URL | Identificador en la URL (minúsculas y guiones) | MATEO | Propuesta |
| T-350 | Ediciones: campo inicio | Empieza | MATEO | Propuesta |
| T-351 | Ediciones: campo fin | Termina | MATEO | Propuesta |
| T-352 | Ediciones: campo lugar | Lugar | MATEO | Propuesta |
| T-353 | Ediciones: campo enlace de inscripción externa | Enlace de inscripción (otro sitio) | MATEO | Propuesta |
| T-354 | Ediciones: campo comités organizadores | Comités organizadores | MATEO | Propuesta |
| T-355 | Eventos: campo orden en el inicio | Orden en el inicio | MATEO | Propuesta |
| T-356 | Medios: botón y campo para subir | Subir imagen | MATEO | Propuesta |
| T-357 | Medios: ayuda del subidor | JPG, PNG o WebP de 5 KB a 20 MB. Solo imágenes con permiso de uso; nada de fotos de personas sin consentimiento. | MATEO | Propuesta |
| T-358 | Medios: estados de un medio | Procesando · Lista · Falló | MATEO | Propuesta |
| T-359 | Medios: subida en curso | Subiendo {nombre}… | MATEO | Propuesta |
| T-360 | Medios: subida confirmada | Listo: la imagen queda disponible en unos segundos. | MATEO | Propuesta |
| T-361 | Medios: archivo de otro tipo | Ese archivo no es una imagen JPG, PNG o WebP. | MATEO | Propuesta |
| T-362 | Medios: archivo fuera de tamaño | La imagen debe pesar entre 5 KB y 20 MB. | MATEO | Propuesta |
| T-363 | Medios: error de subida | No se pudo subir la imagen. Intentá de nuevo. | MATEO | Propuesta |
| T-364 | Medios: columnas del listado | Archivo · Tamaño · Dimensiones · Estado · Subido el | MATEO | Propuesta |
| T-365 | Medios: campo visibilidad | Visibilidad | MATEO | Propuesta |
| T-366 | Medios: opciones de visibilidad | Pública · Privada | MATEO | Propuesta |
| T-367 | Páginas, eventos y ediciones: identificador repetido | Ya existe otro con ese identificador. | MATEO | Propuesta |
| T-368 | Eventos y ediciones: opción sin portada | Sin portada (cartel tipográfico) | MATEO | Propuesta |
| T-369 | Eventos: enlace a las ediciones desde la fila | Ediciones ({n}) | MATEO | Propuesta |

### Admin de Personas y CRM (fase 2: personas, Persona 360, importación, cargos, etiquetas, tareas, segmentos, documentos)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-420 | Recurso personas (plural · singular) | Personas · Persona | MATEO | Propuesta |
| T-421 | Recurso cargos de comité (plural · singular) | Cargos de comité · Cargo de comité | MATEO | Propuesta |
| T-422 | Recurso etiquetas (plural · singular) | Etiquetas · Etiqueta | MATEO | Propuesta |
| T-423 | Recurso tareas (plural · singular) | Tareas · Tarea | MATEO | Propuesta |
| T-424 | Recurso segmentos (plural · singular) | Segmentos · Segmento | MATEO | Propuesta |
| T-425 | Recurso documentos (plural · singular) | Documentos · Documento | MATEO | Propuesta |
| T-426 | Importaciones, título de la lista | Importaciones | MATEO | Propuesta |
| T-427 | Personas: campos y columnas | Nombre · Apellido · Correo institucional · Nombre preferido · Celular · Correo personal · Programa · Tipo · Etapa · Estado · Semestre de ingreso | MATEO | Propuesta |
| T-428 | Personas: opciones de tipo | Estudiante · Contacto externo | MATEO | Propuesta |
| T-429 | Personas: opciones de etapa | Prospecto · Postulante · Miembro · Egresado | MATEO | Propuesta |
| T-430 | Personas: correo repetido | Ya existe una persona con ese correo. | MATEO | Propuesta |
| T-431 | Personas: columna de comités del semestre | Comités del semestre | MATEO | Propuesta |
| T-432 | Persona 360: pestañas | Resumen · Línea de tiempo · Membresía · Participación · Permanencia · Formularios · Comunicaciones · Tareas · Solicitudes · Datos y consentimiento | MATEO | Propuesta |
| T-433 | Persona 360: acciones | Editar datos · Cambiar estado · Dar de baja · Reactivar · Anonimizar · Nueva nota · Nueva tarea · Etiquetas · Permisos | MATEO | Propuesta |
| T-434 | Cambiar estado, baja y notas: campo motivo | Motivo | MATEO | Propuesta |
| T-435 | Cambiar estado: campo del estado nuevo | Estado nuevo | MATEO | Propuesta |
| T-436 | Dar de baja: motivos | Graduación · Retiro voluntario · Permanencia · Otro | GH | Propuesta |
| T-437 | Dar de baja: casillas de consentimiento | Autoriza aparecer en la galería de egresados · Autoriza que la OE lo contacte después de salir | JUNTA | Propuesta |
| T-438 | Dar de baja: botón | Dar de baja | GH | Propuesta |
| T-439 | Reactivar: texto | Vas a reactivar a {nombre}: vuelve a ser miembro activo con su historia. Si tiene un correo institucional nuevo, escribilo. | GH | Propuesta |
| T-440 | Anonimizar: texto | Vas a anonimizar a {nombre} por su solicitud del {fecha}. Se borran nombre, contacto, foto, notas y tareas; comités y puntos quedan sin nombre. Esto no se deshace. | JUNTA | Propuesta; texto sensible |
| T-441 | Anonimizar: botón | Anonimizar | MATEO | Propuesta |
| T-442 | Anonimizar sin solicitud previa | Solo se anonimiza a quien lo pidió desde Mi OE. | MATEO | Propuesta |
| T-443 | Membresía: títulos de los bloques | Historial de estados · Comités por semestre · Cargos de junta y de GH · Condición del semestre | MATEO | Propuesta |
| T-444 | Membresía: cargos de junta y de GH (opciones) | Presidencia · Vicepresidencia de GH · Vicepresidencia de Relaciones Públicas · Vicepresidencia Administrativa · Vicepresidencia Financiera · GH principal · Director de GH · Otro | JUNTA | Propuesta |
| T-445 | Membresía: campo del título cuando el cargo es Otro | Título del cargo | MATEO | Propuesta |
| T-446 | Membresía: casilla del permiso de junta | Otorgar también el permiso Junta (pide un código nuevo) | MATEO | Propuesta |
| T-447 | Membresía: botones de cargos | Agregar cargo · Quitar | MATEO | Propuesta |
| T-448 | Membresía: título del editor de comités | Comités de {término} | MATEO | Propuesta |
| T-449 | Membresía: condición de prueba | En periodo de prueba | GH | Propuesta |
| T-450 | Membresía: campos de una pertenencia | Comité · Cargo · Transferencia interna | MATEO | Propuesta |
| T-451 | Membresía: regla de cantidad de comités | Un activo necesita entre {min} y {max} comités. | MATEO | Propuesta |
| T-452 | Membresía: ya hay un General | {comité} ya tiene un General este semestre. | MATEO | Propuesta |
| T-453 | Resumen: etiquetas | Último contacto · Tareas abiertas · Consentimientos · Permisos · Puntos del semestre · Asambleas | MATEO | Propuesta |
| T-454 | Línea de tiempo: filtro por tipo | Todo · Notas · Membresía · Comités · Consentimientos · Datos · Importaciones · Otros | MATEO | Propuesta |
| T-455 | Línea de tiempo: ayuda del compositor de notas | Escribí una nota para el equipo. La persona puede pedir verla. | MATEO | Propuesta |
| T-456 | Línea de tiempo: botones y marca de nota | Guardar nota · Editar · Editada el {fecha} | MATEO | Propuesta |
| T-457 | Línea de tiempo vacía | Todavía no hay nada en la línea de tiempo. | MATEO | Propuesta |
| T-458 | Línea de tiempo: textos de las interacciones automáticas | Importado desde el roster {término} · Estado cambió de {de} a {a}: {motivo} · Dado de baja: {motivo} · Reactivado · Comités de {término}: {comités} · Cargo {cargo} desde {término} · Cargo {cargo} retirado · Consentimiento de {propósito} autorizado · Consentimiento de {propósito} retirado · Datos actualizados: {campos} · Correo institucional cambiado · Pidió la eliminación de sus datos · Descargó sus datos · Datos anonimizados · Permiso {permiso} otorgado · Permiso {permiso} revocado | MATEO | Propuesta |
| T-459 | Tareas: campos y columnas | Título · Responsable · Vence · Estado · Persona · Tipo | MATEO | Propuesta |
| T-460 | Tareas: opciones de estado | Abierta · Hecha | MATEO | Propuesta |
| T-461 | Tareas: tipos | General · Solicitud de eliminación | MATEO | Propuesta |
| T-462 | Tareas: acción de cerrar | Marcar hecha | MATEO | Propuesta |
| T-463 | Tareas: filtro por responsable | Mías · Sin asignar · Todas | MATEO | Propuesta |
| T-464 | Tarea de eliminación: título | Eliminación de datos pedida por {nombre} | MATEO | Propuesta |
| T-465 | Etiquetas: campos | Nombre · Color | MATEO | Propuesta |
| T-466 | Etiquetas: nombre repetido | Ya existe una etiqueta con ese nombre. | MATEO | Propuesta |
| T-467 | Persona 360: sin etiquetas | Sin etiquetas | MATEO | Propuesta |
| T-468 | Segmentos: campos | Nombre · Etapa · Estado de membresía · Ingreso · Comités · Cargos · Etiquetas · Consentimiento · Programa | MATEO | Propuesta |
| T-469 | Segmentos: opciones de ingreso | Cualquiera · Nuevos este semestre · Veteranos | MATEO | Propuesta |
| T-470 | Segmentos: opciones de consentimiento | Cualquiera · Con consentimiento de comunicaciones · Sin consentimiento de comunicaciones · Con foto autorizada · Con galería de egresados autorizada | MATEO | Propuesta |
| T-471 | Segmentos: columna de personas | Personas | MATEO | Propuesta |
| T-472 | Segmentos: acción de exportar | Exportar personas | MATEO | Propuesta |
| T-473 | Cargos de comité: campos | Código · Nombre · Es liderazgo · Orden | MATEO | Propuesta |
| T-474 | Cargos de comité: código repetido | Ya existe un cargo con ese código. | MATEO | Propuesta |
| T-475 | Importación: pasos | 1. Archivo y semestre · 2. Columnas · 3. Revisión y confirmación | MATEO | Propuesta |
| T-476 | Importación: campo del archivo | Archivo del roster (CSV o Excel) | MATEO | Propuesta |
| T-477 | Importación: campo del semestre | Semestre del archivo | MATEO | Propuesta |
| T-478 | Importación: ayuda del archivo | Un archivo por semestre con las columnas de GH: NOMBRE, APELLIDO, CORREO, CELULAR, PREGRADO, COMITES, ENTRADA A LA OE, ESTADO y CARGO. Si trae CORREO y solo algunas columnas, actualiza solo esas. | MATEO | Propuesta |
| T-479 | Importación: botones | Subir y revisar · Continuar · Aplicar la importación · Descartar | MATEO | Propuesta |
| T-480 | Importación: etiqueta del mapeo de una columna | La columna "{cabecera}" va a | MATEO | Propuesta |
| T-481 | Importación: opción de ignorar una columna | Ignorar esta columna | MATEO | Propuesta |
| T-482 | Importación: grupos de la vista previa | Personas nuevas · Con cambios · Sin cambios · Con errores | MATEO | Propuesta |
| T-483 | Importación: advertencias (una por regla) | Programa que no está en el catálogo · Celular con formato raro · Nombre en mayúsculas sostenidas | MATEO | Propuesta |
| T-484 | Importación: propuesta de líderes | Otorgar el permiso de líder a cada General (marcado por defecto) | MATEO | Propuesta |
| T-485 | Importación: semestres por crear | Estos semestres no existen y se crean al confirmar con fechas por semestre calendario: {lista}. Podés corregir las fechas después en Términos. | MATEO | Propuesta |
| T-486 | Importación: cargos por crear | Cargos nuevos que se agregan al catálogo: {lista} | MATEO | Propuesta |
| T-487 | Importación aplicada | Listo: {n} personas nuevas y {m} actualizadas. El archivo original quedó guardado. | MATEO | Propuesta |
| T-488 | Importación: archivo ilegible | No pudimos leer el archivo. Tiene que ser CSV o Excel (.xlsx) de menos de 5 MB. | MATEO | Propuesta |
| T-489 | Importación: aviso del modo actualización | El archivo trae solo algunas columnas: se actualizan esas columnas en las personas que ya existen. | MATEO | Propuesta |
| T-490 | Importación: columnas obligatorias que faltan en el archivo | Faltan columnas obligatorias: {lista} | MATEO | Propuesta |
| T-491 | Importación: prefijo de una fila | Fila {n} | MATEO | Propuesta |
| T-492 | Importaciones: columnas del listado | Archivo · Tipo · Semestre · Estado · Resumen · Creada · Por | MATEO | Propuesta |
| T-493 | Importaciones: estados | En revisión · Aplicada · Descartada · Falló | MATEO | Propuesta |
| T-494 | Documentos: campos | Título · Tipo · Versión (fecha de la reforma) · Audiencia · Archivo PDF | MATEO | Propuesta |
| T-495 | Documentos: botón de subida | Subir PDF | MATEO | Propuesta |
| T-496 | Documentos: ayuda | PDF de hasta 20 MB. Después cargá los artículos desde el JSON del extractor para que se puedan buscar. | MATEO | Propuesta |
| T-497 | Documentos: cargar artículos | Cargar artículos (JSON) | MATEO | Propuesta |
| T-498 | Documentos: artículos cargados | {n} artículos cargados | MATEO | Propuesta |
| T-499 | Documentos: JSON inválido | Ese JSON no tiene el formato del extractor: {detalle} | MATEO | Propuesta |
| T-500 | Documentos: columnas | Título · Tipo · Versión · Artículos · Publicación · Subido el | MATEO | Propuesta |
| T-501 | Documentos: archivo que no es PDF | Ese archivo no es un PDF. | MATEO | Propuesta |
| T-502 | Datos y consentimiento: títulos | Datos personales · Consentimientos · Eliminación · Exportar | MATEO | Propuesta |
| T-503 | Datos y consentimiento: botones de consentimiento por admin | Registrar autorización dada en persona · Retirar | JUNTA | Propuesta |
| T-504 | Datos y consentimiento: solicitud de eliminación | Pidió la eliminación el {fecha}. Vence el {vence}. | MATEO | Propuesta |
| T-505 | Datos y consentimiento: exportar | Descargar los datos de esta persona (JSON) | MATEO | Propuesta |
| T-506 | Comunicaciones: columnas | Asunto · Canal · Estado · Enviado | MATEO | Propuesta |
| T-507 | Comunicaciones vacía | Todavía no le hemos enviado nada. | MATEO | Propuesta |
| T-508 | Personas: filtros | Etapa · Estado · Comité · Segmento | MATEO | Propuesta |
| T-509 | Navegación del admin: enlaces de la fase 2 | Personas · Importar roster · Cargos · Etiquetas · Tareas · Segmentos · Documentos · Importaciones | MATEO | Propuesta |
| T-510 | Cambiar estado: aviso de sesiones | Al salir de activo u honorario se cierran sus sesiones. | MATEO | Propuesta |
| T-511 | Persona 360: cabecera | Correo · Celular · Programa · Ingresó en {término} | MATEO | Propuesta |
| T-512 | Editar datos: aviso al cambiar el correo | Cambiar el correo cierra sus sesiones: vuelve a entrar con el nuevo. | MATEO | Propuesta |
| T-513 | Tarea creada | Tarea creada. | MATEO | Propuesta |
| T-514 | Membresía: sin cargos | Sin cargos de junta ni de GH. | MATEO | Propuesta |
| T-515 | Línea de tiempo: autor del sistema | Sistema | MATEO | Propuesta |
| T-516 | Propósitos de consentimiento (etiquetas cortas, en el orden del modelo) | Membresía · Comunicaciones · Foto en el directorio · Galería de egresados | JUNTA | Propuesta |
| T-517 | Línea de tiempo: nota de otra persona | Solo quien escribió la nota puede editarla. | MATEO | Propuesta |

## 6. Notificaciones

### Push (título · cuerpo)

| Código | Cuándo | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-180 | Anuncio nuevo | {título del anuncio} · {primera línea} | COM | Propuesta |
| T-181 | Puntos acreditados | ¡Sumaste {n} GH Points! · Por {actividad}. Ya vas en {total}. | GH | Propuesta |
| T-182 | Actividad hoy | Hoy: {actividad} · {hora} en {lugar}. El registro abre a las {hora}. | GH | Propuesta |
| T-183 | Asamblea obligatoria (día anterior y dos horas antes) | Asamblea obligatoria {día} · {hora} en {lugar}. Recordá que faltar implica salir de la OE. | GH | Propuesta; texto sensible, confirmar tono |
| T-184 | Permanencia, mitad de semestre | Vas en {n} % en {comité} · Necesitás {umbral} %. Mirá qué podés sumar. | GH | Propuesta |
| T-185 | Permanencia, tres semanas antes del cierre (solo por debajo) | Quedan 3 semanas · Vas en {n} % en {comité} y necesitás {umbral} %. Todavía podés sumar {m} %. | GH | Propuesta |
| T-186 | Permanencia, "no alcanza" | Hablá con GH · Con lo que queda del semestre no llegás al mínimo en {comité}. | GH | Propuesta; texto sensible |
| T-187 | Cierre de semestre | Cerró {término} · Entrá a ver tu resultado en cada comité. | GH | Propuesta |
| T-188 | Evaluación pendiente (a evaluadores) | Tenés {n} evaluaciones pendientes · La ventana cierra el {fecha}. | GH | Propuesta |
| T-189 | Solicitud respondida | Tu solicitud de {tipo} fue {aprobada/rechazada} · Entrá a ver la respuesta. | GH | Propuesta |
| T-190 | Convocatoria abierta | Se abrió {convocatoria} · {cupo} cupos, cierra el {fecha}. | GH | Propuesta |
| T-191 | Encuesta tras la actividad | ¿Cómo estuvo {actividad}? · Contanos en un minuto. | COM | Propuesta |
| T-192 | Reconocimiento | ¡Destacado del mes! · {nombre} es el destacado de {comité}. | COM | Propuesta |
| T-193 | Reunión de comité mañana | Mañana reunión de {comité} · {hora} en {lugar}. | COMITÉ | Propuesta |

### Correos

| Código | Cuándo | Asunto · cuerpo | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-200 | Bienvenida al dar de alta | Bienvenido a la OE, {nombre} · Ya podés entrar a Mi OE con tu correo institucional: te llega un código cada vez que entrás. Tus comités: {comités}. Lo hacemos por vos. ¡OE OE OE! | GH | Propuesta |
| T-201 | Roster importado (primer semestre de la app) | Ya tenés tu Mi OE · Explica qué es Mi OE, cómo entrar y qué va a encontrar | COM | Propuesta; se escribe con la campaña de lanzamiento |
| T-202 | Resultado de permanencia (cumple) | Cerró {término} · Tu resultado en cada comité y tus puntos del semestre | GH | Propuesta |
| T-203 | Resultado de permanencia (prueba) | Sobre tu permanencia en la OE · Texto por escribir: qué significa el periodo de prueba, qué se espera y con quién hablar | GH | Pendiente; texto sensible |
| T-204 | Resultado de permanencia (salida) | Sobre tu permanencia en la OE · Texto por escribir: comunicación de salida, agradecimiento, cómo queda su historia | GH y JUNTA | Pendiente; texto sensible |
| T-205 | Solicitud respondida | Respuesta a tu solicitud de {tipo} · Aprobada o rechazada, con motivo | GH | Propuesta |
| T-206 | Salida voluntaria | Gracias por tu tiempo en la OE · Confirmación, qué pasa con sus datos, cómo aparece en egresados si lo autorizó | GH | Propuesta |
| T-207 | Campaña (plantilla base) | {asunto} · Encabezado con logo, cuerpo, cierre "Lo hacemos por vos", enlace para dejar de recibir campañas | COM | Propuesta |
| T-208 | Pie legal de todos los correos | Organización Estudiantil · Universidad EAFIT · Bloque 29 of. 525 · Recibís este correo porque estás en el roster de la OE. {enlace de baja si aplica} | JUNTA | Propuesta |

## 7. Documentos generados

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-220 | Carnet, textos | Organización Estudiantil · {nombre} · {comités} · {semestre} · QR | COM | Propuesta |
| T-221 | Exportes, cabeceras | En español, sin abreviaturas: Nombre, Apellido, Correo, Comités, Estado, Semestre de ingreso, Puntos, Permanencia | MATEO | Propuesta |
| T-222 | Cartel de egresados por año | Egresados {año} · {nombres} | COM | Propuesta |
| T-223 | Nombre que queda al anonimizar una persona (eliminación a pedido) | Egresado | JUNTA | Propuesta |

## 8. Sistema

Textos de controles genéricos que no cambian el sentido institucional.

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-230 | Botón para reintentar tras un error | Intentar de nuevo | MATEO | Propuesta |
| T-231 | Botón para salir de Mi OE y del admin | Cerrar sesión | MATEO | Propuesta |
| T-232 | Sesiones: marca de la sesión actual | Este dispositivo | MATEO | Propuesta |
| T-233 | Sesiones: columna de última actividad | Última actividad | MATEO | Propuesta |
| T-234 | Sesiones: dispositivo sin identificar | Dispositivo | MATEO | Propuesta |
| T-235 | Sesiones: confirmación al cerrar las demás | Listo: cerramos tus otras sesiones. | MATEO | Propuesta |
| T-236 | Título del área de administración | Administración | MATEO | Propuesta |
| T-237 | Ingresar: volver al primer paso | Pedir otro código | MATEO | Propuesta |
| T-238 | Ingresar: etiqueta del campo del código | Código de seis dígitos | MATEO | Propuesta |
| T-239 | Ingresar: correo con formato inválido | Ese correo no tiene un formato válido. Revisalo. | MATEO | Propuesta |
| T-240 | Admin: aviso de sección aún sin construir | Esta sección llega en una fase siguiente. | MATEO | Propuesta |
| T-241 | Admin, sistema: título de la vista del outbox | Trabajos de fondo | MATEO | Propuesta |
| T-242 | Admin, sistema: lista de pendientes | Pendientes | MATEO | Propuesta |
| T-243 | Admin, sistema: lista de procesados | Procesados | MATEO | Propuesta |
| T-244 | Admin, sistema: lista de fallidos (dead letter) | Con error | MATEO | Propuesta |
| T-245 | Admin, sistema: botón para reencolar un fallido | Reintentar | MATEO | Propuesta |
| T-246 | Admin, sistema: columnas de la tabla del outbox | Evento · Intentos · Próximo intento · Último error · Procesado · Creado | MATEO | Propuesta |
| T-247 | Admin, sistema: lista vacía | No hay trabajos en esta lista. | MATEO | Propuesta |

## 9. Lo que debe entregar cada dueño

- **COM:** nombre del sitio, textos del inicio, descripciones de los cuatro macroeventos, redes y contacto, plantilla de campaña, campaña de lanzamiento.
- **GH:** texto de Unirse y del proceso de admisión, pasos del onboarding, descripción de una línea de cada criterio de permanencia, tono de los mensajes sensibles (asamblea obligatoria, prueba, salida), nombres y cortes de los niveles de GH Points, preguntas de la encuesta corta.
- **JUNTA:** política de datos y su versión, textos de consentimiento, plazo de respuesta a la eliminación, misión y visión (ya en el manual), pie legal.
- **Cada comité:** presentación, contacto, y los textos de su tabla de permanencia (nombres de los criterios y de los dos eventos).
- **Mateo:** todo lo marcado MATEO, que no cambia el sentido institucional.

Cuando un texto quede aprobado, se cambia su estado aquí y se anota la fecha en el registro del [roadmap](09-roadmap.md). Los textos con "sensible" se revisan con GH antes de escribir código, porque un error de tono ahí cuesta más que cualquier bug.
