# Copy y textos de la app

Inventario de **todos los textos que la app necesita**, para que GH, comunicaciones, la junta y los comités pongan lo que quieran antes de que exista código. Cada texto tiene un código (`T-…`), dónde aparece, una propuesta escrita en la voz de la OE, quién es su dueño y su estado. Lo que diga "Propuesta" es un borrador de Mateo que se puede reemplazar; lo que diga "Aprobado" ya lo validó su dueño. Nada de esto se inventa en el código: el código lee de aquí.

Dueños: **GH** (Gestión Humana), **COM** (comunicaciones y relaciones públicas), **JUNTA**, **COMITÉ** (cada comité escribe lo suyo), **MATEO** (textos del sistema que no cambian el sentido institucional).

## 1. Voz y reglas

Según el manual de marca ([07-marca.md](07-marca.md)): cercana y "parchada", con **voseo**, lenguaje cotidiano; personalidad servicial, fraternal y versátil; cierre **¡OE OE OE!** en éxitos y celebraciones, nunca en errores ni en mensajes sensibles (permanencia, salida, expulsión). Frases cortas. Sin jerga administrativa donde lo lee un miembro.

Toque paisa ([ADR-086](adr/ADR-086-copy-paisa-y-parchado.md), 2026-09-22): sutil, uno por texto y no en todos. Permitido: de una, hágale, listo pues, pues, bacano, qué nota, pilas, parce/parcero (solo saludos y celebraciones), parche, camellar, severo, a lo bien, ratico, pegarse, berraco (admiración). Vetado: chimba, gonorrea, marica, huevón y cualquier grosería. En botones, formularios y errores manda la claridad; el admin lleva el mismo toque, más sobrio; permanencia, salida, expulsión y lo marcado "texto sensible" siguen serios. Las filas "Confirmado" y "Aprobado por el manual" no se reescriben. Los `{variables}`, las piezas separadas por " · " y el `**negrito**` de cada texto no cambian.

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
| Comité | Los comités de pertenencia | Comité de trabajo se escribe completo para no confundir |
| Término | Solo en el admin; para el miembro se dice semestre | |

Límites: título de push hasta 40 caracteres y cuerpo hasta 120; asunto de correo hasta 60; botones de una a tres palabras; mensajes de error que digan qué pasó y qué hacer.

## 2. Portal público

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-001 | Nombre del sitio (pestaña, buscadores) | Organización Estudiantil EAFIT | COM | Propuesta |
| T-002 | Inicio, titular del hero | Lo hacemos por vos | COM | Propuesta |
| T-003 | Inicio, texto bajo el titular | Desde 1987 somos el grupo estudiantil más grande de EAFIT: 18 comités, cuatro macroeventos y una comunidad que se organiza y se pone a camellar para que las cosas pasen. | COM | Propuesta |
| T-004 | Inicio, botón principal | Entrá a Mi OE | COM | Propuesta |
| T-005 | Inicio, botón secundario | Conocé los comités | COM | Propuesta |
| T-006 | Inicio, título de la sección de macroeventos | Nuestros macroeventos | COM | Propuesta |
| T-007 | Inicio, título de la cartelera | Qué está pasando | COM | Propuesta |
| T-008 | Inicio, título del próximo encuentro | Próximo encuentro | COM | Propuesta |
| T-009 | Inicio, cuando no hay anuncios ni encuentros | Por ahora no hay nada programado. Volvé pronto, pues. | MATEO | Propuesta |
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
| T-022 | Comités, intro | 18 comités, 18 formas de vivir la OE. Encontrá tu parche. | COM | Propuesta |
| T-023 | Comité, presentación (uno por comité) | Por escribir: 2 a 4 párrafos, qué hacen, cómo trabajan, cómo entrar | COMITÉ | Pendiente ×27 |
| T-024 | Comité, botón de contacto | Escribiles | COM | Propuesta |
| T-025 | Unirse, título | ¿Te querés pegar a la OE? | GH | Propuesta |
| T-026 | Unirse, texto del proceso | Por escribir: requisitos, fechas de convocatoria, qué pasa después de postularse | GH | Pendiente |
| T-027 | Unirse, botón | Postulate | GH | Propuesta |
| T-028 | Unirse, cuando no hay convocatoria abierta | Ahora no hay convocatoria abierta, pero dejanos tu correo y te avisamos de una cuando abra. | GH | Propuesta |
| T-029 | Privacidad, título | Tratamiento de datos personales | JUNTA | Propuesta |
| T-030 | Privacidad, texto | Texto completo en docs/17-politica-de-datos.md; se publica en la página privacidad y su versión es la fecha de aprobación | JUNTA | Borrador entregado; falta aprobación de la junta |
| T-031 | Pie de página | Organización Estudiantil · Universidad EAFIT · desde 1987 | COM | Propuesta |
| T-032 | Error genérico "no encontrado" de acciones y dominio (el 404 usa T-2721) | Esta página no existe. Volvé al inicio. | MATEO | Propuesta |
| T-033 | Error del servidor | Algo se nos dañó de este lado. Ya nos dimos cuenta; intentá otra vez en un ratico. | MATEO | Propuesta |
| T-034 | Botón de tema (etiqueta accesible), según el tema al que cambia | Cambiar a tema oscuro · Cambiar a tema claro | MATEO | Propuesta |
| T-035 | Enlace para saltar la navegación (lectores de pantalla y teclado) | Saltar al contenido | MATEO | Propuesta |
| T-036 | Nombre accesible del logotipo en cabecera y pie | Organización Estudiantil, Universidad EAFIT | COM | Propuesta |
| T-037 | Expresión de marca del manual, cierre de éxitos y estados vacíos | ¡OE OE OE! | COM | Aprobado por el manual |
| T-038 | Navegación del portal público | Inicio · La OE · Cartelera · Eventos · Comités · Unirse | COM | Propuesta |
| T-039 | Nombres de los cuatro macroeventos (identidades permanentes) | Días EAFIT · Inventiva · EnFemenino · Subsidios-OE | COM | Aprobado por el manual |

### Portal público · fase 1 (cartelera, eventos, comités, imágenes para compartir)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-300 | La OE, Unirse o Privacidad sin publicar todavía | Estamos camellando en este contenido. Volvé pronto. | MATEO | Propuesta |
| T-301 | Cartelera, título de la página | Cartelera | COM | Propuesta |
| T-302 | Cartelera sin anuncios | La cartelera está quieta por ahora. Volvé pronto. | MATEO | Propuesta |
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

### Portal público · fase 5 (formularios propios, unirse, inscripción a ediciones)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-851 | Formulario público: campos implícitos | Nombre · Apellido · Correo | MATEO | Propuesta |
| T-852 | Formulario: botón de enviar | Enviar | MATEO | Propuesta |
| T-853 | Formulario: campo obligatorio vacío | Este campo es obligatorio. | MATEO | Propuesta |
| T-854 | Formulario: correo con formato inválido | Ese correo no tiene un formato válido. Revisalo. | MATEO | Propuesta |
| T-855 | Formulario: celular con formato inválido | Ese celular no se ve bien. Escribilo con indicativo si es de otro país. | MATEO | Propuesta |
| T-856 | Formulario: opción fuera de la lista | Elegí una opción de la lista. | MATEO | Propuesta |
| T-857 | Formulario: fecha inválida | Esa fecha no es válida. | MATEO | Propuesta |
| T-858 | Formulario: consentimiento sin marcar | Para enviar tenés que aceptar la política de tratamiento de datos. | JUNTA | Propuesta |
| T-859 | Formulario: gracias por defecto (si el formulario no trae el suyo) | ¡De una! Recibimos tu respuesta. ¡OE OE OE! | COM | Propuesta |
| T-860 | Formulario cerrado o todavía no abierto | Este formulario no está recibiendo respuestas ahora. | MATEO | Propuesta |
| T-861 | Formulario con el tope de respuestas alcanzado | Este formulario ya alcanzó su tope de respuestas. | MATEO | Propuesta |
| T-862 | Formulario: segunda respuesta con el mismo correo | Ya recibimos una respuesta con ese correo. | MATEO | Propuesta |
| T-863 | Formulario: demasiados envíos desde la misma red | Recibimos muchos envíos desde tu red. Esperá un ratico e intentá de nuevo. | MATEO | Propuesta |
| T-864 | Ingresar: aviso cuando se llega desde un formulario de miembros | Entrá con tu correo institucional para responder el formulario. | MATEO | Propuesta |
| T-865 | Formulario: enlace a la política junto a la casilla | Leé la política de datos | JUNTA | Propuesta |
| T-866 | Formulario: aviso de campos obligatorios | Los campos con * son obligatorios. | MATEO | Propuesta |
| T-867 | Formulario: inscripción registrada (dentro del gracias) | Quedaste inscrito a {edición}. | COM | Propuesta |
| T-868 | Unirse: enlace al formulario de prospecto cuando no hay convocatoria | Dejanos tu correo | GH | Propuesta |
| T-869 | Edición: el miembro ya está inscrito | Ya estás inscrito a esta edición. | COM | Propuesta |
| T-870 | Formulario: ayuda de una selección múltiple | Podés marcar varias. | MATEO | Propuesta |
| T-871 | Formulario: ayuda de un campo de fecha | Día, mes y año. | MATEO | Propuesta |
| T-872 | Formulario de miembros: respondiendo como | Respondés como {nombre} ({correo}). | MATEO | Propuesta |
| T-873 | Formulario: título accesible del campo trampa (nadie debería verlo) | No llenes este campo | MATEO | Propuesta |

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
| T-052 | Cuenta retirada (al intentar entrar) | Respuesta igual a T-044; nunca se dice el motivo | MATEO | Propuesta |
| T-053 | Correo del código, asunto | Tu código para entrar a Mi OE | MATEO | Propuesta |
| T-054 | Correo del código, cuerpo | Hola, {nombre}. Tu código es **{código}** y vence en 10 minutos. Si no fuiste vos, ignorá este correo. | MATEO | Propuesta |
| T-2092 | Correo del código, pie | Organización Estudiantil · Universidad EAFIT · Bloque 29 of. 525 · Este es un mensaje automático de seguridad: te llega porque alguien pidió un código para entrar a Mi OE con tu dirección. | MATEO | Propuesta |
| T-055 | Step-up (acción sensible de admin) | Esta acción pide un código nuevo. Te lo mandamos al correo. | MATEO | Propuesta |

## 4. Mi OE

### Inicio y navegación

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-060 | Saludo | ¿Qué más, {nombre preferido}? | MATEO | Propuesta |
| T-061 | Pestañas de navegación | Inicio · Eventos · Comités · Personas · Egresados · GH Points · Permanencia · Solicitudes · Convocatorias · Normativa · Carnet · Ajustes · Juegos | COM | Propuesta |
| T-062 | Agenda, título | Tu semana | MATEO | Propuesta |
| T-063 | Agenda vacía | No tenés nada esta semana. Pegate a un evento o pasá por tu comité. | MATEO | Propuesta |
| T-064 | Barra de permanencia en el inicio | Permanencia en {comité}: {n} % de {umbral} % | GH | Propuesta |
| T-065 | Saldo compacto de GH Points | {n} GH Points este semestre | GH | Propuesta |
| T-066 | Onboarding, título (solo nuevos) | Tu primera semana en la OE | GH | Propuesta |
| T-067 | Onboarding, pasos | 1. Leé los estatutos y el reglamento · 2. Conocé a tu comité · 3. Pegate a tu primera integración · 4. Activá las notificaciones · 5. Decorá la oficina con los nuevos | GH | Propuesta; GH define los pasos |
| T-068 | Onboarding completado | Ya sos parte de este parche. ¡OE OE OE! | COM | Propuesta |

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
| T-085 | Movimientos, tipos | Asistencia · Ajuste · Reversión · Histórico · Wordle · Reto · Impulso · 2048 · Sudoku · Panal | MATEO | Propuesta |
| T-086 | Sin movimientos | Todavía no tenés puntos. Tu primera asistencia los estrena. | COM | Propuesta |

### Registro de asistencia (QR)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-090 | Página del QR, título | {nombre de la actividad} | MATEO | Propuesta |
| T-091 | Botón | Registrar mi asistencia | GH | Propuesta |
| T-092 | Éxito con puntos | ¡De una! Sumaste {n} GH Points. ¡OE OE OE! | COM | Propuesta |
| T-093 | Éxito sin puntos (asamblea, reunión) | ¡Listo pues! Quedaste registrado. | MATEO | Propuesta |
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
| T-133 | Ajustes, secciones | Mis datos · Notificaciones · Calendario · Sesiones · Consentimientos · Mis datos y privacidad | MATEO | Propuesta |
| T-134 | Ajustes, editar datos | Podés cambiar tu foto, tu celular y tu correo personal. Tu correo institucional no se cambia: es tu identidad en la OE. | MATEO | Propuesta |
| T-135 | Descargar mis datos | Descargar todo lo que la OE guarda sobre mí | JUNTA | Propuesta |
| T-136 | Solicitar eliminación | Pedir que borren mis datos (GH responde en 15 días hábiles) | JUNTA | Propuesta; el plazo sale de la política |
| T-137 | Cerrar otras sesiones | Cerrar sesión en los demás dispositivos | MATEO | Propuesta |
| T-138 | Solicitudes, título | Solicitudes | GH | Propuesta |
| T-139 | Solicitudes, tipos (en el orden del modelo: licencia, retiro, cambio de comité, excusa) | Pedir licencia · Retirarme de la OE · Cambiarme de comité el próximo semestre · Presentar una excusa | GH | Propuesta |
| T-140 | Solicitud enviada | Tu solicitud llegó a GH. Te avisamos cuando la respondan. | GH | Propuesta |
| T-141 | Solicitud aprobada | GH aprobó tu solicitud de {tipo}. Ya está aplicada. | GH | Propuesta |
| T-142 | Solicitud rechazada | GH no aprobó tu solicitud de {tipo}: {motivo}. Si querés hablarlo, escribiles. | GH | Propuesta |
| T-143 | Retiro voluntario, confirmación | ¿Seguro querés retirarte de la OE? Tu historia se conserva, pero no vas a poder volver a entrar a Mi OE. | GH | Propuesta; texto sensible |
| T-144 | Convocatorias, título | Convocatorias | GH | Propuesta |
| T-145 | Convocatorias, intro | Grupos de trabajo, GAP y barra brava que están buscando gente. Pegate a uno desde acá. | GH | Propuesta |
| T-146 | Convocatoria, botón | Me pego | COM | Propuesta |
| T-147 | Convocatoria con cupo lleno | Ya se llenó, pero podés quedar en lista de espera. | GH | Propuesta |
| T-148 | Inscripción aceptada | ¡Qué nota! Quedaste en {grupo}. ¡OE OE OE! | COM | Propuesta |

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
| T-374 | Directorio y ficha: cargos del semestre actual | Cargos vigentes | MATEO | Confirmado |
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
| T-408 | Ajustes, ayuda de la foto | JPG, PNG o WebP de entre 5 KB y 5 MB. Solo se muestra si autorizás la foto en el directorio. | MATEO | Propuesta |
| T-409 | Ajustes, quitar la foto | Quitar foto | MATEO | Propuesta |
| T-410 | Ajustes y admin, celular inválido | Ese celular no tiene un formato válido. Escribí 10 dígitos. | MATEO | Propuesta |
| T-411 | Consentimientos, estado autorizado | Autorizado el {fecha} (política versión {v}) | JUNTA | Propuesta |
| T-412 | Consentimientos, estado no autorizado | No autorizado | JUNTA | Propuesta |
| T-413 | Consentimientos, botones | Autorizar · Retirar la autorización | JUNTA | Propuesta |
| T-414 | Consentimientos, nota sobre el de membresía | Autorizaste el tratamiento de tus datos al entrar por primera vez. Para retirar esa autorización, pedí la eliminación de tus datos. | JUNTA | Propuesta |
| T-415 | Eliminación, confirmación | ¿Seguro? GH revisa tu solicitud y te contacta antes de borrar nada. Tu historia en la OE se conserva sin tu nombre. | JUNTA | Propuesta; texto sensible |
| T-416 | Eliminación, solicitud registrada | Tu solicitud quedó registrada el {fecha}. GH responde en {n} días hábiles. | JUNTA | Propuesta |
| T-417 | Eliminación, botón de confirmación | Sí, pedir la eliminación | JUNTA | Propuesta |
| T-418 | Ajustes, título de la página | Ajustes | MATEO | Propuesta |
| T-419 | Ajustes, foto fuera de tipo o tamaño | La foto debe ser JPG, PNG o WebP de entre 5 KB y 5 MB. | MATEO | Propuesta |

### Mi OE · fase 3 (GH Points, registro de asistencia, agenda)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-521 | Check-in, agenda y admin: nombre de la categoría de una ocasión (en el orden del modelo) | Integración · Partido del Athletic · Reunión de comité · Charla · Taller · Social · Actividad · Inducción | GH | Propuesta |
| T-522 | Check-in, agenda y admin: nombre del tipo de ocasión (en el orden del modelo) | Actividad · Asamblea · Sesión de edición | GH | Propuesta |
| T-523 | Check-in: la actividad es solo para nuevos | Esta actividad es solo para quienes entraron a la OE este semestre. | GH | Propuesta |
| T-524 | Check-in: actividad cancelada | Esta actividad fue cancelada. | MATEO | Propuesta |
| T-525 | Check-in: semestre con los puntos cerrados | Este semestre ya cerró sus puntos: el registro no está disponible. | MATEO | Propuesta |
| T-526 | Check-in: actividad todavía en borrador | Esta actividad todavía no está publicada. | MATEO | Propuesta |
| T-527 | Check-in: enlace que no corresponde a ninguna actividad | Este enlace no corresponde a ninguna actividad. Pedile el QR vigente a quien organiza. | MATEO | Propuesta |
| T-528 | Check-in: etiquetas de la ficha | Cuándo · Dónde · GH Points | MATEO | Propuesta |
| T-529 | Check-in: puntos que da la actividad | Da {n} GH Points | GH | Propuesta |
| T-530 | Check-in: actividad sin puntos | Sin puntos: cuenta como asistencia | GH | Propuesta |
| T-531 | Check-in: enlace tras el éxito | Ver mis GH Points | COM | Propuesta |
| T-532 | Check-in: registro rechazado (al volver a abrir el enlace) | GH no aprobó tu registro en esta actividad. Si creés que es un error, hablá con quien la organizó. | GH | Propuesta; texto sensible |
| T-533 | Check-in: registro anulado (al volver a abrir el enlace) | Tu registro en esta actividad fue anulado: {motivo}. | GH | Propuesta |
| T-534 | Check-in: eyebrow sobre el título | Registrá tu asistencia | GH | Propuesta |
| T-535 | GH Points: nivel actual | Nivel: {nivel} | GH | Propuesta |
| T-536 | GH Points: puntos para el siguiente nivel | Te faltan {n} para {nivel} | GH | Propuesta |
| T-537 | GH Points: nivel máximo alcanzado | Llegaste al nivel más alto. ¡Qué berraco! ¡OE OE OE! | COM | Propuesta |
| T-538 | GH Points: título de los movimientos | Tus movimientos | MATEO | Propuesta |
| T-539 | GH Points: título de los rankings | Rankings del semestre | GH | Propuesta |
| T-540 | GH Points: tu puesto | Vas de {puesto} entre {total} | GH | Propuesta |
| T-541 | GH Points: sin puesto todavía | Todavía no tenés puesto: sumá tu primera asistencia. | COM | Propuesta |
| T-542 | GH Points: ranking vacío | Todavía nadie suma puntos este semestre. | MATEO | Propuesta |
| T-543 | GH Points: columnas del ranking de comités | Comité · Participación · Sin ajustar | MATEO | Propuesta |
| T-544 | GH Points: título de las asambleas | Asambleas del semestre | GH | Propuesta |
| T-545 | GH Points: asambleas obligatorias firmadas | Firmaste {n} de {total} asambleas obligatorias | GH | Propuesta; texto sensible |
| T-546 | GH Points y admin: etiquetas de las asambleas obligatorias | Ordinaria · Elección de junta · Segunda vuelta | GH | Propuesta |
| T-547 | GH Points: estado de cada asamblea en tu lista | Firmada · Pendiente · No fuiste | GH | Propuesta |
| T-548 | GH Points: sin semestre activo | No hay un semestre activo. Apenas GH lo abra, acá ves tus puntos. | MATEO | Propuesta |
| T-549 | GH Points: semestre con los puntos cerrados | Semestre cerrado el {fecha}: los puntos quedaron congelados. | MATEO | Propuesta |
| T-550 | GH Points: selector de semestre | Semestre | MATEO | Propuesta |
| T-551 | GH Points: descripción de los tableros de personas | Nuevos: quienes entraron este semestre. Veteranos: todos los demás. Solo miembros activos. | GH | Propuesta |
| T-552 | GH Points: columnas de los movimientos | Fecha · Movimiento · Puntos | MATEO | Propuesta |
| T-553 | Inicio: insignia de una actividad con registro abierto | Registro abierto | GH | Propuesta |
| T-554 | Inicio: insignia de una actividad próxima | Próximamente | MATEO | Propuesta |
| T-555 | Inicio: enlace a GH Points desde el saldo | Ver GH Points | COM | Propuesta |
| T-556 | Inicio y agenda: insignia de asamblea obligatoria | Asamblea obligatoria | GH | Propuesta |
| T-557 | GH Points: leyenda de los niveles | {nivel} desde {n} puntos | GH | Propuesta |
| T-558 | Check-in: título de la pestaña del navegador | Registro de asistencia | MATEO | Propuesta |
| T-559 | GH Points: etiqueta del puesto propio | Tu puesto | GH | Propuesta |
| T-560 | GH Points: columnas de los tableros de personas | Puesto · Nombre · GH Points | MATEO | Propuesta |

### Mi OE · fase 4 (permanencia, avisos, cartelera del comité, insignias)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-678 | Permanencia: GH no cargó la tabla general del semestre | GH todavía no cargó la tabla de este semestre. | MATEO | Propuesta |
| T-679 | Permanencia: el comité no definió su tabla | {comité} todavía no definió su tabla. | MATEO | Propuesta |
| T-680 | Permanencia: la persona está exenta (licencia, honorario) | Este semestre no te evaluamos ({estado}). | GH | Propuesta |
| T-681 | Permanencia: ya llegó al umbral en un comité | Ya llegaste al {umbral} % en {comité}. Seguí sumando. | GH | Propuesta |
| T-682 | Permanencia: criterio, logrado sobre el peso | {logrado} de {peso} | MATEO | Propuesta |
| T-683 | Permanencia: criterio, lo que aún es posible | Podés sumar {n} más. | GH | Propuesta |
| T-684 | Permanencia: criterio de asistencia con ocasiones programadas | Fuiste a {n}. Quedan {m} programadas; la próxima es el {fecha}. | GH | Propuesta |
| T-685 | Permanencia: criterio de asistencia sin ocasiones programadas | Fuiste a {n}. No hay más programadas por ahora. | GH | Propuesta |
| T-686 | Permanencia: mínimo de asistencias | Vas {n} de {minimo}. | GH | Propuesta |
| T-687 | Permanencia: tasa de reuniones del comité | Fuiste a {n} de {m} reuniones ({tasa} %). Quedan {k} programadas. | GH | Propuesta |
| T-688 | Permanencia: sin grupo de ese tipo | No estás en un grupo de este tipo todavía. | GH | Propuesta |
| T-689 | Permanencia: grupo con su evaluación | {grupo}: {evaluacion} | MATEO | Propuesta |
| T-690 | Permanencia: puntaje del líder asignado | Tu líder te puso {valor} de {peso}. | GH | Propuesta |
| T-691 | Permanencia: puntaje del líder pendiente | Tu líder todavía no lo asigna. | GH | Propuesta |
| T-692 | Permanencia: crédito manual reconocido | GH te reconoció {valor} de {peso}. | GH | Propuesta |
| T-693 | Permanencia: crédito manual pendiente | GH lo reconoce a mano al cierre. | GH | Propuesta |
| T-694 | Permanencia: asamblea obligatoria perdida | Faltaste a {asamblea}. Hablá con GH. | GH | Propuesta; texto sensible |
| T-695 | Permanencia: próxima asamblea obligatoria | Próxima obligatoria: {asamblea}, {fecha}. | GH | Propuesta |
| T-696 | Permanencia: evaluaciones pendientes, título | Evaluaciones pendientes | GH | Propuesta |
| T-697 | Permanencia: historial, título | Historial | MATEO | Propuesta |
| T-698 | Permanencia: resultado de un semestre cerrado, título | Resultado de {término} | GH | Propuesta |
| T-699 | Inicio: enlace a permanencia | Ver tu permanencia | MATEO | Propuesta |
| T-700 | Inicio: enlace del aviso para evaluadores | Ir a evaluar | MATEO | Propuesta |
| T-701 | Comité interno: cartelera del comité, título | Cartelera de {comité} | COM | Propuesta |
| T-702 | Comité interno: cartelera vacía | {comité} no tiene anuncios todavía. Volvé en un ratico. | COM | Propuesta |
| T-703 | Directorio y comité: insignia de destacado del mes | Destacado de {mes} | COM | Propuesta |
| T-704 | Permanencia: umbral que aplica en el comité | Necesitás {umbral} % | GH | Propuesta |
| T-705 | Permanencia: parte general más parte del comité | General {g} + {comité} {c} | MATEO | Propuesta |
| T-706 | Permanencia: texto accesible de la barra | {n} de {umbral} por ciento | MATEO | Propuesta |
| T-707 | Inicio: ventana de evaluación cerrada para un evaluador | La ventana de evaluación abre el {fecha}. | MATEO | Propuesta |

### Mi OE · fase 5 (solicitudes y convocatorias)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-874 | Solicitudes: intro | Pedí una licencia, un cambio de comité para el próximo semestre o tu retiro. GH revisa cada solicitud y te responde acá y por correo. | GH | Propuesta |
| T-875 | Solicitudes: sin solicitudes | Todavía no has hecho solicitudes. | MATEO | Propuesta |
| T-876 | Solicitudes: estados | Pendiente · Aprobada · Rechazada · Retirada | MATEO | Propuesta |
| T-877 | Solicitudes: título de la lista | Tus solicitudes | MATEO | Propuesta |
| T-878 | Solicitud: botón para retirar una pendiente | Retirar solicitud | MATEO | Propuesta |
| T-879 | Solicitud retirada | Retiraste tu solicitud. | MATEO | Propuesta |
| T-880 | Solicitud: campo del motivo | Contanos por qué | GH | Propuesta |
| T-881 | Licencia: campo hasta cuándo (obligatorio desde ADR-060 regla 10) | Hasta cuándo volvés | GH | Propuesta |
| T-882 | Licencia: explicación | Mientras estés en licencia podés consultar Mi OE y actualizar tus datos personales. No podés participar en actividades ni se te evalúa la permanencia. Para volver, escribile a GH. | GH | Propuesta |
| T-883 | Cambio de comité: explicación | El cambio aplica desde el próximo semestre y cuenta como transferencia: ese semestre tenés que cumplir el 70 % en el comité nuevo. | GH | Propuesta |
| T-884 | Cambio de comité: comités que dejás | Comités que dejás | GH | Propuesta |
| T-885 | Cambio de comité: comités a los que entrás | Comités a los que entrás | GH | Propuesta |
| T-886 | Cambio de comité: resultado fuera del rango | Tenés que quedar entre {min} y {max} comités. | GH | Propuesta |
| T-887 | Cambio de comité: sin cambios elegidos | Elegí al menos un comité para dejar o para entrar. | MATEO | Propuesta |
| T-888 | Retiro: casillas de consentimiento | Quiero aparecer en la galería de egresados · Quiero que la OE me contacte después de salir | JUNTA | Propuesta |
| T-889 | Retiro: correo personal (opcional) | Correo personal para contactarte (opcional) | GH | Propuesta |
| T-890 | Retiro: casilla de confirmación | Entiendo que al aprobarse mi retiro pierdo el acceso a Mi OE. | GH | Propuesta; texto sensible |
| T-891 | Solicitud: ya hay una pendiente de ese tipo | Ya tenés una solicitud de {tipo} pendiente. | MATEO | Propuesta |
| T-892 | Solicitud: solo miembros activos | Solo un miembro activo puede hacer solicitudes. | GH | Propuesta |
| T-893 | Solicitud: botón de enviar | Enviar solicitud | MATEO | Propuesta |
| T-894 | Solicitud: tipos en singular para los mensajes (en el orden del modelo: licencia, retiro, cambio de comité, excusa) | licencia · retiro · cambio de comité · excusa | MATEO | Propuesta |
| T-895 | Solicitud: respuesta de GH, título | Respuesta de GH | GH | Propuesta |
| T-896 | Convocatorias: sin convocatorias abiertas | No hay convocatorias abiertas ahora. Pilas: cuando se abra una, la vas a ver acá. | GH | Propuesta |
| T-897 | Convocatoria: cupo y cierre | {cupo} cupos · cierra el {fecha} | MATEO | Propuesta |
| T-898 | Convocatoria: sin cupo fijo | Sin cupo fijo · cierra el {fecha} | MATEO | Propuesta |
| T-899 | Convocatoria: estados de mi inscripción (en el orden del modelo) | Pendiente · Aceptada · En lista de espera · No aceptada | MATEO | Propuesta |
| T-900 | Convocatoria: ya estás en el grupo | Ya estás en {grupo}. | MATEO | Propuesta |
| T-901 | Convocatoria: inscripción pendiente (selección manual) | ¡De una! Te anotaste en {grupo}. El líder revisa las inscripciones y te avisamos. | GH | Propuesta |
| T-902 | Convocatoria: título de mis inscripciones | Tus inscripciones | MATEO | Propuesta |
| T-903 | Convocatoria: ya te anotaste | Ya te anotaste a esta convocatoria. | MATEO | Propuesta |
| T-904 | Convocatoria cerrada | Esta convocatoria ya cerró. | MATEO | Propuesta |
| T-905 | Convocatoria: explicación de la selección (orden de llegada · manual) | Los cupos se asignan por orden de llegada. · El líder del grupo elige entre quienes se anoten. | GH | Propuesta |
| T-906 | Convocatoria: no aceptada | Esta vez no quedaste en {grupo}. | GH | Propuesta; texto sensible |
| T-907 | Convocatoria: solo miembros activos | Solo un miembro activo puede anotarse. | GH | Propuesta |

### Mi OE · fase 6 (notificaciones, calendario, instalar, anuncio interno, encuesta, baja)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-1063 | Notificaciones: intro | Recibí en tu celular los anuncios, tus GH Points y los recordatorios de la OE, y no te perdés de ningún parche. Activalas en cada dispositivo que uses. | MATEO | Propuesta |
| T-1064 | Notificaciones: botón para activar en este dispositivo | Activar en este dispositivo | MATEO | Propuesta |
| T-1065 | Notificaciones: este dispositivo ya recibe | Este dispositivo recibe notificaciones. | MATEO | Propuesta |
| T-1066 | Notificaciones: botón para desactivar en este dispositivo | Desactivar en este dispositivo | MATEO | Propuesta |
| T-1067 | Notificaciones: permiso bloqueado por el navegador | Tu navegador tiene las notificaciones bloqueadas para Mi OE. Permitilas en la configuración del sitio y volvé a intentar. | MATEO | Propuesta |
| T-1068 | Notificaciones: navegador sin soporte | Este navegador no admite notificaciones. Probá con Chrome, Edge, Firefox o Safari actualizado. | MATEO | Propuesta |
| T-1069 | Notificaciones: no configuradas en este entorno (sin claves VAPID) | Las notificaciones no están configuradas en este entorno. | MATEO | Propuesta |
| T-1070 | Notificaciones: iPhone o iPad sin la app instalada | En iPhone o iPad primero instalá Mi OE: tocá Compartir y después "Agregar a pantalla de inicio". Desde la app instalada podés activar las notificaciones. | MATEO | Propuesta |
| T-1071 | Instalar: botón | Instalar Mi OE | MATEO | Propuesta |
| T-1072 | Instalar: ya instalada | Listo pues: Mi OE ya está instalada en este dispositivo. | MATEO | Propuesta |
| T-1073 | Instalar: instrucciones cuando el navegador no ofrece el botón | Para instalar Mi OE, abrí el menú del navegador y elegí "Instalar" o "Agregar a pantalla de inicio". | MATEO | Propuesta |
| T-1074 | Dispositivos: título | Tus dispositivos | MATEO | Propuesta |
| T-1075 | Dispositivos: ninguno | Todavía no activaste las notificaciones en ningún dispositivo. | MATEO | Propuesta |
| T-1076 | Dispositivos: columnas | Dispositivo · Desde · Último uso | MATEO | Propuesta |
| T-1077 | Dispositivos: quitar | Quitar | MATEO | Propuesta |
| T-1078 | Dispositivos: el actual | Este dispositivo | MATEO | Propuesta |
| T-1079 | Preferencias: título | Qué querés recibir | MATEO | Propuesta |
| T-1080 | Preferencias: opciones (en el orden del modelo: anuncios, puntos, recordatorios, campañas por correo; el Wordle se agregó al final para conservar los índices, ADR-074) | Anuncios de la cartelera · GH Points acreditados · Recordatorios de actividades, asambleas y permanencia · Campañas por correo · Wordle del día | MATEO | Propuesta |
| T-1081 | Preferencias: ayuda | Los correos sobre tu ingreso, tus solicitudes y tu permanencia llegan siempre. | MATEO | Propuesta |
| T-1082 | Preferencias: guardadas | Listo pues, guardamos tus preferencias. | MATEO | Propuesta |
| T-1083 | Preferencias: botón guardar | Guardar preferencias | MATEO | Propuesta |
| T-1084 | Calendario: intro | Tené tu agenda de la OE a la mano: suscribite desde el calendario de tu celular o computador y ves las ediciones de los eventos, las asambleas y las actividades de tus comités. | MATEO | Propuesta |
| T-1085 | Calendario: nombre del calendario (dentro del ICS) | Mi agenda OE | COM | Propuesta |
| T-1086 | Calendario: copiar enlace | Copiar enlace | MATEO | Propuesta |
| T-1087 | Calendario: copiado | Enlace copiado. | MATEO | Propuesta |
| T-1088 | Calendario: abrir en el calendario del dispositivo (webcal) | Abrir en mi calendario | MATEO | Propuesta |
| T-1089 | Calendario: regenerar | Regenerar enlace | MATEO | Propuesta |
| T-1090 | Calendario: regenerado | Listo. El enlace anterior dejó de funcionar. | MATEO | Propuesta |
| T-1091 | Calendario: advertencia | Este enlace es personal: quien lo tenga ve tu agenda. Si lo compartiste por error, regeneralo. | MATEO | Propuesta |
| T-1092 | Inicio: aviso de instalar y activar (título · texto · botón) | Llevá Mi OE en el celular · Hágale: instalá la app y activá las notificaciones para no perderte anuncios ni recordatorios. · Activar | COM | Propuesta |
| T-1093 | Inicio: cerrar el aviso | Ahora no | MATEO | Propuesta |
| T-1094 | Anuncio interno: volver | Volver a Mi OE | MATEO | Propuesta |
| T-1095 | Encuesta: título | ¿Cómo estuvo {actividad}? | COM | Propuesta |
| T-1096 | Encuesta: intro | Tus respuestas son anónimas: quedan agregadas con las de los demás asistentes y nadie ve quién dijo qué. Te toma un minuto. | COM | Propuesta |
| T-1097 | Encuesta: enviar | Enviar respuestas | MATEO | Propuesta |
| T-1098 | Encuesta: gracias | ¡Gracias, parce! Tus respuestas ayudan a que la próxima salga mejor. ¡OE OE OE! | COM | Propuesta |
| T-1099 | Encuesta: ya respondida | Ya respondiste esta encuesta. ¡Qué nota, gracias! | MATEO | Propuesta |
| T-1100 | Encuesta: vencida | Esta encuesta ya cerró. | MATEO | Propuesta |
| T-1101 | Encuesta: no encontrada | No encontramos esta encuesta. Revisá el enlace de la notificación. | MATEO | Propuesta |
| T-1102 | Encuesta y formularios: extremos de una calificación de 1 a 5 | Muy mal · Excelente | COM | Propuesta |
| T-1103 | Baja: título | Dejar de recibir campañas | MATEO | Propuesta |
| T-1104 | Baja: texto | Si confirmás, no te mandamos más campañas por correo. Los correos sobre tu ingreso, tus solicitudes y tu permanencia siguen llegando. Podés volver a activarlas en Ajustes de Mi OE. | JUNTA | Propuesta |
| T-1105 | Baja: botón | Confirmar la baja | MATEO | Propuesta |
| T-1106 | Baja: confirmada | Listo. No te mandamos más campañas por correo. | MATEO | Propuesta |
| T-1107 | Baja: enlace inválido | Este enlace no es válido o ya venció. | MATEO | Propuesta |
| T-1108 | Notificaciones: activadas ahora | ¡De una! Este dispositivo ya recibe notificaciones. | MATEO | Propuesta |
| T-1109 | Notificaciones: falló activar | No pudimos activar las notificaciones. Intentá otra vez en un ratico. | MATEO | Propuesta |
| T-1110 | Dispositivos: quitado | Listo, ese dispositivo ya no recibe notificaciones. | MATEO | Propuesta |
| T-3208 | Notificaciones: el endpoint del dispositivo ya es de otra persona (ADR-113) | Este dispositivo ya recibe notificaciones a nombre de otra persona. | MATEO | Propuesta |
| T-3209 | Notificaciones: tope de dispositivos por persona (ADR-113) | Ya tenés 10 dispositivos con notificaciones. Quitá uno en Ajustes para activar este. | MATEO | Propuesta |

## 5. Administración

Los textos del admin son funcionales y los escribe Mateo; GH solo revisa las confirmaciones de acciones sensibles y los mensajes de importación.

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-160 | Secciones | Personas · Organizaciones · Pipelines · Solicitudes · Convocatorias · Formularios · Comunidad · Contenido · Participación · Permanencia · Comunicaciones · Junta · Sistema | MATEO | Propuesta |
| T-161 | Confirmar cancelar una actividad | Vas a cancelar "{actividad}". Se revierten los puntos de {n} personas. Esto no se deshace. Escribí el motivo. | GH | Propuesta |
| T-162 | Confirmar dar de baja | Vas a dar de baja a {nombre}. Su historia se conserva y su perfil pasa a egresado. Escribí el motivo y confirmá los consentimientos. | GH | Propuesta |
| T-163 | Confirmar cerrar el semestre | Vas a cerrar {término}. Los puntos quedan congelados y se generan las propuestas de permanencia. Revisalas antes de aplicar. | GH | Propuesta |
| T-164 | Cierre, propuesta por persona | Propuesta: {estado}. Motivo automático: {detalle}. Podés cambiarla con motivo. | GH | Propuesta |
| T-165 | Importación, errores (uno por regla) | Correo repetido en el archivo · Correo fuera del dominio institucional · Comité "{sigla}" no existe, ¿quisiste decir "{sugerencia}"? · Más de 3 comités · Semestre de ingreso vacío o inexistente · Estado fuera de la lista · Cargo desconocido · Cargo sin comité (la persona tiene varios) · Dos titulares de {cargo} en {comité} · Faltan columnas obligatorias para una persona nueva | MATEO | Propuesta |
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
| T-256 | Listados y paleta: sin resultados | Nada por acá con esa búsqueda. | MATEO | Propuesta |
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
| T-287 | Comités: opciones de estado | Activo · Inactivo · En prueba | MATEO | Propuesta |
| T-288 | Contenido: opciones de publicación | Borrador · Publicado | MATEO | Propuesta |
| T-289 | Permisos: opciones (ADMIN, líder, junta) | ADMIN · Líder de comité · Junta | MATEO | Propuesta |
| T-290 | Paleta ⌘K: tipos de resultado | Persona · Comité · Ocasión · Organización | MATEO | Propuesta |
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
| T-360 | Medios: subida confirmada | Listo: la imagen queda disponible en un ratico. | MATEO | Propuesta |
| T-361 | Medios: archivo de otro tipo | Ese archivo no es una imagen JPG, PNG o WebP. | MATEO | Propuesta |
| T-362 | Medios: archivo fuera de tamaño | La imagen debe pesar entre 5 KB y 20 MB. | MATEO | Propuesta |
| T-363 | Medios: error de subida | No se pudo subir la imagen. Intentá de nuevo. | MATEO | Propuesta |
| T-364 | Medios: columnas del listado | Archivo · Tamaño · Dimensiones · Estado · Subido el | MATEO | Propuesta |
| T-365 | Medios: campo visibilidad | Visibilidad | MATEO | Propuesta |
| T-366 | Medios: opciones de visibilidad | Pública · Privada | MATEO | Propuesta |
| T-367 | Páginas, eventos y ediciones: identificador repetido | Ya existe otro con ese identificador. | MATEO | Propuesta |
| T-368 | Eventos y ediciones: opción sin portada | Sin portada (cartel tipográfico) | MATEO | Propuesta |
| T-369 | Eventos: enlace a las ediciones desde la fila | Ediciones ({n}) | MATEO | Propuesta |
| T-3207 | Medios y evidencias: motivo de una imagen que no se procesó (no se pudo leer · no es un formato admitido · pasa del tope de píxeles · no se pudo codificar; ADR-113) | No se pudo decodificar la imagen. · El archivo no es una imagen JPG, PNG o WebP. · La imagen tiene más de 40 megapíxeles. · No se pudo codificar la imagen. | MATEO | Propuesta |

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
| T-436 | Dar de baja: motivos (en el orden del modelo) | Graduación · Retiro voluntario · Permanencia · Expulsión · Pérdida de la calidad de estudiante · Otro | GH | Propuesta |
| T-437 | Dar de baja: casillas de consentimiento | Autoriza aparecer en la galería de egresados · Autoriza que la OE lo contacte después de salir | JUNTA | Propuesta |
| T-438 | Dar de baja: botón | Dar de baja | GH | Propuesta |
| T-439 | Reactivar: texto | Vas a reactivar a {nombre}: vuelve a ser miembro activo con su historia. Si tiene un correo institucional nuevo, escribilo. | GH | Propuesta |
| T-440 | Anonimizar: texto | Vas a anonimizar a {nombre} por su solicitud del {fecha}. Se borran nombre, contacto, foto, notas y tareas; comités y puntos quedan sin nombre. Esto no se deshace. | JUNTA | Propuesta; texto sensible |
| T-441 | Anonimizar: botón | Anonimizar | MATEO | Propuesta |
| T-442 | Anonimizar sin solicitud previa | Solo se anonimiza a quien lo pidió desde Mi OE. | MATEO | Propuesta |
| T-443 | Membresía: títulos de los bloques | Historial de estados · Comités por semestre · Historial de cargos · Condición del semestre | MATEO | Propuesta |
| T-444 | Membresía: tipos de cargo (opciones) | Presidencia · Vicepresidencia de GH · Vicepresidencia de Relaciones Públicas · Vicepresidencia Administrativa · Vicepresidencia Financiera · Vicepresidencia de Comunicaciones y Mercadeo · GH principal · Director de GH · Dirección de macroevento · Otro | JUNTA | Propuesta; el nombre es el del cuerpo de los Estatutos 2026 (art. 21 y 27), ADR-060 regla 4; la dirección de macroevento se etiqueta con T-2268 y T-2269 (regla 9) |
| T-445 | Membresía: campo del título cuando el cargo es Otro | Título del cargo | MATEO | Propuesta |
| T-446 | Membresía: casilla del permiso de junta | Otorgar también el permiso Junta (pide un código nuevo) | MATEO | Propuesta |
| T-447 | Membresía: botones de cargos | Agregar cargo · Quitar | MATEO | Propuesta |
| T-448 | Membresía: título del editor de comités | Comités de {término} | MATEO | Propuesta |
| T-449 | Membresía: condición de prueba (insignia · campo del comité) | En periodo de prueba · Comité | GH | Propuesta |
| T-450 | Membresía: campos de una pertenencia | Comité · Cargo · Transferencia interna | MATEO | Propuesta |
| T-451 | Membresía: regla de cantidad de comités | Un activo necesita entre {min} y {max} comités. | MATEO | Propuesta |
| T-452 | Membresía: ya hay quien ocupe ese cargo (titular o codirección, ADR-058) | {comité} ya tiene {cargo} este semestre. | MATEO | Propuesta |
| T-453 | Resumen: etiquetas | Último contacto · Tareas abiertas · Consentimientos · Permisos · Puntos del semestre · Asambleas | MATEO | Propuesta |
| T-454 | Línea de tiempo: filtro por tipo | Todo · Notas · Membresía · Comités · Consentimientos · Datos · Importaciones · Otros · Participación · Formularios · Pipelines · Solicitudes · Convocatorias | MATEO | Propuesta |
| T-455 | Línea de tiempo: ayuda del compositor de notas | Escribí una nota para el equipo. La persona puede pedir verla. | MATEO | Propuesta |
| T-456 | Línea de tiempo: botones y marca de nota | Guardar nota · Editar · Editada el {fecha} | MATEO | Propuesta |
| T-457 | Línea de tiempo vacía | Todavía no hay nada por acá en la línea de tiempo. | MATEO | Propuesta |
| T-458 | Línea de tiempo: textos de las interacciones automáticas | Importado desde el roster {término} · Estado cambió de {de} a {a}: {motivo} · Dado de baja: {motivo} · Reactivado · Comités de {término}: {comités} · Cargo {cargo} desde {término} · Cargo {cargo} retirado · Consentimiento de {propósito} autorizado · Consentimiento de {propósito} retirado · Datos actualizados: {campos} · Correo institucional cambiado · Pidió la eliminación de sus datos · Descargó sus datos · Datos anonimizados · Permiso {permiso} otorgado · Permiso {permiso} revocado | MATEO | Propuesta |
| T-459 | Tareas: campos y columnas | Título · Responsable · Vence · Estado · Persona · Tipo | MATEO | Propuesta |
| T-460 | Tareas: opciones de estado | Abierta · Hecha | MATEO | Propuesta |
| T-461 | Tareas: tipos | General · Solicitud de eliminación · Solicitud de miembro · Retiro de comité · Licencia vencida | MATEO | Propuesta |
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
| T-473 | Cargos de comité: campos | Código · Nombre · Es dirección · Obligatorio · Capacidades · Orden | MATEO | Propuesta |
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
| T-513 | Tarea creada | Listo, tarea creada. | MATEO | Propuesta |
| T-514 | Membresía: sin cargos | Sin cargos registrados. | MATEO | Propuesta |
| T-515 | Línea de tiempo: autor del sistema | Sistema | MATEO | Propuesta |
| T-516 | Propósitos de consentimiento (etiquetas cortas, en el orden del modelo) | Membresía · Comunicaciones · Foto en el directorio · Galería de egresados · Tratamiento de datos | JUNTA | Propuesta |
| T-517 | Línea de tiempo: nota de otra persona | Solo quien escribió la nota puede editarla. | MATEO | Propuesta |
| T-518 | Documentos: error de subida | No se pudo subir el PDF. Intentá de nuevo. | MATEO | Propuesta |
| T-519 | Documentos: archivo fuera de tamaño | El PDF debe pesar entre 1 KB y 20 MB. | MATEO | Propuesta |
| T-520 | Documentos: subida confirmada | De una: el PDF quedó guardado. Ahora cargá los artículos. | MATEO | Propuesta |
| T-3210 | Importación: aplicar o descartar una que ya se aplicó o se descartó (ADR-113) | Esta importación ya no está en revisión. Para repetirla, subí el archivo de nuevo. | MATEO | Propuesta |

### Admin de Participación (fase 3: ocasiones, consola, anfitrión, ledger, rankings, asambleas, cierre, vista de líder, alias)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-561 | Navegación del admin: enlaces de la fase 3 | Ocasiones · Ledger · Rankings · Asambleas · Cierre · Alias | MATEO | Propuesta |
| T-562 | Recurso ocasiones (plural · singular) | Ocasiones · Ocasión | MATEO | Propuesta |
| T-563 | Ocasiones: campos | Título · Tipo · Tipo de asamblea · Categoría · Solo nuevos · Descripción (Markdown) · Lugar · Empieza · Termina · Abre el registro · Cierra el registro · GH Points · Aprobación · Código rotativo · Comité · Edición · Semestre | MATEO | Propuesta |
| T-564 | Ocasiones: opciones de tipo | Actividad · Asamblea · Sesión de edición | MATEO | Propuesta |
| T-565 | Ocasiones: opciones de tipo de asamblea | Ordinaria · Elección de junta · Segunda vuelta | GH | Propuesta |
| T-566 | Ocasiones: opciones de categoría | Integración · Partido del Athletic · Reunión de comité · Charla · Taller · Social · Otra · Inducción | GH | Propuesta |
| T-567 | Ocasiones: opciones de aprobación | Automática · Manual (GH revisa cada registro) | GH | Propuesta |
| T-568 | Ocasiones: estados | Borrador · Abierta · Cerrada · Cancelada | MATEO | Propuesta |
| T-569 | Ocasiones: acciones de fila | Abrir · Cerrar · Consola | MATEO | Propuesta |
| T-570 | Ocasiones: filtros | Semestre · Tipo · Estado · Comité | MATEO | Propuesta |
| T-571 | Ocasiones: columnas | Título · Tipo · Empieza · Registro · GH Points · Estado · Registrados | MATEO | Propuesta |
| T-572 | Ocasiones: una asamblea no da puntos | Una asamblea no da GH Points: dejá los puntos en 0. | MATEO | Propuesta |
| T-573 | Ocasiones: la asamblea necesita su tipo | Elegí el tipo de asamblea. | MATEO | Propuesta |
| T-574 | Ocasiones: la sesión necesita edición | Una sesión de edición necesita la edición. | MATEO | Propuesta |
| T-575 | Ocasiones: ventana invertida | El registro debe cerrar después de abrir. | MATEO | Propuesta |
| T-576 | Ocasiones: ya hay una elección de junta o una segunda vuelta en el semestre | Este semestre ya tiene una {tipo}. | MATEO | Propuesta |
| T-577 | Ocasiones: fuera de borrador solo cambian algunos campos | Una ocasión abierta o cerrada solo cambia título, descripción y lugar. | MATEO | Propuesta |
| T-578 | Ocasiones: transición inválida | Esa acción no aplica: la ocasión está {estado}. | MATEO | Propuesta |
| T-579 | Ocasiones: no se abre con el semestre cerrado | El semestre ya cerró sus puntos: no se pueden abrir ocasiones. | MATEO | Propuesta |
| T-580 | Ocasiones: ayuda de la ventana por defecto | Si dejás la ventana vacía, el registro abre 30 minutos antes y cierra 3 horas después del inicio. | MATEO | Propuesta |
| T-581 | Ocasiones: ayuda del código rotativo | Recomendado en ocasiones grandes: el QR cambia cada minuto y un pantallazo reenviado no sirve. | GH | Propuesta |
| T-582 | Ocasiones: opción sin comité | Toda la OE (sin comité) | MATEO | Propuesta |
| T-583 | Ocasiones: opción sin edición | Sin edición | MATEO | Propuesta |
| T-584 | Consola: título | Consola · {título} | MATEO | Propuesta |
| T-585 | Consola: contadores | Registrados · Pendientes · Rechazados · Anulados | MATEO | Propuesta |
| T-586 | Consola: título sobre el QR (pantalla proyectada) | Escaneá para registrar tu asistencia | GH | Propuesta |
| T-587 | Consola: código vigente y cuenta regresiva | Código {codigo} · cambia en {s} s | MATEO | Propuesta |
| T-588 | Consola: botones del código rotativo | Activar código rotativo · Rotar secreto · Desactivar | MATEO | Propuesta |
| T-589 | Consola: botones del ciclo de vida | Abrir registro · Cerrar registro · Cancelar ocasión | MATEO | Propuesta |
| T-590 | Consola: cancelar, botón de confirmación | Sí, cancelar | MATEO | Propuesta |
| T-591 | Consola: sección de pendientes | Pendientes de aprobación | GH | Propuesta |
| T-592 | Consola: botones de decisión sobre un registro | Aprobar · Rechazar · Anular | GH | Propuesta |
| T-593 | Consola: aprobar todos | Aprobar todos los pendientes | GH | Propuesta |
| T-594 | Consola: lista de asistentes, título | Asistentes | MATEO | Propuesta |
| T-595 | Consola: columnas de asistentes | Persona · Comités · Hora · Fuente · Estado | MATEO | Propuesta |
| T-596 | Consola y Persona 360: fuentes del check-in (en el orden del modelo) | QR · Anfitrión · Admin · Importado | MATEO | Propuesta |
| T-597 | Consola y Persona 360: estados del check-in (en el orden del modelo) | Pendiente · Aprobado · Rechazado · Anulado · Excusado | MATEO | Propuesta |
| T-598 | Consola: alta manual, título y botón | Registrar a alguien · Registrar | GH | Propuesta |
| T-599 | Consola y anfitrión: campo de búsqueda | Buscá por nombre | MATEO | Propuesta |
| T-600 | Consola y anfitrión: sin resultados | No encontramos a nadie con ese nombre. | MATEO | Propuesta |
| T-601 | Consola y anfitrión: ya estaba registrado | {nombre} ya estaba registrado. | MATEO | Propuesta |
| T-602 | Consola y anfitrión: registro hecho | De una: {nombre} quedó registrado. | MATEO | Propuesta |
| T-603 | Consola: últimos registros | Últimos registros | MATEO | Propuesta |
| T-604 | Consola: participación por comité, título | Participación por comité | GH | Propuesta |
| T-605 | Consola y vista de líder: columnas de participación | Comité · Presentes · Elegibles · Tasa · Ajustada | MATEO | Propuesta |
| T-606 | Consola: score todavía no calculado | La participación se calcula unos segundos después de cada registro. | MATEO | Propuesta |
| T-607 | Consola: enlace al modo anfitrión | Modo anfitrión | GH | Propuesta |
| T-608 | Consola: exporte de asistentes | Exportar asistentes (CSV) | MATEO | Propuesta |
| T-609 | Consola: anular sin motivo | Escribí el motivo para anular. | MATEO | Propuesta |
| T-610 | Consola: acreditar por ajuste tras una anulación | Acreditar por ajuste | GH | Propuesta |
| T-611 | Consola: enlace público del QR | Enlace: {url} | MATEO | Propuesta |
| T-612 | Consola: aviso de registro cerrado | Registro cerrado el {fecha}. Podés seguir registrando a mano. | MATEO | Propuesta |
| T-613 | Consola: aviso de ocasión cancelada | Cancelada el {fecha}: {motivo} | MATEO | Propuesta |
| T-614 | Anfitrión: título | Modo anfitrión · {título} | GH | Propuesta |
| T-615 | Anfitrión: intro | Buscá a la persona por nombre o escaneá el QR de su carnet. | GH | Propuesta |
| T-616 | Anfitrión: botones del lector | Escanear carnet · Detener · Subir una foto del carnet | MATEO | Propuesta |
| T-617 | Anfitrión: cámara no disponible o permiso negado | No pudimos usar la cámara. Buscá a la persona por nombre o subí una foto del QR. | MATEO | Propuesta |
| T-618 | Anfitrión: el QR no es un carnet | Ese QR no es un carnet de la OE. | MATEO | Propuesta |
| T-619 | Anfitrión: carnet vencido | Ese carnet venció. Pedile que abra Mi OE y muestre el carnet de nuevo. | MATEO | Propuesta |
| T-620 | Anfitrión: la ocasión no está abierta | El registro por anfitrión solo funciona con la ocasión abierta. | MATEO | Propuesta |
| T-621 | Anfitrión: último marcado | {nombre} · registrado a las {hora} | MATEO | Propuesta |
| T-622 | Ledger: título | Ledger de GH Points | GH | Propuesta |
| T-623 | Ledger: columnas | Fecha · Persona · Semestre · Movimiento · Puntos · Motivo · Por | MATEO | Propuesta |
| T-624 | Ledger: filtros | Persona · Semestre · Movimiento | MATEO | Propuesta |
| T-625 | Ledger y Persona 360: botón de ajuste | Ajustar puntos | GH | Propuesta |
| T-626 | Ledger: campos del ajuste | Persona · Semestre · Puntos (positivos o negativos) · Motivo | MATEO | Propuesta |
| T-627 | Ledger: puntos en cero | Los puntos no pueden ser 0. | MATEO | Propuesta |
| T-628 | Ledger: motivo obligatorio | El motivo es obligatorio: queda en el historial de la persona. | GH | Propuesta |
| T-629 | Ledger: semestre cerrado | El semestre ya cerró sus puntos: no acepta movimientos. | MATEO | Propuesta |
| T-630 | Ledger: revertir, botón | Revertir | MATEO | Propuesta |
| T-631 | Ledger: revertir, confirmación | Vas a revertir {puntos} puntos de {nombre} ({motivo}). Escribí el motivo. | GH | Propuesta |
| T-632 | Ledger: no se revierte una asistencia ni una reversión | Solo se revierten ajustes e históricos; una asistencia se anula desde su ocasión. | MATEO | Propuesta |
| T-633 | Ledger: ya revertida | Ese movimiento ya fue revertido. | MATEO | Propuesta |
| T-634 | Ledger: ajuste guardado | Listo: {puntos} puntos para {nombre}. | MATEO | Propuesta |
| T-635 | Rankings admin: título | Rankings de {término} | GH | Propuesta |
| T-636 | Rankings admin: columnas | Puesto · Persona · Semestre de ingreso · GH Points | MATEO | Propuesta |
| T-637 | Asambleas admin: título | Asambleas de {término} | GH | Propuesta |
| T-638 | Asambleas admin: columnas de cumplimiento | Persona · Requeridas · Firmadas · Elección · Segunda vuelta · Cumple | MATEO | Propuesta |
| T-639 | Asambleas admin: filtros de cumplimiento | Todos · Cumplen · No cumplen · Con ajuste | MATEO | Propuesta |
| T-640 | Asambleas admin: ajustar requisito, título y campos | Ajustar requisito · Ordinarias requeridas · Debe firmar la elección · Debe firmar la segunda vuelta · Motivo | GH | Propuesta |
| T-641 | Asambleas admin: ajuste guardado | Requisito ajustado para {nombre}. | MATEO | Propuesta |
| T-642 | Asambleas admin: valores | Sí · No · Cumple · No cumple · Ajustado | MATEO | Propuesta |
| T-643 | Asambleas admin: sin asambleas en el semestre | Este semestre todavía no tiene asambleas. Creá una desde Ocasiones. | MATEO | Propuesta |
| T-644 | Cierre: título | Cierre de {término} | GH | Propuesta |
| T-645 | Cierre: resumen | Ocasiones abiertas · Registros pendientes · Miembros con puntos · Puntos otorgados | MATEO | Propuesta |
| T-646 | Cierre: bloqueo por ocasiones abiertas | Cerrá o cancelá las {n} ocasiones abiertas antes de cerrar los puntos. | MATEO | Propuesta |
| T-647 | Cierre: botón | Cerrar puntos del semestre | GH | Propuesta |
| T-648 | Cierre: cerrado | Puntos cerrados el {fecha}. Los rankings quedaron congelados. | MATEO | Propuesta |
| T-649 | Cierre: títulos del standing | Top nuevos · Top veteranos · Comités | GH | Propuesta |
| T-650 | Cierre: sin semestre abierto | No hay un semestre abierto para cerrar. | MATEO | Propuesta |
| T-651 | Vista de líder: títulos | Tu comité · Roster del semestre · Participación del comité · Ocasiones del comité | GH | Propuesta |
| T-652 | Vista de líder: botones | Nueva ocasión · Crear serie semanal | GH | Propuesta |
| T-653 | Vista de líder: aviso de apertura | Las ocasiones con GH Points las abre GH. Las reuniones (0 puntos) las abrís vos. | GH | Propuesta |
| T-654 | Serie semanal: campos | Título · Día de la semana · Hora · Duración (minutos) · Lugar · Primera reunión | MATEO | Propuesta |
| T-655 | Serie semanal: creada | Listo pues: {n} reuniones creadas hasta el {fecha}. | MATEO | Propuesta |
| T-656 | Vista de líder: sin permiso sobre este comité | No sos líder de este comité. | MATEO | Propuesta |
| T-657 | Vista de líder: columnas de la participación por ocasión | Ocasión · Fecha · Presentes · Elegibles · Tasa | MATEO | Propuesta |
| T-658 | Recurso alias legados (plural · singular) | Alias legados · Alias legado | MATEO | Propuesta |
| T-659 | Alias: campos y columnas | Ruta antigua · Ocasión · Creado el | MATEO | Propuesta |
| T-660 | Alias: ruta repetida | Ya existe un alias con esa ruta. | MATEO | Propuesta |
| T-661 | Alias: ruta inválida | La ruta debe empezar por /a/ o /asamblea/. | MATEO | Propuesta |
| T-662 | Recurso check-ins (plural · singular) | Check-ins · Check-in | MATEO | Propuesta |
| T-663 | Recurso ledger (plural · singular) | Movimientos · Movimiento | MATEO | Propuesta |
| T-664 | Recurso rankings (plural · singular) | Rankings · Puesto | MATEO | Propuesta |
| T-665 | Recurso cumplimiento de asambleas (plural · singular) | Cumplimiento de asambleas · Persona | MATEO | Propuesta |
| T-666 | Tarea: falta crear el semestre siguiente | Crear el semestre {codigo}: el actual termina el {fecha} | MATEO | Propuesta |
| T-667 | Línea de tiempo: textos de las interacciones de participación | Asistió a {ocasion} · Sumó {n} GH Points por {ocasion} · Registro en {ocasion} pendiente de aprobación · Registro en {ocasion} anulado: {motivo} · Ajuste de {n} GH Points: {motivo} · Reversión de {n} GH Points: {motivo} · Resolvió el Wordle del {fecha} en {intentos}/6 y sumó {n} GH Points · Excusa aceptada para {ocasion} · Completó el reto {reto} y sumó {n} GH Points · Desbloqueó la insignia {insignia} nivel {nivel} · Recibió un {booster} · Entrega del reto {reto} rechazada: {motivo} · Hizo {puntaje} puntos en el 2048 del {fecha} y sumó {n} GH Points · Resolvió un Sudoku el {fecha} y sumó {n} GH Points · Llegó a Genio en Panal el {fecha} y sumó {n} GH Points · Encontró {palabras} palabras en Panal el {fecha} y sumó {n} GH Points | MATEO | Propuesta |
| T-668 | Persona 360, Participación: títulos | Check-ins · Movimientos de GH Points | MATEO | Propuesta |
| T-669 | Persona 360, Participación: sin check-ins | Todavía no tiene check-ins. | MATEO | Propuesta |
| T-670 | Persona 360, Resumen: asambleas obligatorias | {n} de {total} obligatorias | MATEO | Propuesta |
| T-671 | Consola: sin registros todavía | Todavía nadie se registró. | MATEO | Propuesta |
| T-672 | Inicio del admin: ocasiones abiertas | Ocasiones abiertas | MATEO | Propuesta |
| T-673 | Consola y anfitrión: la persona no está activa | {nombre} no está activo este semestre. | GH | Propuesta |
| T-674 | Consola y anfitrión: la ocasión es solo para nuevos | Esta ocasión es solo para nuevos: {nombre} no aplica. | GH | Propuesta |
| T-675 | Ocasiones: la fecha de inicio no cae en ningún semestre | No hay un semestre que contenga esa fecha. Crealo primero en Términos. | MATEO | Propuesta |
| T-676 | Consola: decisión que no aplica al estado del registro | Esa decisión no aplica: el registro está {estado}. | MATEO | Propuesta |
| T-677 | Migración: motivo del requisito de asambleas heredado de un semestre ya cerrado | Requisito heredado de GHPOINTS (regla anterior). | MATEO | Propuesta |

### Admin de Permanencia (fase 4: reglas, grupos, evaluaciones, puntajes, créditos, cumplimiento, cierre, vista de líder, junta)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-708 | Navegación del admin: enlaces de la fase 4 | Reglas · Grupos · Evaluaciones · Cumplimiento · Cierre de permanencia · Junta | MATEO | Propuesta |
| T-709 | Navegación del líder de comité, líder de grupo y evaluador | Permanencia de {comité} · Mis grupos · Evaluaciones | MATEO | Propuesta |
| T-710 | Reglas: título | Tablas de permanencia | GH | Propuesta |
| T-711 | Reglas: intro | La tabla general la define GH; cada comité define la suya. Los pesos son puntos: la suma de cada tabla se compara con su valor nominal. | GH | Propuesta |
| T-712 | Reglas: bloques | Tabla general · Tablas de comité | MATEO | Propuesta |
| T-713 | Reglas: suma frente al nominal | Veteranos {v} · Nuevos {n} · nominal {nominal} | MATEO | Propuesta |
| T-714 | Reglas: aviso de desviación del nominal | Esta tabla se aleja del valor nominal ({nominal}). No bloquea, pero revisá los pesos. | GH | Propuesta |
| T-715 | Reglas: botones | Nuevo criterio · Copiar del semestre anterior · Cargar tabla de referencia · Vista previa del impacto · Bloquear · Desbloquear · Comentar · Bloquear todas | MATEO | Propuesta |
| T-716 | Reglas: campos del criterio | Clave · Nombre · Descripción · Peso · Aplica a · Cómo se calcula · Orden | MATEO | Propuesta |
| T-717 | Reglas: opciones de "aplica a" (en el orden del modelo) | Todos · Solo nuevos · Solo veteranos | GH | Propuesta |
| T-718 | Reglas: nombres de los cálculos (en el orden del modelo) | Conteo de asistencias · Mínimo de asistencias · Tasa de asistencia · Grupo evaluado · Asistencias más grupo · Puntaje del líder · Manual | MATEO | Propuesta |
| T-719 | Reglas: qué hace cada cálculo (mismo orden) | Suma un porcentaje por cada asistencia hasta el peso · Da el peso completo al llegar al mínimo · Reparte el peso según la tasa de asistencia a las reuniones del comité · Da el peso si el grupo evalúa buen desempeño · Exige el mínimo de asistencias y un grupo con buen desempeño · Lo asigna el líder del comité, con observación si baja · Lo reconoce GH a mano con motivo | MATEO | Propuesta |
| T-720 | Reglas: parámetros de asistencia | Categoría · Tipo · Comité · Solo nuevos · Ocasiones · Por asistencia · Mínimo · Esperadas en el semestre | MATEO | Propuesta |
| T-721 | Reglas: opciones del filtro de solo nuevos (en el orden del modelo) | Todas · Solo las de nuevos · Sin las de nuevos | MATEO | Propuesta |
| T-722 | Reglas: opciones del filtro de comité (en el orden del modelo) | Cualquier comité · Solo este comité | MATEO | Propuesta |
| T-723 | Reglas: parámetros de grupo | Tipo de grupo · Código · Modo · Por grupo · Tramos | MATEO | Propuesta |
| T-724 | Reglas: opciones del modo de grupo (en el orden del modelo) | Fijo · Por grupo · Por cantidad | MATEO | Propuesta |
| T-725 | Grupos y reglas: tipos de grupo (en el orden del modelo) | Comité de trabajo · GT de macroevento · GAP · GAP OE · Barra brava · Tarea de nuevos | GH | Propuesta |
| T-726 | Reglas: parámetro obligatorio del puntaje del líder | Obligatorio: vale el peso completo salvo que el líder lo baje | GH | Propuesta |
| T-727 | Reglas: ayuda de los tramos | Cantidad de grupos con buen desempeño y peso de cada tramo, uno por línea: 1 4, 2 6, 3 8. | MATEO | Propuesta |
| T-728 | Reglas: ayuda de esperadas en el semestre | Cuántas ocasiones de este tipo habrá en el semestre. Sirve para calcular lo que aún es posible mientras el calendario no esté cargado. | MATEO | Propuesta |
| T-729 | Reglas: clave repetida | Ya hay un criterio con esa clave en esta tabla. | MATEO | Propuesta |
| T-730 | Reglas: parámetros inválidos | Revisá los parámetros del cálculo: {detalle}. | MATEO | Propuesta |
| T-731 | Reglas: tabla bloqueada (para el líder) | GH bloqueó la tabla de {comité} este semestre. Si necesitás un cambio, escribiles. | GH | Propuesta |
| T-732 | Reglas: no se borra un criterio con puntajes o créditos | Este criterio ya tiene puntajes o créditos: editalo en vez de borrarlo. | MATEO | Propuesta |
| T-733 | Reglas: copiar exige tabla vacía | Solo se copia sobre una tabla vacía. | MATEO | Propuesta |
| T-734 | Reglas: no hay semestre anterior con tabla | El semestre anterior no tiene tabla para copiar. | MATEO | Propuesta |
| T-735 | Reglas: referencia cargada | Tabla de referencia cargada: {n} criterios. | MATEO | Propuesta |
| T-736 | Reglas: comentario de GH, campo | Comentario para el comité | GH | Propuesta |
| T-737 | Reglas: vista previa, título y columnas | Impacto sobre el roster · Personas · En camino · En riesgo · No alcanza · Promedio | MATEO | Propuesta |
| T-738 | Reglas: estado de la tabla | Sin criterios · Abierta · Bloqueada el {fecha} | MATEO | Propuesta |
| T-739 | Reglas: intro para el líder | Tu tabla vale unos {nominal} puntos. Definí los criterios de tu comité: reuniones, eventos, puntajes. | GH | Propuesta |
| T-740 | Reglas: opción "cualquiera" para categoría o tipo | Cualquiera | MATEO | Propuesta |
| T-741 | Reglas: todas las tablas bloqueadas | {n} tablas bloqueadas. | MATEO | Propuesta |
| T-742 | Recurso grupos de trabajo (plural · singular) | Grupos de trabajo · Grupo de trabajo | MATEO | Propuesta |
| T-743 | Grupos: campos | Semestre · Tipo · Nombre · Código · Edición · Evento · Líder | MATEO | Propuesta |
| T-744 | Grupos: columnas | Nombre · Tipo · Código · Líder · Miembros · Evaluadores · Pendientes | MATEO | Propuesta |
| T-745 | Grupos: filtros | Semestre · Tipo | MATEO | Propuesta |
| T-746 | Grupos: acciones | Abrir · Sembrar comités de trabajo | MATEO | Propuesta |
| T-747 | Grupo: secciones | Miembros · Evaluadores · Importar desde CSV | MATEO | Propuesta |
| T-748 | Grupo: botones | Agregar miembro · Quitar · Guardar evaluadores · Cargar archivo · Confirmar importación | MATEO | Propuesta |
| T-749 | Grupo: columnas de miembros | Persona · Comités · Entró · Evaluación · Evaluó · Observación | MATEO | Propuesta |
| T-750 | Grupo y Mi OE: evaluaciones (en el orden del modelo) | Pendiente · Buen desempeño · Insuficiente | GH | Propuesta |
| T-751 | Grupo: ya es miembro | {nombre} ya está en este grupo. | MATEO | Propuesta |
| T-752 | Grupo: la persona no está activa | {nombre} no está activo este semestre: no puede entrar al grupo. | GH | Propuesta |
| T-753 | Grupo: importación, ayuda | Un CSV con la columna CORREO (correo institucional). Solo entran miembros activos; el resto queda listado para que lo revises. | MATEO | Propuesta |
| T-754 | Grupo: importación, resumen | {n} para agregar · {m} ya estaban · {k} sin membresía activa · {j} correos desconocidos | MATEO | Propuesta |
| T-755 | Grupo: importación, archivo inválido | No pude leer el archivo: necesita la columna CORREO y menos de 1 MB. | MATEO | Propuesta |
| T-756 | Grupos: comités de trabajo sembrados | Listo: {n} comités de trabajo creados para {término}. Faltan los evaluadores. | MATEO | Propuesta |
| T-757 | Grupos: sin líder | Sin líder | MATEO | Propuesta |
| T-758 | Grupo: código repetido en el semestre | Ya hay un grupo con ese código este semestre. | MATEO | Propuesta |
| T-759 | Grupo: sin evaluador | Sin evaluador: GH debe asignar al director del frente. | GH | Propuesta |
| T-760 | Grupo: opción sin evento | Sin evento | MATEO | Propuesta |
| T-761 | Evaluaciones: título | Evaluaciones de desempeño | GH | Propuesta |
| T-762 | Evaluaciones: intro | Marcá si cada persona tuvo buen desempeño antes, durante y después. Insuficiente pide una observación que la persona va a leer. | GH | Propuesta |
| T-763 | Evaluaciones: ventana cerrada | La ventana de evaluación de {término} abre el {fecha}. Hasta entonces solo GH puede evaluar. | GH | Propuesta |
| T-764 | Evaluaciones: ventana abierta | Ventana abierta hasta el cierre del semestre · {n} pendientes | MATEO | Propuesta |
| T-765 | Evaluaciones: sin grupos | No tenés grupos para evaluar este semestre. | MATEO | Propuesta |
| T-766 | Evaluaciones: la observación es obligatoria | Insuficiente necesita una observación para la persona. | GH | Propuesta |
| T-767 | Evaluaciones: fuera de ventana | Todavía no abre la ventana de evaluación. | MATEO | Propuesta |
| T-768 | Evaluaciones: no evalúa ese grupo | No evaluás este grupo. | MATEO | Propuesta |
| T-769 | Evaluaciones: campo de observación | Observación (la lee la persona) | GH | Propuesta |
| T-770 | Evaluaciones: evaluada | Evaluada por {evaluador} el {fecha} | MATEO | Propuesta |
| T-771 | Puntajes del líder: título | Puntajes de {comité} | GH | Propuesta |
| T-772 | Puntajes del líder: intro | Cada criterio del líder va de 0 al peso. Si bajás el valor, la observación es obligatoria y la persona la ve. | GH | Propuesta |
| T-773 | Puntajes del líder: campos | Valor · Observación | MATEO | Propuesta |
| T-774 | Puntajes y créditos: valor fuera de rango | El valor va de 0 a {peso}. | MATEO | Propuesta |
| T-775 | Puntajes del líder: falta la observación | Si el puntaje es menor al peso, escribí la observación. | GH | Propuesta |
| T-776 | Puntajes del líder: la persona no está en el comité | {nombre} no está en {comité} este semestre. | MATEO | Propuesta |
| T-777 | Puntajes del líder: sin criterios de puntaje | Tu tabla no tiene criterios de puntaje del líder todavía. | MATEO | Propuesta |
| T-778 | Destacado del mes: título y botón | Destacado del mes · Nombrar destacado | COM | Propuesta |
| T-779 | Destacado del mes: campos | Mes · Persona | MATEO | Propuesta |
| T-780 | Destacado del mes: ya hay uno ese mes | {comité} ya tiene destacado de {mes}. | MATEO | Propuesta |
| T-781 | Destacado del mes: publicado | Listo pues: {nombre} quedó como destacado de {mes}. Se publicó en la cartelera del comité. | COM | Propuesta |
| T-782 | Destacado del mes: sin consentimiento de directorio | {nombre} quedó registrado como destacado de {mes}, pero no autorizó aparecer en el directorio: no se publica. | JUNTA | Propuesta |
| T-783 | Destacado del mes: título del anuncio | Destacado de {mes}: {nombre} | COM | Propuesta |
| T-784 | Destacado del mes: cuerpo del anuncio | {comité} reconoce a {nombre} como destacado del mes de {mes}. ¡Qué berraco! ¡OE OE OE! | COM | Propuesta |
| T-785 | Créditos manuales: título y botón | Crédito manual · Reconocer | GH | Propuesta |
| T-786 | Créditos manuales: campos | Criterio · Valor · Motivo | MATEO | Propuesta |
| T-787 | Créditos manuales: solo criterios manuales | Solo se reconocen a mano los criterios de tipo manual. | MATEO | Propuesta |
| T-788 | Cumplimiento: título | Cumplimiento de permanencia | GH | Propuesta |
| T-789 | Cumplimiento: filtros | Todos · Por debajo · No alcanza · En prueba · Nuevos · Exentos | MATEO | Propuesta |
| T-790 | Cumplimiento: columnas | Persona · Condición · Comité · General · Del comité · Total · Umbral · Estado · Obligatorias | MATEO | Propuesta |
| T-791 | Cumplimiento y Mi OE: estados (en el orden del modelo) | En camino · En riesgo · No alcanza · Cumple · Prueba · No cumple | GH | Propuesta |
| T-792 | Cumplimiento y Mi OE: condiciones (en el orden del modelo) | Activo · Nuevo · En prueba · Transferencia | GH | Propuesta |
| T-793 | Cumplimiento: exento | Exento ({estado}) | MATEO | Propuesta |
| T-794 | Cumplimiento: recalcular | Recalcular ahora | MATEO | Propuesta |
| T-795 | Cumplimiento: recálculo encolado | Recalculando: refrescá en unos segundos. | MATEO | Propuesta |
| T-796 | Cumplimiento: fecha del cálculo | Calculado el {fecha} | MATEO | Propuesta |
| T-797 | Cumplimiento: sin cálculo | Sin cálculo todavía | MATEO | Propuesta |
| T-798 | Cierre de permanencia: título | Cierre de permanencia | GH | Propuesta |
| T-799 | Cierre: puntos sin cerrar | Primero cerrá los puntos de {término}. Las propuestas se ven, pero no se confirman hasta entonces. | MATEO | Propuesta |
| T-800 | Cierre: resumen | Personas · Continúan · En prueba · Salen de un comité · Salen de la OE · Sin decisión · Evaluaciones pendientes | MATEO | Propuesta |
| T-801 | Cierre: motivos automáticos (cumple, prueba, no cumple, sin comité, obligatoria, sanciones) | Cumplió el umbral · Por debajo del umbral, dentro de la banda de prueba de su condición · Por debajo del umbral, fuera de la banda de prueba de su condición · No le queda un comité donde cumpla o esté en prueba · Faltó a una asamblea obligatoria · Falta grave vigente más otra sanción (Reglamento, art. 69) | GH | Propuesta |
| T-802 | Cierre y Persona 360: decisiones (en el orden del modelo) | Continúa · Periodo de prueba · Sale del comité · Sale de la OE | GH | Propuesta |
| T-803 | Cierre: botones | Confirmar propuesta · Cambiar · Confirmar todas las propuestas · Aplicar cierre | MATEO | Propuesta |
| T-804 | Cierre: campos al cambiar | Decisión · Motivo | MATEO | Propuesta |
| T-805 | Cierre: motivo obligatorio al cambiar | Cambiar la propuesta exige un motivo. | MATEO | Propuesta |
| T-806 | Cierre: la propuesta cambió desde la confirmación | La propuesta actual ({propuesta}) difiere de la confirmada; rige la confirmada. | MATEO | Propuesta |
| T-807 | Cierre: faltan decisiones | Faltan decisiones para {n} personas. | MATEO | Propuesta |
| T-808 | Cierre: ya cerró | {término} ya cerró su permanencia el {fecha}. | MATEO | Propuesta |
| T-809 | Cierre: confirmación para aplicar | Vas a aplicar el cierre de {término}: {salen} personas salen de la OE, {comites} salen de un comité y {prueba} quedan en prueba. Esto no se deshace. | GH | Propuesta; texto sensible |
| T-810 | Cierre: avance de la aplicación | {n} de {m} decisiones aplicadas | MATEO | Propuesta |
| T-811 | Cierre: aplicado | Cierre aplicado. Las decisiones quedaron en cada persona. | MATEO | Propuesta |
| T-812 | Cierre: confirmadas en bloque | {n} propuestas confirmadas. | MATEO | Propuesta |
| T-813 | Cierre: evaluaciones pendientes (aviso) | Hay {n} evaluaciones pendientes: cuentan como no logradas. | GH | Propuesta |
| T-814 | Cierre: sin personas evaluadas | Nadie tiene resultado en {término}. | MATEO | Propuesta |
| T-815 | Cierre de puntos: enlace al cierre de permanencia | Seguí con el cierre de permanencia | MATEO | Propuesta |
| T-816 | Cierre: filtros | Todas · Sin decisión · Con cambios · Salen | MATEO | Propuesta |
| T-817 | Cierre: confirmada | Confirmada por {quien} el {fecha} | MATEO | Propuesta |
| T-818 | Vista de líder: título de permanencia | Permanencia de {comité} | MATEO | Propuesta |
| T-819 | Vista de líder: secciones de permanencia | Tabla del comité · Puntajes · Destacado del mes · Progreso de los miembros | MATEO | Propuesta |
| T-820 | Vista de líder: columnas del progreso | Persona · Condición · Reuniones · Resultado · Estado | MATEO | Propuesta |
| T-821 | Junta: título | Panel de la junta | JUNTA | Propuesta |
| T-822 | Junta: intro | Indicadores agregados del semestre, sin nombres. Para decidir con datos. | JUNTA | Propuesta |
| T-823 | Junta: tarjetas | Activos · Nuevos · Retención · En camino · En riesgo · No alcanza · Reuniones · Integraciones · Asambleas | MATEO | Propuesta |
| T-824 | Junta: secciones | Retención por semestre · Nuevos por comité · Permanencia por comité · Reuniones por comité · Integraciones y asambleas | MATEO | Propuesta |
| T-825 | Junta: columnas de retención | Semestre · Con comité · Siguen el siguiente · Retención · Nuevos | MATEO | Propuesta |
| T-826 | Junta: nota de la retención | Retención: de quienes tenían comité en un semestre, cuántos lo tienen en el siguiente. | MATEO | Propuesta |
| T-827 | Junta: sin datos | Todavía no hay datos de este semestre. | MATEO | Propuesta |
| T-828 | Junta: columnas por comité | Comité · Miembros · En camino · En riesgo · No alcanza · Reuniones · Asistencia | MATEO | Propuesta |
| T-829 | Persona 360, Permanencia: bloques | Resultado por comité · Tabla general · Decisiones del cierre · Créditos manuales | MATEO | Propuesta |
| T-830 | Persona 360, Permanencia: exento | Sin evaluación de permanencia este semestre ({estado}). | MATEO | Propuesta |
| T-831 | Persona 360, Permanencia: decisión confirmada | {decisión}: {motivo} (por {quien}, {fecha}) | MATEO | Propuesta |
| T-832 | Línea de tiempo: eventos de permanencia (buen desempeño, insuficiente, puntaje del líder, crédito manual, entró al grupo, salió del grupo, decisión del cierre, condición de prueba marcada, condición de prueba retirada, prueba marcada en un comité, prueba retirada en un comité) | Buen desempeño en {grupo}, evaluado por {evaluador} · Desempeño insuficiente en {grupo}, evaluado por {evaluador}: {nota} · {criterio} en {comité}: {valor} de {peso} · Crédito manual en {criterio}: {valor} ({motivo}) · Entró al grupo {grupo} · Salió del grupo {grupo} · Cierre de {término}: {decisión} · En periodo de prueba en {término}: {motivo} · Sin periodo de prueba en {término}: {motivo} · En periodo de prueba en {comité} en {término}: {motivo} · Sin periodo de prueba en {comité} en {término}: {motivo} | MATEO | Propuesta |
| T-833 | Línea de tiempo: reconocimiento | Destacado de {mes} en {comité} | MATEO | Propuesta |
| T-834 | Permanencia: el semestre ya cerró su permanencia (comandos) | El semestre ya cerró su permanencia: no se puede cambiar. | MATEO | Propuesta |
| T-835 | Permanencia: sin permiso sobre el grupo | No operás este grupo. | MATEO | Propuesta |
| T-836 | Exporte de cumplimiento: cabeceras | Nombre · Apellido · Correo · Condición · Comité · General · Del comité · Total · Umbral · Estado · Obligatorias | MATEO | Propuesta |
| T-837 | Exporte de la junta: cabeceras | Indicador · Comité · Semestre · Valor | MATEO | Propuesta |
| T-838 | Cartelera (admin): campo de comité | Comité (solo en su cartelera interna) | MATEO | Propuesta |
| T-839 | Cartelera (admin): opción sin comité | Toda la OE | MATEO | Propuesta |
| T-840 | Grupos: opción sin líder en el formulario | Sin líder por ahora | MATEO | Propuesta |
| T-841 | Reglas: criterios de la tabla de referencia de A3 (en el orden de 12-permanencia) | Asistencia a reuniones · Subcomité, liderazgo o destacado · Convivencia | COMITÉ | Propuesta; transcritos de la tabla que envió A3 |
| T-842 | Reglas: claves de la tabla de referencia general (mismo orden que T-125) | integraciones · asambleas · gt-macroeventos · gap · gap-oe · comite-de-trabajo · barra-brava · decoracion-de-oficina · integracion-de-nuevos | MATEO | Propuesta |
| T-843 | Reglas: borrar un criterio | Borrar criterio | MATEO | Propuesta |
| T-844 | Grupo: sin miembros | Todavía nadie entró a este grupo. | MATEO | Propuesta |
| T-845 | Grupo: importación aplicada | Listo: {n} personas agregadas al grupo. | MATEO | Propuesta |
| T-846 | Grupo: resultado de cada fila de la importación (agregar, ya estaba, sin membresía activa, desconocido) | Para agregar · Ya estaba · Sin membresía activa · Correo desconocido | MATEO | Propuesta |
| T-847 | Grupo: campo de correos de los evaluadores | Correos de los evaluadores (uno por línea) | MATEO | Propuesta |
| T-848 | Junta: ocasiones celebradas (unidad) | celebradas | MATEO | Propuesta |
| T-849 | Junta: check-ins aprobados (unidad) | check-ins | MATEO | Propuesta |
| T-850 | Junta: promedio por ocasión (unidad) | por ocasión | MATEO | Propuesta |

### Admin de admisión, aliados y contactos (fase 5: formularios, organizaciones, pipelines, solicitudes, convocatorias, tablero)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-908 | Navegación del admin: enlaces de la fase 5 | Formularios · Pipelines · Organizaciones · Solicitudes · Convocatorias | MATEO | Propuesta |
| T-909 | Formularios: nombres del recurso | Formulario · Formularios | MATEO | Propuesta |
| T-910 | Formularios: campos y columnas | Identificador · Título · Descripción · Audiencia · Estado · Abre · Cierra · Tope de respuestas · Admite varias respuestas por correo · Consentimiento obligatorio · Texto de gracias · Respuestas | MATEO | Propuesta |
| T-911 | Formularios: opciones de audiencia | Público · Miembros | MATEO | Propuesta |
| T-912 | Formularios: opciones de estado | Borrador · Abierto · Cerrado | MATEO | Propuesta |
| T-913 | Formularios: acciones de fila | Abrir · Cerrar | MATEO | Propuesta |
| T-914 | Formularios: identificador inválido | El identificador lleva solo minúsculas, números y guiones (de 2 a 60). | MATEO | Propuesta |
| T-915 | Formularios: identificador repetido | Ya existe un formulario con ese identificador. | MATEO | Propuesta |
| T-916 | Formularios: ayuda del identificador | Es la URL pública: /f/{identificador} | MATEO | Propuesta |
| T-917 | Formularios: cierre anterior a la apertura | El cierre tiene que ser posterior a la apertura. | MATEO | Propuesta |
| T-918 | Constructor: título de la sección de campos | Campos | MATEO | Propuesta |
| T-919 | Constructor: título de la sección de acciones | Qué pasa con cada respuesta | MATEO | Propuesta |
| T-920 | Constructor: enlace público y vista previa | Enlace público · Ver como lo ve la gente | MATEO | Propuesta |
| T-921 | Constructor: sin campos | Este formulario todavía no tiene campos. En los públicos, nombre, apellido y correo van siempre. | MATEO | Propuesta |
| T-922 | Constructor: botón para agregar un campo | Agregar campo | MATEO | Propuesta |
| T-923 | Constructor: campos del panel de un campo | Clave · Etiqueta · Tipo · Obligatorio · Ayuda · Opciones (una por línea) | MATEO | Propuesta |
| T-924 | Constructor: tipos de campo (en el orden del modelo) | Texto corto · Texto largo · Correo · Celular · Selección · Selección múltiple · Casilla · Fecha · Calificación de 1 a 5 | MATEO | Propuesta |
| T-925 | Constructor: clave inválida | La clave lleva solo minúsculas, números y guiones bajos (de 1 a 40). | MATEO | Propuesta |
| T-926 | Constructor: clave repetida | Ya hay un campo con esa clave. | MATEO | Propuesta |
| T-927 | Constructor: selección sin opciones | Una selección necesita al menos una opción. | MATEO | Propuesta |
| T-928 | Constructor: ayuda de las claves reservadas | Las claves phone y program se copian al celular y al programa de la persona nueva. | MATEO | Propuesta |
| T-929 | Constructor: botones de orden y borrado de un campo | Subir · Bajar · Borrar | MATEO | Propuesta |
| T-930 | Constructor: acciones (casilla y selectores) | Crear la persona como prospecto si no existe · Entrar al pipeline · Inscribir a la edición · Etiquetar con | MATEO | Propuesta |
| T-931 | Constructor: ayuda de las acciones | Entrar a un pipeline o inscribirse a una edición crea la persona si no existe. | MATEO | Propuesta |
| T-932 | Constructor: opciones vacías de pipeline y edición | Ninguno · Ninguna | MATEO | Propuesta |
| T-933 | Constructor: guardado | Campos guardados. · Acciones guardadas. | MATEO | Propuesta |
| T-934 | Constructor: aviso de consentimiento en públicos | Un formulario público siempre pide el consentimiento. | MATEO | Propuesta |
| T-935 | Respuestas: nombres del recurso | Respuesta · Respuestas | MATEO | Propuesta |
| T-936 | Respuestas: columnas | Fecha · Nombre · Correo · Persona · Tarjeta · Consentimiento · IP | MATEO | Propuesta |
| T-937 | Respuestas: sin respuestas | Todavía no hay respuestas. | MATEO | Propuesta |
| T-938 | Respuestas: cabeceras fijas del exporte (más una columna por campo) | Fecha · Nombre · Apellido · Correo · Consentimiento · IP | MATEO | Propuesta |
| T-939 | Respuestas: enlace a la tarjeta | Ver tarjeta | MATEO | Propuesta |
| T-940 | Inscritos: nombres del recurso | Inscrito · Inscritos | MATEO | Propuesta |
| T-941 | Inscritos: columnas | Nombre · Correo · Estado · Inscrito el | MATEO | Propuesta |
| T-942 | Inscritos: estados (en el orden del modelo) | Inscrito · Cancelada | MATEO | Propuesta |
| T-943 | Ediciones: columna y enlace de inscritos | Inscritos | MATEO | Propuesta |
| T-944 | Persona 360, Formularios: títulos de los bloques | Respuestas · Inscripciones · Tarjetas | MATEO | Propuesta |
| T-945 | Persona 360, Formularios: bloques vacíos | No ha respondido formularios. · Sin inscripciones. · Sin tarjetas. | MATEO | Propuesta |
| T-946 | Respuesta: título del detalle | Respuesta a {formulario} | MATEO | Propuesta |
| T-947 | Organizaciones: nombres del recurso | Organización · Organizaciones | MATEO | Propuesta |
| T-948 | Organizaciones: campos y columnas | Nombre · Tipo · Sitio web · Notas · Contactos · Etiquetas | MATEO | Propuesta |
| T-949 | Organizaciones: tipos (en el orden del modelo) | Empresa · Unidad de EAFIT · Grupo estudiantil · Otra | MATEO | Propuesta |
| T-950 | Organizaciones: nombre repetido | Ya existe una organización con ese nombre. | MATEO | Propuesta |
| T-951 | Organización: títulos de los bloques del detalle | Contactos · Línea de tiempo · Tareas · Patrocinios y tarjetas · Etiquetas | MATEO | Propuesta |
| T-952 | Organización: campos de un contacto | Persona · Rol · Contacto principal | MATEO | Propuesta |
| T-953 | Organización: campos del alta de un contacto externo | Nombre · Apellido · Correo · Celular · Rol · Contacto principal | MATEO | Propuesta |
| T-954 | Organización: botones de contactos | Agregar contacto · Vincular persona · Quitar | MATEO | Propuesta |
| T-955 | Organización: sin contactos | Todavía no hay contactos. | MATEO | Propuesta |
| T-956 | Organización: contacto que no es externo | Un contacto de organización tiene que ser una persona externa. | MATEO | Propuesta |
| T-957 | Organización: contacto repetido | Esa persona ya es contacto de esta organización. | MATEO | Propuesta |
| T-958 | Organización: insignia del contacto principal | Principal | MATEO | Propuesta |
| T-959 | Organización: sin tarjetas | Sin patrocinios ni tarjetas. | MATEO | Propuesta |
| T-960 | Organización: sin notas | Sin notas todavía. | MATEO | Propuesta |
| T-961 | Paleta ⌘K: subtítulo de una organización | {tipo} · {n} contactos | MATEO | Propuesta |
| T-962 | Pipelines: nombres del recurso | Pipeline · Pipelines | MATEO | Propuesta |
| T-963 | Pipelines: campos y columnas | Nombre · Tipo · Archivado · Tarjetas abiertas · Tablero | MATEO | Propuesta |
| T-964 | Pipelines: tipos (en el orden del modelo) | Admisión · Patrocinio · Personalizado | MATEO | Propuesta |
| T-965 | Pipelines: plantilla de admisión (etapas en orden; las dos últimas son ganada y perdida) | Recibida · Entrevista · Admitida · Alta · No admitida | GH | Propuesta |
| T-966 | Pipelines: plantilla de patrocinio (etapas en orden; las dos últimas son ganada y perdida) | Contacto · Propuesta · Negociación · Cerrado · Sin acuerdo | COM | Propuesta |
| T-967 | Pipelines: etapa inicial de un pipeline personalizado | Nueva | MATEO | Propuesta |
| T-968 | Pipelines: enlace al tablero | Abrir tablero | MATEO | Propuesta |
| T-969 | Pipelines: acciones de fila | Archivar · Desarchivar | MATEO | Propuesta |
| T-970 | Kanban: columna vacía | Sin tarjetas | MATEO | Propuesta |
| T-971 | Kanban: mover, etiqueta del selector y botón | Mover a… · Mover | MATEO | Propuesta |
| T-972 | Kanban: nueva tarjeta, botón y título del panel | Nueva tarjeta | MATEO | Propuesta |
| T-973 | Kanban: nueva tarjeta, campos | Persona · Organización · Edición · Título · Responsable · Vence | MATEO | Propuesta |
| T-974 | Kanban: tarjeta sin sujeto o con dos | Una tarjeta es de una persona o de una organización, no de las dos. | MATEO | Propuesta |
| T-975 | Kanban: títulos del panel de la tarjeta | Respuesta del formulario · Notas · Tareas · Datos de la tarjeta | MATEO | Propuesta |
| T-976 | Kanban: campos de un patrocinio | Monto · Contraprestación | MATEO | Propuesta |
| T-977 | Kanban: etapas, botón y título del panel | Etapas | MATEO | Propuesta |
| T-978 | Kanban: etapas, campos | Nombre · Ganada · Perdida | MATEO | Propuesta |
| T-979 | Kanban: etapa ganada y perdida a la vez | Una etapa no puede ser ganada y perdida a la vez. | MATEO | Propuesta |
| T-980 | Kanban: etapa con tarjetas no se borra | Esa etapa tiene tarjetas: movelas antes de borrarla. | MATEO | Propuesta |
| T-981 | Kanban: insignias de etapa ganada, perdida y tarjeta cerrada | Ganada · Perdida · Cerrada el {fecha} | MATEO | Propuesta |
| T-982 | Kanban: días en la etapa | {n} días en esta etapa | MATEO | Propuesta |
| T-983 | Kanban y Persona 360: botón de dar de alta | Dar de alta | GH | Propuesta |
| T-984 | Dar de alta: texto | Vas a dar de alta a {nombre} en {término}. Elegí de {min} a {max} comités; entra como Miembro. Para que pueda entrar a Mi OE hay que emitirle su enlace de acceso desde la ficha. | GH | Propuesta |
| T-985 | Dar de alta: campo de comités | Comités | MATEO | Propuesta |
| T-986 | Dar de alta: la persona ya tiene membresía | {nombre} ya tiene membresía: si está retirada, reactivala. | MATEO | Propuesta |
| T-987 | Dar de alta: correo fuera del dominio institucional | Para dar de alta necesita un correo institucional. Editá la persona primero. | MATEO | Propuesta |
| T-988 | Dar de alta: contacto externo | Un contacto externo no se da de alta. | MATEO | Propuesta |
| T-989 | Dar de alta: sin semestre vigente | No hay un semestre vigente: crealo en Términos. | MATEO | Propuesta |
| T-990 | Dar de alta: listo | De una: {nombre} ya es miembro. Falta emitirle su enlace de acceso para que pueda entrar. | GH | Propuesta |
| T-991 | Kanban: mover a la etapa ganada de admisión sin membresía | Para pasar a {etapa} primero da de alta a la persona. | MATEO | Propuesta |
| T-992 | Kanban: tarjeta movida | Tarjeta movida a {etapa}. | MATEO | Propuesta |
| T-993 | Kanban: ayuda accesible para arrastrar | Arrastrá la tarjeta a otra columna o usá "Mover a…". | MATEO | Propuesta |
| T-994 | Tarea de seguimiento de un patrocinio ganado: título | Seguimiento del patrocinio de {organización} | COM | Propuesta |
| T-995 | Kanban: pipeline archivado | Este pipeline está archivado. | MATEO | Propuesta |
| T-996 | Kanban: tarjeta perdida en admisión (aviso) | La persona sigue como postulante con esta tarjeta como historia. | MATEO | Propuesta |
| T-997 | Solicitudes (admin): título | Solicitudes | MATEO | Propuesta |
| T-998 | Solicitudes (admin): columnas | Persona · Tipo · Detalle · Pedida el · Estado · Decidida por | MATEO | Propuesta |
| T-999 | Solicitudes (admin): filtros por estado | Pendientes · Aprobadas · Rechazadas · Retiradas · Todas | MATEO | Propuesta |
| T-1000 | Solicitudes (admin): sin solicitudes | Nada por acá: no hay solicitudes en esta lista. | MATEO | Propuesta |
| T-1001 | Solicitudes (admin): botones | Aprobar · Rechazar | MATEO | Propuesta |
| T-1002 | Solicitudes (admin): rechazo, campo del motivo | Motivo del rechazo (la persona lo va a leer) | GH | Propuesta |
| T-1003 | Solicitudes (admin): rechazo sin motivo | Para rechazar tenés que escribir el motivo. | MATEO | Propuesta |
| T-1004 | Solicitudes (admin): aprobar una licencia, texto | Vas a aprobar la licencia de {nombre}: pasa a "En licencia", conserva Mi OE para consultar y actualizar sus datos, y le llega el correo. | GH | Propuesta |
| T-1005 | Solicitudes (admin): aprobar un retiro, texto | Vas a aprobar el retiro de {nombre}: se da de baja con motivo retiro voluntario, con los consentimientos que eligió, y le llega el correo. | GH | Propuesta; texto sensible |
| T-1006 | Solicitudes (admin): aprobar un cambio de comité, texto | Vas a aprobar el cambio de comité de {nombre} para {término}: deja {deja} y entra a {entra} como transferencia (70 %). | GH | Propuesta |
| T-1007 | Solicitudes (admin): ya decidida | Esta solicitud ya fue decidida. | MATEO | Propuesta |
| T-1008 | Solicitudes (admin): decidida | Solicitud {estado}. | MATEO | Propuesta |
| T-1009 | Tarea de solicitud: título | {nombre} pide {tipo} | MATEO | Propuesta |
| T-1010 | Solicitud: detalle de una licencia (con o sin fecha) | Licencia hasta el {fecha} · Licencia sin fecha de vuelta | MATEO | Propuesta |
| T-1011 | Solicitud: detalle de un cambio de comité | Deja {deja} · Entra a {entra} | MATEO | Propuesta |
| T-1012 | Solicitud: detalle de un retiro | Retiro voluntario | MATEO | Propuesta |
| T-1013 | Solicitudes (admin): enlace desde la tarea | Ver solicitud | MATEO | Propuesta |
| T-1014 | Solicitudes (admin): término en el que aplica el cambio | Aplica en {término} | MATEO | Propuesta |
| T-1015 | Solicitud: sin comités a dejar o a entrar (en el detalle) | ninguno | MATEO | Propuesta |
| T-1016 | Convocatorias: nombres del recurso | Convocatoria · Convocatorias | MATEO | Propuesta |
| T-1017 | Convocatorias: campos y columnas | Título · Grupo · Formulario · Abre · Cierra · Cupo · Selección · Estado · Inscritos · Descripción | MATEO | Propuesta |
| T-1018 | Convocatorias: tipos de selección (en el orden del modelo) | Por orden de llegada · Manual | MATEO | Propuesta |
| T-1019 | Convocatorias: estados (en el orden del modelo) | Borrador · Abierta · Cerrada | MATEO | Propuesta |
| T-1020 | Convocatorias: acciones de fila | Abrir · Cerrar | MATEO | Propuesta |
| T-1021 | Convocatorias: opción sin formulario | Sin formulario | MATEO | Propuesta |
| T-1022 | Convocatoria: títulos del detalle | Inscritos · Aceptados · En lista de espera · Pendientes · No aceptados | MATEO | Propuesta |
| T-1023 | Convocatoria: botones sobre una inscripción | Aceptar · Rechazar · Pasar a aceptado | MATEO | Propuesta |
| T-1024 | Convocatoria: cupo lleno al aceptar | El cupo ya está lleno. | MATEO | Propuesta |
| T-1025 | Convocatoria: inscripción decidida | Inscripción {estado}. | MATEO | Propuesta |
| T-1026 | Convocatoria: sin inscritos | Todavía nadie se anotó. | MATEO | Propuesta |
| T-1027 | Convocatoria: aceptados sobre el cupo | {aceptados} de {cupo} cupos | MATEO | Propuesta |
| T-1028 | Convocatoria: cierre anterior a la apertura | El cierre tiene que ser posterior a la apertura. | MATEO | Propuesta |
| T-1029 | Convocatoria: sin permiso | No operás esta convocatoria. | MATEO | Propuesta |
| T-1030 | Grupo: enlace a sus convocatorias | Convocatorias de este grupo | MATEO | Propuesta |
| T-1031 | Convocatoria: nota de la decisión | Nota (opcional) | MATEO | Propuesta |
| T-1032 | Convocatoria: el grupo no es del término | El grupo tiene que ser del mismo semestre que la convocatoria. | MATEO | Propuesta |
| T-1033 | Tablero: títulos de los bloques | Tus pendientes · Vencidas del equipo · Solicitudes pendientes · Respuestas de la última semana · Pipelines · Convocatorias abiertas · Sistema | MATEO | Propuesta |
| T-1034 | Tablero: sin pendientes | No tenés tareas pendientes. Todo al día, pues. | MATEO | Propuesta |
| T-1035 | Tablero: sin vencidas | Nada vencido. | MATEO | Propuesta |
| T-1036 | Tablero: sin respuestas recientes | Sin respuestas nuevas esta semana. | MATEO | Propuesta |
| T-1037 | Tablero: sin pipelines abiertos | No hay pipelines abiertos. | MATEO | Propuesta |
| T-1038 | Tablero: sin convocatorias abiertas | No hay convocatorias abiertas. | MATEO | Propuesta |
| T-1039 | Tablero: trabajos con error | {n} trabajos con error | MATEO | Propuesta |
| T-1040 | Tablero: estado del respaldo (con copia · sin copias) | Última copia: {fecha} · Sin copias registradas | MATEO | Propuesta |
| T-1041 | Tablero: enlace a la sección completa | Ver todas | MATEO | Propuesta |
| T-1042 | Tablero: conteo de respuestas por formulario | {n} respuestas | MATEO | Propuesta |
| T-1043 | Tablero: conteo de solicitudes pendientes | {n} pendientes | MATEO | Propuesta |
| T-1044 | Tablero: sin ocasiones abiertas | No hay ocasiones abiertas. | MATEO | Propuesta |
| T-1045 | Tablero: sin trabajos con error | Sin trabajos con error | MATEO | Propuesta |
| T-1046 | Línea de tiempo: eventos de la fase 5 (respuesta recibida, inscripción a edición, tarjeta creada, tarjeta movida, etapa cambiada, dado de alta, solicitud enviada, solicitud decidida, inscripción a convocatoria) | Respondió {formulario} · Se inscribió a {edición} · Entró al pipeline {pipeline} en {etapa} · Pasó a {etapa} en {pipeline} · Ahora es {etapa} · Dado de alta en {término} con {comités} · Pidió {tipo} · Solicitud de {tipo} {estado}: {motivo} · Convocatoria {convocatoria}: {estado} | MATEO | Propuesta |
| T-1047 | Línea de tiempo: etapas de la persona para el texto "Ahora es" (en el orden del modelo) | prospecto · postulante · miembro · egresado | MATEO | Propuesta |
| T-1048 | Exporte de organizaciones: cabeceras | Nombre · Tipo · Sitio web · Contactos · Etiquetas | MATEO | Propuesta |
| T-1049 | Exporte de pipelines (tarjetas): cabeceras | Pipeline · Etapa · Título · Persona · Correo · Organización · Edición · Monto · Responsable · Vence · Entró a la etapa · Cerrada | MATEO | Propuesta |
| T-1050 | Exporte de convocatorias: cabeceras | Título · Grupo · Abre · Cierra · Cupo · Selección · Estado · Inscritos · Aceptados | MATEO | Propuesta |
| T-1051 | Exporte de inscritos: cabeceras | Nombre · Apellido · Correo · Estado · Inscrito el | MATEO | Propuesta |
| T-1052 | Persona 360, Solicitudes: sin solicitudes | Esta persona no ha hecho solicitudes. | MATEO | Propuesta |
| T-1053 | Persona 360, Membresía: aviso para prospectos y postulantes | Sin membresía: podés darla de alta. | MATEO | Propuesta |
| T-1054 | Kanban: buscador de persona u organización, texto | Buscá por nombre o correo | MATEO | Propuesta |
| T-1055 | Kanban: sujeto elegido | Sujeto | MATEO | Propuesta |
| T-1056 | Correos: destinatario sin nombre preferido | Hola | MATEO | Propuesta |
| T-1057 | Solicitud (admin): tipos en plural para los filtros | Licencias · Retiros · Cambios de comité · Excusas | MATEO | Propuesta |
| T-1058 | Formulario: valor "sí" y "no" de una casilla en respuestas y exportes | Sí · No | MATEO | Propuesta |
| T-1059 | Organización: sin tareas | Sin tareas. | MATEO | Propuesta |
| T-1060 | Kanban: sin responsable | Sin responsable | MATEO | Propuesta |
| T-1061 | Correo de solicitud: la decisión dentro de T-205 (aprobada · rechazada) | aprobó · no aprobó | GH | Propuesta |
| T-1062 | Correo de solicitud: el motivo dentro de T-205 (solo al rechazar) | Motivo: {motivo}. | GH | Propuesta |

### Admin de Comunicaciones (fase 6: push en la cartelera, plantillas, campañas, mensajes, encuesta en ocasiones, PWA)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-1111 | Cartelera: acción de fila publicar y avisar por push | Publicar y avisar por push | MATEO | Propuesta |
| T-1112 | Cartelera: acción de fila avisar por push (ya publicado) | Avisar por push | MATEO | Propuesta |
| T-1113 | Cartelera: columna push | Push | MATEO | Propuesta |
| T-1114 | Cartelera: estados de la columna push (sin push · enviando · enviado) | — · Enviando · Enviado a {n} | MATEO | Propuesta |
| T-1115 | Plantillas: título | Plantillas de correo | MATEO | Propuesta |
| T-1116 | Plantillas: columnas | Identificador · Nombre · Asunto · Actualizada | MATEO | Propuesta |
| T-1117 | Plantillas: campos (identificador, nombre, asunto, cuerpo) | Identificador (solo minúsculas, números y guiones) · Nombre · Asunto · Cuerpo (Markdown) | MATEO | Propuesta |
| T-1118 | Plantillas: ayuda de variables | Variables: {nombre}, {apellido}, {correo}, {comités}, {semestre} y {url}. Se reemplazan por los datos de cada persona. | MATEO | Propuesta |
| T-1119 | Plantillas: acción vista previa | Vista previa | MATEO | Propuesta |
| T-1120 | Plantillas: acción enviarme una prueba | Enviarme una prueba | MATEO | Propuesta |
| T-1121 | Plantillas: prueba enviada | De una: te mandamos la prueba a {correo}. | MATEO | Propuesta |
| T-1122 | Plantillas: identificador repetido | Ya existe una plantilla con ese identificador. | MATEO | Propuesta |
| T-1123 | Campañas: título | Campañas | MATEO | Propuesta |
| T-1124 | Campañas: intro | Una campaña manda una plantilla a un segmento, en lotes de {n} correos por minuto y siempre con enlace de baja. | MATEO | Propuesta |
| T-1125 | Campañas: columnas | Nombre · Plantilla · Segmento · Estado · Programada · Enviados | MATEO | Propuesta |
| T-1126 | Campañas: campos | Nombre · Plantilla · Segmento | MATEO | Propuesta |
| T-1127 | Campañas: estados (borrador, programada, enviando, enviada, cancelada) | Borrador · Programada · Enviando · Enviada · Cancelada | MATEO | Propuesta |
| T-1128 | Campaña: destinatarios estimados | {n} destinatarios ahora: {m} en el segmento, {a} sin correo, {b} dados de baja, {c} sin consentimiento. | MATEO | Propuesta |
| T-1129 | Campaña: programar (campo · botón) | Enviar el · Programar | MATEO | Propuesta |
| T-1130 | Campaña: enviar ahora | Enviar ahora | MATEO | Propuesta |
| T-1131 | Campaña: confirmación de envío | Vas a mandar "{plantilla}" a {n} personas. Pedimos un código nuevo y el envío sale en lotes. | MATEO | Propuesta |
| T-1132 | Campaña: cancelar | Cancelar campaña | MATEO | Propuesta |
| T-1133 | Campaña: progreso | {enviados} de {total} enviados · {fallidos} fallidos · {omitidos} omitidos | MATEO | Propuesta |
| T-1134 | Campaña: destinatarios, columnas | Persona · Estado · Motivo · Enviado | MATEO | Propuesta |
| T-1135 | Campaña: estados de destinatario (pendiente, enviado, fallido, omitido) | Pendiente · Enviado · Fallido · Omitido | MATEO | Propuesta |
| T-1136 | Campaña: motivos de omisión (sin correo, baja, sin consentimiento, cancelada) | Sin correo · Se dio de baja · Sin consentimiento de comunicaciones · Campaña cancelada | MATEO | Propuesta |
| T-1137 | Campaña: solo se edita en borrador | Una campaña programada o enviada no se edita. Creá otra. | MATEO | Propuesta |
| T-1138 | Campaña: sin destinatarios | El segmento no tiene destinatarios con correo. | MATEO | Propuesta |
| T-1139 | Campaña: programada (aviso) | Programada para el {fecha}. Los lotes salen desde esa hora. | MATEO | Propuesta |
| T-1140 | Campaña: en camino (aviso tras enviar ahora) | Hágale, ya va en camino. El primer lote sale en menos de un minuto. | MATEO | Propuesta |
| T-1141 | Campaña: cancelada (aviso) | Campaña cancelada. Lo pendiente quedó omitido. | MATEO | Propuesta |
| T-1142 | Mensajes: título | Mensajes | MATEO | Propuesta |
| T-1143 | Mensajes: intro | Todo lo que la OE mandó por correo o push, persona por persona. | MATEO | Propuesta |
| T-1144 | Mensajes: columnas | Fecha · Persona · Canal · Tipo · Asunto · Estado · Proveedor · Campaña | MATEO | Propuesta |
| T-1145 | Mensajes: canales (correo, push) | Correo · Push | MATEO | Propuesta |
| T-1146 | Mensajes: tipos (en el orden del modelo: transaccional, anuncio, puntos, recordatorio, encuesta, campaña) | Transaccional · Anuncio · GH Points · Recordatorio · Encuesta · Campaña | MATEO | Propuesta |
| T-1147 | Mensajes: estados (enviado, fallido) | Enviado · Fallido | MATEO | Propuesta |
| T-1148 | Mensajes: filtros | Canal · Tipo · Estado · Campaña | MATEO | Propuesta |
| T-1149 | Mensajes: lista vacía | Todavía no se mandó ningún mensaje. | MATEO | Propuesta |
| T-1150 | Mensajes: proveedores (consola, resend, ses, webpush) | Consola · Resend · SES · Push web | MATEO | Propuesta |
| T-1151 | Persona 360, comunicaciones: preferencias (título) | Preferencias | MATEO | Propuesta |
| T-1152 | Persona 360, comunicaciones: dispositivos con notificaciones | {n} dispositivos con notificaciones · Último uso: {fecha} | MATEO | Propuesta |
| T-1153 | Persona 360, comunicaciones: sin dispositivos | Sin dispositivos con notificaciones | MATEO | Propuesta |
| T-1154 | Persona 360, comunicaciones: sin mensajes | Todavía no se le mandó ningún mensaje. | MATEO | Propuesta |
| T-1155 | Persona 360, comunicaciones: columnas de mensajes | Fecha · Canal · Tipo · Asunto · Estado | MATEO | Propuesta |
| T-1156 | Tablero: campañas programadas o en curso (título) | Campañas | MATEO | Propuesta |
| T-1157 | Tablero: sin campañas programadas ni en curso | Ninguna campaña programada ni en curso. | MATEO | Propuesta |
| T-1158 | Ocasión: campo encuesta al cerrar | Encuesta al cerrar | MATEO | Propuesta |
| T-1159 | Ocasión: sin encuesta (opción vacía) | Sin encuesta | MATEO | Propuesta |
| T-1160 | Ocasión: ayuda del campo encuesta | Al cerrar la ocasión, quienes registraron asistencia reciben la encuesta por push. Solo sirven formularios de miembros que no crean personas. | MATEO | Propuesta |
| T-1161 | Consola: encuesta (título) | Encuesta | MATEO | Propuesta |
| T-1162 | Consola: encuesta, resumen | {respondieron} de {invitados} respondieron | MATEO | Propuesta |
| T-1163 | Consola: encuesta, sin respuestas | Todavía nadie respondió. | MATEO | Propuesta |
| T-1164 | Consola: encuesta, promedio de una calificación | Promedio {promedio} de 5 | MATEO | Propuesta |
| T-1165 | Consola: encuesta, comentarios ocultos por pocas respuestas | Los comentarios se muestran cuando hay al menos {n} respuestas, para cuidar el anonimato. | MATEO | Propuesta |
| T-1166 | Consola: ocasión sin encuesta | Esta ocasión no tiene encuesta. | MATEO | Propuesta |
| T-1167 | Vista de líder: encuestas del semestre (título) | Encuestas del semestre | MATEO | Propuesta |
| T-1168 | Vista de líder: encuestas, columnas | Actividad · Respondieron · Promedio | MATEO | Propuesta |
| T-1169 | Vista de líder: encuestas, promedio global | Promedio del semestre: {promedio} de 5 con {n} respuestas | MATEO | Propuesta |
| T-1170 | Vista de líder: sin encuestas | Ninguna actividad del semestre tuvo encuesta. | MATEO | Propuesta |
| T-1171 | Formulario: calificación fuera de rango | Elegí una calificación de 1 a 5. | MATEO | Propuesta |
| T-1172 | Navegación del admin: comunicaciones | Plantillas · Campañas · Mensajes | MATEO | Propuesta |
| T-1173 | PWA: nombre corto (ícono en el celular) | Mi OE | COM | Propuesta |
| T-1174 | PWA: nombre completo (manifest) | Mi OE · Organización Estudiantil EAFIT | COM | Propuesta |
| T-1175 | Campaña: sección de destinatarios (título) | Destinatarios | MATEO | Propuesta |
| T-1176 | Campaña: título de la sección con la estimación, la fecha y los botones de envío | Envío | MATEO | Propuesta |

### Mi OE · fase 8 (carnet en billeteras)

Los badges conservan sus textos oficiales; el resto de la interfaz usa voseo. Revocar afecta al QR de las billeteras, no a los QR de Mi OE ya emitidos (ADR-040).

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-1189 | Carnet: sección billeteras, título | Llevalo en tu billetera | COM | Propuesta |
| T-1190 | Carnet: texto de billeteras | Agregá tu carnet a Apple Wallet o Google Wallet y mostralo sin abrir Mi OE. Si cambian tus comités, en Google se actualiza solo; en Apple volvé a agregarlo. | MATEO | Propuesta |
| T-1191 | Carnet: alt del badge de Apple | Agregar a Apple Wallet | MATEO | Propuesta |
| T-1192 | Carnet: alt del badge de Google | Añadir a Google Wallet | MATEO | Propuesta |
| T-1193 | Carnet: botón revocar | Revocar y volver a emitir | MATEO | Propuesta |
| T-1194 | Carnet: explicación de revocar | Si perdiste el celular o alguien copió el QR de tu billetera, revocalo. Ese QR deja de servir y Google recibe uno nuevo cuando termina la actualización. En Apple, volvé a agregar el carnet. El carnet de Mi OE sigue funcionando. | MATEO | Propuesta |
| T-1195 | Carnet: confirmación tras revocar | Listo: el QR anterior de tus billeteras ya no vale. Si usás Google Wallet, la actualización quedó pendiente; si usás Apple Wallet, agregá el carnet otra vez. | MATEO | Propuesta |
| T-1196 | Carnet: pase de Apple con QR o datos desactualizados | Tu carnet de Apple Wallet es del {fecha}. Agregalo de nuevo para que muestre el QR y tus datos actuales. | MATEO | Propuesta |
| T-1197 | Pase: nombre de la organización (`organizationName`, `logoText`, `cardTitle`) | Organización Estudiantil EAFIT | COM | Propuesta |
| T-1198 | Pase: descripción accesible (`description`) | Carnet de miembro de la OE | MATEO | Propuesta |
| T-1199 | Pase: etiqueta del semestre | Semestre | MATEO | Propuesta |
| T-1200 | Pase: etiqueta del nombre | Miembro | MATEO | Propuesta |
| T-1201 | Pase: etiqueta de los comités | Comités | MATEO | Propuesta |
| T-1202 | Pase: etiqueta de "miembro desde" | En la OE desde | MATEO | Propuesta |
| T-1203 | Pase: dorso, cómo funciona | Mostrá el QR en la entrada de las actividades. Vale mientras seas miembro; si lo revocás desde Mi OE, este pase deja de servir. | MATEO | Propuesta |
| T-1204 | Pase: dorso, etiqueta del enlace a Mi OE | Mi OE | MATEO | Propuesta |
| T-1205 | Pase: dorso, cómo actualizarlo | Si cambian tus comités o tu semestre, volvé a agregar el carnet desde Mi OE: reemplaza a este. | MATEO | Propuesta |
| T-1206 | Pase de Google: texto bajo el QR | Carnet OE {semestre} | MATEO | Propuesta |
| T-1207 | Anfitrión: carnet revocado o desconocido | Ese carnet ya no vale. Pedile que abra Mi OE y muestre el carnet, o que lo vuelva a agregar a su billetera. | MATEO | Propuesta |
| T-1208 | Carnet: Google Wallet no respondió | Google Wallet no respondió. Probá de nuevo en un ratico. | MATEO | Propuesta |
| T-1209 | Persona 360: sección del carnet, título | Carnet en billeteras | MATEO | Propuesta |
| T-1210 | Persona 360: pase emitido | {plataforma}: emitido el {fecha} | MATEO | Propuesta |
| T-1211 | Persona 360: sin pases | Sin pases emitidos | MATEO | Propuesta |
| T-1212 | Persona 360: botón revocar el carnet | Revocar el carnet | MATEO | Propuesta |
| T-1213 | Persona 360: confirmación de revocar | El QR anterior de las billeteras ya no vale. La persona verá el aviso en Mi OE y Google se actualizará cuando termine el trabajo pendiente. | MATEO | Propuesta |
| T-1214 | Carnet: nota de datos junto al botón de Google | Al agregarlo a Google Wallet, tu nombre, tus comités, el semestre y tu semestre de ingreso se envían a Google para guardar el carnet en tu cuenta. | MATEO | Propuesta |
| T-1215 | Carnet: nota de datos junto al botón de Apple | El pase contiene tu nombre, tus comités, el semestre y tu semestre de ingreso. Al guardarlo en Apple Wallet, su almacenamiento y sincronización dependen de tu configuración de Apple. | JUNTA | Propuesta; texto sensible |
| T-1216 | Carnet: no se pudo preparar el pase de Apple | No pudimos preparar tu carnet de Apple Wallet. Probá de nuevo en un rato. | MATEO | Propuesta |
| T-1217 | Persona 360: pase reservado sin emisión completada | {plataforma}: emisión pendiente | MATEO | Propuesta |
| T-1218 | Carnet: Google pendiente de actualización | La actualización de Google Wallet está pendiente. Mientras termina, mostrá el carnet de Mi OE. | MATEO | Propuesta |
| T-1219 | Persona 360: pase revocado | {plataforma}: QR revocado el {fecha} | MATEO | Propuesta |
| T-1220 | Persona 360: confirmación antes de revocar el carnet | El QR anterior de las billeteras de esta persona dejará de servir. Si usa Google Wallet, se actualizará; si usa Apple Wallet, tendrá que volver a agregarlo. | MATEO | Propuesta |

## 6. Notificaciones

### Push (título · cuerpo)

| Código | Cuándo | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-180 | Anuncio nuevo | {título del anuncio} · {primera línea} | COM | Propuesta |
| T-181 | Puntos acreditados | ¡Qué nota! Sumaste {n} GH Points · Por {actividad}. Ya vas en {total}. | GH | Propuesta |
| T-182 | Actividad hoy | Hoy: {actividad} · {hora} en {lugar}. El registro abre a las {apertura}. | GH | Propuesta |
| T-183 | Asamblea obligatoria (día anterior y dos horas antes) | Asamblea obligatoria {día} · {hora} en {lugar}. Recordá que faltar implica salir de la OE. | GH | Propuesta; texto sensible, confirmar tono |
| T-184 | Permanencia, mitad de semestre | Vas en {n} % en {comité} · Necesitás {umbral} %. Mirá qué podés sumar. | GH | Propuesta |
| T-185 | Permanencia, tres semanas antes del cierre (solo por debajo) | Quedan 3 semanas · Vas en {n} % en {comité} y necesitás {umbral} %. Todavía podés sumar {m} %. | GH | Propuesta |
| T-186 | Permanencia, "no alcanza" | Hablá con GH · Con lo que queda del semestre no llegás al mínimo en {comité}. | GH | Propuesta; texto sensible |
| T-187 | Cierre de semestre | Cerró {término} · Entrá a ver tu resultado en cada comité. | GH | Propuesta |
| T-188 | Evaluación pendiente (a evaluadores) | Tenés {n} evaluaciones pendientes · La ventana cierra el {fecha}. | GH | Propuesta |
| T-189 | Solicitud respondida | Tu solicitud de {tipo} fue {aprobada/rechazada} · Entrá a ver la respuesta. | GH | Propuesta |
| T-190 | Convocatoria abierta | Se abrió {convocatoria} · {cupo} cupos, cierra el {fecha}. ¡Pilas! | GH | Propuesta |
| T-191 | Encuesta tras la actividad | ¿Cómo estuvo {actividad}? · Contanos en un ratico. | COM | Propuesta |
| T-192 | Reconocimiento | ¡Destacado del mes! · {nombre} es el destacado de {comité}. ¡Qué berraco! | COM | Propuesta |
| T-193 | Reunión de comité mañana | Mañana reunión de {comité} · {hora} en {lugar}. | COMITÉ | Propuesta |
| T-194 | Convocatoria abierta sin cupo | Se abrió {convocatoria} · Cierra el {fecha}. | GH | Propuesta |
| T-195 | Solicitud respondida: la decisión dentro de T-189 (aprobada · rechazada) | aprobada · rechazada | GH | Propuesta |

### Correos

| Código | Cuándo | Asunto · cuerpo | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-200 | Bienvenida al dar de alta | Bienvenido a la OE, {nombre} · ¡Qué nota tenerte! Ya estás en el roster y tus comités son: {comités}. Para entrar a Mi OE en {url} necesitás tu contraseña: pedile tu enlace de acceso a Gestión Humana o a cualquier persona de la junta. Lo hacemos por vos. ¡OE OE OE! | GH | Propuesta |
| T-201 | Roster importado (primer semestre de la app) | Ya tenés tu Mi OE · Explica qué es Mi OE, cómo entrar y qué va a encontrar | COM | Propuesta; se escribe con la campaña de lanzamiento |
| T-202 | Resultado de permanencia (cumple) | Cerró {término} · Tu resultado en cada comité y tus puntos del semestre | GH | Propuesta |
| T-203 | Resultado de permanencia (prueba) | Sobre tu permanencia en la OE · Texto por escribir: qué significa el periodo de prueba, qué se espera y con quién hablar | GH | Pendiente; texto sensible |
| T-204 | Resultado de permanencia (salida) | Sobre tu permanencia en la OE · Texto por escribir: comunicación de salida, agradecimiento, cómo queda su historia | GH y JUNTA | Pendiente; texto sensible |
| T-205 | Solicitud respondida | Respuesta a tu solicitud de {tipo} · Hola, {nombre}. GH {decisión} tu solicitud de {tipo}.{motivo} Si querés hablarlo, escribiles. Lo hacemos por vos. | GH | Propuesta; {decisión} es "aprobó" o "no aprobó" y {motivo} lleva el motivo del rechazo |
| T-206 | Salida voluntaria | Gracias por tu tiempo en la OE · Confirmación, qué pasa con sus datos, cómo aparece en egresados si lo autorizó | GH | Propuesta |
| T-207 | Campaña (plantilla base) | {asunto} · Encabezado con logo, cuerpo, cierre "Lo hacemos por vos", enlace para dejar de recibir campañas | COM | Propuesta |
| T-208 | Pie legal de todos los correos | Organización Estudiantil · Universidad EAFIT · Bloque 29 of. 525 · Recibís este correo porque estás en el roster de la OE. {enlace de baja si aplica} | JUNTA | Propuesta |
| T-209 | Correo de prueba de una plantilla: prefijo del asunto | [Prueba] | MATEO | Propuesta |
| T-210 | Correo de campaña: texto del enlace de baja (va en el pie T-208) | Dejar de recibir estos correos | JUNTA | Propuesta |

## 7. Documentos generados

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-220 | Carnet, textos | Organización Estudiantil · {nombre} · {comités} · {semestre} · QR | COM | Propuesta |
| T-221 | Exportes, cabeceras | En español, sin abreviaturas: Nombre, Apellido, Correo, Comités, Estado, Semestre de ingreso, Puntos, Permanencia | MATEO | Propuesta |
| T-222 | Cartel de egresados por año | Egresados {año} · {nombres} | COM | Propuesta |
| T-223 | Nombre que queda al anonimizar una persona (eliminación a pedido) | Egresado | JUNTA | Propuesta |

## 8. Sistema

Textos de controles genéricos que no cambian el sentido institucional.

Avisos de arranque con política pendiente (ADR-039; excepción del primer ADMIN aprobada por Mateo el 2026-09-06):

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-1178 | Política pendiente: aviso público en consentimientos y formularios | La política de tratamiento de datos está en preparación. Podés entrar a Mi OE y registrar tu asistencia; las nuevas autorizaciones estarán disponibles cuando se publique. | JUNTA | Propuesta; texto sensible |
| T-1179 | Política pendiente: aviso administrativo en altas, roster y consentimientos | Publicá la política de tratamiento de datos y configurá su versión antes de registrar nuevas autorizaciones o dar de alta a personas. | JUNTA | Propuesta; texto sensible |
| T-1180 | Admin: navegación y título del control de política | Política de datos | MATEO | Propuesta |
| T-1181 | Política de datos: orden de publicación y habilitación | Publicá primero el texto aprobado en Páginas, con audiencia Público, y revisá cómo se ve en Privacidad. Al final, guardá aquí su versión para habilitar nuevas autorizaciones y la importación del roster. | MATEO | Propuesta |
| T-1182 | Política de datos: campo de versión | Versión de la política | MATEO | Propuesta |
| T-1183 | Política de datos: ayuda de versión y bloqueo | Usá el identificador de la versión aprobada. Para bloquear nuevas autorizaciones, guardá pendiente. El acceso, la asistencia y las revocaciones siguen disponibles. | MATEO | Propuesta |
| T-1184 | Política de datos: valor vigente | Versión actual: {version} | MATEO | Propuesta |
| T-1185 | Política de datos: enlace al editor existente | Editar publicación | MATEO | Propuesta |
| T-1186 | Política de datos: enlace al texto público | Ver política pública | MATEO | Propuesta |
| T-1187 | Política de datos: falta publicar antes de habilitar | Publicá la página Privacidad con el texto aprobado y audiencia Público antes de habilitar su versión. | MATEO | Propuesta |
| T-1188 | Política de datos: versión inválida | Escribí una versión de entre 1 y 120 caracteres. | MATEO | Propuesta |

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
| T-247 | Admin, sistema: lista vacía | Nada por acá en esta lista. | MATEO | Propuesta |

## Wordle diario (ADR-041)

Reglas aprobadas por Mateo el 2026-09-07: una partida diaria, cinco letras, seis intentos y premio de 6 a 1 puntos por acertar. Textos funcionales de esta implementación:

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-1230 | Juegos: título del Wordle | Wordle de hoy | MATEO | Propuesta |
| T-1231 | Wordle: introducción | Una palabra distinta para vos cada día. Hágale: resolvela y sumá GH Points. | MATEO | Propuesta |
| T-1232 | Wordle: iniciar partida | Jugar el Wordle de hoy | MATEO | Propuesta |
| T-1233 | Wordle: reglas | Adiviná una palabra de 5 letras en 6 intentos. Podés escribir con o sin tilde; la Ñ es distinta de la N. Cada intento válido queda guardado para que sigás en otro dispositivo. | MATEO | Propuesta |
| T-1234 | Wordle: título de premios | Tus puntos por acertar | MATEO | Propuesta |
| T-1235 | Wordle: escala de premios | Intentos · GH Points | MATEO | Propuesta |
| T-1236 | Wordle: campo de palabra | Tu palabra de cinco letras | MATEO | Propuesta |
| T-1237 | Wordle: enviar intento | Probar palabra | MATEO | Propuesta |
| T-1238 | Wordle: borrar letra | Borrar | MATEO | Propuesta |
| T-1239 | Wordle: envío pendiente | Guardando tu jugada… | MATEO | Propuesta |
| T-1240 | Wordle: leyenda de pistas | En su lugar · En otro lugar · No aparece | MATEO | Propuesta |
| T-1241 | Wordle: intento actual | Intento {n} de 6 | MATEO | Propuesta |
| T-1242 | Wordle: celda accesible | {letra}: {estado} | MATEO | Propuesta |
| T-1243 | Wordle: longitud o caracteres incorrectos | Escribí una palabra de cinco letras. | MATEO | Propuesta |
| T-1244 | Wordle: palabra ausente del diccionario | No la encontré en el diccionario. Probá otra; no perdiste un intento. | MATEO | Propuesta |
| T-1245 | Wordle: victoria | ¡Qué nota, la resolviste en {n}/6! Sumaste {puntos} GH Points. ¡OE OE OE! | MATEO | Propuesta |
| T-1246 | Wordle: derrota | Se acabaron los intentos. Hoy no sumaste puntos; mañana hay otra palabra, pues. | MATEO | Propuesta |
| T-1247 | Wordle: respuesta al terminar | La palabra era {palabra}. | MATEO | Propuesta |
| T-1248 | Wordle: próximo reto | Próxima palabra: {fecha}, a las 12:00 a. m. de Colombia. | MATEO | Propuesta |
| T-1249 | Wordle: sin semestre o puntos cerrados | El Wordle estará disponible cuando haya un semestre vigente con los puntos abiertos. | MATEO | Propuesta |
| T-1250 | Wordle: miembro no elegible | El Wordle está disponible para miembros activos y honorarios. | MATEO | Propuesta |
| T-1251 | Wordle: catálogo no disponible | No pudimos preparar tu palabra. Probá otra vez en un ratico. | MATEO | Propuesta |
| T-1252 | Wordle: partida vencida | Terminó el día de esta partida. No sumaste puntos; ya podés consultar el reto de hoy. | MATEO | Propuesta |
| T-1253 | Wordle: otro dispositivo avanzó | Tu partida cambió en otro dispositivo. Ya trajimos los intentos guardados; revisalos antes de seguir. | MATEO | Propuesta |
| T-1254 | Wordle: respuesta de red incierta | No recibimos la confirmación. Reintentá la misma jugada: si ya se guardó, no contará dos veces. | MATEO | Propuesta |
| T-1255 | Wordle: partida no encontrada o solicitud inválida | No pudimos recuperar esa jugada. Actualizá la partida para seguir. | MATEO | Propuesta |
| T-1256 | Wordle: actualizar estado | Actualizar partida | MATEO | Propuesta |
| T-1257 | GH Points: enlace al juego actual | Ir al Wordle de hoy | MATEO | Propuesta |
| T-1258 | GH Points: al consultar otro semestre | El Wordle suma puntos en el semestre vigente. | MATEO | Propuesta |
| T-1259 | Wordle: nombre accesible del teclado | Teclado del Wordle | MATEO | Propuesta |
| T-1260 | Wordle: desplegable de instrucciones | Cómo jugar | MATEO | Propuesta |
| T-1261 | Ledger: motivo del premio Wordle | Wordle del {fecha}: intento {intento}/6 | MATEO | Propuesta |
| T-1262 | Wordle: nombre accesible del tablero | Tus seis intentos | MATEO | Propuesta |
| T-1263 | Wordle: pista de celda vacía | Sin letra | MATEO | Propuesta |
| T-1264 | Wordle: premio posible | Podés sumar {n} GH Points en este intento. | MATEO | Propuesta |
| T-1265 | Wordle: sin premio por perder | Si no acertás, no sumás puntos. | MATEO | Propuesta |
| T-1266 | Wordle: día nuevo | Ya cambió el día en Colombia. Actualizá para jugar tu nueva palabra. | MATEO | Propuesta |
| T-1267 | Wordle: partida cerrada | Tu partida ya terminó. | MATEO | Propuesta |
| T-1268 | Wordle: reintentar envío incierto | Reintentar jugada | MATEO | Propuesta |

## Normativa completa y vista previa

| Código | Dónde | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-1280 | Normativa: páginas de origen de una unidad | Páginas del PDF: {paginas} | MATEO | Propuesta |
| T-1281 | Normativa: resumen del contenido | {articulos} artículos · {secciones} secciones | MATEO | Propuesta |
| T-1282 | Documentos: enlace a la vista previa | Vista previa | MATEO | Propuesta |
| T-1283 | Documentos: aviso de vista previa administrativa | Esta vista previa es solo para ADMIN. Revisá el contenido y el PDF antes de publicar. Abrirla no marca el paso de normativa del onboarding. | MATEO | Propuesta |
| T-1284 | Documentos: volver desde la vista previa | Volver a documentos | MATEO | Propuesta |
| T-1285 | Documentos: conteo de secciones complementarias | {n} secciones | MATEO | Propuesta |
| T-1286 | Documentos: vista previa sin contenido | Todavía no hay contenido cargado. Cargá el JSON revisado para ver los artículos y las secciones. | MATEO | Propuesta |
| T-1287 | Documentos: título de la pestaña de vista previa | Vista previa · {titulo} | MATEO | Propuesta |
| T-1288 | Normativa: imagen no disponible | La imagen no está disponible. Podés consultarla en el PDF original. | MATEO | Propuesta |
| T-1289 | Normativa: nombre accesible de una tabla | Tabla de {seccion} | MATEO | Propuesta |
| T-1290 | Documentos: confirmación de carga de contenido | Listo: {n} unidades de contenido cargadas | MATEO | Propuesta |
| T-1291 | Documentos: cargar el JSON del extractor | Cargar contenido (JSON) | MATEO | Propuesta |
| T-1292 | Documentos: PDF confirmado | Listo: el PDF quedó guardado. Ahora cargá el contenido revisado. | MATEO | Propuesta |

## 9. Lo que debe entregar cada dueño

- **COM:** nombre del sitio, textos del inicio, descripciones de los cuatro macroeventos, redes y contacto, plantilla de campaña, campaña de lanzamiento; en la fase 5, la plantilla de etapas del patrocinio (T-966) y los aliados que se cargan; en la fase 6, el nombre de la PWA (T-1173, T-1174), el nombre del calendario (T-1085), el aviso de instalar (T-1092) y los textos de la encuesta (T-1095 a T-1102).
- **GH:** texto de Unirse y del proceso de admisión, pasos del onboarding, descripción de una línea de cada criterio de permanencia, nombres de los criterios y de los cálculos de la fase 4 (T-717 a T-726, T-791, T-792, T-801, T-802), tono de los mensajes sensibles (asamblea obligatoria, prueba, salida, aplicar el cierre), nombres y cortes de los niveles de GH Points, preguntas de la encuesta corta; en la fase 5, las preguntas del formulario de admisión, las etapas reales del proceso, los textos de las solicitudes (T-874 a T-895, T-1002 a T-1006) y de las convocatorias (T-896 a T-907), y los correos de bienvenida (T-200) y de respuesta a una solicitud (T-205); en la fase 6, las variantes de push T-194 y T-195 y el tono de los recordatorios T-182 a T-193.
- **JUNTA:** política de datos y su versión, textos de consentimiento, plazo de respuesta a la eliminación, misión y visión (ya en el manual), pie legal; en la fase 6, el texto de la baja de campañas (T-1104) y del enlace de baja (T-210).
- **Cada comité:** presentación, contacto, y los textos de su tabla de permanencia (nombres de los criterios y de los dos eventos).
- **Mateo:** todo lo marcado MATEO, que no cambia el sentido institucional.

Cuando un texto quede aprobado, se cambia su estado aquí y se anota la fecha en el registro del [roadmap](09-roadmap.md). Los textos con "sensible" se revisan con GH antes de escribir código, porque un error de tono ahí cuesta más que cualquier bug.

### Normativa completa · integridad (ADR-042)

| Código | Dónde | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-1300 | Normativa, publicación vacía | Cargá el contenido del documento antes de publicarlo. | MATEO | Propuesta |
| T-1301 | Normativa, fuente incompatible | El contenido no corresponde al tipo o al PDF original de este documento. | MATEO | Propuesta |
| T-1302 | Normativa, edición de publicado | Despublicá el documento antes de reemplazar su contenido y revisalo antes de volver a publicarlo. | MATEO | Propuesta |
| T-1303 | Normativa, imagen inválida | Las imágenes del documento deben estar disponibles y ser privadas. Revisá sus referencias. | MATEO | Propuesta |
| T-1304 | Normativa, publicación concurrente | El contenido cambió desde tu revisión. Revisá la vista previa antes de publicarlo. | MATEO | Propuesta |

## Administración · experiencia de trabajo (ADR-043)

| Código | Dónde | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-1400 | Navegación administrativa, grupos | Comunidad · Gestión · Contenido · Comunicaciones · Participación · Permanencia · Sistema | MATEO | Propuesta |
| T-1401 | Navegación administrativa, inicio | Inicio | MATEO | Propuesta |
| T-1402 | Navegación administrativa, abrir | Menú | MATEO | Propuesta |
| T-1403 | Navegación administrativa, cuenta | Tu cuenta | MATEO | Propuesta |
| T-1404 | Administración, salto de navegación | Saltar al contenido | MATEO | Propuesta |
| T-1405 | Administración, búsqueda | Buscar | MATEO | Propuesta |
| T-1406 | Administración, búsqueda pendiente | Buscando… | MATEO | Propuesta |
| T-1407 | Administración, error de búsqueda | No pudimos buscar. Intentá de nuevo. | MATEO | Propuesta |
| T-1408 | Administración, ayuda de búsqueda | Buscá personas, comités, ocasiones u organizaciones. | MATEO | Propuesta |
| T-1409 | Administración, búsqueda reintento | Volver a buscar | MATEO | Propuesta |
| T-1410 | Administración, contexto del tablero | Tu espacio de trabajo | MATEO | Propuesta |
| T-1420 | Filtros del listado | Filtros | MATEO | Propuesta |
| T-1421 | Aplicar filtros | Aplicar filtros | MATEO | Propuesta |
| T-1422 | Restablecer listado | Limpiar filtros | MATEO | Propuesta |
| T-1423 | Conteo listado | Registros: {n} | MATEO | Propuesta |
| T-1424 | Colección vacía | Todavía no hay registros. | MATEO | Propuesta |
| T-1425 | Ayuda colección vacía | Creá el primer registro para empezar. | MATEO | Propuesta |
| T-1426 | Columna y menú acciones | Acciones | MATEO | Propuesta |
| T-1427 | Guardado pendiente | Guardando… | MATEO | Propuesta |
| T-1428 | Buscador multiselección | Buscá una opción | MATEO | Propuesta |
| T-1429 | Conteo multiselección | Seleccionadas: {n} | MATEO | Propuesta |
| T-1430 | Marca campo | Obligatorio | MATEO | Propuesta |
| T-1431 | Acción fila pendiente | Procesando… | MATEO | Propuesta |
| T-1432 | Caption por defecto | Listado de registros | MATEO | Propuesta |
| T-1433 | Opciones sin coincidencias | No hay opciones para esa búsqueda. | MATEO | Propuesta |
| T-1434 | Opción filtro sin restricción | Todos | MATEO | Propuesta |
| T-1435 | Colección de opciones vacía | Todavía no hay opciones disponibles. | MATEO | Propuesta |
| T-1460 | Administración: archivos e importación | Subir PDF | MATEO | Propuesta |
| T-1461 | Administración: archivos e importación | Guardá los PDF, revisá su contenido y elegí cuándo publicarlos. | MATEO | Propuesta |
| T-1462 | Administración: archivos e importación | Todavía no hay documentos. Subí el primer PDF para empezar. | MATEO | Propuesta |
| T-1463 | Administración: archivos e importación | Buscá documentos por título | MATEO | Propuesta |
| T-1464 | Administración: archivos e importación | Escribí un título de al menos 2 caracteres y una versión. | MATEO | Propuesta |
| T-1465 | Administración: archivos e importación | PDF de 1 KB a 20 MB. Quedará en borrador hasta que revises el contenido y lo publiques. | MATEO | Propuesta |
| T-1466 | Administración: archivos e importación | Seleccioná un archivo para continuar. | MATEO | Propuesta |
| T-1467 | Administración: archivos e importación | Contenido y publicación | MATEO | Propuesta |
| T-1468 | Administración: archivos e importación | Cargá el archivo JSON revisado del documento. Si está publicado, despublicalo antes de reemplazar el contenido; después revisalo y volvé a publicar. | MATEO | Propuesta |
| T-1469 | Administración: archivos e importación | Documento publicado. | MATEO | Propuesta |
| T-1470 | Administración: archivos e importación | Documento en borrador. | MATEO | Propuesta |
| T-1471 | Administración: archivos e importación | Todavía no hay imágenes. Subí la primera para usarla en páginas y anuncios. | MATEO | Propuesta |
| T-1472 | Administración: archivos e importación | Buscá imágenes por nombre | MATEO | Propuesta |
| T-1473 | Administración: archivos e importación | Elegí la imagen y su visibilidad antes de subirla. | MATEO | Propuesta |
| T-1474 | Administración: archivos e importación | Limpiar búsqueda | MATEO | Propuesta |
| T-1475 | Administración: archivos e importación | Continuar a la revisión | MATEO | Propuesta |
| T-1476 | Administración: archivos e importación | Continuar a la confirmación | MATEO | Propuesta |
| T-1477 | Administración: archivos e importación | Volver al mapeo | MATEO | Propuesta |
| T-1478 | Administración: archivos e importación | Volver a la revisión | MATEO | Propuesta |
| T-1479 | Administración: archivos e importación | Revisá el resumen y los permisos de líder antes de aplicar. Las filas con errores se omitirán. | MATEO | Propuesta |
| T-1480 | Administración: archivos e importación | Importá personas en cuatro pasos. Podés revisar los cambios antes de aplicarlos. | MATEO | Propuesta |
| T-1481 | Administración: archivos e importación | Archivo seleccionado: {nombre} | MATEO | Propuesta |
| T-1482 | Administración: archivos e importación | No hay personas nuevas ni cambios para aplicar. | MATEO | Propuesta |
| T-1483 | Administración: archivos e importación | Resumen de la importación | MATEO | Propuesta |
| T-1484 | Administración: archivos e importación | Filas con errores: {n} | MATEO | Propuesta |
| T-1485 | Administración: archivos e importación | Elegir archivo | MATEO | Propuesta |
| T-1486 | Administración: archivos e importación | Ningún archivo seleccionado. | MATEO | Propuesta |
| T-1500 | Administración: acciones y navegación | Más acciones | MATEO | Propuesta |
| T-1501 | Administración: acciones y navegación | Procesando… | MATEO | Propuesta |
| T-1502 | Administración: acciones y navegación | Sección | MATEO | Propuesta |
| T-1487 | Importación: pasos | Archivo y semestre · Columnas · Revisión · Confirmación | MATEO | Propuesta |
| T-1488 | Archivos: reemplazo | Reemplazar archivo | MATEO | Propuesta |
| T-1489 | Archivos: quitar selección | Quitar archivo | MATEO | Propuesta |
| T-1490 | Importación: selección desactualizada | Las propuestas de permisos cambiaron. Revisalas y elegí de nuevo cuáles querés aplicar. | MATEO | Propuesta |

## Mi OE · solicitudes guiadas

| Código | Dónde | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-1580 | Solicitudes: comienzo | Nueva solicitud | MATEO | Propuesta |
| T-1581 | Solicitudes: elección de trámite | Elegí qué querés solicitar para ver los datos que necesitás completar. | MATEO | Propuesta |
| T-1582 | Solicitudes: volver a la selección | Cambiar de trámite | MATEO | Propuesta |
| T-1583 | Solicitudes: envío pendiente | Enviando solicitud… | MATEO | Propuesta |
| T-1584 | Solicitudes: resumen de errores | Revisá los campos señalados antes de enviar. | MATEO | Propuesta |
| T-1585 | Solicitudes: motivo inválido y ayuda | Escribí entre 2 y 500 caracteres. | MATEO | Propuesta |
| T-1586 | Solicitudes: fecha inválida | Ingresá una fecha válida. | MATEO | Propuesta |
| T-1587 | Solicitudes: correo inválido | Revisá el correo: debe tener un formato válido y hasta 254 caracteres. | MATEO | Propuesta |
| T-1588 | Solicitudes: fallo de envío | No pudimos confirmar el envío. Tus datos siguen acá; intentá de nuevo. | MATEO | Propuesta |
| T-1589 | Solicitudes: buscar comités | Buscá un comité | MATEO | Propuesta |
| T-1590 | Solicitudes: comités seleccionados | Seleccionados: {n} | MATEO | Propuesta |
| T-1591 | Solicitudes: comités sin coincidencias | No hay comités para esa búsqueda. | MATEO | Propuesta |
| T-1592 | Solicitudes: sin opciones de comités | No hay comités disponibles en esta lista. | MATEO | Propuesta |
| T-1593 | Solicitudes: datos del formulario | Datos de la solicitud | MATEO | Propuesta |
| T-1594 | Solicitudes: retiro pendiente | Retirando solicitud… | MATEO | Propuesta |
| T-1595 | Solicitudes: fallo al retirar | No pudimos confirmar el retiro. Intentá de nuevo. | MATEO | Propuesta |
| T-1596 | Solicitudes: fecha de regreso, ayuda | La licencia dura máximo un año (Estatutos, art. 5.4). Al volver retomás la condición que tenías. | MATEO | Propuesta |
| T-1597 | Solicitudes: recuento de historial | Solicitudes: {n} | MATEO | Propuesta |
| T-1598 | Solicitudes: ver seguimiento | Ver mis solicitudes | MATEO | Propuesta |

## Portal: navegación y descubrimiento (2026-09-08)

| Código | Ubicación | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-1540 | Portal: nombre de la navegación | Navegación del portal | COM | Propuesta |
| T-1541 | Portal: abrir menú móvil | Menú | COM | Propuesta |
| T-1542 | Portal: cerrar menú móvil | Cerrar menú | COM | Propuesta |
| T-1543 | Portal: acción para visitantes sin admisión abierta | Unite a la OE | COM | Propuesta |
| T-1544 | Portal: buscar comité | Buscá un comité | COM | Propuesta |
| T-1545 | Portal: aplicar búsqueda | Buscar | COM | Propuesta |
| T-1546 | Portal: ayuda de búsqueda de comités | Escribí el nombre o la sigla del comité. | COM | Propuesta |
| T-1547 | Portal: recuento de comités | Comités: {n} de {total} | COM | Propuesta |
| T-1548 | Unirse: convocatoria cerrada sin lista de interés | Ahora no hay convocatoria abierta. Cuando haya una nueva, vas a encontrarla acá. Mientras tanto, date una vuelta por nuestros eventos. | GH | Propuesta |
| T-1549 | Portal: acceso breve de miembros | Mi OE | COM | Propuesta |
| T-1550 | Portal: búsqueda sin coincidencias | No encontramos comités con ese nombre o sigla. Probá otra búsqueda o limpiala para verlos todos. | COM | Propuesta |
| T-1551 | Portal: colección de comités vacía | Todavía no hay comités publicados. | COM | Propuesta |

## Experiencia cotidiana de Mi OE (ADR-044)

| Código | Ubicación | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-1660 | Marca de la aplicación | Mi OE | MATEO | Propuesta |
| T-2090 | Cambio de área: enlace a Administración | Cambiar a Administración | MATEO | Propuesta |
| T-2091 | Cambio de área: enlace a Mi OE | Cambiar a Mi OE (vista de miembro) | MATEO | Propuesta |
| T-1661 | Navegación y página | Agenda | MATEO | Propuesta |
| T-1662 | Menú secundario | Más | MATEO | Propuesta |
| T-1663 | Nombre accesible de navegación | Navegación de Mi OE | MATEO | Propuesta |
| T-1664 | Grupo del menú | Comunidad | MATEO | Propuesta |
| T-1665 | Grupo del menú | Tu participación | MATEO | Propuesta |
| T-1666 | Grupo del menú | Tu cuenta | MATEO | Propuesta |
| T-1667 | Agenda resumida | Ver agenda completa | MATEO | Propuesta |
| T-1668 | Actividad plegable | Mostrar detalles | MATEO | Propuesta |
| T-1669 | Detalle de actividad | Detalles de la actividad | MATEO | Propuesta |
| T-1670 | Actividad con registro abierto | Registrar asistencia | MATEO | Propuesta |
| T-1671 | Actividad próxima | El registro abre el {fecha}. | MATEO | Propuesta |
| T-1672 | Introducción de Agenda | Mirá qué se viene y pegate al plan. Cuando abra el registro, marcás tu asistencia desde acá. | MATEO | Propuesta |
| T-1673 | Acceso al carnet | Abrir mi carnet | MATEO | Propuesta |
| T-1674 | Ayuda de carnet en Inicio | Pilas: tené tu código a mano para registrar tu asistencia. | MATEO | Propuesta |
| T-1675 | Avisos de permanencia plegables | Ver avisos de permanencia ({n}) | MATEO | Propuesta |
| T-1676 | Onboarding resumido | Tus primeros pasos · {n} pendientes | MATEO | Propuesta |
| T-1677 | Onboarding secundario | Pasos completados ({n}) | MATEO | Propuesta |
| T-1678 | Recuento del directorio | {n} personas | MATEO | Propuesta |
| T-1679 | Directorio sin personas | Todavía no hay personas disponibles en el directorio. | MATEO | Propuesta |
| T-1680 | Directorio: retirar consulta | Limpiar filtros | MATEO | Propuesta |
| T-1681 | Agenda sin actividades | Todavía no hay actividades programadas. Mientras tanto, mirá la cartelera y volvé pronto, pues. | MATEO | Propuesta |
| T-1682 | Onboarding terminado | ¡Listo pues! Ya completaste tus primeros pasos. | MATEO | Propuesta |
| T-1683 | Nombre accesible de menú | Todas las secciones de Mi OE | MATEO | Propuesta |
| T-1684 | Detalle: ventana de registro | Registro de asistencia | MATEO | Propuesta |
| T-1685 | Enlace de agenda | Ver actividad | MATEO | Propuesta |
| T-1686 | Retorno de detalle | Volver a la agenda | MATEO | Propuesta |
| T-1687 | Estado de agenda seleccionada | Esa actividad ya no está en la agenda. Consultá las próximas actividades. | MATEO | Propuesta |
| T-1688 | Directorio sin semestre | Todavía no hay un semestre activo para consultar el directorio. | MATEO | Propuesta |

## Ajustes de Mi OE: selección de foto y categorías (2026-09-08)

| Código | Dónde | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-1620 | Foto propia, envío explícito | Guardar foto | MATEO | Propuesta |
| T-1621 | Foto propia, selector | Seleccionar foto | MATEO | Propuesta |
| T-1622 | Foto propia, reemplazar selección | Reemplazar selección | MATEO | Propuesta |
| T-1623 | Foto propia, descartar selección | Quitar selección | MATEO | Propuesta |
| T-1624 | Foto propia, antes de seleccionar | Seleccioná una imagen para revisarla antes de guardar. | MATEO | Propuesta |
| T-1625 | Foto propia, alternativa de vista previa | Vista previa de la foto seleccionada | MATEO | Propuesta |
| T-1626 | Foto propia, eliminación en curso | Quitando tu foto… | MATEO | Propuesta |
| T-1627 | Foto propia, eliminación confirmada | De una, ya quitamos tu foto. | MATEO | Propuesta |
| T-1628 | Ajustes, envío en curso | Guardando… | MATEO | Propuesta |
| T-1629 | Ajustes, error de envío | No pudimos guardar. Conservamos tus cambios para que lo intentés de nuevo. | MATEO | Propuesta |
| T-1630 | Ajustes, grupo de datos de contacto | Datos de contacto | MATEO | Propuesta |
| T-1631 | Ajustes, validación de campo | Revisá este campo. | MATEO | Propuesta |
| T-1632 | Ajustes, validación general | Revisá los campos marcados antes de guardar. | MATEO | Propuesta |
| T-1633 | Ajustes, contexto de categorías | Elegí qué querés ajustar. Tus datos, dispositivos y permisos están organizados por sección. | MATEO | Propuesta |

## Datos del integrante importados desde el roster (2026-09-08)

| Código | Dónde | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-2010 | Datos personales: tipo de documento | Tipo de documento | MATEO | Propuesta |
| T-2011 | Datos personales: número de documento | Número de documento | MATEO | Propuesta |
| T-2012 | Datos personales: identificador EPIK | ID EPIK | MATEO | Propuesta |
| T-2013 | Datos personales: fecha civil de nacimiento | Fecha de nacimiento | MATEO | Propuesta |
| T-2014 | Ajustes: consulta de identificación propia | Datos registrados por la OE | MATEO | Propuesta |
| T-2015 | Ajustes: ayuda de identificación propia | Podés consultar estos datos. Si necesitás corregirlos, contactá a Gestión Humana. | MATEO | Propuesta |
| T-2016 | Edición administrativa: borrado de identificadores | Si dejás vacío uno de estos cuatro campos, se borra el dato guardado. | MATEO | Propuesta |


## Acceso de consulta durante la licencia

| Código | Dónde | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-2040 | Mi OE: aviso de licencia | Estás en licencia. Podés consultar Mi OE y actualizar tus datos personales. La participación y las funciones de tu cargo vuelven cuando GH te reactive. | MATEO | Confirmado |
| T-2041 | Mi OE: acción restringida durante licencia | Mientras estés en licencia, esta acción no está disponible. Podés seguir consultando Mi OE y gestionar tus datos en Ajustes. | MATEO | Confirmado |
| T-2042 | Carnet: licencia | Tu carnet está suspendido para nuevas asistencias mientras estés en licencia. Cuando GH te reactive, vas a poder mostrar el QR y agregarlo a tu billetera de nuevo. | MATEO | Confirmado |
| T-2043 | Carnet: volver a Mi OE | Volver a Mi OE | MATEO | Confirmado |

## Importación de datos del roster

| Código | Dónde | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-2080 | Roster: dato opcional inválido | {campo} no tiene un formato válido. Se conserva el dato existente y queda pendiente de corrección. | MATEO | Confirmado |
| T-2081 | Roster: nacimiento inválido | La fecha de nacimiento debe ser una fecha real, no futura, en formato AAAA-MM-DD. Se conserva el dato existente y queda pendiente de corrección. | MATEO | Confirmado |
| T-2082 | Roster: formato de fecha incorrecto en Excel | El Excel contiene una celda con formato de fecha que no se puede leer. Revisá su formato o subí una copia CSV con los valores corregidos. | MATEO | Confirmado |
| T-2083 | Roster: graduado pendiente | La persona graduada queda pendiente hasta contar con su fecha o semestre de salida. | MATEO | Confirmado |
| T-2084 | Roster: discrepancia de ingreso | El semestre de ingreso no coincide con el registrado. Revisá la diferencia antes de importar esta persona. | MATEO | Confirmado |

## Autorización en el primer ingreso (ADR-048)

| Código | Dónde | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-2085 | Autorización: título de la pantalla | Antes de entrar, autorizá el tratamiento de tus datos | JUNTA | Propuesta |
| T-2086 | Autorización: explicación | Para usar Mi OE necesitamos tu autorización. Leé la política y aceptala: queda registrada con la fecha y la versión que estás viendo. | JUNTA | Propuesta |
| T-2087 | Autorización: botón | Autorizo y entro | JUNTA | Propuesta |
| T-2088 | Autorización: política sin publicar | La política de tratamiento de datos todavía no está publicada, así que no podemos pedirte una autorización válida. Avisale a Gestión Humana antes de continuar. | JUNTA | Propuesta |

## Acceso con contraseña propia y enlace de la junta (ADR-051)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-2093 | Ingresar, texto | Escribí tu correo institucional y tu contraseña. | MATEO | Propuesta |
| T-2094 | Ingresar, campo de contraseña | Contraseña | MATEO | Propuesta |
| T-2095 | Ingresar, botón | Entrar | MATEO | Propuesta |
| T-2096 | Ingresar, error de credenciales (igual si el correo no existe, si no tiene contraseña o si está equivocada) | Correo o contraseña incorrectos. | MATEO | Propuesta |
| T-2097 | Ingresar, bloqueo temporal por intentos | Demasiados intentos. Esperá 15 minutos y volvé a probar. | MATEO | Propuesta |
| T-2098 | Ingresar, ayuda fija de primer ingreso y olvido (nunca depende del correo tecleado) | ¿Primera vez acá o perdiste la contraseña? Pedile tu enlace de acceso a Gestión Humana o a cualquier persona de la junta. | MATEO | Propuesta |
| T-2099 | Ingresar, enlace al método alterno | Entrar con un código al correo institucional | MATEO | Propuesta |
| T-2100 | Ingresar por código, aviso del filtro de EAFIT | El correo de EAFIT está reteniendo nuestros mensajes, así que el código puede no llegarte. Si no llega, pedile tu enlace de acceso a la junta. | MATEO | Propuesta |
| T-2101 | Activación, título | Elegí tu contraseña | MATEO | Propuesta |
| T-2102 | Activación, saludo | Hola, {nombre}. Este enlace es tuyo y sirve una sola vez. | MATEO | Propuesta |
| T-2103 | Activación, campo de contraseña nueva | Contraseña nueva | MATEO | Propuesta |
| T-2104 | Activación, campo de confirmación | Repetí la contraseña | MATEO | Propuesta |
| T-2105 | Activación, requisitos | Mínimo 10 caracteres. Usá algo que solo vos sepas y que no uses en otro lado. | MATEO | Propuesta |
| T-2106 | Activación, botón | Guardar y entrar | MATEO | Propuesta |
| T-2107 | Activación, enlace vencido, ya usado o desconocido | Este enlace ya no sirve: vence a la hora y se puede usar una sola vez. Pedile uno nuevo a la junta. | MATEO | Propuesta |
| T-2108 | Activación, contraseña muy corta | La contraseña necesita al menos 10 caracteres. | MATEO | Propuesta |
| T-2109 | Activación, contraseñas distintas | Las dos contraseñas no son iguales. | MATEO | Propuesta |
| T-2110 | Activación, contraseña predecible | Esa contraseña es muy fácil de adivinar. Probá con otra que no lleve tu nombre ni tu correo. | MATEO | Propuesta |
| T-2111 | Activación, aviso de cierre de sesiones | Al guardar cerramos las sesiones que tuvieras abiertas en otros dispositivos. | MATEO | Propuesta |
| T-2112 | Ajustes, crear la primera contraseña | Creá tu contraseña | MATEO | Propuesta |
| T-2113 | Ajustes, cambiar la contraseña | Cambiar la contraseña | MATEO | Propuesta |
| T-2114 | Ajustes, campo de contraseña actual | Contraseña actual | MATEO | Propuesta |
| T-2115 | Ajustes, contraseña actual equivocada | Esa no es tu contraseña actual. | MATEO | Propuesta |
| T-2116 | Ajustes, contraseña guardada | Listo, guardamos tu contraseña y cerramos las demás sesiones. | MATEO | Propuesta |
| T-2117 | Step-up con contraseña | Esta acción es sensible: confirmá con tu contraseña. | MATEO | Propuesta |
| T-2141 | Step-up, título de la pantalla | Confirmá que sos vos | MATEO | Propuesta |
| T-2118 | Step-up, contraseña equivocada | Esa no es tu contraseña. | MATEO | Propuesta |
| T-2119 | Persona 360, botón de emisión | Emitir enlace de acceso | MATEO | Propuesta |
| T-2120 | Emisión, opción de activación | Primera contraseña | MATEO | Propuesta |
| T-2121 | Emisión, opción de recuperación | Recuperación (perdió la contraseña) | MATEO | Propuesta |
| T-2122 | Emisión, el enlace se muestra una sola vez | Copialo ahora: no lo vas a poder volver a ver. Vence a las {hora} y sirve una sola vez. | MATEO | Propuesta |
| T-2123 | Emisión, cómo se entrega | Entregáselo en persona o por un canal que ya conozcas de esa persona. Nunca emitas un enlace porque alguien te lo pidió por mensaje. | JUNTA | Propuesta |
| T-2124 | Emisión, botón de copiar | Copiar enlace | MATEO | Propuesta |
| T-2125 | Emisión, confirmación de copiado | Copiado | MATEO | Propuesta |
| T-2126 | Emisión, intento de emitirse a uno mismo | No podés emitirte un enlace a vos. Cambiá tu contraseña desde Ajustes. | MATEO | Propuesta |
| T-2127 | Emisión, persona que no puede entrar | Esta persona no está activa en el roster, así que no puede entrar a Mi OE. | MATEO | Propuesta |
| T-2128 | Jornada de activación, título | Jornada de activación | MATEO | Propuesta |
| T-2129 | Jornada de activación, instrucción | Elegí a la persona, mostrale el QR y esperá a que entre. Un QR a la vez. | MATEO | Propuesta |
| T-2130 | Jornada de activación, botón | Siguiente persona | MATEO | Propuesta |
| T-2131 | Jornada de activación, persona que ya tiene contraseña | Ya tiene contraseña. Emitile un enlace solo si la perdió. | MATEO | Propuesta |
| T-2138 | Jornada de activación, avance general | {activadas} de {personas} ya tienen contraseña | MATEO | Propuesta |
| T-2139 | Jornada de activación, avance de un comité (texto accesible de la barra) | {activadas} de {total} en {comité} | MATEO | Propuesta |
| T-2140 | Jornada de activación, sin término abierto | No hay un semestre en curso, así que todavía no hay a quién activar. | MATEO | Propuesta |
| T-2135 | Jornada de activación, selector de comité | Comité | MATEO | Propuesta |
| T-2136 | Jornada de activación, sin comité elegido | Elegí un comité para ver a su gente. | MATEO | Propuesta |
| T-2137 | Jornada de activación, persona sin contraseña todavía | Sin contraseña | MATEO | Propuesta |
| T-2134 | Activación, bienvenida (solo cuando es la primera contraseña) | ¡Bienvenido a la OE! Elegí tu contraseña y entrás a Mi OE: ahí están tus comités, tus GH Points y tu permanencia. | MATEO | Propuesta |
| T-2133 | Ingresar por código, enlace de vuelta | Entrar con tu contraseña | MATEO | Propuesta |
| T-2132 | Push: enlace de acceso emitido (título · cuerpo) | Emitieron tu enlace de acceso · Si no lo pediste, avisale a la junta ya mismo. | MATEO | Propuesta |
| T-3206 | Emisión, persona con permisos que quien emite no tiene (ADR-113) | Esta persona tiene permisos que vos no tenés. Su enlace de acceso solo lo emite un ADMIN: pedíselo a uno. | MATEO | Propuesta |

## Alta y condición del semestre desde la Persona 360 (ADR-056)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-2142 | Persona 360, Membresía: botón para cambiar la condición del semestre | Cambiar condición | MATEO | Propuesta |
| T-2143 | Condición del semestre: ayuda del panel | Marcá o quitá el periodo de prueba de ese semestre, en todos sus comités o solo en uno. Cambia el umbral que le aplica en permanencia y queda en la línea de tiempo con tu motivo. | MATEO | Propuesta |

## La dirección del comité por áreas (ADR-058)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-2144 | Cargo con codirección; se compone con T-370 en Mi OE, carnet y billetera y con "{comité} · {cargo}" en el admin | Codirección de {cargo} | MATEO | Propuesta |
| T-2145 | Vista del comité, área Personas: título de la gestión del roster | Gestión del roster | MATEO | Propuesta |
| T-2146 | Vista del comité, área Personas: ayuda para la dirección | Podés agregar miembros activos y cambiar cargos. Sacar a alguien es un pedido a GH, que lo resuelve desde la ficha. | GH | Propuesta |
| T-2147 | Vista del comité: botón y título del panel de agregar | Agregar miembro | MATEO | Propuesta |
| T-2148 | Agregar miembro: campo de búsqueda | Buscá por nombre | MATEO | Propuesta |
| T-2149 | Agregar miembro: botón de buscar | Buscar | MATEO | Propuesta |
| T-2150 | Agregar miembro: sin candidatos | Nadie con ese nombre está activo y fuera de este comité. | MATEO | Propuesta |
| T-2151 | Agregar miembro: candidato sin cupo | Ya está en {max} comités. | MATEO | Propuesta |
| T-2152 | Gestión del roster: columnas | Miembro · Cargos · Acciones | MATEO | Propuesta |
| T-2153 | Casilla de codirección (roster, agregar y Persona 360) | Codirección | MATEO | Propuesta |
| T-2154 | Gestión del roster: la propia fila | Tu cargo lo cambia GH. | MATEO | Propuesta |
| T-2155 | Gestión del roster: botón de pedir retiro | Pedir retiro a GH | GH | Propuesta |
| T-2156 | Pedir retiro: título del panel | Pedir a GH que retire a {nombre} | MATEO | Propuesta |
| T-2157 | Pedir retiro: ayuda | No lo saca del comité: GH recibe tu pedido como tarea y decide desde la ficha. Contale el motivo. | GH | Propuesta |
| T-2158 | Pedir retiro: campo del motivo | Motivo | MATEO | Propuesta |
| T-2159 | Pedir retiro: botón | Enviar el pedido | MATEO | Propuesta |
| T-2160 | Pedir retiro: confirmación | Listo: GH ya tiene tu pedido. | MATEO | Propuesta |
| T-2161 | Agregar miembro: confirmación | ¡Qué nota! {nombre} ya hace parte del comité. ¡OE OE OE! | MATEO | Propuesta |
| T-2162 | Guarda: sin esa capacidad en el comité | No tenés a cargo esta área de {comité}. | MATEO | Propuesta |
| T-2163 | Guarda: la propia pertenencia | Tu propia pertenencia la cambia GH. | MATEO | Propuesta |
| T-2164 | Guarda: la persona no está activa | Solo podés agregar a miembros activos de la OE. | MATEO | Propuesta |
| T-2165 | Guarda: ya está en el comité | {nombre} ya está en este comité. | MATEO | Propuesta |
| T-2166 | Guarda: sin cupo | {nombre} ya está en {max} comités este semestre. | MATEO | Propuesta |
| T-2167 | Guarda: cargo de dirección sin la capacidad de nombrar | Los cargos de dirección los asigna o quita el General del comité o GH. | MATEO | Propuesta |
| T-2168 | Guarda: cargo obligatorio sin titular | El comité no puede quedar sin {cargo} titular: nombrá primero a quien lo reemplace. | MATEO | Propuesta |
| T-2169 | Guarda: codirección sobre un cargo que no es de dirección | La codirección solo aplica a cargos de dirección. | MATEO | Propuesta |
| T-2170 | Tarea de retiro de comité: título | Retirar a {nombre} de {comité}: {motivo} | MATEO | Propuesta |
| T-2171 | Línea de tiempo: pedido de retiro | Pidieron a GH su retiro de {comité}: {motivo} | MATEO | Propuesta |
| T-2172 | Gestión del roster (ADMIN): enlace a la ficha | Ver ficha | MATEO | Propuesta |
| T-2173 | Guarda: la persona ya no está en el comité | Esa persona ya no está en el comité. | MATEO | Propuesta |
| T-2174 | Vista del comité: áreas (pestañas) | Personas · Actividades · Comunicación · Aliados · Finanzas | MATEO | Propuesta |
| T-2175 | Cabecera del comité y tablero: cargo obligatorio vacío | {comité} no tiene {cargo} titular. | MATEO | Propuesta |
| T-2176 | Tablero de ADMIN: título del bloque | Comités sin cargos obligatorios | MATEO | Propuesta |
| T-2177 | Importación: advertencia por comité | {comité} queda sin {cargo} titular en {término}. | MATEO | Propuesta |
| T-2178 | Varios cargos: conector de la lista | {lista} y {último} | MATEO | Propuesta |
| T-2179 | Catálogo de cargos: capacidades (por índice) | Roster · Nombrar cargos · Permanencia · Ocasiones · Eventos · Cartelera · Ficha pública · Aliados · Finanzas | MATEO | Propuesta |
| T-2180 | Catálogo de cargos: casilla de obligatorio | Obligatorio en todo comité | MATEO | Propuesta |
| T-2181 | Gestión del roster: panel de cargos de una persona | Cargos de {nombre} en {comité} | MATEO | Propuesta |
| T-2182 | Vista del comité, área Comunicación: títulos | Cartelera del comité · Nuevo anuncio · Ficha pública | MATEO | Propuesta |
| T-2183 | Nuevo anuncio interno: ayuda | Lo ven solo los miembros de {comité} en Mi OE. | GH | Propuesta |
| T-2184 | Ficha pública: ayuda | La presentación y el contacto salen en la página pública del comité; publicarla y cambiar el logo siguen siendo de la junta. | MATEO | Propuesta |
| T-2185 | Vista del comité, área Actividades: ediciones | Eventos que organiza el comité | MATEO | Propuesta |
| T-2186 | Vista del comité, área Aliados: aviso | Acá van a vivir las organizaciones y patrocinios del comité. | MATEO | Propuesta |

## Presupuesto del comité (ADR-059)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-2190 | Área Finanzas: títulos | Presupuesto {año} · Rubros · Gastos · Traslados | MATEO | Propuesta |
| T-2191 | Área Finanzas: columnas del resumen por rubro | Rubro · Asignado · Gastado · Trasladado · Disponible | MATEO | Propuesta |
| T-2192 | Área Finanzas: botón y panel de gasto | Registrar gasto | MATEO | Propuesta |
| T-2193 | Área Finanzas: botón y panel de traslado | Trasladar entre rubros | MATEO | Propuesta |
| T-2194 | Registrar gasto: campos | Fecha · Rubro · Monto · Descripción | MATEO | Propuesta |
| T-2195 | Trasladar entre rubros: campos | Desde · Hacia · Monto · Motivo | MATEO | Propuesta |
| T-2196 | Guarda: sin disponible en el rubro | No hay disponible en {rubro}: quedan {monto}. | MATEO | Propuesta |
| T-2197 | Área Finanzas: sin presupuesto del año | Sin presupuesto cargado para {año}: pedíselo a la junta. | MATEO | Propuesta |
| T-2198 | Registrar gasto: confirmación | Gasto registrado. | MATEO | Propuesta |
| T-2199 | Trasladar entre rubros: confirmación | Traslado registrado. | MATEO | Propuesta |
| T-2200 | Recurso Presupuestos: nombre (plural · singular) | Presupuestos · Presupuesto | MATEO | Propuesta |
| T-2201 | Recurso Presupuestos: campos | Comité · Año · Estado · Notas | MATEO | Propuesta |
| T-2202 | Presupuesto: estados | Borrador · Abierto · Cerrado | MATEO | Propuesta |
| T-2203 | Rubros: campos | Nombre · Asignado · Orden | MATEO | Propuesta |
| T-2204 | Guarda: presupuesto que no está abierto | El presupuesto {año} no está abierto: solo la junta lo cambia. | MATEO | Propuesta |
| T-2205 | Área Finanzas: ayuda | Registrá cada gasto en su rubro y, si un rubro va a sobrar, trasladalo a tiempo: lo que no se ejecuta en el año se pierde. | JUNTA | Propuesta |

## Normativa 2026 (ADR-060)

| T-2206 | Persona 360: reactivar a una persona expulsada | No se puede reactivar: fue expulsada de la OE y el Reglamento no admite el reingreso (art. 61). | GH | Propuesta; texto sensible |
| T-2207 | Condición del semestre: opción del comité que aplica a todos | Todos sus comités | MATEO | Propuesta |
| T-2208 | Importación del roster: aviso por persona expulsada | {nombre} fue expulsada de la OE y el roster no la reactiva (Reglamento, art. 61); su fila conserva el estado actual. | GH | Propuesta |
| T-2209 | Catálogo de cargos: casilla de retirado · campo del reemplazo | Retirado del catálogo · Lo reemplaza (código) | MATEO | Propuesta |
| T-2210 | Catálogo de cargos: ayuda de retirado | Un cargo retirado no se ofrece al nombrar; quien ya lo tiene lo conserva hasta cerrarlo y el roster lo traduce al reemplazo. | MATEO | Propuesta |
| T-2211 | Catálogo de cargos: reemplazo inválido | El cargo de reemplazo no existe en el catálogo o es el mismo cargo. | MATEO | Propuesta |
| T-2212 | Guarda: nombrar un cargo retirado con reemplazo | El cargo {cargo} está retirado del catálogo: usá {nuevo}. | MATEO | Propuesta |
| T-2213 | Importación: aviso de cargo traducido | {cargo} ya no existe en los comités desde los Estatutos 2026: se carga como {nuevo}. | GH | Propuesta |
| T-2214 | Guarda e importación: cargo retirado sin reemplazo | El cargo {cargo} está retirado del catálogo y no tiene reemplazo. | MATEO | Propuesta |
| T-2215 | Excusa: causales del Anexo 1 del Reglamento (en el orden del modelo) | Clase, parcial o actividad académica obligatoria · Cita médica, odontológica, psicológica o terapéutica · Incapacidad médica · Emergencia médica o accidente propio o de un familiar cercano · Fallecimiento de un familiar o de una persona cercana · Obligación laboral que no se puede reprogramar · Diligencia académica o institucional obligatoria · Problema de movilidad (accidente, cierre vial, manifestación, transporte o clima) · Situación familiar de fuerza mayor · Citación judicial, notarial o de una entidad pública · Competencia, congreso o evento en representación de la Universidad · Falla técnica imprevista para asistir o entregar de forma virtual · Riesgo para la seguridad o la integridad personal · Otra circunstancia de fuerza mayor o caso fortuito | GH | Propuesta; transcripción del Anexo 1 |
| T-2216 | Excusa: detalle en listas y paneles | Excusa para {ocasión} · {causal} | MATEO | Propuesta |
| T-2217 | Solicitudes (admin): aceptar una excusa, texto | Vas a aceptar la excusa de {nombre} ({detalle}): la ocasión queda excusada, sin puntos, y no cuenta como falta ni como obligatoria perdida. | GH | Propuesta |
| T-2218 | Excusa: campos del formulario (ocasión · causal · soporte) | Ocasión · Causal (Anexo 1 del Reglamento) · Soporte: enlace o descripción (opcional) | GH | Propuesta |
| T-2219 | Excusa: fuera de plazo | La excusa se presenta antes de la ocasión o hasta tres días hábiles después (Reglamento, Anexo 1). Ya pasó el plazo: hablá con GH. | GH | Propuesta; texto sensible |
| T-2220 | Excusa: ya hay una pendiente para esa ocasión | Ya tenés una excusa pendiente para esa ocasión. | MATEO | Propuesta |
| T-2221 | Excusa: explicación | Si no pudiste ir a una asamblea, actividad, reunión o partido por una causal del Reglamento, presentá la excusa antes o hasta tres días hábiles después. Si GH o tu comité la aceptan, no cuenta como falta ni te expulsa por una asamblea obligatoria; tampoco suma puntos. | GH | Propuesta |
| T-2222 | Excusa: falta la ocasión o la causal | Elegí la ocasión y la causal. | MATEO | Propuesta |
| T-2223 | Excusa: la ocasión ya tiene asistencia | Esa ocasión ya tiene tu asistencia registrada: no hace falta excusa. | MATEO | Propuesta |
| T-2224 | Excusa: sin ocasiones para excusar | No hay ocasiones recientes ni próximas para excusar. | MATEO | Propuesta |
| T-2225 | Permanencia del comité: bloque de excusas pendientes, título | Excusas pendientes de tu comité | GH | Propuesta |
| T-2226 | Permanencia del comité: sin excusas pendientes | No hay excusas pendientes sobre las ocasiones de tu comité. | MATEO | Propuesta |
| T-2227 | Excusa: ocasión inválida | La ocasión no existe, está cancelada o no es de este semestre. | MATEO | Propuesta |
| T-2228 | Excusa: decidida desde el comité | Excusa {estado}. | MATEO | Propuesta |
| T-2229 | Sanciones: tipos (en el orden del modelo) | Llamado de atención · Falta leve · Falta grave · Suspensión · Inhabilidad para cargos | GH | Propuesta; Reglamento cap. 9 y Anexo 1 |
| T-2230 | Sanciones: campos del formulario | Tipo · Causal: los hechos y los descargos · Referencia del Reglamento (opcional) · Fecha de la falta · Suspendida hasta (solo suspensión) · Comité que la impone (opcional) · Miembro | GH | Propuesta |
| T-2231 | Sanciones: ayuda del formulario | Un llamado de atención suspende derechos y beneficios 7 días y una falta leve 20; una suspensión dura hasta un mes; una falta grave no suspende pero advierte de expulsión y, con otra sanción vigente, el cierre propone la salida; la inhabilidad para cargos dura un año. Toda falta vence al año. Anotá los descargos en la causal. | GH | Propuesta; texto sensible |
| T-2232 | Sanciones: botones | Registrar sanción · Revocar sanción | MATEO | Propuesta |
| T-2233 | Guarda: reconocimiento o aval a una persona suspendida | {nombre} tiene derechos y beneficios suspendidos hasta el {fecha}: no puede recibir reconocimientos ni avales (Reglamento, art. 69 y 73). | GH | Propuesta; texto sensible |
| T-2234 | Línea de tiempo: sanción registrada · sanción revocada | Sanción registrada: {tipo} ({causal}) · Sanción revocada: {tipo} ({motivo}) | MATEO | Propuesta |
| T-2235 | Mi OE, permanencia: bloque de sanciones, título | Faltas y sanciones | GH | Propuesta |
| T-2236 | Mi OE, permanencia: línea de una sanción | {tipo} del {fecha}: {causal}. Vence el {vence}. | GH | Propuesta; texto sensible |
| T-2237 | Mi OE, permanencia: derechos suspendidos | Tus derechos y beneficios en la OE están suspendidos hasta el {fecha}. Seguís con tus deberes y tus reuniones. | GH | Propuesta; texto sensible |
| T-2238 | Mi OE, permanencia: advertencia de expulsión | Tenés una falta grave vigente más otra sanción: el cierre del semestre propone tu salida de la OE (Reglamento, art. 69). Hablá con GH. | GH | Propuesta; texto sensible |
| T-2239 | Persona 360, Membresía: bloque de sanciones (título · vacío) | Faltas y sanciones · Sin sanciones registradas | MATEO | Propuesta |
| T-2240 | Sanciones: motivo de la revocación | Motivo de la revocación (descargos o revisión de la junta) | GH | Propuesta |
| T-2241 | Sanciones: fecha de fin de la suspensión inválida | La suspensión necesita una fecha de fin entre la falta y un mes después (Reglamento, art. 58). | MATEO | Propuesta |
| T-2242 | Permanencia del comité: registrar una falta, título | Registrar una falta a un miembro del comité | GH | Propuesta |
| T-2243 | Sanciones: estados (vigente · vencida · revocada) | Vigente · Vencida · Revocada | MATEO | Propuesta |
| T-2244 | Sanciones: membresía terminada | Solo se sanciona a un miembro con membresía viva; una persona retirada se da de baja con motivo expulsión. | MATEO | Propuesta |
| T-2245 | Mi OE, permanencia: sanción revocada o vencida | Sin sanciones vigentes. | MATEO | Propuesta |
| T-2246 | Representantes ante la Asamblea: roles (en el orden del modelo) | Titular · Suplente | MATEO | Propuesta |
| T-2247 | Comité, área Personas: bloque de representación, título | Representación ante la Asamblea Directiva | GH | Propuesta |
| T-2248 | Comité, área Personas: ayuda de representación | Un titular y un suplente de la mesa directiva, miembros activos del comité (Reglamento, art. 14). El comité cuenta como representado cuando su titular, su suplente o cualquier cargo de dirección registra asistencia en la asamblea; con excusa aceptada, la falta cuenta con excusa. | GH | Propuesta |
| T-2249 | Asambleas (admin): columnas de la representación por comité | Comité · Titular · Suplente · Representado en · Faltas sin excusa · Faltas con excusa · Consecuencia | MATEO | Propuesta |
| T-2250 | Representación: escalera de consecuencias del término (en el orden del modelo) | Al día · Primera falta: sin voto en la siguiente asamblea y llamado de atención a la mesa · Segunda falta: sin voto en las dos siguientes y falta leve a la mesa · Tercera falta: causal de desactivación y falta grave a la mesa | GH | Propuesta; Reglamento art. 64; texto sensible |
| T-2251 | Representación: más de dos faltas con excusa | Más de dos faltas con excusa en el semestre (Reglamento, art. 64). | GH | Propuesta |
| T-2252 | Asambleas (admin): comités representados en una asamblea | {n} de {m} comités representados | MATEO | Propuesta |
| T-2253 | Asambleas (admin): sección de representación, título | Representación de los comités | GH | Propuesta |
| T-2254 | Asambleas (admin): botón de recalcular la representación | Recalcular | MATEO | Propuesta |
| T-2255 | Representantes: persona no elegible | El representante debe ser un miembro activo del comité en este semestre (Reglamento, art. 14). | MATEO | Propuesta |
| T-2256 | Comité, área Personas: botón de guardar representantes | Guardar representantes | MATEO | Propuesta |
| T-2257 | Representación: sin representante · sin asambleas cerradas | Sin representante · Sin asambleas cerradas todavía | MATEO | Propuesta |
| T-2258 | Comité, área Personas: resumen de la representación del semestre | Representado en {n} de {m} asambleas · {faltas} sin excusa · {excusadas} con excusa | MATEO | Propuesta |
| T-2259 | Comité: campos del periodo de prueba y la desactivación | Prueba desde · Prueba hasta · Desactivado el | MATEO | Propuesta |
| T-2260 | Comité: ayuda del periodo de prueba | Un comité creado o reactivado queda en prueba seis meses, ampliables a un año por la junta con motivo; en ese lapso debe hacer al menos un evento propio, representar al comité en el 90 % de las asambleas y cerrar con diez miembros fuera de la mesa (Reglamento, art. 25). Reactivar uno desactivado solo tras dos meses (art. 64). | JUNTA | Propuesta |
| T-2261 | Tablero y cabecera del comité: aviso de viabilidad | {comité}: {alerta} | MATEO | Propuesta |
| T-2262 | Condición del semestre: casilla de mesa de comité nuevo | Se reporta como activo aunque sea nuevo (mesa de comité nuevo o reactivado, Estatutos art. 5) | GH | Propuesta |
| T-2263 | Tablero de ADMIN: viabilidad de los comités, título | Viabilidad de los comités | MATEO | Propuesta |
| T-2264 | Viabilidad: avisos (en el orden del modelo) | Menos de tres direcciones vivas · Sin General o Financiero titular · Menos de seis miembros fuera de la mesa · Tres o más faltas sin excusa a la Asamblea · Sin evento propio en el semestre · En prueba con menos de diez miembros fuera de la mesa · En prueba con menos del 90 % de asambleas representadas · La prueba termina en menos de 30 días | GH | Propuesta; Reglamento art. 25 y 26; texto sensible |
| T-2265 | Comité en prueba: insignia de la cabecera | En prueba hasta el {fecha} | MATEO | Propuesta |
| T-2266 | Ediciones: columna, enlace y título de la mesa directiva | Mesa directiva | MATEO | Propuesta |
| T-2267 | Mesa directiva de la edición: ayuda | Los cargos de la mesa directiva de un macroevento los elige la Asamblea Directiva (Reglamento, art. 41 a 43); aquí queda el resultado, con un titular y, si la hay, una codirección por cargo. Solo miembros activos. | JUNTA | Propuesta |
| T-2268 | Cargo de macroevento: etiqueta del titular (Persona 360, directorio, egresados) | {cargo} · {edición} | MATEO | Propuesta |
| T-2269 | Cargo de macroevento: etiqueta de la codirección | {cargo} (codirección) · {edición} | MATEO | Propuesta |
| T-2270 | Mesa directiva: campos y botones | Cargo · Persona · Agregar a la mesa · Quitar | MATEO | Propuesta |
| T-2271 | Mesa directiva: guardas | Ese cargo ya tiene titular en esta edición. · Ese cargo ya tiene codirección en esta edición. · Solo un miembro activo puede tener un cargo de macroevento. · Esa persona ya tiene un cargo en esta edición. | MATEO | Propuesta |
| T-2272 | Mesa directiva: sin cargos | Esta edición no tiene cargos registrados. | MATEO | Propuesta |
| T-2273 | Mesa directiva: confirmación | Listo, mesa directiva actualizada. | MATEO | Propuesta |
| T-2274 | Licencia: guarda sin fecha de regreso | La licencia necesita una fecha de regreso. | MATEO | Propuesta |
| T-2275 | Licencia: guarda de la ventana de regreso | La licencia empieza mañana y dura máximo un año (Estatutos, art. 5.4): el regreso puede ser hasta el {fecha}. | MATEO | Propuesta |
| T-2276 | Condición retomada al volver de licencia (motivo automático) | Retoma la condición que tenía al salir a licencia (Estatutos, art. 5 par. 2). | MATEO | Propuesta |
| T-2277 | Tarea a GH: licencia vencida sin regreso | Licencia vencida: {nombre} debía volver el {fecha} (Estatutos, art. 11.3). | GH | Propuesta |
| T-2278 | Cambiar estado: campo del regreso previsto | Regreso previsto | MATEO | Propuesta |
| T-2279 | Cambiar estado: ayuda del regreso previsto | Obligatorio para la licencia: desde mañana y máximo un año (Estatutos, art. 5.4). Al volver a activo retoma la condición que tenía. | MATEO | Propuesta |
| T-2280 | Membresía: licencia con regreso previsto | En licencia hasta el {fecha} | MATEO | Propuesta |
| T-2281 | Inhabilidades para cargos: motivos (en el orden del modelo) | Tiene una inhabilidad para cargos vigente · Es de la Junta Directiva y la junta no convive con la mesa de un comité (Reglamento, art. 11) · Es nuevo: un cargo de mesa necesita el aval de la Vicepresidencia de GH (art. 27) · Ya dirige otro macroevento · Ya es General de otro comité · Ya es Financiero de otro comité · Superaría dos cargos directivos · Con dos cargos directivos, al menos uno debe ser codirección | GH | Propuesta; Reglamento art. 11 y 27 par. 3 y 4 |
| T-2282 | Inhabilidades: guarda al nombrar | No se puede nombrar: {motivos}. ADMIN puede registrar una excepción con motivo. | MATEO | Propuesta |
| T-2283 | Inhabilidades: campo de excepción (Persona 360, mesa de macroevento) y su ayuda | Excepción registrada (motivo) · Solo si hay una inhabilidad: el aval de la Vicepresidencia de GH o la decisión de la junta quedan auditados con este motivo. | MATEO | Propuesta |
| T-2284 | Grupos de trabajo: tope de comités de trabajo por persona | {nombre} ya está en dos comités de trabajo este semestre (Estatutos, art. 4 par. 3). | GH | Propuesta |
| T-2285 | Roster: aviso de inhabilidad en la vista previa | Inhabilidad al nombrar ({motivos}): se aplica igual y queda auditada con el motivo del roster. | MATEO | Propuesta |
| T-2286 | Presupuesto: tipos (en el orden del modelo) | Ordinario · Extraordinario | MATEO | Propuesta |
| T-2287 | Presupuesto: guarda de ordinario repetido | Ese comité ya tiene presupuesto ordinario para {año}. | MATEO | Propuesta |
| T-2288 | Presupuesto: campos de ADR-060 | Tipo · Actividad (solo extraordinario) · Presentado el · Aprobación de Desarrollo Estudiantil · Aprobación de la Vicepresidencia Financiera · Sanción (%) · Motivo de la sanción | MATEO | Propuesta |
| T-2289 | Rubros: guarda al borrar uno con movimientos | El rubro {rubro} tiene movimientos: no se borra; trasladá lo que queda. | MATEO | Propuesta |
| T-2290 | Presupuesto: guarda al abrir sin aprobaciones | Para abrirlo faltan las aprobaciones de Desarrollo Estudiantil y de la Vicepresidencia Financiera (Reglamento, art. 50 par. 1). | MATEO | Propuesta |
| T-2291 | Presupuesto: guarda al abrir sin rubros | Para abrirlo necesita al menos un rubro. | MATEO | Propuesta |
| T-2292 | Gasto: guarda sin presolicitud del mes | Sin presolicitud de {mes} el comité no tiene acceso a los recursos ese mes (Estatutos, art. 38): registrala primero. | MATEO | Propuesta |
| T-2293 | Traslado: guarda de rubros iguales | Elegí dos rubros distintos. | MATEO | Propuesta |
| T-2294 | Aval: guarda de aval no aprobado o de otro comité | Elegí un aval aprobado para este comité y presupuesto. | MATEO | Propuesta |
| T-2295 | Traslado: guarda después del evento | Las reasignaciones se presentan antes del evento (Estatutos, art. 38 par. 2): el evento del aval fue el {fecha}. | MATEO | Propuesta |
| T-2296 | Aval: guarda de decisión repetida | Ese aval ya fue decidido. | MATEO | Propuesta |
| T-2297 | Presolicitud: guarda de mes repetido | Ya hay presolicitud para {mes}. | MATEO | Propuesta |
| T-2298 | Presolicitud: título, campos, botón y confirmación | Presolicitud mensual · Mes · Notas · Registrar presolicitud · Presolicitud registrada. | MATEO | Propuesta |
| T-2299 | Aval de evento: título, campos, botón y confirmación | Avales de evento · Evento · Fecha del evento · Edición (opcional) · Descripción · Pedir aval · Aval pedido: lo decide la Presidencia. | MATEO | Propuesta |
| T-2300 | Aval de evento: estados (en el orden del modelo) | Pendiente · Aprobado · Rechazado | MATEO | Propuesta |
| T-2301 | Aval de evento: ayuda | Antes de ejecutar, difundir o comprar para un evento, la Presidencia lo avala (Reglamento, art. 35 par. 1). Los gastos y los traslados de ese evento se ligan a su aval. | JUNTA | Propuesta |
| T-2302 | Presupuesto (detalle): títulos | Aprobaciones · Sanción por presentación tardía · Presolicitudes · Avales · Movimientos · Detalle | MATEO | Propuesta |
| T-2303 | Presupuesto (detalle): botones | Registrar aprobación · Abrir · Cerrar · Aplicar sanción · Guardar rubros · Aprobar · Rechazar | MATEO | Propuesta |
| T-2304 | Presupuesto (detalle): aprobador (en el orden del modelo) | Desarrollo Estudiantil · Vicepresidencia Financiera | MATEO | Propuesta |
| T-2305 | Presupuesto: ayuda del tipo | El ordinario es anual y se presenta al final del año anterior; los extraordinarios cubren actividades no previstas durante el año (Reglamento, art. 50). Los dos los aprueban Desarrollo Estudiantil y la Vicepresidencia Financiera antes de abrirse. | JUNTA | Propuesta |
| T-2306 | Presupuesto: ayuda de la sanción | No presentar el presupuesto a tiempo sin aplazamiento descuenta el 10 % del siguiente presupuesto aprobado (Reglamento, art. 66): queda como ajuste con motivo. | JUNTA | Propuesta |
| T-2307 | Gasto y traslado: campos del aval y del proveedor | Aval del evento (opcional) · Proveedor (de la lista de la Universidad, Reglamento art. 51) · Sin aval | MATEO | Propuesta |
| T-2308 | Presupuesto (detalle): confirmación | Presupuesto actualizado. | MATEO | Propuesta |
| T-2309 | Presupuesto extraordinario: etiqueta | Extraordinario: {actividad} | MATEO | Propuesta |
| T-2310 | Presupuesto: totales | Asignado {asignado} · Gastado {gastado} · Disponible {disponible} | MATEO | Propuesta |
| T-2311 | Presupuesto (detalle): sin movimientos, sin presolicitudes, sin avales | Sin movimientos todavía. · Sin presolicitudes todavía. · Sin avales pedidos. | MATEO | Propuesta |
| T-2312 | Presupuesto (detalle): campos de la aprobación y de la sanción | Quién aprueba · Fecha · Porcentaje · Motivo · Nota de la decisión | MATEO | Propuesta |
| T-2313 | Condición del semestre: casilla de verificación académica | Requisitos académicos verificados este semestre (Estatutos, art. 6 y 7; sin guardar promedio ni materias) | GH | Propuesta |
| T-2314 | Condición del semestre: insignia de la verificación académica | Verificación académica: {fecha} | MATEO | Propuesta |
| T-2315 | Membresía: elegibilidad a honorario (título y ayuda) | Elegibilidad a honorario · Cuatro de cinco requisitos (Reglamento, art. 23): la junta decide y la asamblea resuelve las apelaciones. En periodo de prueba no se piden avales (art. 73). Los cargos "completos" se aproximan como vivos hasta el fin del semestre; la junta, como los dos semestres del mismo año. | JUNTA | Propuesta |
| T-2316 | Elegibilidad a honorario: requisitos (en el orden del modelo) | Cargo directivo de comité completo · Cargo directivo de macroevento completo · Seis semestres como miembro activo · Junta Directiva completa (año) · Un año en un comité de trabajo | JUNTA | Propuesta |
| T-2317 | Elegibilidad a honorario: resumen e insignias | Cumple {n} de {m} requisitos · Elegible · Todavía no elegible | MATEO | Propuesta |
| T-2318 | Permanencia: inducción de nuevos (título y estados) | Inducción · Obligatoria para nuevos (Reglamento, art. 47) · Asististe · Pendiente · Sin registro | GH | Propuesta |
| T-2319 | Ocasiones: asamblea citada con menos de tres días hábiles | Citada con menos de tres días hábiles (Reglamento, art. 15 par. 1) | MATEO | Propuesta |
| T-2320 | Premios OE: categorías (en el orden del Reglamento, art. 71) | Mejor Dirección General · Mejor Dirección Financiera · Mejor Dirección de Gestión Humana · Mejor Dirección de Logística · Mejor Dirección de Relaciones Públicas · Mejor Dirección de Mercadeo · Mejor Mesa Directiva · Mejor Miembro Nuevo · Mejor Evento Académico · Mejor Evento Cultural · Mejor Evento Social · Mejor Evento Deportivo · Mejor Evento Recreativo · Mejor Comité · Mejor Semana de Carrera · Comité Revelación | JUNTA | Propuesta |
| T-2321 | Premio OE: panel (título, campo, botón, confirmación y enlace) | Premio OE · Categoría · Otorgar · Premio registrado. · Otorgar Premio OE | MATEO | Propuesta |
| T-2322 | Membresía: reconocimientos (título, vacío y tipos) | Reconocimientos · Sin reconocimientos. · Destacado del mes · Otro · Premio OE | MATEO | Propuesta |
| T-2323 | Horario preferencial: recurso (plural · singular), columnas y tipos | Horario preferencial · Horario preferencial · Nombre · Ámbito · Cargo · Junta Directiva · Mesa directiva · Macroevento | MATEO | Propuesta |
| T-2324 | Horario preferencial: ayuda | Junta Directiva, mesas directivas de los comités (máximo seis por CIC o CE, titulares antes que codirecciones) y directores de macroevento del término (Reglamento, art. 72). La Universidad exige acreditar la asistencia a la Asamblea de Carrera; el CSV lleva el correo. | JUNTA | Propuesta |

| T-2325 | Comité: fecha de desactivación | Registrá la fecha de desactivación, sin usar una fecha futura. | JUNTA | Propuesta |
| T-2326 | Comité: reactivación | Un comité desactivado vuelve en periodo de prueba, después de al menos dos meses desde su desactivación. | JUNTA | Propuesta |
| T-2327 | Comité: límites del periodo de prueba | El periodo de prueba va de seis a doce meses desde su inicio. Conservá la fecha de inicio y esperá al vencimiento antes de pasarlo a activo. | JUNTA | Propuesta |
| T-2328 | Comité: motivo de ampliación | Para ampliar la prueba más allá de seis meses, registrá el motivo de la decisión de la junta. | JUNTA | Propuesta |
| T-2329 | Finanzas: año del presupuesto | La fecha debe corresponder al año {año} de este presupuesto. | MATEO | Propuesta |
| T-2330 | Aval: aprobación previa | El aval debe aprobarse antes del evento y antes de los gastos que se registren con él. | JUNTA | Propuesta |
| T-2331 | Beneficios y avales: prueba o suspensión | En periodo de prueba o con derechos suspendidos no se reciben beneficios ni se piden avales (Reglamento, art. 73). | JUNTA | Propuesta |
| T-2332 | Comité: motivo del cambio | Motivo de la decisión sobre el periodo de prueba | JUNTA | Propuesta |
| T-2333 | Condición retomada en licencia | Nuevo al regresar de licencia | GH | Propuesta |
| T-2334 | Traslado: aval obligatorio | Aval aprobado del evento | MATEO | Propuesta |
| T-2335 | Condición retomada en licencia | Transferencia al regresar de licencia | GH | Propuesta |
| T-2336 | Excusa: revisión excepcional | Si está fuera de plazo, solicito revisión excepcional de la Vicepresidencia de Gestión Humana; explico el retraso en el motivo. | GH | Propuesta |
| T-2337 | Excusa tardía: autoridad y motivo | Una excusa presentada fuera de plazo solo la acepta ADMIN como Vicepresidencia de Gestión Humana, con motivo de la excepción. | GH | Propuesta |
| T-2338 | Excusa: ocasión fuera de plazo | Fuera de plazo: revisión excepcional | GH | Propuesta |

| T-2340 | Importación histórica: precisión de fecha | Actividad histórica del {inicio} al {fin}. La fuente solo contiene fechas; el intervalo registrado representa días completos y no un horario real. | GH | Confirmado |
| T-2341 | Importación: grupo de decoración | Decoración de oficina | GH | Confirmado |
| T-2342 | Importación: grupo de apoyo deportivo | Apoyo Athletic OE | GH | Confirmado |
| T-2343 | Importación: evaluación validada | Cumplimiento validado por GH en las evidencias de la importación. | GH | Confirmado |

| T-2344 | Macroeventos: sección | Macroeventos | MATEO | Confirmado |
| T-2345 | Macroeventos: ayuda | Administrá la mesa directiva por edición y los equipos GT y GAP por semestre. | MATEO | Confirmado |
| T-2346 | Macroeventos: abrir ficha | Gestionar macroevento | MATEO | Confirmado |
| T-2347 | Macroeventos: áreas | Mesa directiva · Equipo del GT · Ediciones | MATEO | Confirmado |
| T-2348 | Macroeventos: GT vacío | Todavía no hay un GT preparado para este semestre. Podés organizar el equipo aunque la fecha del evento esté pendiente. | MATEO | Propuesta |
| T-2349 | Macroeventos: preparar | Preparar GT del semestre | MATEO | Propuesta |
| T-2350 | Macroeventos: cargos disponibles | {n} cargos de dirección, con opción de codirección. | MATEO | Confirmado |
| T-2351 | Macroeventos: cargo inválido | Ese cargo no corresponde a este macroevento. Elegí uno de los cargos disponibles. | MATEO | Propuesta |
| T-2352 | Macroeventos: GT repetido | Ya existe un GT de este macroevento en el semestre. Usá ese equipo para conservar sus evaluaciones. | MATEO | Propuesta |
| T-2353 | Macroeventos: vínculo inválido | El macroevento, la edición y el grupo deben corresponder. Revisá la selección. | MATEO | Propuesta |
| T-2354 | Macroeventos: sin edición | Todavía no hay ediciones registradas. Registrá una edición con su fecha real para nombrar la mesa directiva. | MATEO | Propuesta |
| T-2355 | Macroeventos: edición | Edición de la mesa directiva | MATEO | Propuesta |
| T-2356 | Macroeventos: administrar ediciones | Administrar ediciones | MATEO | Propuesta |
| T-2357 | Macroeventos: vacante | Sin asignar | MATEO | Propuesta |
| T-2358 | Macroeventos: responsables | Responsables del GT | MATEO | Propuesta |
| T-2359 | Macroeventos: equipo, ayuda | Agregá a quienes trabajan en el GT. El desempeño acreditado suma 4%, 6% u 8% según los macroeventos cumplidos, para integrantes antiguos. | GH | Confirmado |
| T-2360 | Macroeventos: evaluar | Evaluar desempeño | GH | Propuesta |
| T-2361 | Macroeventos: observación | Observación (obligatoria si el desempeño es insuficiente) | GH | Propuesta |
| T-2362 | Macroeventos: guardar evaluación | Guardar evaluación | GH | Propuesta |
| T-2363 | Macroeventos: guardar responsables | Guardar responsables y edición | GH | Propuesta |
| T-2364 | Macroeventos: líder | Líder del GT | GH | Propuesta |
| T-2365 | Macroeventos: evaluadores | Evaluadores de GH | GH | Propuesta |
| T-2366 | Macroeventos: edición opcional | Edición vinculada al GT (opcional) | GH | Propuesta |
| T-2367 | Macroeventos: sin vínculo | Sin edición vinculada | GH | Propuesta |
| T-2368 | Macroeventos: sin evaluaciones automáticas | Nombrar un cargo no incorpora a la persona al GT. Agregala al equipo para que GH pueda evaluar su desempeño y acreditar el cumplimiento. | GH | Confirmado |
| T-2369 | Macroeventos: historial de integrantes | Integrantes anteriores | GH | Propuesta |
| T-2370 | Macroeventos: resumen de equipo | Integrantes: {n} · Evaluaciones pendientes: {m} | GH | Propuesta |
| T-2371 | Macroeventos: semestre cerrado | Este semestre está cerrado. Podés consultar su equipo y sus evaluaciones. | GH | Propuesta |
| T-2372 | Macroeventos: historial | Cada edición conserva su propia mesa directiva. Seleccioná una edición para consultar sus cargos. | MATEO | Propuesta |
| T-2373 | Macroeventos: titular | Titular | MATEO | Propuesta |
| T-2374 | Macroeventos: operación | Nombrar dirección | MATEO | Propuesta |
| T-2375 | GT/GAP: Pestañas | Mesa directiva · GT · GAP · Ediciones | GH | Confirmado |
| T-2376 | GT/GAP: Áreas | General · Publicidad · Logística · Finanzas · Relaciones Públicas · Mercadeo · Gestión Humana · Agenda académica · Seguridad · Carnival · The Games | GH | Confirmado |
| T-2377 | GT/GAP: Áreas del integrante | Áreas de trabajo (elegí al menos una) | GH | Confirmado |
| T-2378 | GT/GAP: Ayuda de áreas | Seleccioná una o varias áreas. Cada macroevento cuenta una sola vez para el criterio de GT. | GH | Confirmado |
| T-2379 | GT/GAP: Editar áreas | Editar áreas | GH | Confirmado |
| T-2380 | GT/GAP: Guardar áreas | Guardar áreas | GH | Confirmado |
| T-2381 | GT/GAP: Acreditación al registrar | Registrar y acreditar cumplimiento | GH | Confirmado |
| T-2382 | GT/GAP: Ayuda de acreditación | Marcá esta opción solo si ya verificaste el desempeño. La acreditación quedará a tu nombre; sin marcarla, la evaluación queda pendiente. | GH | Confirmado |
| T-2383 | GT/GAP: Equipos y apoyos | Equipos y apoyos | GH | Confirmado |
| T-2384 | GT/GAP: Área inválida | Seleccioná al menos un área válida para este macroevento. | GH | Confirmado |
| T-2385 | GT/GAP: GAP: preparar | Preparar GAP del semestre | GH | Confirmado |
| T-2386 | GT/GAP: GAP: vacío | Todavía no hay un GAP de este macroevento en el semestre. Preparalo para registrar sus integrantes y áreas. | GH | Confirmado |
| T-2387 | GT/GAP: GAP: ayuda | Agregá a quienes apoyan este macroevento como GAP. El desempeño acreditado suma hasta un 5% en permanencia, sin acumular más por otros GAP. | GH | Confirmado |
| T-2388 | GT/GAP: Responsables GAP | Responsables del GAP | GH | Confirmado |
| T-2389 | GT/GAP: Líder GAP | Líder del GAP | GH | Confirmado |
| T-2390 | GT/GAP: Edición GAP | Edición vinculada al GAP (opcional) | GH | Confirmado |
| T-2391 | GT/GAP: Área sin especificar | Área por completar | GH | Confirmado |
| T-2392 | GT/GAP: Sin equipos | Todavía no hay equipos o apoyos registrados en este semestre. | GH | Confirmado |
| T-2393 | GT/GAP: Ayuda de pertenencia | La participación se muestra en el perfil al registrarla. El porcentaje de permanencia requiere desempeño acreditado por GH. | GH | Confirmado |

### Cargos vigentes e historial (14/09/2026)

| Código | Dónde | Texto | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-2394 | Cargos: ámbito institucional, incluidos los cargos de GH | Junta Directiva | MATEO | Confirmado |
| T-2395 | Cargos históricos: sin ámbito indicado | Otros cargos | MATEO | Confirmado |
| T-2396 | Cargos: vacío del semestre actual | Sin cargos vigentes en este semestre. | MATEO | Confirmado |
| T-2397 | Cargos: nombramientos de semestres futuros | Próximos cargos | MATEO | Confirmado |
| T-2398 | Formulario de nombramiento: tipo | Cargo | MATEO | Confirmado |
| T-2399 | Historial: semestre sin identificar | Semestre por confirmar | MATEO | Propuesta |
| T-2400 | Historial: vacío | Sin cargos anteriores registrados. | MATEO | Confirmado |
| T-2401 | Cargo de macroevento: codirección | {cargo} (codirección) | MATEO | Confirmado |

## Retos, boosters y colección (ADR-067)

Textos de los retos relámpago, los boosters, las campañas de puntos y la colección de insignias en Mi OE → GH Points, y de la sección Gamificación de Administración ([ADR-067](adr/ADR-067-retos-boosters-y-coleccion.md)). Los nombres de familias, niveles y retos son propuestas para GH; el catálogo inicial se siembra en la migración `0030` con estos textos. `T-085` y `T-667` se amplían al final en sus filas originales.

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-2402 | GH Points: subnavegación | Resumen · Retos · Boosters · Colección | MATEO | Propuesta |
| T-2403 | Admin: grupo de navegación | Gamificación | MATEO | Propuesta |
| T-2404 | Admin: enlaces de Gamificación | Panel · Retos · Revisión · Campañas · Insignias · Límites | MATEO | Propuesta |
| T-2405 | Admin: títulos de las páginas de Gamificación | Panel de gamificación · Retos · Revisión de evidencias · Campañas de puntos · Insignias · Límites y activación | MATEO | Propuesta |
| T-2406 | Retos: título | Retos relámpago | GH | Propuesta |
| T-2407 | Retos: intro | Retos cortos con premio en GH Points. Elegí uno, hacelo antes de la fecha límite y sumá. | GH | Propuesta |
| T-2408 | Retos: vacío | Por ahora no hay retos abiertos. Volvé pronto, pues: GH publica nuevos durante el semestre. | MATEO | Propuesta |
| T-2409 | Retos: formatos | Presencial · Trivia · Misión con evidencia | GH | Propuesta |
| T-2410 | Retos: estados del miembro | Disponible · Enviado · Pendiente de revisión · Completado · Rechazado · Vencido | MATEO | Propuesta |
| T-2411 | Retos: públicos | Toda la membresía · Nuevos · Veteranos · Comités seleccionados | MATEO | Propuesta |
| T-2412 | Reto: fecha límite | Hasta {fecha} | MATEO | Propuesta |
| T-2413 | Reto: premio | {n} GH Points | MATEO | Propuesta |
| T-2414 | Reto: admite booster | Podés usar un booster | MATEO | Propuesta |
| T-2415 | Reto: booster elegido | Vas a usar tu {booster} acá | MATEO | Propuesta |
| T-2416 | Reto: campaña vigente | +{n} % de campaña hasta {fecha} | MATEO | Propuesta |
| T-2417 | Reto presencial: acción requerida | Registrá tu asistencia en {actividad} antes de {fecha}. Con eso queda completo. | GH | Propuesta |
| T-2418 | Trivia: acción requerida | Respondé {n} preguntas. Necesitás al menos el {porcentaje} % de aciertos y tenés un solo envío. | GH | Propuesta |
| T-2419 | Evidencia: acción requerida | Contanos qué hiciste y subí hasta tres fotos. GH lo revisa y te avisa. | GH | Propuesta |
| T-2420 | Retos: botones | Participar · Enviar respuestas · Enviar evidencia · Ir a la actividad · Cambiar booster · Quitar booster · Volver a los retos | MATEO | Propuesta |
| T-2421 | Trivia: progreso | Pregunta {n} de {total} | MATEO | Propuesta |
| T-2422 | Trivia: aprobada | ¡Qué berraco! Acertaste {aciertos} de {total} y sumaste {n} GH Points. ¡OE OE OE! | GH | Propuesta |
| T-2423 | Trivia: bajo el umbral (motivo automático) | No alcanzaste el {porcentaje} % de aciertos: acertaste {aciertos} de {total}. Este reto no da puntos, pero vienen más. | GH | Propuesta |
| T-2424 | Trivia: título de respuestas correctas | Respuestas correctas | MATEO | Propuesta |
| T-2425 | Trivia: respuestas ocultas | Las respuestas correctas se muestran cuando cierre el reto. | MATEO | Propuesta |
| T-2426 | Trivia: falta responder | Respondé todas las preguntas antes de enviar. | MATEO | Propuesta |
| T-2427 | Evidencia: instrucciones | Escribí qué hiciste ({min} a {max} caracteres) y subí hasta 3 imágenes JPG, PNG o WebP de máximo 5 MB cada una. | MATEO | Propuesta |
| T-2428 | Evidencia: campo de texto | Contanos qué hiciste | GH | Propuesta |
| T-2429 | Evidencia: botón de imagen | Agregar imagen | MATEO | Propuesta |
| T-2430 | Evidencia: errores de imagen | Ese archivo no es una imagen JPG, PNG o WebP. · Esa imagen pesa más de 5 MB. · Ya subiste tres imágenes. · No pudimos subir la imagen. Probá de nuevo. | MATEO | Propuesta |
| T-2431 | Evidencia: enviada | ¡Listo pues! Tu evidencia quedó enviada. GH la revisa y te avisamos. | GH | Propuesta |
| T-2432 | Evidencia: rechazo de GH | GH no aprobó tu evidencia: {motivo} | GH | Propuesta |
| T-2433 | Reto: pendiente de revisión | Tu participación está en revisión. Reservamos tu premio con las reglas de hoy. | MATEO | Propuesta |
| T-2434 | Reto: completado | ¡Reto completado, parce! Sumaste {n} GH Points. ¡OE OE OE! | GH | Propuesta |
| T-2435 | Reto: desglose del premio | {base} de base + {extra} de booster | MATEO | Propuesta |
| T-2436 | Reto: tope aplicado | El tope de puntos extra redujo este premio. Mañana o la próxima semana volvés a tener cupo. | MATEO | Propuesta |
| T-2437 | Reto: booster no consumido | Tu booster no alcanzó a sumar puntos, así que sigue disponible. | MATEO | Propuesta |
| T-2438 | Reto: vencido | Este reto ya cerró. | MATEO | Propuesta |
| T-2439 | Reto: ya participaste | Ya participaste en este reto. | MATEO | Propuesta |
| T-2440 | Reto: no elegible | Este reto no es para tu público o tu membresía no está activa. | MATEO | Propuesta |
| T-2441 | Reto: no encontrado | No encontramos ese reto. | MATEO | Propuesta |
| T-2442 | Retos: función apagada | Los retos todavía no están activos. Pronto vas a poder participar. | MATEO | Propuesta |
| T-2443 | Reto: semestre cerrado | El semestre ya cerró sus puntos: este reto no puede recibir participaciones. | MATEO | Propuesta |
| T-2444 | Reto: envío repetido con otro contenido | Ese envío ya llegó con otro contenido. Recargá para ver tu estado. | MATEO | Propuesta |
| T-2445 | Inicio de Mi OE: próximo reto | Tu próximo reto | GH | Propuesta |
| T-2446 | Inicio de Mi OE: botón del próximo reto | Ver el reto | MATEO | Propuesta |
| T-2447 | Inicio de Mi OE: sin retos | Sin retos abiertos por ahora. | MATEO | Propuesta |
| T-2448 | Retos: filtros | Abiertos · Míos · Cerrados | MATEO | Propuesta |
| T-2449 | Reto presencial: asistencia pendiente | Tu asistencia espera aprobación. Cuando la aprueben, el reto queda completo. | MATEO | Propuesta |
| T-2450 | Reto: actividad vinculada | Actividad: {actividad} | MATEO | Propuesta |
| T-2451 | Boosters: nombres | Impulso · Superimpulso | GH | Propuesta |
| T-2452 | Boosters: título | Tus boosters | GH | Propuesta |
| T-2453 | Boosters: intro | Un Impulso suma +50 % y un Superimpulso +100 % al premio de un reto o de una actividad con puntos. Son de un uso y vencen al terminar el semestre. | GH | Propuesta |
| T-2454 | Boosters: vacío | Todavía no tenés boosters. Los ganás al subir de nivel en tu colección. | MATEO | Propuesta |
| T-2455 | Boosters: estados | Disponible · Reservado · Usado · Vencido · Retirado | MATEO | Propuesta |
| T-2456 | Boosters: vencimiento | Vence el {fecha} | MATEO | Propuesta |
| T-2457 | Boosters: elegir objetivo | ¿Dónde lo usás? | MATEO | Propuesta |
| T-2458 | Boosters: tipos de objetivo | Retos abiertos · Actividades próximas | MATEO | Propuesta |
| T-2459 | Boosters: asignado | ¡De una! Tu {booster} está reservado para {objetivo}. Podés cambiarlo hasta que participes. | MATEO | Propuesta |
| T-2460 | Boosters: quitar del objetivo | Quitar de {objetivo} | MATEO | Propuesta |
| T-2461 | Check-in: usar booster | Usar mi {booster} en esta actividad | MATEO | Propuesta |
| T-2462 | Check-in: booster aplicado | Tu {booster} se aplica a esta asistencia. | MATEO | Propuesta |
| T-2463 | Boosters: título de campañas | Campañas de puntos | GH | Propuesta |
| T-2464 | Boosters: campaña vigente | +{n} % en {objetivo} hasta {fecha} | MATEO | Propuesta |
| T-2465 | Boosters: sin campañas | No hay campañas activas. | MATEO | Propuesta |
| T-2466 | Boosters: errores | Ya tenés un booster en esa participación. · Ese booster ya venció. · Ese booster ya se usó. · Los boosters no aplican a esa actividad. · Ya participaste ahí: el booster no se puede mover. | MATEO | Propuesta |
| T-2467 | Boosters: origen por insignia | Por {origen} | MATEO | Propuesta |
| T-2468 | Boosters: origen manual | Otorgado por GH: {motivo} | MATEO | Propuesta |
| T-2469 | Ledger: motivo del premio de reto | Reto: {reto} | MATEO | Propuesta |
| T-2470 | Ledger: motivo del extra de booster | Booster +{porcentaje} % en {origen} | MATEO | Propuesta |
| T-2471 | Colección: título | Tu colección | GH | Propuesta |
| T-2472 | Colección: intro | Cada insignia cuenta algo que hiciste en la OE. Suben de nivel con vos y se quedan para siempre. | GH | Propuesta |
| T-2473 | Colección: familias | En parche · Explorador OE · Relámpago · Palabra a palabra · Ediciones especiales | GH | Propuesta |
| T-2474 | Insignia En parche: descripción | Asistencias aprobadas a actividades voluntarias | GH | Propuesta |
| T-2475 | Insignia En parche: niveles | 1 asistencia · 5 asistencias · 15 asistencias | GH | Propuesta |
| T-2476 | Insignia Explorador OE: descripción | Actividades de comités distintos | GH | Propuesta |
| T-2477 | Insignia Explorador OE: niveles | 2 comités · 4 comités · 6 comités | GH | Propuesta |
| T-2478 | Insignia Relámpago: descripción | Retos relámpago completados | GH | Propuesta |
| T-2479 | Insignia Relámpago: niveles | 1 reto · 5 retos · 15 retos | GH | Propuesta |
| T-2480 | Insignia Palabra a palabra: descripción | Wordles resueltos | GH | Propuesta |
| T-2481 | Insignia Palabra a palabra: niveles | 1 Wordle · 10 Wordles · 30 Wordles | GH | Propuesta |
| T-2482 | Colección: nivel | Nivel {nivel} | MATEO | Propuesta |
| T-2483 | Colección: progreso | {n} de {total} | MATEO | Propuesta |
| T-2484 | Colección: bloqueada | Todavía no. {condición} | MATEO | Propuesta |
| T-2485 | Colección: desbloqueada | Desbloqueada el {fecha} por {origen} | MATEO | Propuesta |
| T-2486 | Colección: historial de niveles | Niveles anteriores | MATEO | Propuesta |
| T-2487 | Colección: logro histórico | Reconocida por tu historia en la OE, sin booster | MATEO | Propuesta |
| T-2488 | Colección: logro revocado | Este nivel se retiró: {motivo} | MATEO | Propuesta; texto sensible |
| T-2489 | Colección: filtro por semestre | Semestre | MATEO | Propuesta |
| T-2490 | Colección: todos los semestres | Todos | MATEO | Propuesta |
| T-2491 | Colección: destacar | Destacar en el directorio | MATEO | Propuesta |
| T-2492 | Colección: quitar destacada | Quitar del directorio | MATEO | Propuesta |
| T-2493 | Colección: límite de destacadas | Ya destacaste tres. Quitá una para destacar otra. | MATEO | Propuesta |
| T-2494 | Colección: explicación de destacadas | Podés destacar hasta tres insignias en tu tarjeta del directorio. | MATEO | Propuesta |
| T-2495 | Desbloqueo: título | ¡Nueva insignia! | GH | Propuesta |
| T-2496 | Desbloqueo: texto | ¡Bacano! Desbloqueaste {insignia} nivel {nivel}. ¡OE OE OE! | GH | Propuesta |
| T-2497 | Desbloqueo: con booster | Además ganaste un {booster}. Pilas: usalo antes de que termine el semestre. | GH | Propuesta |
| T-2498 | Desbloqueo: botón | Ver mi colección | MATEO | Propuesta |
| T-2499 | Desbloqueo: alternativa estática | Nueva insignia desbloqueada: {insignia} nivel {nivel}. | MATEO | Propuesta |
| T-2500 | Colección: vacío | Tu colección arranca con tu primera asistencia, tu primer reto o tu primer Wordle. | GH | Propuesta |
| T-2501 | Colección: edición especial | Edición especial · {origen} | MATEO | Propuesta |
| T-2502 | Directorio: insignias destacadas | Insignias destacadas | MATEO | Propuesta |
| T-2503 | Admin retos: nuevo | Nuevo reto | MATEO | Propuesta |
| T-2504 | Admin retos: campos del editor | Formato · Título · Descripción · Público · Comités · Abre · Cierra · Premio base · Porcentaje para aprobar · Ocasión vinculada | MATEO | Propuesta |
| T-2505 | Admin retos: ayuda del premio | Entre 0 y 20 GH Points. Por defecto: trivia {trivia}, presencial {presencial}, evidencia {evidencia}. | MATEO | Propuesta |
| T-2506 | Admin retos: ayuda del porcentaje | Aciertos necesarios para aprobar la trivia. Por defecto {n} %. | MATEO | Propuesta |
| T-2507 | Admin retos: título de preguntas | Preguntas | MATEO | Propuesta |
| T-2508 | Admin retos: campos de pregunta | Pregunta · Opciones · Respuesta correcta · Agregar pregunta · Quitar pregunta · Agregar opción | MATEO | Propuesta |
| T-2509 | Admin retos: ayuda de preguntas | De 1 a 5 preguntas con 2 a 6 opciones cada una; marcá la correcta. | MATEO | Propuesta |
| T-2510 | Admin retos: acciones | Guardar borrador · Publicar · Cancelar · Duplicar · Vista previa | MATEO | Propuesta |
| T-2511 | Admin retos: estados | Borrador · Programado · Abierto · Cerrado · Cancelado | MATEO | Propuesta |
| T-2512 | Admin retos: aviso al publicar | Al publicar se congelan formato, preguntas, público, premio y ocasión. Después solo podés cambiar título y descripción. | MATEO | Propuesta |
| T-2513 | Admin retos: aviso al cancelar | Cancelar libera las participaciones pendientes y sus reservas. Los premios ya entregados no se tocan: anulalos uno a uno si hace falta. | MATEO | Propuesta |
| T-2514 | Admin retos: motivo de cancelación | Motivo de la cancelación | MATEO | Propuesta |
| T-2515 | Admin retos: cancelar con premios exige step-up | Este reto ya entregó premios. Confirmá tu identidad para cancelarlo. | MATEO | Propuesta |
| T-2516 | Admin retos: vista previa | Así lo ve un miembro | MATEO | Propuesta |
| T-2517 | Admin retos: título de participantes | Participantes | MATEO | Propuesta |
| T-2518 | Admin retos: columnas de participantes | Persona · Estado · Enviado · Premio · Booster · Decidido por | MATEO | Propuesta |
| T-2519 | Admin retos: sin participantes | Nadie ha participado todavía. | MATEO | Propuesta |
| T-2520 | Admin retos: errores del editor | La fecha de cierre debe ser posterior a la de apertura. · Elegí al menos un comité. · Una trivia necesita entre 1 y 5 preguntas. · Cada pregunta necesita entre 2 y 6 opciones y una correcta. · Un reto presencial necesita una ocasión con puntos del mismo semestre. · El premio base va de 0 a 20. · Solo se puede publicar un borrador. · Este reto ya no está en borrador: solo cambian título y descripción. · Cada pregunta y cada opción necesitan texto. | MATEO | Propuesta |
| T-2521 | Admin retos: duplicado | Borrador creado a partir de «{reto}». | MATEO | Propuesta |
| T-2522 | Admin retos: resultados | Reto publicado. · Reto cancelado. · Borrador guardado. | MATEO | Propuesta |
| T-2523 | Admin revisión: título | Evidencias por revisar | MATEO | Propuesta |
| T-2524 | Admin revisión: vacío | Nada por revisar por acá: todo al día. | MATEO | Propuesta |
| T-2525 | Admin revisión: acciones | Aprobar · Rechazar · Anular | MATEO | Propuesta |
| T-2526 | Admin revisión: motivo de rechazo | Motivo del rechazo (lo ve la persona) | MATEO | Propuesta |
| T-2527 | Admin revisión: estado de imagen | Imagen en proceso · No se pudo procesar la imagen | MATEO | Propuesta |
| T-2528 | Admin revisión: premio reservado | Premio reservado: {base} de base + {extra} de booster ({fecha}) | MATEO | Propuesta |
| T-2529 | Admin revisión: resultados | Entrega aprobada. · Entrega rechazada. · Premio anulado. | MATEO | Propuesta |
| T-2530 | Admin revisión: anular premio | Anular premio · Revierte los puntos entregados con motivo y devuelve el booster si sigue vigente. No reabre el cupo del día. | MATEO | Propuesta |
| T-2531 | Admin revisión: filtros | Solo pendientes · Todas | MATEO | Propuesta |
| T-2532 | Admin campañas: título | Campañas de puntos | MATEO | Propuesta |
| T-2533 | Admin campañas: campos | Nombre · Porcentaje · Objetivo · Empieza · Termina | MATEO | Propuesta |
| T-2534 | Admin campañas: porcentajes | +25 % · +50 % · +100 % | MATEO | Propuesta |
| T-2535 | Admin campañas: tipos de objetivo | Retos · Actividades con puntos | MATEO | Propuesta |
| T-2536 | Admin campañas: ayuda | Se crea una campaña por cada objetivo elegido. Si varias coinciden aplica la más favorable y el extra total nunca pasa de +100 %. | MATEO | Propuesta |
| T-2537 | Admin campañas: acciones | Crear campaña · Cancelar campaña | MATEO | Propuesta |
| T-2538 | Admin campañas: vacío | No hay campañas en este semestre. | MATEO | Propuesta |
| T-2539 | Admin campañas: errores | Elegí al menos un objetivo. · La campaña debe terminar después de empezar. · El objetivo debe ser del mismo semestre. | MATEO | Propuesta |
| T-2540 | Admin insignias: título | Catálogo de insignias | MATEO | Propuesta |
| T-2541 | Admin insignias: columnas | Código · Familia · Nivel · Umbral · Nombre · Activa · Desbloqueos | MATEO | Propuesta |
| T-2542 | Admin insignias: nueva edición especial | Nueva edición especial | MATEO | Propuesta |
| T-2543 | Admin insignias: campos de edición especial | Nombre · Descripción · Vinculada a · Ocasión · Reto | MATEO | Propuesta |
| T-2544 | Admin insignias: ayuda de edición especial | Se otorga a todos los asistentes aprobados de la ocasión o a quienes completen el reto. | MATEO | Propuesta |
| T-2545 | Admin insignias: otorgar booster | Otorgar booster | MATEO | Propuesta |
| T-2546 | Admin insignias: campos de otorgar | Persona · Booster · Motivo | MATEO | Propuesta |
| T-2547 | Admin insignias: retirar booster | Retirar booster · Motivo del retiro | MATEO | Propuesta |
| T-2548 | Admin insignias: resultados | Edición especial creada. · Booster otorgado. · Booster retirado. | MATEO | Propuesta |
| T-2549 | Admin insignias: booster usado tras revocar | Este logro se revocó y su booster ya se usó: revisá si hace falta un ajuste. | MATEO | Propuesta |
| T-2550 | Admin límites: título | Límites y activación | MATEO | Propuesta |
| T-2551 | Admin límites: campos | Tope diario · Tope semanal · Premio por defecto de trivia · Premio por defecto presencial · Premio por defecto de evidencia · Porcentaje por defecto para aprobar | MATEO | Propuesta |
| T-2552 | Admin límites: bandera | Retos activos para los miembros | MATEO | Propuesta |
| T-2553 | Admin límites: ayuda | Los topes suman el premio base de los retos y los extras de boosters; la asistencia normal y el Wordle quedan fuera. Un cambio aplica a las participaciones nuevas. | MATEO | Propuesta |
| T-2554 | Admin límites: guardado | Límites guardados. | MATEO | Propuesta |
| T-2555 | Admin panel: indicadores | Participantes únicos · Entregas pendientes · Premios reservados · Premios entregados · Boosters usados · Errores de procesamiento | MATEO | Propuesta |
| T-2556 | Admin panel: título de conciliación | Conciliación histórica | MATEO | Propuesta |
| T-2557 | Admin panel: ayuda de conciliación | Reconoce insignias por asistencias aprobadas, retos completados y Wordles resueltos de cualquier semestre. No entrega puntos, boosters ni avisos. Simulá primero. | MATEO | Propuesta |
| T-2558 | Admin panel: acciones de conciliación | Simular · Aplicar | MATEO | Propuesta |
| T-2559 | Admin panel: estados de conciliación | En curso · Terminada · Con error | MATEO | Propuesta |
| T-2560 | Admin panel: cifras de conciliación | {procesadas} personas · {desbloqueadas} desbloqueadas · {revocadas} revocadas | MATEO | Propuesta |
| T-2561 | Admin panel: conciliación en curso | Ya hay una conciliación en curso. | MATEO | Propuesta |
| T-2562 | Cierre de puntos: pendientes de retos | Quedan {n} entregas pendientes y {m} premios reservados. Resolvelos antes de cerrar. | MATEO | Propuesta |
| T-2563 | Admin cierre: filas del resumen | Entregas de retos pendientes · Premios reservados | MATEO | Propuesta |
| T-2564 | Admin: motivo obligatorio | Escribí un motivo. | MATEO | Propuesta |
| T-2565 | Admin retos: filtros | Semestre · Estado · Formato | MATEO | Propuesta |
| T-2566 | Push: reto publicado | Nuevo reto: {reto} · Tenés hasta {fecha}. De una: entrá y participá. | GH | Propuesta |
| T-2567 | Push: entrega aprobada | ¡Reto completado! · Sumaste {n} GH Points por {reto}. Ya vas en {total}. | GH | Propuesta |
| T-2568 | Push: entrega rechazada | Tu reto no fue aprobado · {reto}: {motivo} | GH | Propuesta |
| T-2569 | Push: insignia desbloqueada | ¡Nueva insignia! · Qué nota: desbloqueaste {insignia} nivel {nivel}. | GH | Propuesta |
| T-2570 | Export de retos: cabeceras | Reto · Formato · Semestre · Persona · Correo · Estado · Enviado · Base · Extra · Booster · Decidido | MATEO | Propuesta |
| T-2571 | Export de insignias: cabeceras | Persona · Correo · Insignia · Nivel · Desbloqueada · Histórica · Revocada | MATEO | Propuesta |
| T-2572 | Reto: premio reservado (tarjeta) | Premio reservado: {n} GH Points | MATEO | Propuesta |
| T-2573 | Retos: trivia respondida (lista) | Trivia respondida | MATEO | Propuesta |
| T-2574 | Admin retos: título de la lista y vacío | Retos del semestre · Todavía no hay retos. Creá el primero. | MATEO | Propuesta |
| T-2575 | Admin panel: título de errores | Últimos errores de procesamiento | MATEO | Propuesta |
| T-2576 | Colección: origen de un logro | Asistencia a {actividad} · Reto {reto} · Wordle del {fecha} · Historia de la OE · Edición especial | MATEO | Propuesta |
| T-2577 | Reto: cuenta para insignia | Cuenta para Relámpago | MATEO | Propuesta |
| T-2578 | Boosters: cuál usar (selector) | Sin booster · {booster} (vence el {fecha}) | MATEO | Propuesta |
| T-2579 | Reto presencial: asistencia rechazada (motivo automático) | Tu asistencia en {actividad} no fue aprobada. | MATEO | Propuesta |
| T-2580 | Reto presencial: asistencia anulada (motivo automático) | Tu asistencia en {actividad} fue anulada: {motivo} | MATEO | Propuesta |
| T-2581 | Reto cancelado: motivo automático de la participación | El reto se canceló: {motivo} | MATEO | Propuesta |
| T-2582 | Admin retos: columnas de la lista | Reto · Formato · Estado · Abre · Cierra · Premio · Participantes · Pendientes | MATEO | Propuesta |
| T-2583 | Admin panel: enlaces rápidos | Ver jobs · Ver ledger · Ver cierre | MATEO | Propuesta |
| T-2584 | Admin retos: ocasión vinculada, ayuda | Elegí una actividad con puntos del mismo semestre; el reto se completa al aprobar su asistencia dentro de la ventana del reto. | MATEO | Propuesta |
| T-2585 | Admin revisión: texto de la evidencia (título) | Lo que contó | MATEO | Propuesta |
| T-2586 | Admin: sin sesión reciente para anular | Confirmá tu identidad para anular un premio entregado. | MATEO | Propuesta |
| T-2587 | Admin panel: reanudar conciliación | Reanudar | MATEO | Propuesta |
| T-2588 | Admin panel: título de corridas de conciliación | Corridas recientes | MATEO | Propuesta |
| T-2589 | Admin panel: columnas de corridas | Modo · Estado · Procesadas · Desbloqueadas · Revocadas · Inicio · Fin | MATEO | Propuesta |
| T-2590 | Admin panel: modos de conciliación | Simulación · Aplicación | MATEO | Propuesta |
| T-2591 | Admin panel: aplicar exige step-up | Aplicar escribe logros históricos, sin puntos ni boosters. Confirmá tu identidad para seguir. | MATEO | Propuesta |
| T-2592 | Admin panel: sin corridas | Todavía no se corrió la conciliación. | MATEO | Propuesta |
| T-2593 | Admin panel: error de la corrida | Error: {mensaje} | MATEO | Propuesta |
| T-2594 | Admin cierre: estadísticas de gamificación del standing | Retos completados · Puntos de boosters | MATEO | Propuesta |
| T-3205 | Reto presencial: asistencia excusada (motivo automático, ADR-111) | Tu asistencia en {actividad} quedó excusada. | MATEO | Propuesta |

## Directorio de comités de Mi OE

| Código | Dónde | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-2595 | Comités internos: acción de la ficha | Ver comité | COM | Propuesta |
| T-2596 | Comités internos: nombre accesible del enlace | Ver comité {comité} | COM | Propuesta |
| T-2597 | Comités internos: buscador de los demás comités | Buscá entre los demás comités | COM | Propuesta |
| T-2598 | Comités internos: ejemplo del buscador | Nombre o sigla del comité | COM | Propuesta |
| T-2599 | Comités internos: sin otros comités activos | No hay otros comités activos para explorar. | COM | Propuesta |

## Podio de comités en GH Points

| Código | Dónde | Texto | Responsable | Estado |
| --- | --- | --- | --- | --- |
| T-2600 | Podio: título | El podio del semestre | GH | Propuesta |
| T-2601 | Podio: indicador principal | Participación ajustada · Define el puesto | GH | Propuesta |
| T-2602 | Podio: acción | Ver detalle | GH | Propuesta |
| T-2603 | Podio: acción accesible | Ver detalle de {comité}, puesto {puesto}, participación ajustada {porcentaje} | GH | Propuesta |
| T-2604 | Podio: puesto accesible | Puesto {n} | GH | Propuesta |
| T-2605 | Podio: empate | Puesto compartido | GH | Propuesta |
| T-2606 | Podio: detalle del comité | {comité} · Puesto {puesto} | GH | Propuesta |
| T-2607 | Podio: cerrar detalle | Cerrar detalle | GH | Propuesta |
| T-2608 | Podio: desglose | Participación sin ajustar · Efecto del ajuste · Participación ajustada · Actividades consideradas | GH | Propuesta |
| T-2609 | Podio: diferencia | {n} puntos porcentuales | GH | Propuesta |
| T-2610 | Podio: ayuda del detalle | Promedios del semestre. El ajuste acerca la participación de cada actividad al promedio de los comités e influye más en los grupos pequeños. | GH | Propuesta |
| T-2611 | Podio: lista inferior | Los demás puestos | GH | Propuesta |
| T-2612 | Podio: ayuda desplegable | Cómo se calcula el ranking | GH | Propuesta |
| T-2613 | Podio: explicación del cálculo | En cada actividad, se divide la asistencia aprobada entre los miembros elegibles del comité y se aplica el ajuste por tamaño. El ranking usa el promedio de esos porcentajes ajustados. | GH | Propuesta |
| T-2614 | Podio: actividades y empates | Cuentan las actividades cerradas que otorgan GH Points; todas pesan igual. Los comités con el mismo resultado del ranking comparten puesto. | GH | Propuesta |
| T-2615 | Reglas: etiqueta del parámetro de equivalencia | También cumplen este criterio | MATEO | Propuesta |
| T-2616 | Reglas: ayuda de la equivalencia | Otros tipos de grupo cuyo buen desempeño acredita este criterio. No aplica cuando el criterio está fijado a un código. | MATEO | Propuesta |
| T-2617 | Permanencia: grupo que cumple el criterio por equivalencia | Cuenta por tu {tipo} | GH | Propuesta |

## Comité inactivo (ADR-073)

| Código | Dónde | Texto | Fuente | Estado |
| --- | --- | --- | --- | --- |
| T-2618 | Asignar a un comité inactivo | {comité} está inactivo: ya no recibe integrantes. | MATEO | Propuesta |
| T-2619 | Roster: comité inactivo en la fila | {sigla} está inactivo: ya no recibe integrantes. Quitá esa sigla o pedí que la junta lo reactive. | MATEO | Propuesta |
| T-2620 | Push: Wordle del día (ADR-074) | ¿Qué más? El Wordle de hoy te espera · Cinco letras, seis intentos y hasta 6 GH Points. | GH | Propuesta |

## Biblioteca de juegos y 2048 (ADR-075)

| Código | Dónde | Texto | Fuente | Estado |
| --- | --- | --- | --- | --- |
| T-2621 | Juegos: título de la sección | Juegos | MATEO | Propuesta |
| T-2622 | Juegos: introducción | Despejá la cabeza un ratico y sumá GH Points mientras tanto. | MATEO | Propuesta |
| T-2623 | Juegos: estado de la tarjeta | Disponible hoy · Ya sumaste hoy · No disponible ahora | MATEO | Propuesta |
| T-2624 | Juegos: botón de la tarjeta | Jugar | MATEO | Propuesta |
| T-2625 | GH Points: enlace a la biblioteca | Ver todos los juegos | MATEO | Propuesta |
| T-2626 | Juegos: nombre del Wordle en la tarjeta | Wordle | MATEO | Propuesta |
| T-2627 | Juegos: de qué va el Wordle | Una palabra distinta para vos cada día. Cinco letras, seis intentos y hasta 6 GH Points. | MATEO | Propuesta |
| T-2628 | Juegos: nombre del 2048 en la tarjeta | 2048 | MATEO | Propuesta |
| T-2629 | Juegos: de qué va el 2048 | Juntá fichas iguales hasta armar el 2048. Jugá las veces que quieras; la primera partida del día es la que suma. | MATEO | Propuesta |
| T-2630 | 2048: título | 2048 | MATEO | Propuesta |
| T-2631 | 2048: introducción | Deslizá las fichas: dos iguales se juntan en una. Cuanto más alto el puntaje, más GH Points. | MATEO | Propuesta |
| T-2632 | 2048: cómo se juega | Movés todo el tablero de una vez, con las flechas, con los botones de abajo o deslizando el dedo. Dos fichas iguales que chocan se juntan y suman su valor. Después de cada movimiento aparece una ficha nueva. Se acaba cuando ya no queda ninguna jugada. | MATEO | Propuesta |
| T-2633 | 2048: empezar partida | Empezar una partida | MATEO | Propuesta |
| T-2634 | 2048: envío pendiente | Guardando tu partida… | MATEO | Propuesta |
| T-2635 | 2048: nombre accesible del tablero | Tablero de cuatro por cuatro | MATEO | Propuesta |
| T-2636 | 2048: celda vacía | Vacía | MATEO | Propuesta |
| T-2637 | 2048: ficha del tablero | Ficha {n} | MATEO | Propuesta |
| T-2638 | 2048: nombre accesible de los controles | Mover el tablero | MATEO | Propuesta |
| T-2639 | 2048: direcciones | Arriba · Abajo · Izquierda · Derecha | MATEO | Propuesta |
| T-2640 | 2048: puntaje de la partida | Puntaje: {puntaje} | MATEO | Propuesta |
| T-2641 | 2048: ficha más alta | Tu ficha más alta: {n} | MATEO | Propuesta |
| T-2642 | 2048: aviso de ficha nueva | Llegaste a la ficha {n}. | MATEO | Propuesta |
| T-2643 | 2048: aviso de umbral | Ya asegurás {n} GH Points con este puntaje. | MATEO | Propuesta |
| T-2644 | 2048: fin de la partida | No quedan jugadas. Hiciste {puntaje} puntos. | MATEO | Propuesta |
| T-2645 | 2048: tope de movimientos | Llegaste a los 4.000 movimientos y cerramos la partida ahí. Empezá otra cuando quieras. | MATEO | Propuesta |
| T-2646 | 2048: partida guardada | Tenés una partida a medias. ¿La seguís? | MATEO | Propuesta |
| T-2647 | 2048: retomar la partida guardada | Seguir la partida | MATEO | Propuesta |
| T-2648 | 2048: descartar la partida guardada | Empezar de cero | MATEO | Propuesta |
| T-2649 | 2048: título de premios | Tus puntos por puntaje | MATEO | Propuesta |
| T-2650 | 2048: escala de premios | Puntaje · GH Points | MATEO | Propuesta |
| T-2651 | 2048: premio acreditado | ¡Severo! Sumaste {n} GH Points. ¡OE OE OE! | MATEO | Propuesta |
| T-2652 | 2048: sin premio por puntaje bajo | Con este puntaje todavía no sumás. Hágale a otra partida: el crédito del día sigue libre. | MATEO | Propuesta |
| T-2653 | 2048: ya acreditaste hoy | Hoy ya sumaste tus GH Points del 2048. Podés seguir jugando por gusto y mañana vuelve a contar. | MATEO | Propuesta |
| T-2654 | Ledger: motivo del premio 2048 | 2048 del {fecha}: {puntaje} puntos | MATEO | Propuesta |
| T-2655 | 2048: partida vencida | Terminó el día de esta partida. No sumaste puntos; empezá una nueva. | MATEO | Propuesta |
| T-2656 | 2048: partida cerrada | Esa partida ya terminó. | MATEO | Propuesta |
| T-2657 | 2048 y Sudoku: día nuevo | Ya cambió el día en Colombia. Actualizá para que tu partida cuente. | MATEO | Propuesta |
| T-2658 | 2048: no hay semestre con puntos abiertos | El 2048 suma puntos mientras el semestre esté abierto. Volvé cuando arranque el próximo. | MATEO | Propuesta |
| T-2659 | 2048: no elegible | El 2048 es para miembros activos y honorarios. | MATEO | Propuesta |
| T-2660 | 2048: partida no encontrada o solicitud inválida | No pudimos recuperar esa partida. Empezá una nueva para seguir. | MATEO | Propuesta |
| T-2661 | 2048: partida ilegible | No pudimos reconstruir esa partida, así que no la guardamos. Empezá otra: el crédito del día sigue libre. | MATEO | Propuesta |
| T-2662 | 2048 y Sudoku: respuesta de red incierta | No recibimos la confirmación. Reintentá el mismo envío: si ya se guardó, no contará dos veces. | MATEO | Propuesta |
| T-2663 | 2048 y Sudoku: reintentar envío incierto | Reintentar envío | MATEO | Propuesta |
| T-2664 | 2048: mejor puntaje del semestre | Tu mejor puntaje del semestre: {puntaje} | MATEO | Propuesta |

## Biblioteca de iconos (ADR-076)

Nombres accesibles de los iconos que representan un valor sin texto visible al lado. No se ven en pantalla: los lee el lector de pantalla en lugar de los glifos `✓`, `×` y `↔` que había antes.

| Código | Dónde | Texto | Fuente | Estado |
| --- | --- | --- | --- | --- |
| T-2670 | Iconos: valor de sí o no en una celda o un resumen del admin | Sí · No | MATEO | Propuesta |
| T-2671 | Iconos: requisito cumplido o sin cumplir | Cumple · No cumple | MATEO | Propuesta |
| T-2672 | Iconos: pertenencia que llegó por transferencia | Llegó por transferencia | MATEO | Propuesta |
| T-2673 | Iconos: marcas de una trivia resuelta | Tu respuesta · Respuesta correcta | MATEO | Propuesta |
| T-2674 | Admin retos: quitar una opción de una pregunta (nombre accesible del botón con icono) | Quitar opción | MATEO | Propuesta |

## Sudoku (ADR-078)

Textos del Sudoku de la biblioteca de juegos ([ADR-078](adr/ADR-078-sudoku-con-solucion-en-el-servidor.md)). `T-085` y `T-667` se amplían al final en sus filas originales; `T-2657`, `T-2662` y `T-2663` se comparten con el 2048.

| Código | Dónde | Texto | Fuente | Estado |
| --- | --- | --- | --- | --- |
| T-2675 | Juegos: nombre del Sudoku en la tarjeta | Sudoku | MATEO | Propuesta |
| T-2676 | Juegos: de qué va el Sudoku | Completá la cuadrícula del 1 al 9 sin repetir. Vos elegís la dificultad; el primer tablero que resuelvas en el día es el que suma. | MATEO | Propuesta |
| T-2677 | Sudoku: título | Sudoku | MATEO | Propuesta |
| T-2678 | Sudoku: introducción | Llená cada fila, cada columna y cada caja con los números del 1 al 9, sin repetir ninguno. Cuanto más difícil el tablero, más GH Points. | MATEO | Propuesta |
| T-2679 | Sudoku: cómo se juega | Elegí una casilla y después un número, con el teclado de abajo o con el tuyo. Con el lápiz anotás candidatos sin comprometerte. Un número repetido en su fila, columna o caja se marca solo. Cada tablero tiene una sola solución y sale con pura lógica: nunca hace falta adivinar. | MATEO | Propuesta |
| T-2680 | Sudoku: leyenda del selector de dificultad | Dificultad | MATEO | Propuesta |
| T-2681 | Sudoku: dificultades | Fácil · Medio · Difícil | MATEO | Propuesta |
| T-2682 | Sudoku: leyenda del selector de modo | Modo | MATEO | Propuesta |
| T-2683 | Sudoku: modos | Sin ayudas · Con ayudas | MATEO | Propuesta |
| T-2684 | Sudoku: qué trae cada modo | Notas a lápiz y repetidos marcados. Paga el premio completo. · Además te marca los errores al instante y te da pistas. Paga la mitad. | MATEO | Propuesta |
| T-2685 | Sudoku: aviso antes de empezar | El primer Sudoku que resuelvas hoy es el que suma, sea cual sea. Elegí bien antes de empezar: después podés seguir jugando por gusto. | MATEO | Propuesta |
| T-2686 | Sudoku: premio de la combinación elegida | Este tablero paga {n} GH Points. | MATEO | Propuesta |
| T-2687 | Sudoku: empezar | Empezar el tablero | MATEO | Propuesta |
| T-2688 | Sudoku: tablero en camino | Armando tu tablero… | MATEO | Propuesta |
| T-2689 | Sudoku: título de premios | Tus puntos por dificultad | MATEO | Propuesta |
| T-2690 | Sudoku: encabezados de la tabla de premios | Dificultad · Sin ayudas · Con ayudas | MATEO | Propuesta |
| T-2691 | Sudoku: tablero a medias | Tenés un Sudoku a medias: {dificultad}, {modo}. ¿Lo seguís? | MATEO | Propuesta |
| T-2692 | Sudoku: retomar el tablero | Seguir el tablero | MATEO | Propuesta |
| T-2693 | Sudoku: abandonar el tablero | Abandonar el tablero | MATEO | Propuesta |
| T-2694 | Sudoku: confirmar el abandono | ¿Abandonás este tablero? Se pierde lo que llevás escrito. Abandonar no cuesta puntos. | MATEO | Propuesta |
| T-2695 | Sudoku: botones de la confirmación | Sí, abandonar · Seguir jugando | MATEO | Propuesta |
| T-2696 | Sudoku: nombre accesible de la grilla | Tablero de Sudoku de nueve por nueve | MATEO | Propuesta |
| T-2697 | Sudoku: nombre accesible de una casilla | Fila {fila}, columna {columna}: {contenido} | MATEO | Propuesta |
| T-2698 | Sudoku: estados de una casilla | vacía · fija · repetido · no va ahí · pista | MATEO | Propuesta |
| T-2699 | Sudoku: notas de una casilla | notas {notas} | MATEO | Propuesta |
| T-2700 | Sudoku: nombre accesible del teclado | Teclado numérico | MATEO | Propuesta |
| T-2701 | Sudoku: controles del teclado | Borrar · Lápiz · Deshacer · Pista | MATEO | Propuesta |
| T-2702 | Sudoku: casillas por llenar | Te faltan {n} casillas. | MATEO | Propuesta |
| T-2703 | Sudoku: aviso de número repetido | El {n} ya está en esa fila, columna o caja. | MATEO | Propuesta |
| T-2704 | Sudoku: aviso de error, con ayudas | El {n} no va en esa casilla. | MATEO | Propuesta |
| T-2705 | Sudoku: aviso de pista | Pista: en la fila {fila}, columna {columna} va un {n}. | MATEO | Propuesta |
| T-2706 | Sudoku: pista sin casilla vacía elegida | Elegí una casilla vacía para pedir la pista. | MATEO | Propuesta |
| T-2707 | Sudoku: envío pendiente | Revisando tu tablero… | MATEO | Propuesta |
| T-2708 | Sudoku: resuelto con premio | ¡Resuelto, parce! Sumaste {n} GH Points. ¡OE OE OE! | MATEO | Propuesta |
| T-2709 | Sudoku: resuelto sin premio | ¡Resuelto! Hoy ya habías sumado con el Sudoku, así que este fue por puro gusto. | MATEO | Propuesta |
| T-2710 | Sudoku: ya acreditaste hoy | Hoy ya sumaste tus GH Points del Sudoku. Podés seguir jugando por gusto y mañana vuelve a contar. | MATEO | Propuesta |
| T-2711 | Sudoku: jugar otro | Jugar otro tablero | MATEO | Propuesta |
| T-2712 | Ledger: motivo del premio del Sudoku, por modo | Sudoku del {fecha}: {dificultad}, sin ayudas · Sudoku del {fecha}: {dificultad}, con ayudas | MATEO | Propuesta |
| T-2713 | Sudoku: tablero vencido | Terminó el día de este tablero. No sumaste puntos; empezá uno nuevo. | MATEO | Propuesta |
| T-2714 | Sudoku: tablero cerrado | Ese tablero ya está cerrado. | MATEO | Propuesta |
| T-2715 | Sudoku: no hay semestre con puntos abiertos | El Sudoku suma puntos mientras el semestre esté abierto. Volvé cuando arranque el próximo. | MATEO | Propuesta |
| T-2716 | Sudoku: no elegible | El Sudoku es para miembros activos y honorarios. | MATEO | Propuesta |
| T-2717 | Sudoku: tablero no encontrado o solicitud inválida | No pudimos recuperar ese tablero. Empezá uno nuevo para seguir. | MATEO | Propuesta |
| T-2718 | Sudoku: cuadrícula que no es la solución | Ese tablero todavía no está resuelto. Revisá las casillas y volvé a intentarlo. | MATEO | Propuesta |
| T-2719 | Sudoku: ya hay otro tablero abierto | Ya tenés otro tablero abierto. Seguilo o abandonalo antes de empezar uno nuevo. | MATEO | Propuesta |
| T-2720 | Sudoku: resueltos del semestre | Resueltos este semestre | MATEO | Propuesta |

## Copy paisa (ADR-086)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-2721 | Página no encontrada (404); el primer punto separa el título del botón | Uy, esta página no existe. Volvé al inicio. | MATEO | Propuesta |

## Panal diario (ADR-088)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-2722 | Panal: Nombre | Panal | MATEO | Propuesta |
| T-2723 | Panal: Biblioteca | Encontrá palabras con siete letras y una central obligatoria. Un panal nuevo cada día. | MATEO | Propuesta |
| T-2724 | Panal: Introducción | Siete letras, muchas palabras. ¿Hasta dónde llegás hoy? | MATEO | Propuesta |
| T-2725 | Panal: Empezar | Jugar Panal | MATEO | Propuesta |
| T-2726 | Panal: Entrada | Tu palabra | MATEO | Propuesta |
| T-2727 | Panal: Acción | Enviar | MATEO | Propuesta |
| T-2728 | Panal: Acción | Borrar | MATEO | Propuesta |
| T-2729 | Panal: Acción | Mezclar letras | MATEO | Propuesta |
| T-2730 | Panal: Centro accesible | {letra}, letra central obligatoria | MATEO | Propuesta |
| T-2731 | Panal: Letras accesible | Letras del panal | MATEO | Propuesta |
| T-2732 | Panal: Puntaje | {n} puntos de juego | MATEO | Propuesta |
| T-2733 | Panal: Conteo | {n} de {total} palabras | MATEO | Propuesta |
| T-2734 | Panal: Palabras | Tus palabras | MATEO | Propuesta |
| T-2735 | Panal: Vacío | Tu primera palabra abre el panal. Usá siempre la letra del centro. | MATEO | Propuesta |
| T-2736 | Panal: Reglas | Cómo jugar | MATEO | Propuesta |
| T-2737 | Panal: Reglas lista | Formá palabras de al menos cuatro letras con las siete del panal. · Incluí siempre la letra del centro; podés repetir letras. · Las tildes y la diéresis son opcionales. La ñ es distinta de la n. · Se aceptan plurales y conjugaciones del diccionario del juego. · Cuatro letras dan 1 punto; desde cinco, un punto por letra. · Usar las siete letras en una palabra es un pangrama y suma 7 puntos extra. | MATEO | Propuesta |
| T-2738 | Panal: Premio | Llegá a Genio con {n} puntos de juego y ganá 6 GH Points. Un solo premio al día; después podés seguir buscando. | MATEO | Propuesta |
| T-2739 | Panal: Rangos | Principiante · Buen comienzo · En camino · Bien · Muy bien · Genial · Excelente · Brillante · Genio · Panal completo | MATEO | Propuesta |
| T-2740 | Panal: Meta | Te faltan {n} puntos para Genio | MATEO | Propuesta |
| T-2741 | Panal: Premio recibido | ¡Qué nota! Llegaste a Genio y sumaste 6 GH Points. ¡OE OE OE! | MATEO | Propuesta |
| T-2742 | Panal: Completado | ¡Encontraste todas las palabras! Volvé mañana por otro panal. ¡OE OE OE! | MATEO | Propuesta |
| T-2743 | Panal: Palabra aceptada | {palabra}: +{n} puntos | MATEO | Propuesta |
| T-2744 | Panal: Pangrama | ¡Pangrama! {palabra}: +{n} puntos | MATEO | Propuesta |
| T-2745 | Panal: Repetida | Ya encontraste esa palabra. Probá otra. | MATEO | Propuesta |
| T-2746 | Panal: Corta | Escribí al menos cuatro letras. | MATEO | Propuesta |
| T-2747 | Panal: Falta centro | Incluí la letra del centro. | MATEO | Propuesta |
| T-2748 | Panal: Letras ajenas | Usá solo las siete letras del panal. | MATEO | Propuesta |
| T-2749 | Panal: Desconocida | Esa palabra no está en el diccionario del juego. Probá otra. | MATEO | Propuesta |
| T-2750 | Panal: Envío | Guardando palabra… | MATEO | Propuesta |
| T-2751 | Panal: Red | No pudimos confirmar el envío. Reintentá la misma palabra; no se contará dos veces. | MATEO | Propuesta |
| T-2752 | Panal: Ledger | Panal del {fecha}: rango Genio | MATEO | Propuesta |
| T-2753 | Panal: Nuevo día | Ya hay un nuevo panal. Actualizá para jugar el de hoy. | MATEO | Propuesta |
| T-2754 | Panal: Actualizar | Actualizar panal | MATEO | Propuesta |
| T-2755 | Panal: No disponible | El panal no está disponible ahora. Actualizá para volver a intentarlo. | MATEO | Propuesta |
| T-2756 | Panal: Datos incorrectos | Escribí una palabra de hasta 32 letras, sin espacios ni signos. | MATEO | Propuesta |
| T-2757 | Panal: Reintento | Reintentar envío | MATEO | Propuesta |
| T-2758 | Panal: Palabra pangrama | {palabra}, pangrama | MATEO | Propuesta |
| T-2759 | Panal: Fecha | Panal del {fecha} | MATEO | Propuesta |
| T-2760 | Panal: Centro visible | La {letra} siempre va | MATEO | Propuesta |
| T-2761 | Panal: Completado biblioteca | Panal completo | MATEO | Propuesta |
| T-2762 | Panal: Rango | Rango: {rango} | MATEO | Propuesta |

## Panal: premios por avance desde el 24 de septiembre de 2026 (ADR-092)

| Código | Uso | Texto | Responsable | Estado |
|---|---|---|---|---|
| T-3000 | Panal: premios | Tus premios de hoy | MATEO | Aprobado |
| T-3001 | Panal: total acreditado | {n} de 6 GH Points | MATEO | Aprobado |
| T-3002 | Panal: meta de palabras | {n} palabras | MATEO | Aprobado |
| T-3003 | Panal: meta final | Genio | MATEO | Aprobado |
| T-3004 | Panal: importe por meta | +{n} GH Points | MATEO | Aprobado |
| T-3005 | Panal: meta acreditada | Guardado | MATEO | Aprobado |
| T-3006 | Panal: próxima meta | Próximo premio: {meta} · +{n} GH Points | MATEO | Aprobado |
| T-3007 | Panal: salir | Volver a Juegos | MATEO | Aprobado |
| T-3008 | Panal: guardado | Cada palabra y premio se guarda al instante. Podés salir y volver hoy cuando querás. | MATEO | Aprobado |
| T-3009 | Panal: anuncio de premio | ¡Sumaste {n} GH Points! | MATEO | Aprobado |
| T-3010 | Ledger: premio de Panal por avance | Panal del {fecha}: {meta} | MATEO | Aprobado |
| T-3011 | Panal: reglas de premios | Ganás 1 GH Point con 5 palabras, 2 más con 10 y 3 más al llegar a Genio ({n} puntos de juego). Hasta 6 GH Points al día; vos elegís hasta dónde llegar. | MATEO | Aprobado |
| T-3012 | Panal: recuperar premio pendiente | Guardar premios de este avance | MATEO | Aprobado |
| T-3013 | Panal: premio pendiente | Ya alcanzaste una meta. Guardá su premio para sumarlo a tus GH Points. | MATEO | Aprobado |
| T-3014 | Panal: introducción corta | Siete letras. Tres metas. Vos elegís hasta dónde llegar. | MATEO | Aprobado |

## The Games (ADR-089 a ADR-091 y ADR-094)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-2763 | The Games: Nombre | The Games | MATEO | Propuesta |
| T-2764 | The Games: No existe | Esa competencia no existe o no está a tu cargo. | MATEO | Propuesta |
| T-2765 | The Games: Sin permiso | No tenés permiso para operar esta competencia. | MATEO | Propuesta |
| T-2766 | The Games: Número repetido | Ya hay un equipo con el número {n}. | MATEO | Propuesta |
| T-2767 | The Games: Nombre repetido | Ya hay un equipo que se llama «{nombre}». | MATEO | Propuesta |
| T-2768 | The Games: Inscripción ajena | Esa inscripción no es del formulario de esta competencia o ya tiene equipo. | MATEO | Propuesta |
| T-2769 | The Games: Base repetida | Ya hay una base con ese nombre o ese orden en la jornada {dia}. | MATEO | Propuesta |
| T-2770 | The Games: Calendario incompleto | Para generar la jornada {dia} hacen falta un número impar de bases (3 o más), el doble de equipos activos y no más rotaciones que bases. Hoy hay {hayBases} bases y {hayEquipos} equipos; con {bases} bases hacen falta {equipos} equipos. | MATEO | Propuesta |
| T-2771 | The Games: Calendario existente | La jornada {dia} ya tiene rotaciones. Borralas antes de generarla otra vez. | MATEO | Propuesta |
| T-2772 | The Games: Calendario con resultados | La jornada {dia} ya tiene resultados: su calendario no se puede borrar. | MATEO | Propuesta |
| T-2773 | The Games: Rotación en curso | Ya hay una rotación en curso. Cerrala antes de iniciar otra. | MATEO | Propuesta |
| T-2774 | The Games: Rotación no en curso | Esa rotación no está en curso. | MATEO | Propuesta |
| T-2775 | The Games: Juez fuera de base | Solo podés registrar resultados de tu base, en la rotación en curso. | MATEO | Propuesta |
| T-2776 | The Games: Validador bloquea | El cambio deja el calendario con errores. Revisá los equipos y la base. | MATEO | Propuesta |
| T-2777 | The Games: Duración | La duración va de 1 a 240 minutos. | MATEO | Propuesta |
| T-2778 | The Games: Código incorrecto | El código del equipo no coincide. | MATEO | Propuesta |
| T-2779 | The Games: Código bloqueado | El código de este equipo quedó bloqueado por intentos fallidos. Probá otra vez a las {hora}. | MATEO | Propuesta |
| T-2780 | The Games: Sin código | Este equipo todavía no tiene código. Emitilo desde Equipos. | MATEO | Propuesta |
| T-2781 | The Games: Apuesta cerrada | Esta apuesta ya no recibe apuestas. | MATEO | Propuesta |
| T-2782 | The Games: Saldo insuficiente | Al equipo no le alcanzan los puntos: tiene {saldo}. | MATEO | Propuesta |
| T-2783 | The Games: Ya apostó | Este equipo ya apostó en esta apuesta. | MATEO | Propuesta |
| T-2784 | The Games: Opción inválida | Elegí uno de los equipos de la apuesta. | MATEO | Propuesta |
| T-2785 | The Games: Por sí mismo | Un equipo no puede apostar por sí mismo. | MATEO | Propuesta |
| T-2786 | The Games: Apuestas apagadas | Las apuestas están apagadas en esta competencia. | MATEO | Propuesta |
| T-2787 | The Games: Pocas opciones | Una apuesta necesita al menos dos equipos. | MATEO | Propuesta |
| T-2788 | The Games: Ganador fuera | El ganador tiene que ser uno de los equipos de la apuesta. | MATEO | Propuesta |
| T-2789 | The Games: Motivo | Escribí el motivo. | MATEO | Propuesta |
| T-2790 | The Games: Sin puntos iniciales | Definí los puntos iniciales de apuestas antes de repartirlos. | MATEO | Propuesta |
| T-2791 | The Games: Enfrentamiento con resultado | Ese enfrentamiento ya tiene resultado. Anulalo antes de cambiarlo. | MATEO | Propuesta |
| T-2792 | The Games: Estado de la apuesta | La apuesta no está en un estado que permita esto. | MATEO | Propuesta |
| T-2793 | The Games: Competencia cerrada | La competencia está cerrada: ya no se registran cambios. | MATEO | Propuesta |
| T-2794 | The Games: Libro corrección | Corrección del resultado | MATEO | Propuesta |
| T-2795 | The Games: Libro anulación | Resultado anulado | MATEO | Propuesta |
| T-2796 | The Games: Personal no miembro | Solo se asigna a miembros activos u honorarios de la OE. | MATEO | Propuesta |
| T-2797 | The Games: Personal repetido | Esa persona ya tiene ese rol. | MATEO | Propuesta |
| T-2798 | The Games: Dirección repetida | Ya hay una competencia con esa dirección. | MATEO | Propuesta |
| T-2799 | The Games: Descripción del panel | La competencia por equipos de Días EAFIT: equipos, bases, rotaciones, resultados y apuestas. Lo que se publica sale en dias.oeeafit.com/the-games. | MATEO | Propuesta |
| T-2800 | The Games: Sin competencias | Todavía no hay competencias. ADMIN crea la de la edición. | MATEO | Propuesta |
| T-2801 | The Games: Nueva competencia | Nueva competencia | MATEO | Propuesta |
| T-2802 | The Games: Campos de la competencia | Edición · Dirección (por ejemplo, the-games-2026) · Nombre · Es de ensayo | MATEO | Propuesta |
| T-2803 | The Games: Crear competencia | Crear competencia | MATEO | Propuesta |
| T-2804 | The Games: Estados | Borrador · En vivo · Terminada · Archivada | MATEO | Propuesta |
| T-2805 | The Games: Pestañas | Resumen · Equipos · Bases · Personal · Rotaciones · Resultados · Posiciones · Extras · Anuncios · Apuestas · Poderes · Seguimiento | MATEO | Propuesta |
| T-2806 | The Games: Campos de ajustes | Nombre · Fecha de la jornada 1 · Fecha de la jornada 2 · Formulario de inscripción · Apuestas activas · Puntos iniciales de apuestas · Un equipo puede apostar por sí mismo | MATEO | Propuesta |
| T-2807 | The Games: Guardar ajustes | Guardar ajustes | MATEO | Propuesta |
| T-2808 | The Games: Cambiar estado | Volver a borrador · Poner en vivo · Terminar · Archivar | MATEO | Propuesta |
| T-2809 | The Games: Ver vitrina | Ver la vitrina pública | MATEO | Propuesta |
| T-2810 | The Games: Resumen | Estado: {estado}. {equipos} equipos, {bases} bases y {rotaciones} rotaciones. | MATEO | Propuesta |
| T-2811 | The Games: Columnas de equipos | Número · Nombre · Color · Estado · Código | MATEO | Propuesta |
| T-2812 | The Games: Estados de equipo | Activo · Retirado | MATEO | Propuesta |
| T-2813 | The Games: Agregar equipo | Agregar equipo | MATEO | Propuesta |
| T-2814 | The Games: Inscripciones | Inscripciones sin equipo | MATEO | Propuesta |
| T-2815 | The Games: Crear desde inscripción | Crear equipo | MATEO | Propuesta |
| T-2816 | The Games: Sin formulario | Ligá el formulario de inscripción en Resumen para ver aquí las respuestas. | MATEO | Propuesta |
| T-2817 | The Games: Estado del código | Emitido · Sin código · Bloqueado | MATEO | Propuesta |
| T-2818 | The Games: Emitir códigos | Emitir los que faltan · Volver a emitir todos | MATEO | Propuesta |
| T-2819 | The Games: Aviso de códigos | Los códigos se muestran una sola vez. Imprimí las tarjetas antes de salir de esta pantalla; si se pierden, volvé a emitirlos. | MATEO | Propuesta |
| T-2820 | The Games: Tarjeta de código | Equipo {n} · {nombre} | MATEO | Propuesta |
| T-2821 | The Games: Imprimir tarjetas | Imprimir tarjetas | MATEO | Propuesta |
| T-2822 | The Games: Retirar equipo | Retirar · Reactivar | MATEO | Propuesta |
| T-2823 | The Games: Columnas de bases | Orden · Nombre · Tipo · Lugar | MATEO | Propuesta |
| T-2824 | The Games: Tipos de base | Normal · Inflable (macro) | MATEO | Propuesta |
| T-2825 | The Games: Jornada | Jornada {dia} | MATEO | Propuesta |
| T-2826 | The Games: Agregar base | Agregar base | MATEO | Propuesta |
| T-2827 | The Games: Roles del personal | Operador · Juez | MATEO | Propuesta |
| T-2828 | The Games: Asignar | Asignar | MATEO | Propuesta |
| T-2829 | The Games: Campos del personal | Persona · Rol · Base | MATEO | Propuesta |
| T-2830 | The Games: Quitar | Quitar | MATEO | Propuesta |
| T-2831 | The Games: Generar jornada | Generar la jornada {dia} | MATEO | Propuesta |
| T-2832 | The Games: Campos de generar | Rotaciones · Minutos por rotación | MATEO | Propuesta |
| T-2833 | The Games: Borrar calendario | Borrar el calendario de la jornada {dia} | MATEO | Propuesta |
| T-2834 | The Games: Estados de rotación | Pendiente · En curso · Cerrada | MATEO | Propuesta |
| T-2835 | The Games: Acciones de rotación | Iniciar · Cerrar · Reabrir · Avanzar a la siguiente | MATEO | Propuesta |
| T-2836 | The Games: Reloj | +1 min · +5 min · −1 min | MATEO | Propuesta |
| T-2837 | The Games: Rotación | Rotación {n} · jornada {dia} | MATEO | Propuesta |
| T-2838 | The Games: Avance de rotación | {resultados} de {enfrentamientos} resultados | MATEO | Propuesta |
| T-2839 | The Games: Editar enfrentamientos | Editar enfrentamientos | MATEO | Propuesta |
| T-2840 | The Games: Validador | Errores · Advertencias | MATEO | Propuesta |
| T-2841 | The Games: Tipos de problema | Un equipo juega contra sí mismo · Un equipo aparece dos veces en la rotación · Una base se usa dos veces en la rotación · Una base es de otra jornada · Equipo desconocido · Equipo retirado · Cruce repetido · Un equipo repite base en la jornada · Un equipo no juega en la rotación | MATEO | Propuesta |
| T-2842 | The Games: Confirmar advertencias | Guardar aunque haya advertencias | MATEO | Propuesta |
| T-2843 | The Games: Calendario limpio | El calendario no tiene errores. | MATEO | Propuesta |
| T-2844 | The Games: Mapa de cruces | Cruces por equipo | MATEO | Propuesta |
| T-2845 | The Games: Mesa de control | Mesa de control | MATEO | Propuesta |
| T-2846 | The Games: Ganó | Ganó {equipo} | MATEO | Propuesta |
| T-2847 | The Games: Empate | Empate | MATEO | Propuesta |
| T-2848 | The Games: Anular | Anular | MATEO | Propuesta |
| T-2849 | The Games: Pendientes | Pendientes de rotaciones cerradas | MATEO | Propuesta |
| T-2850 | The Games: Sin rotación | No hay una rotación en curso. | MATEO | Propuesta |
| T-2851 | The Games: Alcances | General · Jornada 1 · Jornada 2 | MATEO | Propuesta |
| T-2852 | The Games: Columnas de posiciones | Puesto · Equipo · Puntos · Jugados · Ganados · Empatados · Perdidos | MATEO | Propuesta |
| T-2853 | The Games: Descargar CSV | Descargar CSV | MATEO | Propuesta |
| T-2854 | The Games: Nueva extra | Nueva competencia extra | MATEO | Propuesta |
| T-2855 | The Games: Campos de extra | Nombre · Jornada | MATEO | Propuesta |
| T-2856 | The Games: Total del equipo | Total del equipo | MATEO | Propuesta |
| T-2857 | The Games: Ajuste manual | Ajuste manual | MATEO | Propuesta |
| T-2858 | The Games: Campos de ajuste | Equipo · Jornada · Puntos · Motivo | MATEO | Propuesta |
| T-2859 | The Games: Libro de puntos | Libro de puntos | MATEO | Propuesta |
| T-2860 | The Games: Niveles de anuncio | Información · Aviso · Urgente | MATEO | Propuesta |
| T-2861 | The Games: Publicar anuncio | Publicar anuncio | MATEO | Propuesta |
| T-2862 | The Games: Mostrar anuncio | Ocultar · Mostrar | MATEO | Propuesta |
| T-2863 | The Games: Apuestas apagadas aviso | Las apuestas están apagadas. Activalas en Resumen. | MATEO | Propuesta |
| T-2864 | The Games: Repartir puntos iniciales | Repartir {n} puntos iniciales | MATEO | Propuesta |
| T-2865 | The Games: Nueva apuesta | Nueva apuesta | MATEO | Propuesta |
| T-2866 | The Games: Campos de apuesta | Título · Equipos · Cierra a las | MATEO | Propuesta |
| T-2867 | The Games: Estados de apuesta | Borrador · Abierta · Cerrada · Resuelta · Cancelada | MATEO | Propuesta |
| T-2868 | The Games: Acciones de apuesta | Abrir · Cerrar · Cancelar | MATEO | Propuesta |
| T-2869 | The Games: Declarar ganador | Declarar ganador | MATEO | Propuesta |
| T-2870 | The Games: Registrar apuesta | Registrar apuesta | MATEO | Propuesta |
| T-2871 | The Games: Campos de registrar | Equipo que apuesta · Código del equipo · Por quién apuesta · Puntos | MATEO | Propuesta |
| T-2872 | The Games: Saldos | Saldos | MATEO | Propuesta |
| T-2873 | The Games: Bolsa | Bolsa: {n} puntos | MATEO | Propuesta |
| T-2874 | The Games: Apuesta registrada | Apuesta registrada. Al equipo le quedan {saldo} puntos. | MATEO | Propuesta |
| T-2875 | The Games: Tu base | Tu base | MATEO | Propuesta |
| T-2876 | The Games: Sin base | No tenés una base asignada en esta competencia. | MATEO | Propuesta |
| T-2877 | The Games: Esperando | Esperando la próxima rotación. | MATEO | Propuesta |
| T-2878 | The Games: Siguiente | Después: {a} contra {b} | MATEO | Propuesta |
| T-2879 | The Games: Resultado guardado | Resultado guardado: {resultado} | MATEO | Propuesta |
| T-2880 | The Games: Se actualiza | Se actualiza sola cada pocos segundos. | MATEO | Propuesta |
| T-2881 | The Games: Reloj de la rotación | Quedan · Tiempo cumplido | MATEO | Propuesta |
| T-2882 | The Games: Pantalla del juez | Pantalla del juez | MATEO | Propuesta |
| T-2883 | The Games: Contra | {a} contra {b} | MATEO | Propuesta |
| T-2884 | The Games: Intercambiar bases | Intercambiar las bases de dos enfrentamientos | MATEO | Propuesta |
| T-2885 | The Games: Cambiar enfrentamiento | Cambiar un enfrentamiento | MATEO | Propuesta |
| T-2886 | The Games: Campos de edición | Enfrentamiento · Otro enfrentamiento · Base · Equipo A · Equipo B | MATEO | Propuesta |
| T-2887 | The Games: Sin personal | Todavía no hay personal asignado. | MATEO | Propuesta |
| T-2888 | The Games: Sin equipos | Todavía no hay equipos. | MATEO | Propuesta |
| T-2889 | The Games: Sin bases | Todavía no hay bases en esta jornada. | MATEO | Propuesta |
| T-2890 | The Games: Sin apuestas | Todavía no hay apuestas. | MATEO | Propuesta |
| T-2891 | The Games: Sin anuncios | Todavía no hay anuncios. | MATEO | Propuesta |
| T-2892 | The Games: Ensayo | Ensayo | MATEO | Propuesta |
| T-2893 | The Games: Sin construcción | No hay un calendario automático para {bases} bases en la jornada {dia}. Con 15 bases sí lo hay; con otro número, consultá antes de generar. | MATEO | Propuesta |
| T-2894 | The Games: Tipos de extra | Puntos directos · Rúbrica de The Challenge (5 criterios, total × 10) | MATEO | Propuesta |
| T-2895 | The Games: Niveles de la rúbrica | Excelente · Bueno · Regular · Por mejorar | MATEO | Propuesta |
| T-2896 | The Games: Resumen de la rúbrica | Total {total} de 100 · {nivel} · {puntos} puntos | MATEO | Propuesta |
| T-2897 | The Games: Rúbrica sin calificar | Sin calificar | MATEO | Propuesta |
| T-2898 | The Games: Nota fuera de rango | Cada criterio va del 1 al 10, y hacen falta todos. | MATEO | Propuesta |
| T-2899 | The Games: Extra con rúbrica | Esta competencia se califica con la rúbrica. | MATEO | Propuesta |
| T-2900 | The Games: Tipo de extra | Tipo | MATEO | Propuesta |
| T-2901 | The Games: Criterio con peso | {criterio} ({peso} %) | MATEO | Propuesta |
| T-2902 | The Games: Importar jornada | Importar la jornada {dia} desde la hoja | MATEO | Propuesta |
| T-2903 | The Games: Ayuda de importar | Copiá de la hoja de cálculo las columnas Equipo, Rotación, Base y Rival, con o sin encabezado, y pegalas acá. Va una fila por equipo y rotación, y las rotaciones conservan el número de la hoja. Si la competencia no tiene equipos, se crean en el orden de la hoja; si ya tiene, los nombres tienen que coincidir. Si la jornada no tiene bases, se crean con el número que trae la hoja: «Base 1», «Base 16», etc. | MATEO | Propuesta |
| T-2904 | The Games: Campos de importar | Hoja pegada · Minutos por rotación | MATEO | Propuesta |
| T-2905 | The Games: Botón importar | Importar la jornada {dia} | MATEO | Propuesta |
| T-2906 | The Games: Importando | Importando… | MATEO | Propuesta |
| T-2907 | The Games: Importar con advertencias | Importar aunque haya advertencias | MATEO | Propuesta |
| T-2908 | The Games: Jornada importada | Listo: la jornada {dia} quedó con {rotaciones} rotaciones y {enfrentamientos} enfrentamientos. Equipos nuevos: {equipos}. Bases nuevas: {bases}. | MATEO | Propuesta |
| T-2909 | The Games: Hoja sin columnas | Línea {linea}: faltan columnas. Van Equipo, Rotación, Base y Rival. | MATEO | Propuesta |
| T-2910 | The Games: Hoja con rotación inválida | Línea {linea}: la rotación tiene que ser un número del 1 al 99. | MATEO | Propuesta |
| T-2911 | The Games: Hoja con base inválida | Línea {linea}: la base tiene que ser un número del 1 al 99, como 3 o «Base 3». | MATEO | Propuesta |
| T-2912 | The Games: Hoja con equipo contra sí mismo | Línea {linea}: {equipo} juega contra sí mismo. | MATEO | Propuesta |
| T-2913 | The Games: Hoja con equipo dos veces | Línea {linea}: {equipo} ya tiene otro enfrentamiento en la rotación {n}. | MATEO | Propuesta |
| T-2914 | The Games: Hoja con base dos veces | Línea {linea}: la base {base} ya tiene otro enfrentamiento en la rotación {n}. | MATEO | Propuesta |
| T-2915 | The Games: Hoja con rotación faltante | Falta la rotación {n}: las rotaciones van seguidas, sin saltos. | MATEO | Propuesta |
| T-2916 | The Games: Hoja vacía | La hoja pegada no tiene filas. | MATEO | Propuesta |
| T-2917 | The Games: Hoja con equipo desconocido | No hay un equipo llamado «{nombre}» en esta competencia. | MATEO | Propuesta |
| T-2918 | The Games: Hoja con base desconocida | La jornada {dia} no tiene base {base}. | MATEO | Propuesta |
| T-2919 | The Games: Hoja con demasiados equipos | La hoja tiene {equipos} equipos; el máximo es 99. | MATEO | Propuesta |
| T-2920 | The Games: Base importada | Base {n} | MATEO | Propuesta |
| T-2921 | The Games: Jornada ya cargada | La jornada {dia} ya tiene rotaciones. Borralas antes de importarla. | MATEO | Propuesta |
| T-2922 | The Games: Más problemas | Y {n} más. | MATEO | Propuesta |
| T-2923 | The Games: Hoja muy larga | La hoja pegada es demasiado larga. Pegá solo las cuatro columnas de una jornada. | MATEO | Propuesta |
| T-2924 | The Games: Importación bloqueada | No se importó nada. Corregí la hoja y volvé a importarla. | MATEO | Propuesta |
| T-2925 | The Games: Importación con advertencias | La hoja no tiene errores, pero sí advertencias. Revisalas y, si están bien, confirmá para importarla. | MATEO | Propuesta |

## Capitanes de The Games (ADR-095)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-3015 | The Games: Columna de capitanes | Capitanes | MATEO | Propuesta |
| T-3016 | The Games: Ayuda de capitanes | Copiá de la hoja de la OE tres columnas, Equipo, Nombre y Celular, con o sin encabezado, y pegalas acá. El equipo va por su número («Equipo 7» o «7») o por su nombre. Una fila con más columnas se rechaza: no pegués la fila completa, que trae la cédula y datos de salud. Cada carga reemplaza a todos los capitanes. | MATEO | Propuesta |
| T-3017 | The Games: Cargar capitanes | Cargar los capitanes desde la hoja | MATEO | Propuesta |
| T-3018 | The Games: Campo de capitanes | Tres columnas pegadas | MATEO | Propuesta |
| T-3019 | The Games: Botón de capitanes | Cargar capitanes | MATEO | Propuesta |
| T-3020 | The Games: Cargando capitanes | Cargando… | MATEO | Propuesta |
| T-3021 | The Games: Capitanes cargados | Listo: quedaron {capitanes} capitanes en {equipos} equipos. | MATEO | Propuesta |
| T-3022 | The Games: Capitanes sin columnas | Línea {linea}: faltan columnas. Van Equipo, Nombre y Celular. | MATEO | Propuesta |
| T-3023 | The Games: Capitanes con columnas de más | Línea {linea}: sobran columnas. Pegá solo Equipo, Nombre y Celular, no la fila completa de la hoja. | MATEO | Propuesta |
| T-3024 | The Games: Capitán sin equipo | Línea {linea}: no hay un equipo «{equipo}» en esta competencia. | MATEO | Propuesta |
| T-3025 | The Games: Nombre de capitán largo | Línea {linea}: el nombre pasa de 80 caracteres. | MATEO | Propuesta |
| T-3026 | The Games: Celular inválido | Línea {linea}: el celular no tiene 10 dígitos. | MATEO | Propuesta |
| T-3027 | The Games: Demasiados capitanes | Línea {linea}: el equipo {equipo} ya tiene dos capitanes. | MATEO | Propuesta |
| T-3028 | The Games: Resumen de capitanes | Hay {capitanes} capitanes cargados en {equipos} equipos. | MATEO | Propuesta |
| T-3029 | The Games: Hoja de capitanes muy larga | La hoja pegada es demasiado larga. Pegá solo las tres columnas de los capitanes. | MATEO | Propuesta |
| T-3030 | The Games: Vitrina de capitanes | La vitrina muestra los nombres de los capitanes; el celular nunca. · La vitrina no muestra los capitanes. | MATEO | Propuesta |
| T-3031 | The Games: Publicar capitanes | Mostrar los nombres en la vitrina · Dejar de mostrarlos | MATEO | Propuesta |
| T-3032 | The Games: Borrar capitanes | Borrar los capitanes | MATEO | Propuesta |
| T-3033 | The Games: Capitanes solo ADMIN | Solo ADMIN carga, publica o borra los capitanes. | MATEO | Propuesta |
| T-3034 | The Games: Ayuda de la vitrina de capitanes | Prendela solo con la autorización de la inscripción confirmada. Archivar la competencia borra los capitanes. | MATEO | Propuesta |
| T-3035 | The Games: Llamar al capitán | Llamar a {nombre} | MATEO | Propuesta |

## Hub de capitanes de The Games (ADR-096)

La página es de DÍAS (D-039 de `dias`); aquí van los mensajes que devuelve la API de la casa.

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-3036 | Hub de capitanes: código que no corresponde | Ese código no corresponde a ningún equipo en competencia. Revisalo en la tarjeta. | MATEO | Propuesta |
| T-3037 | Hub de capitanes: demasiados intentos | Hubo demasiados intentos desde esta conexión. Esperá 15 minutos o pedile al operador que registre la apuesta. | MATEO | Propuesta |
| T-3038 | Hub de capitanes: sesión vencida | Tu sesión venció o el código de tu equipo cambió. Escribí el código otra vez. | MATEO | Propuesta |
| T-3039 | The Games: dirección del hub en la tarjeta | Apostá en {direccion} | MATEO | Propuesta |

## Poderes de The Games (ADR-098)

Los textos del reparto, la pantalla del líder de base y el panel de Poderes. Los nombres y las descripciones de las tarjetas también los usa DÍAS (D-041 de `dias`), con su propia copia.

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-3040 | The Games: Nombres de los poderes | Cambio de resultados · Multiplicador x2 · Cancelar poder · El adversario empieza 1 min tarde · Un jugador menos | MATEO | Propuesta |
| T-3041 | The Games: Cambio de resultados | Invierte el resultado de la base: si perdés, ganás; si ganás, perdés. Si empatás, ganás. | MATEO | Propuesta |
| T-3042 | The Games: Multiplicador x2 | Duplica tus puntos en la base: 2.000 si ganás y 1.000 si empatás. Si perdés, no suma. | MATEO | Propuesta |
| T-3043 | The Games: Cancelar poder | Anula el poder que use el rival en esta base. Si el rival no usa ninguno, la tarjeta se gasta sin efecto. | MATEO | Propuesta |
| T-3044 | The Games: El adversario empieza 1 min tarde | El equipo rival empieza la base un minuto después. | MATEO | Propuesta |
| T-3045 | The Games: Un jugador menos | El rival juega toda la base con una persona menos. | MATEO | Propuesta |
| T-3046 | The Games: Estados de una tarjeta | Por entregar · Entregada · Usada · No se usó · Anulada | MATEO | Propuesta |
| T-3047 | The Games: Efectos de un poder | Tuvo efecto · Lo anuló un Cancelar poder · Sin efecto · Se anuló con el del rival | MATEO | Propuesta |
| T-3048 | The Games: Jornadas | Jueves · Viernes | MATEO | Propuesta |
| T-3049 | The Games: Poderes en inflables | En las bases inflables no se usan poderes. | MATEO | Propuesta |
| T-3050 | The Games: Poderes cerrados | Los poderes de esta base ya están cerrados. | MATEO | Propuesta |
| T-3051 | The Games: Poder fuera de la rotación | Los poderes se registran con la rotación en curso. | MATEO | Propuesta |
| T-3052 | The Games: Un poder por base | {equipo} ya usó {poder} en esta base: va una tarjeta por equipo en cada base. | MATEO | Propuesta |
| T-3053 | The Games: Tarjeta sin entregar | {equipo} no tiene esa tarjeta entregada para hoy. Si la tiene en la mano, pedile a la operación que registre la entrega. | MATEO | Propuesta |
| T-3054 | The Games: Poder de equipo retirado | Ese equipo está retirado de la competencia. | MATEO | Propuesta |
| T-3055 | The Games: Anular tarjeta usada | Esa tarjeta ya se usó: primero revertí el uso. | MATEO | Propuesta |
| T-3056 | The Games: Quitar con los poderes cerrados | Con los poderes cerrados, solo la operación quita un poder. | MATEO | Propuesta |
| T-3057 | The Games: Motivo del poder | Escribí el motivo, de 2 a 200 caracteres. | MATEO | Propuesta |
| T-3058 | The Games: Rotación con poderes | Esta rotación tiene poderes registrados o confirmados: ya no se puede editar. | MATEO | Propuesta |
| T-3059 | The Games: Base con poderes a inflable | Esta base tiene poderes registrados: no puede pasar a inflable. | MATEO | Propuesta |
| T-3060 | The Games: Confirmar fuera de la rotación | Los poderes solo se confirman con la rotación en curso. | MATEO | Propuesta |
| T-3061 | The Games: Libro con poderes | Con poderes: {poderes} | MATEO | Propuesta |
| T-3062 | The Games: Libro poder revertido | Poder revertido: {motivo} | MATEO | Propuesta |
| T-3063 | The Games: Poder quitado antes de confirmar | Quitado antes de confirmar | MATEO | Propuesta |
| T-3064 | The Games: Pegar el reparto | Cargar el reparto de poderes desde la hoja | MATEO | Propuesta |
| T-3065 | The Games: Ayuda del reparto | Pegá tres columnas, Equipo, Poder y Jornada, con o sin encabezado. El equipo va por su número o su nombre; el poder, por el nombre de la tarjeta («Multiplicador x2», «Cambio de resultados», «Cancelar poder», «1 min tarde» o «Un jugador menos»); la jornada, «jueves» o «viernes». Cada equipo lleva 5 tarjetas, 2 un día y 3 el otro, y se pueden repetir. Entra todo o nada, y las tarjetas quedan por entregar. | MATEO | Propuesta |
| T-3066 | The Games: Campo del reparto | Reparto (Equipo, Poder, Jornada) | MATEO | Propuesta |
| T-3067 | The Games: Botón del reparto | Cargar el reparto | MATEO | Propuesta |
| T-3068 | The Games: Reparto cargado | Listo: se asignaron {tarjetas} tarjetas a {equipos} equipos. Falta marcarlas entregadas. | MATEO | Propuesta |
| T-3069 | The Games: Reparto sin columnas | Línea {linea}: faltan columnas. Van Equipo, Poder y Jornada. | MATEO | Propuesta |
| T-3070 | The Games: Reparto con columnas de más | Línea {linea}: sobran columnas. Pegá solo Equipo, Poder y Jornada. | MATEO | Propuesta |
| T-3071 | The Games: Reparto con poder desconocido | Línea {linea}: «{poder}» no es un poder. Van Cambio de resultados, Multiplicador x2, Cancelar poder, 1 min tarde o Un jugador menos. | MATEO | Propuesta |
| T-3072 | The Games: Reparto con jornada inválida | Línea {linea}: «{dia}» no es una jornada. Va «jueves» o «viernes». | MATEO | Propuesta |
| T-3073 | The Games: Reparto de más de 5 | {equipo} pasaría de 5 tarjetas. | MATEO | Propuesta |
| T-3074 | The Games: Reparto de más de 3 en un día | {equipo} pasaría de 3 tarjetas el {dia}. | MATEO | Propuesta |
| T-3075 | The Games: Reparto muy largo | El reparto pegado es demasiado largo. Pegá solo las tres columnas. | MATEO | Propuesta |
| T-3076 | The Games: Sección de reparto | Reparto y entregas | MATEO | Propuesta |
| T-3077 | The Games: Resumen del reparto | {entregadas} de {total} tarjetas entregadas · {completos} de {equipos} equipos con el reparto completo | MATEO | Propuesta |
| T-3078 | The Games: Columnas del reparto | Equipo · Jueves · Viernes · Entregadas | MATEO | Propuesta |
| T-3079 | The Games: Entregar las de un equipo | Entregar las del {dia} | MATEO | Propuesta |
| T-3080 | The Games: Entregar las de todos | Entregar todas las del {dia} | MATEO | Propuesta |
| T-3081 | The Games: Anular tarjeta | Anular | MATEO | Propuesta |
| T-3082 | The Games: Motivo | Motivo | MATEO | Propuesta |
| T-3083 | The Games: Agregar tarjeta | Agregar una tarjeta | MATEO | Propuesta |
| T-3084 | The Games: Agregar entregada | Ya está entregada | MATEO | Propuesta |
| T-3085 | The Games: Botón agregar tarjeta | Agregar | MATEO | Propuesta |
| T-3086 | The Games: Reparto de un equipo | Reparto completo · Reparto incompleto | MATEO | Propuesta |
| T-3087 | The Games: Sección de usos | Poderes registrados | MATEO | Propuesta |
| T-3088 | The Games: Columnas de usos | Rotación · Base · Equipo · Poder · Recibida · Efecto | MATEO | Propuesta |
| T-3089 | The Games: Revertir poder | Revertir | MATEO | Propuesta |
| T-3090 | The Games: Ayuda de revertir | Revertir anula el uso de la tarjeta. Si la base ya tiene resultado, se vuelve a calcular con reversiones en el libro. | MATEO | Propuesta |
| T-3091 | The Games: Uso revertido | Revertido: {motivo} | MATEO | Propuesta |
| T-3092 | The Games: Título de reglas | Reglas de los poderes (versión {version}, confirmadas el {fecha}) | MATEO | Propuesta |
| T-3093 | The Games: Reglas de los poderes | Cada equipo recibe 5 tarjetas, 2/3 o 3/2 entre jueves y viernes, y los tipos se pueden repetir. · Una tarjeta se usa una vez y solo en su jornada. · Solo en bases normales, nunca en las inflables. · Una tarjeta por equipo en cada base, entregada al líder antes de empezar. · x2 duplica los puntos de quien lo usa: 2.000 si gana, 1.000 si empata y 0 si pierde. · Cambio de resultados invierte el enfrentamiento; en un empate gana quien lo usó, y dos Cambios se anulan. · Cancelar poder anula el poder del rival en esa base; sin poder del rival se gasta sin efecto, y dos Cancelar se anulan. · 1 min tarde y Un jugador menos no tocan los puntos. · Se resuelven en este orden: Cancelar, Cambio y x2. | MATEO | Propuesta |
| T-3094 | The Games: Sin reparto | Todavía no hay reparto. Pegalo arriba. | MATEO | Propuesta |
| T-3095 | The Games: Sin poderes registrados | Todavía no se registró ningún poder. | MATEO | Propuesta |
| T-3096 | The Games: Poderes del juez | Poderes | MATEO | Propuesta |
| T-3097 | The Games: Sin tarjetas para hoy | Sin tarjetas entregadas para hoy. | MATEO | Propuesta |
| T-3098 | The Games: Tipo con cantidad | {poder} · {n} | MATEO | Propuesta |
| T-3099 | The Games: Confirmar tarjeta | ¿Recibiste la tarjeta «{poder}» de {equipo}? | MATEO | Propuesta |
| T-3100 | The Games: Ayuda de confirmar tarjeta | Registrala solo con la tarjeta física en la mano. Después de confirmar los poderes ya no se puede. | MATEO | Propuesta |
| T-3101 | The Games: Sí, la recibí | Sí, la recibí | MATEO | Propuesta |
| T-3102 | The Games: Tarjeta recibida | Recibida a las {hora} | MATEO | Propuesta |
| T-3103 | The Games: Quitar poder | Quitar | MATEO | Propuesta |
| T-3104 | The Games: Confirmar poderes | Confirmar poderes | MATEO | Propuesta |
| T-3105 | The Games: Aviso de confirmar poderes | ¿Seguro? Después de confirmar no se pueden agregar ni quitar poderes en esta base. Si hay un error, llamá a la operación. | MATEO | Propuesta |
| T-3106 | The Games: Sí, confirmar los poderes | Sí, confirmar los poderes | MATEO | Propuesta |
| T-3107 | The Games: Poderes confirmados a las | Poderes confirmados a las {hora} | MATEO | Propuesta |
| T-3108 | The Games: Cuenta del minuto | {equipo} empieza en | MATEO | Propuesta |
| T-3109 | The Games: Fin del minuto | {equipo} ya puede empezar | MATEO | Propuesta |
| T-3110 | The Games: Un jugador menos en la base | {equipo} juega toda la base con una persona menos. | MATEO | Propuesta |
| T-3111 | The Games: Vista previa oficial | Oficial: {resultado} · {puntosA} a {puntosB} | MATEO | Propuesta |
| T-3112 | The Games: Resultado con poderes | En la cancha: {cancha} · Oficial: {oficial} | MATEO | Propuesta |
| T-3113 | The Games: Puntos con x2 | {equipo}: {total} ({base} + {bono} del x2) | MATEO | Propuesta |
| T-3114 | The Games: Puntos | {equipo}: {total} | MATEO | Propuesta |
| T-3115 | The Games: Poder registrado | Poder registrado: {poder} de {equipo}. | MATEO | Propuesta |
| T-3116 | The Games: Poder quitado | Poder quitado. | MATEO | Propuesta |
| T-3117 | The Games: Poderes confirmados | Poderes confirmados. | MATEO | Propuesta |
| T-3118 | The Games: Poder de un equipo | {poder} de {equipo} | MATEO | Propuesta |
| T-3119 | The Games: Campos de agregar tarjeta | Equipo · Poder · Jornada | MATEO | Propuesta |

## Instrucciones del hub de capitanes (ADR-099)

El texto de las instrucciones vive en DÍAS (D-042 de `dias`); aquí van el mensaje de la API y lo que ve la operación.

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-3120 | Hub de capitanes: instrucciones sin aceptar | Antes de entrar, leé y aceptá las instrucciones del hub. | MATEO | Propuesta |
| T-3121 | The Games: Columna de instrucciones | Instrucciones | MATEO | Propuesta |
| T-3122 | The Games: Instrucciones aceptadas | Versión {version} · {fecha} | MATEO | Propuesta |
| T-3123 | The Games: Instrucciones sin aceptar | Sin aceptar | MATEO | Propuesta |

## Personal de The Games desde la hoja del GAP (ADR-101)

La carga del personal por jornada, la vista por base de Personal y el equipo de la base en la pantalla del líder. Donde dice `{dia}` va el día en minúscula («jueves» o «viernes»).

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-3124 | The Games: Cargar el personal | Cargar el personal desde la hoja del GAP | MATEO | Propuesta |
| T-3125 | The Games: Ayuda del personal | Elegí la jornada y pegá las columnas A a C de la hoja del GAP: Persona, Base y Función, con o sin encabezado. La base va en la fila del líder y vale para las filas de abajo. Si un nombre no aparece, escribilo como está en la casa o poné su correo institucional. El calificador, los veedores y el VAR pueden estar en licencia; el líder no, porque es quien registra. Guardar reemplaza a los líderes y al apoyo de esa jornada; los operadores no cambian. | MATEO | Propuesta |
| T-3126 | The Games: Campo del personal | Columnas A a C pegadas | MATEO | Propuesta |
| T-3127 | The Games: Campo de jornada | Jornada | MATEO | Propuesta |
| T-3128 | The Games: Revisar el personal | Revisar | MATEO | Propuesta |
| T-3129 | The Games: Guardar el personal | Guardar el personal del {dia} | MATEO | Propuesta |
| T-3130 | The Games: Totales del personal | {bases} bases · {lideres} líderes · {calificadores} calificadores · {veedores} veedores · {var} VAR | MATEO | Propuesta |
| T-3131 | The Games: Cambios del personal | Entran {entran} · Salen {salen} · Siguen {siguen} | MATEO | Propuesta |
| T-3132 | The Games: Nombres parciales | Revisá estos nombres: la hoja no los trae completos. | MATEO | Propuesta |
| T-3133 | The Games: Nombre parcial | Línea {linea}: «{hoja}» es {nombre}. | MATEO | Propuesta |
| T-3134 | The Games: Salen del personal | Salen de esta jornada | MATEO | Propuesta |
| T-3135 | The Games: Líder de una base en juego | {base} está en juego: {nombre} deja de registrar ahí. | MATEO | Propuesta |
| T-3136 | The Games: Base sin líder | {base} queda sin líder: ahí registra solo la operación. | MATEO | Propuesta |
| T-3137 | The Games: Base con varios líderes | {base} queda con {n} líderes. | MATEO | Propuesta |
| T-3138 | The Games: Revisión vencida | Algo cambió desde que revisaste. Mirá la revisión nueva y guardá otra vez. | MATEO | Propuesta |
| T-3139 | The Games: Personal cargado | Listo: el {dia} quedaron {lideres} líderes y {apoyo} personas de apoyo en {bases} bases. | MATEO | Propuesta |
| T-3140 | The Games: Personal sin cambios | Esa jornada ya tiene este personal: no cambió nada. | MATEO | Propuesta |
| T-3141 | The Games: Personal sin columnas | Línea {linea}: faltan columnas. Van Persona, Base y Función. | MATEO | Propuesta |
| T-3142 | The Games: Personal con columnas de más | Línea {linea}: sobran columnas. Pegá solo las columnas A a C. | MATEO | Propuesta |
| T-3143 | The Games: Personal sin base | Línea {linea}: falta la base. Va en la fila del líder, arriba de su equipo. | MATEO | Propuesta |
| T-3144 | The Games: Base que no existe | Línea {linea}: el {dia} no tiene la base {base}. | MATEO | Propuesta |
| T-3145 | The Games: Base de otra jornada | Línea {linea}: la base {base} no es del {dia}. | MATEO | Propuesta |
| T-3146 | The Games: Función desconocida | Línea {linea}: «{funcion}» no es una función. Van Líder de base, Calificador, Veedor o VAR. | MATEO | Propuesta |
| T-3147 | The Games: Persona no encontrada | Línea {linea}: no encontramos a «{nombre}» entre los miembros activos, honorarios o en licencia. | MATEO | Propuesta |
| T-3148 | The Games: Persona con sugerencias | Línea {linea}: no encontramos a «{nombre}». ¿Es {opciones}? | MATEO | Propuesta |
| T-3149 | The Games: Persona ambigua | Línea {linea}: «{nombre}» puede ser {opciones}. Escribí el nombre completo o el correo institucional. | MATEO | Propuesta |
| T-3150 | The Games: Persona repetida | Línea {linea}: {nombre} ya está en la línea {otra}. | MATEO | Propuesta |
| T-3151 | The Games: Persona sin membresía | Línea {linea}: {nombre} ya no es miembro de la OE. | MATEO | Propuesta |
| T-3152 | The Games: Hoja de personal muy larga | La hoja pegada es demasiado larga. Pegá solo las columnas A a C de una jornada. | MATEO | Propuesta |
| T-3153 | The Games: Jornada sin bases | El {dia} no tiene bases. Crealas en Bases antes de cargar el personal. | MATEO | Propuesta |
| T-3154 | The Games: Operadores | Operadores | MATEO | Propuesta |
| T-3155 | The Games: Funciones de la base | Líder · Calificador · Veedores · VAR | MATEO | Propuesta |
| T-3156 | The Games: Sin contraseña | Sin contraseña | MATEO | Propuesta |
| T-3157 | The Games: Ir a la activación | Emitir los enlaces en la jornada de activación | MATEO | Propuesta |
| T-3158 | The Games: Quitar a alguien | Quitar a {nombre} | MATEO | Propuesta |
| T-3159 | The Games: Función sin asignar | Sin asignar | MATEO | Propuesta |
| T-3160 | The Games: Resumen de la jornada | {lideres} líderes ({sinClave} sin contraseña) · {apoyo} de apoyo | MATEO | Propuesta |
| T-3161 | The Games: Equipo de la base | Con vos en {base} | MATEO | Propuesta |
| T-3162 | The Games: Líder en licencia | Línea {linea}: {nombre} está en licencia. Puede ser calificador, veedor o VAR, pero no líder: el líder tiene que poder entrar a registrar. | MATEO | Propuesta |

## Jurados de The Challenge (ADR-103)

La calificación de los jurados dentro de una extra de puntos directos. Las notas no dan puntos: ordenan a los equipos para que la Dirección ponga el podio.

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-3163 | The Games: Calificación de los jurados | Calificación de los jurados | MATEO | Propuesta |
| T-3164 | The Games: Ayuda de los jurados | Escribí el nombre del jurado y pegá su tabla, desde el encabezado hasta el último equipo: sirve la plantilla de jurado o la hoja Consolidado de la OE. Cada equipo va con sus 5 notas del 1 al 10, en el orden de la rúbrica; el total y el nivel se ignoran. Volver a cargar un jurado reemplaza solo sus notas. Las notas no dan puntos: el podio se pone abajo, en los puntos de cada equipo. | MATEO | Propuesta |
| T-3165 | The Games: Campo del jurado | Jurado | MATEO | Propuesta |
| T-3166 | The Games: Campo de las notas | Tabla del jurado pegada | MATEO | Propuesta |
| T-3167 | The Games: Cargar las notas | Cargar las notas de este jurado | MATEO | Propuesta |
| T-3168 | The Games: Notas cargadas | Listo: {jurado} calificó {equipos} equipos. | MATEO | Propuesta |
| T-3169 | The Games: Faltan notas | Línea {linea}: faltan notas. Van las 5 de la rúbrica, del 1 al 10. | MATEO | Propuesta |
| T-3170 | The Games: Nota inválida | Línea {linea}: «{nota}» no es una nota entera del 1 al 10. | MATEO | Propuesta |
| T-3171 | The Games: Equipo repetido en las notas | Línea {linea}: el equipo {equipo} ya está en la línea {otra}. | MATEO | Propuesta |
| T-3172 | The Games: Tabla de notas muy larga | La hoja pegada es demasiado larga. Pegá solo la tabla de un jurado. | MATEO | Propuesta |
| T-3173 | The Games: Nombre del jurado | Escribí el nombre del jurado, hasta 60 caracteres. | MATEO | Propuesta |
| T-3174 | The Games: Jurado cargado | {jurado} · {equipos} equipos | MATEO | Propuesta |
| T-3175 | The Games: Columnas del orden | Puesto · Equipo · Impacto · Integración · Estructura · Producción · Normas · Total · Nivel · Jurados | MATEO | Propuesta |
| T-3176 | The Games: Empate | Empate | MATEO | Propuesta |
| T-3177 | The Games: Podio sugerido | Podio: {puntos} | MATEO | Propuesta |
| T-3178 | The Games: Empate en el podio | Hay un empate en el podio: lo decide la organización. | MATEO | Propuesta |
| T-3179 | The Games: Sin notas de jurados | Todavía no hay notas de jurados. | MATEO | Propuesta |
| T-3180 | The Games: Orden de los jurados | Orden con el promedio de los jurados | MATEO | Propuesta |

## Seguimiento del registro (ADR-105)

Qué bases ya registraron, qué resultados se deben y quién se demora más, para la operación; y el aviso al líder cuando le falta registrar.

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-3181 | The Games: Ayuda del seguimiento | Qué bases ya registraron la rotación en curso, qué resultados se deben y quién se demora más. Se actualiza sola cada 15 segundos. | MATEO | Propuesta |
| T-3182 | The Games: Bases que registraron | Registraron {registradas} de {total} bases | MATEO | Propuesta |
| T-3183 | The Games: Base sin resultado | Falta | MATEO | Propuesta |
| T-3184 | The Games: Base con poderes confirmados | Falta: poderes confirmados a las {hora} | MATEO | Propuesta |
| T-3185 | The Games: Base registrada | Registrada a las {hora} | MATEO | Propuesta |
| T-3186 | The Games: Minutos desde el inicio | a los {minutos} min | MATEO | Propuesta |
| T-3187 | The Games: Quién registró | Lo registró el líder · Lo registró la operación | MATEO | Propuesta |
| T-3188 | The Games: Resultados que se deben | Resultados que se deben | MATEO | Propuesta |
| T-3189 | The Games: Sin deudas | No se debe ningún resultado de las rotaciones cerradas. | MATEO | Propuesta |
| T-3190 | The Games: Quién se demora más | Quién se demora más | MATEO | Propuesta |
| T-3191 | The Games: Cómo se mide la demora | Cuenta el primer registro de cada resultado, en minutos desde que empezó la rotación, y la base que registró de última en cada rotación cerrada. No separa un juego largo de un líder lento: sirve para saber a quién llamar. | MATEO | Propuesta |
| T-3192 | The Games: Columnas de la demora | Base · Líder · Calificador · Por el líder · Por la operación · Deben · Mediana (min) · Veces última | MATEO | Propuesta |
| T-3193 | The Games: Jornada sin rotaciones jugadas | La jornada {dia} todavía no tiene rotaciones jugadas. | MATEO | Propuesta |
| T-3194 | The Games: Aviso al líder | Ya registraron {registradas} de {total} bases. Falta el resultado de {base}: registralo apenas termine el juego. | MATEO | Propuesta |
| T-3195 | The Games: Deuda del líder | La rotación {n} se cerró sin el resultado de {base}. Pasáselo a la operación para que lo registre. | MATEO | Propuesta |

## Base, poderes y resultado (ADR-106)

La base empieza con la rotación; el líder confirma los poderes y el resultado con un aviso, y cambiar el resultado es de la operación. Los textos de «Empezar la base» (T-3104 a T-3107 y T-3117) pasaron a ser los de «Confirmar poderes».

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-3196 | The Games: Aviso de confirmar el resultado | ¿Seguro? Queda «{resultado}» y después no lo podés cambiar. Si hay un error, llamá a la operación. | MATEO | Propuesta |
| T-3197 | The Games: El resultado cierra los poderes | Registrarlo también cierra los poderes de esta base. | MATEO | Propuesta |
| T-3198 | The Games: Sí, registrar | Sí, registrar | MATEO | Propuesta |
| T-3199 | The Games: Resultado bloqueado | Resultado registrado: {resultado}. Si hay un error, llamá a la operación. | MATEO | Propuesta |
| T-3200 | The Games: El líder ya registró | El resultado de esta base ya está registrado. Si hay que cambiarlo, llamá a la operación. | MATEO | Propuesta |
| T-3201 | The Games: Confirmar antes del resultado | Hay poderes registrados: confirmalos antes de registrar el resultado. | MATEO | Propuesta |
| T-3202 | The Games: Vitrina de la tabla | La vitrina muestra la tabla de posiciones y el podio. · La vitrina no muestra la tabla ni el podio; la rotación, sus resultados y el recorrido de cada equipo siguen a la vista. | MATEO | Propuesta |
| T-3203 | The Games: Publicar la tabla | Mostrar la tabla · Ocultar la tabla | MATEO | Propuesta |
| T-3204 | The Games: Ayuda de la vitrina de la tabla | Ocultala mientras se juega para que los equipos compitan sin estar pendientes de la tabla. El podio se oculta con ella: para proyectarlo, mostrala antes. | MATEO | Propuesta |
