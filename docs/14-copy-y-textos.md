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
| T-859 | Formulario: gracias por defecto (si el formulario no trae el suyo) | ¡Listo! Recibimos tu respuesta. ¡OE OE OE! | COM | Propuesta |
| T-860 | Formulario cerrado o todavía no abierto | Este formulario no está recibiendo respuestas ahora. | MATEO | Propuesta |
| T-861 | Formulario con el tope de respuestas alcanzado | Este formulario ya alcanzó su tope de respuestas. | MATEO | Propuesta |
| T-862 | Formulario: segunda respuesta con el mismo correo | Ya recibimos una respuesta con ese correo. | MATEO | Propuesta |
| T-863 | Formulario: demasiados envíos desde la misma red | Recibimos muchos envíos desde tu red. Esperá unos minutos e intentá de nuevo. | MATEO | Propuesta |
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
| T-052 | Cuenta en licencia o retirada (al intentar entrar) | Respuesta igual a T-044; nunca se dice el motivo | MATEO | Propuesta |
| T-053 | Correo del código, asunto | Tu código para entrar a Mi OE: {código} | MATEO | Propuesta |
| T-054 | Correo del código, cuerpo | Hola, {nombre}. Tu código es **{código}** y vence en 10 minutos. Si no fuiste vos, ignorá este correo. | MATEO | Propuesta |
| T-055 | Step-up (acción sensible de admin) | Esta acción pide un código nuevo. Te lo mandamos al correo. | MATEO | Propuesta |

## 4. Mi OE

### Inicio y navegación

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-060 | Saludo | Hola, {nombre preferido} | MATEO | Propuesta |
| T-061 | Pestañas de navegación | Inicio · Eventos · Comités · Personas · Egresados · GH Points · Permanencia · Solicitudes · Convocatorias · Normativa · Carnet · Ajustes | COM | Propuesta |
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
| T-139 | Solicitudes, tipos (en el orden del modelo: licencia, retiro, cambio de comité) | Pedir licencia · Retirarme de la OE · Cambiarme de comité el próximo semestre | GH | Propuesta |
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
| T-419 | Ajustes, foto fuera de tipo o tamaño | La foto debe ser JPG, PNG o WebP de hasta 5 MB. | MATEO | Propuesta |

### Mi OE · fase 3 (GH Points, registro de asistencia, agenda)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-521 | Check-in, agenda y admin: nombre de la categoría de una ocasión (en el orden del modelo) | Integración · Partido del Athletic · Reunión de comité · Charla · Taller · Social · Actividad | GH | Propuesta |
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
| T-537 | GH Points: nivel máximo alcanzado | Llegaste al nivel más alto. ¡OE OE OE! | COM | Propuesta |
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
| T-548 | GH Points: sin semestre activo | No hay un semestre activo. Cuando GH lo abra, acá ves tus puntos. | MATEO | Propuesta |
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
| T-702 | Comité interno: cartelera vacía | {comité} no tiene anuncios todavía. | COM | Propuesta |
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
| T-881 | Licencia: campo hasta cuándo (opcional) | Hasta cuándo (opcional) | GH | Propuesta |
| T-882 | Licencia: explicación | Mientras estés en licencia no podés entrar a Mi OE ni se te evalúa la permanencia. Para volver, escribile a GH. | GH | Propuesta |
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
| T-894 | Solicitud: tipos en singular para los mensajes (en el orden del modelo: licencia, retiro, cambio de comité) | licencia · retiro · cambio de comité | MATEO | Propuesta |
| T-895 | Solicitud: respuesta de GH, título | Respuesta de GH | GH | Propuesta |
| T-896 | Convocatorias: sin convocatorias abiertas | No hay convocatorias abiertas ahora. Cuando se abra una, la vas a ver acá. | GH | Propuesta |
| T-897 | Convocatoria: cupo y cierre | {cupo} cupos · cierra el {fecha} | MATEO | Propuesta |
| T-898 | Convocatoria: sin cupo fijo | Sin cupo fijo · cierra el {fecha} | MATEO | Propuesta |
| T-899 | Convocatoria: estados de mi inscripción (en el orden del modelo) | Pendiente · Aceptada · En lista de espera · No aceptada | MATEO | Propuesta |
| T-900 | Convocatoria: ya estás en el grupo | Ya estás en {grupo}. | MATEO | Propuesta |
| T-901 | Convocatoria: inscripción pendiente (selección manual) | Te anotaste en {grupo}. El líder revisa las inscripciones y te avisamos. | GH | Propuesta |
| T-902 | Convocatoria: título de mis inscripciones | Tus inscripciones | MATEO | Propuesta |
| T-903 | Convocatoria: ya te anotaste | Ya te anotaste a esta convocatoria. | MATEO | Propuesta |
| T-904 | Convocatoria cerrada | Esta convocatoria ya cerró. | MATEO | Propuesta |
| T-905 | Convocatoria: explicación de la selección (orden de llegada · manual) | Los cupos se asignan por orden de llegada. · El líder del grupo elige entre quienes se anoten. | GH | Propuesta |
| T-906 | Convocatoria: no aceptada | Esta vez no quedaste en {grupo}. | GH | Propuesta; texto sensible |
| T-907 | Convocatoria: solo miembros activos | Solo un miembro activo puede anotarse. | GH | Propuesta |

### Mi OE · fase 6 (notificaciones, calendario, instalar, anuncio interno, encuesta, baja)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-1063 | Notificaciones: intro | Recibí en tu celular los anuncios, tus GH Points y los recordatorios de la OE. Activalas en cada dispositivo que uses. | MATEO | Propuesta |
| T-1064 | Notificaciones: botón para activar en este dispositivo | Activar en este dispositivo | MATEO | Propuesta |
| T-1065 | Notificaciones: este dispositivo ya recibe | Este dispositivo recibe notificaciones. | MATEO | Propuesta |
| T-1066 | Notificaciones: botón para desactivar en este dispositivo | Desactivar en este dispositivo | MATEO | Propuesta |
| T-1067 | Notificaciones: permiso bloqueado por el navegador | Tu navegador tiene las notificaciones bloqueadas para Mi OE. Permitilas en la configuración del sitio y volvé a intentar. | MATEO | Propuesta |
| T-1068 | Notificaciones: navegador sin soporte | Este navegador no admite notificaciones. Probá con Chrome, Edge, Firefox o Safari actualizado. | MATEO | Propuesta |
| T-1069 | Notificaciones: no configuradas en este entorno (sin claves VAPID) | Las notificaciones no están configuradas en este entorno. | MATEO | Propuesta |
| T-1070 | Notificaciones: iPhone o iPad sin la app instalada | En iPhone o iPad primero instalá Mi OE: tocá Compartir y después "Agregar a pantalla de inicio". Desde la app instalada podés activar las notificaciones. | MATEO | Propuesta |
| T-1071 | Instalar: botón | Instalar Mi OE | MATEO | Propuesta |
| T-1072 | Instalar: ya instalada | Mi OE ya está instalada en este dispositivo. | MATEO | Propuesta |
| T-1073 | Instalar: instrucciones cuando el navegador no ofrece el botón | Para instalar Mi OE, abrí el menú del navegador y elegí "Instalar" o "Agregar a pantalla de inicio". | MATEO | Propuesta |
| T-1074 | Dispositivos: título | Tus dispositivos | MATEO | Propuesta |
| T-1075 | Dispositivos: ninguno | Todavía no activaste las notificaciones en ningún dispositivo. | MATEO | Propuesta |
| T-1076 | Dispositivos: columnas | Dispositivo · Desde · Último uso | MATEO | Propuesta |
| T-1077 | Dispositivos: quitar | Quitar | MATEO | Propuesta |
| T-1078 | Dispositivos: el actual | Este dispositivo | MATEO | Propuesta |
| T-1079 | Preferencias: título | Qué querés recibir | MATEO | Propuesta |
| T-1080 | Preferencias: opciones (en el orden del modelo: anuncios, puntos, recordatorios, campañas por correo) | Anuncios de la cartelera · GH Points acreditados · Recordatorios de actividades, asambleas y permanencia · Campañas por correo | MATEO | Propuesta |
| T-1081 | Preferencias: ayuda | Los correos sobre tu ingreso, tus solicitudes y tu permanencia llegan siempre. | MATEO | Propuesta |
| T-1082 | Preferencias: guardadas | Listo, guardamos tus preferencias. | MATEO | Propuesta |
| T-1083 | Preferencias: botón guardar | Guardar preferencias | MATEO | Propuesta |
| T-1084 | Calendario: intro | Suscribite a tu agenda de la OE desde el calendario de tu celular o computador: las ediciones de los eventos, las asambleas y las actividades de tus comités. | MATEO | Propuesta |
| T-1085 | Calendario: nombre del calendario (dentro del ICS) | Mi agenda OE | COM | Propuesta |
| T-1086 | Calendario: copiar enlace | Copiar enlace | MATEO | Propuesta |
| T-1087 | Calendario: copiado | Enlace copiado. | MATEO | Propuesta |
| T-1088 | Calendario: abrir en el calendario del dispositivo (webcal) | Abrir en mi calendario | MATEO | Propuesta |
| T-1089 | Calendario: regenerar | Regenerar enlace | MATEO | Propuesta |
| T-1090 | Calendario: regenerado | Listo. El enlace anterior dejó de funcionar. | MATEO | Propuesta |
| T-1091 | Calendario: advertencia | Este enlace es personal: quien lo tenga ve tu agenda. Si lo compartiste por error, regeneralo. | MATEO | Propuesta |
| T-1092 | Inicio: aviso de instalar y activar (título · texto · botón) | Llevá Mi OE en el celular · Instalá la app y activá las notificaciones para no perderte anuncios ni recordatorios. · Activar | COM | Propuesta |
| T-1093 | Inicio: cerrar el aviso | Ahora no | MATEO | Propuesta |
| T-1094 | Anuncio interno: volver | Volver a Mi OE | MATEO | Propuesta |
| T-1095 | Encuesta: título | ¿Cómo estuvo {actividad}? | COM | Propuesta |
| T-1096 | Encuesta: intro | Tus respuestas son anónimas: quedan agregadas con las de los demás asistentes y nadie ve quién dijo qué. Te toma un minuto. | COM | Propuesta |
| T-1097 | Encuesta: enviar | Enviar respuestas | MATEO | Propuesta |
| T-1098 | Encuesta: gracias | ¡Gracias! Tus respuestas ayudan a que la próxima salga mejor. ¡OE OE OE! | COM | Propuesta |
| T-1099 | Encuesta: ya respondida | Ya respondiste esta encuesta. ¡Gracias! | MATEO | Propuesta |
| T-1100 | Encuesta: vencida | Esta encuesta ya cerró. | MATEO | Propuesta |
| T-1101 | Encuesta: no encontrada | No encontramos esta encuesta. Revisá el enlace de la notificación. | MATEO | Propuesta |
| T-1102 | Encuesta y formularios: extremos de una calificación de 1 a 5 | Muy mal · Excelente | COM | Propuesta |
| T-1103 | Baja: título | Dejar de recibir campañas | MATEO | Propuesta |
| T-1104 | Baja: texto | Si confirmás, no te mandamos más campañas por correo. Los correos sobre tu ingreso, tus solicitudes y tu permanencia siguen llegando. Podés volver a activarlas en Ajustes de Mi OE. | JUNTA | Propuesta |
| T-1105 | Baja: botón | Confirmar la baja | MATEO | Propuesta |
| T-1106 | Baja: confirmada | Listo. No te mandamos más campañas por correo. | MATEO | Propuesta |
| T-1107 | Baja: enlace inválido | Este enlace no es válido o ya venció. | MATEO | Propuesta |
| T-1108 | Notificaciones: activadas ahora | Listo: este dispositivo ya recibe notificaciones. | MATEO | Propuesta |
| T-1109 | Notificaciones: falló activar | No pudimos activar las notificaciones. Intentá de nuevo. | MATEO | Propuesta |
| T-1110 | Dispositivos: quitado | Listo, ese dispositivo ya no recibe notificaciones. | MATEO | Propuesta |

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
| T-454 | Línea de tiempo: filtro por tipo | Todo · Notas · Membresía · Comités · Consentimientos · Datos · Importaciones · Otros · Participación · Formularios · Pipelines · Solicitudes · Convocatorias | MATEO | Propuesta |
| T-455 | Línea de tiempo: ayuda del compositor de notas | Escribí una nota para el equipo. La persona puede pedir verla. | MATEO | Propuesta |
| T-456 | Línea de tiempo: botones y marca de nota | Guardar nota · Editar · Editada el {fecha} | MATEO | Propuesta |
| T-457 | Línea de tiempo vacía | Todavía no hay nada en la línea de tiempo. | MATEO | Propuesta |
| T-458 | Línea de tiempo: textos de las interacciones automáticas | Importado desde el roster {término} · Estado cambió de {de} a {a}: {motivo} · Dado de baja: {motivo} · Reactivado · Comités de {término}: {comités} · Cargo {cargo} desde {término} · Cargo {cargo} retirado · Consentimiento de {propósito} autorizado · Consentimiento de {propósito} retirado · Datos actualizados: {campos} · Correo institucional cambiado · Pidió la eliminación de sus datos · Descargó sus datos · Datos anonimizados · Permiso {permiso} otorgado · Permiso {permiso} revocado | MATEO | Propuesta |
| T-459 | Tareas: campos y columnas | Título · Responsable · Vence · Estado · Persona · Tipo | MATEO | Propuesta |
| T-460 | Tareas: opciones de estado | Abierta · Hecha | MATEO | Propuesta |
| T-461 | Tareas: tipos | General · Solicitud de eliminación · Solicitud de miembro | MATEO | Propuesta |
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
| T-516 | Propósitos de consentimiento (etiquetas cortas, en el orden del modelo) | Membresía · Comunicaciones · Foto en el directorio · Galería de egresados · Tratamiento de datos | JUNTA | Propuesta |
| T-517 | Línea de tiempo: nota de otra persona | Solo quien escribió la nota puede editarla. | MATEO | Propuesta |
| T-518 | Documentos: error de subida | No se pudo subir el PDF. Intentá de nuevo. | MATEO | Propuesta |
| T-519 | Documentos: archivo fuera de tamaño | El PDF debe pesar entre 1 KB y 20 MB. | MATEO | Propuesta |
| T-520 | Documentos: subida confirmada | Listo: el PDF quedó guardado. Ahora cargá los artículos. | MATEO | Propuesta |

### Admin de Participación (fase 3: ocasiones, consola, anfitrión, ledger, rankings, asambleas, cierre, vista de líder, alias)

| Código | Dónde | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-561 | Navegación del admin: enlaces de la fase 3 | Ocasiones · Ledger · Rankings · Asambleas · Cierre · Alias | MATEO | Propuesta |
| T-562 | Recurso ocasiones (plural · singular) | Ocasiones · Ocasión | MATEO | Propuesta |
| T-563 | Ocasiones: campos | Título · Tipo · Tipo de asamblea · Categoría · Solo nuevos · Descripción (Markdown) · Lugar · Empieza · Termina · Abre el registro · Cierra el registro · GH Points · Aprobación · Código rotativo · Comité · Edición · Semestre | MATEO | Propuesta |
| T-564 | Ocasiones: opciones de tipo | Actividad · Asamblea · Sesión de edición | MATEO | Propuesta |
| T-565 | Ocasiones: opciones de tipo de asamblea | Ordinaria · Elección de junta · Segunda vuelta | GH | Propuesta |
| T-566 | Ocasiones: opciones de categoría | Integración · Partido del Athletic · Reunión de comité · Charla · Taller · Social · Otra | GH | Propuesta |
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
| T-597 | Consola y Persona 360: estados del check-in (en el orden del modelo) | Pendiente · Aprobado · Rechazado · Anulado | MATEO | Propuesta |
| T-598 | Consola: alta manual, título y botón | Registrar a alguien · Registrar | GH | Propuesta |
| T-599 | Consola y anfitrión: campo de búsqueda | Buscá por nombre | MATEO | Propuesta |
| T-600 | Consola y anfitrión: sin resultados | No encontramos a nadie con ese nombre. | MATEO | Propuesta |
| T-601 | Consola y anfitrión: ya estaba registrado | {nombre} ya estaba registrado. | MATEO | Propuesta |
| T-602 | Consola y anfitrión: registro hecho | Listo: {nombre} quedó registrado. | MATEO | Propuesta |
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
| T-655 | Serie semanal: creada | Listo: {n} reuniones creadas hasta el {fecha}. | MATEO | Propuesta |
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
| T-667 | Línea de tiempo: textos de las interacciones de participación | Asistió a {ocasion} · Sumó {n} GH Points por {ocasion} · Registro en {ocasion} pendiente de aprobación · Registro en {ocasion} anulado: {motivo} · Ajuste de {n} GH Points: {motivo} · Reversión de {n} GH Points: {motivo} | MATEO | Propuesta |
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
| T-781 | Destacado del mes: publicado | {nombre} quedó como destacado de {mes}. Se publicó en la cartelera del comité. | COM | Propuesta |
| T-782 | Destacado del mes: sin consentimiento de directorio | {nombre} quedó registrado como destacado de {mes}, pero no autorizó aparecer en el directorio: no se publica. | JUNTA | Propuesta |
| T-783 | Destacado del mes: título del anuncio | Destacado de {mes}: {nombre} | COM | Propuesta |
| T-784 | Destacado del mes: cuerpo del anuncio | {comité} reconoce a {nombre} como destacado del mes de {mes}. ¡OE OE OE! | COM | Propuesta |
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
| T-801 | Cierre: motivos automáticos (cumple, prueba, no cumple, sin comité, obligatoria) | Cumplió el umbral · Hasta 10 puntos por debajo del umbral · Más de 10 puntos por debajo del umbral · No le queda un comité donde cumpla o esté en prueba · Faltó a una asamblea obligatoria | GH | Propuesta |
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
| T-832 | Línea de tiempo: eventos de permanencia (buen desempeño, insuficiente, puntaje del líder, crédito manual, entró al grupo, salió del grupo, decisión del cierre) | Buen desempeño en {grupo}, evaluado por {evaluador} · Desempeño insuficiente en {grupo}, evaluado por {evaluador}: {nota} · {criterio} en {comité}: {valor} de {peso} · Crédito manual en {criterio}: {valor} ({motivo}) · Entró al grupo {grupo} · Salió del grupo {grupo} · Cierre de {término}: {decisión} | MATEO | Propuesta |
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
| T-845 | Grupo: importación aplicada | {n} personas agregadas al grupo. | MATEO | Propuesta |
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
| T-924 | Constructor: tipos de campo (en el orden del modelo) | Texto corto · Texto largo · Correo · Celular · Selección · Selección múltiple · Casilla · Fecha | MATEO | Propuesta |
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
| T-984 | Dar de alta: texto | Vas a dar de alta a {nombre} en {término}. Elegí de {min} a {max} comités; entra como Miembro y le llega el correo de bienvenida. | GH | Propuesta |
| T-985 | Dar de alta: campo de comités | Comités | MATEO | Propuesta |
| T-986 | Dar de alta: la persona ya tiene membresía | {nombre} ya tiene membresía: si está retirada, reactivala. | MATEO | Propuesta |
| T-987 | Dar de alta: correo fuera del dominio institucional | Para dar de alta necesita un correo institucional. Editá la persona primero. | MATEO | Propuesta |
| T-988 | Dar de alta: contacto externo | Un contacto externo no se da de alta. | MATEO | Propuesta |
| T-989 | Dar de alta: sin semestre vigente | No hay un semestre vigente: crealo en Términos. | MATEO | Propuesta |
| T-990 | Dar de alta: listo | {nombre} ya es miembro. Le enviamos la bienvenida. | GH | Propuesta |
| T-991 | Kanban: mover a la etapa ganada de admisión sin membresía | Para pasar a {etapa} primero da de alta a la persona. | MATEO | Propuesta |
| T-992 | Kanban: tarjeta movida | Tarjeta movida a {etapa}. | MATEO | Propuesta |
| T-993 | Kanban: ayuda accesible para arrastrar | Arrastrá la tarjeta a otra columna o usá "Mover a…". | MATEO | Propuesta |
| T-994 | Tarea de seguimiento de un patrocinio ganado: título | Seguimiento del patrocinio de {organización} | COM | Propuesta |
| T-995 | Kanban: pipeline archivado | Este pipeline está archivado. | MATEO | Propuesta |
| T-996 | Kanban: tarjeta perdida en admisión (aviso) | La persona sigue como postulante con esta tarjeta como historia. | MATEO | Propuesta |
| T-997 | Solicitudes (admin): título | Solicitudes | MATEO | Propuesta |
| T-998 | Solicitudes (admin): columnas | Persona · Tipo · Detalle · Pedida el · Estado · Decidida por | MATEO | Propuesta |
| T-999 | Solicitudes (admin): filtros por estado | Pendientes · Aprobadas · Rechazadas · Retiradas · Todas | MATEO | Propuesta |
| T-1000 | Solicitudes (admin): sin solicitudes | No hay solicitudes en esta lista. | MATEO | Propuesta |
| T-1001 | Solicitudes (admin): botones | Aprobar · Rechazar | MATEO | Propuesta |
| T-1002 | Solicitudes (admin): rechazo, campo del motivo | Motivo del rechazo (la persona lo va a leer) | GH | Propuesta |
| T-1003 | Solicitudes (admin): rechazo sin motivo | Para rechazar tenés que escribir el motivo. | MATEO | Propuesta |
| T-1004 | Solicitudes (admin): aprobar una licencia, texto | Vas a aprobar la licencia de {nombre}: pasa a "En licencia", pierde el acceso a Mi OE y le llega el correo. | GH | Propuesta |
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
| T-1034 | Tablero: sin pendientes | No tenés tareas pendientes. | MATEO | Propuesta |
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
| T-1057 | Solicitud (admin): tipos en plural para los filtros | Licencias · Retiros · Cambios de comité | MATEO | Propuesta |
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
| T-1121 | Plantillas: prueba enviada | Te mandamos la prueba a {correo}. | MATEO | Propuesta |
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
| T-1140 | Campaña: en camino (aviso tras enviar ahora) | En camino. El primer lote sale en menos de un minuto. | MATEO | Propuesta |
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

## 6. Notificaciones

### Push (título · cuerpo)

| Código | Cuándo | Propuesta | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-180 | Anuncio nuevo | {título del anuncio} · {primera línea} | COM | Propuesta |
| T-181 | Puntos acreditados | ¡Sumaste {n} GH Points! · Por {actividad}. Ya vas en {total}. | GH | Propuesta |
| T-182 | Actividad hoy | Hoy: {actividad} · {hora} en {lugar}. El registro abre a las {apertura}. | GH | Propuesta |
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
| T-194 | Convocatoria abierta sin cupo | Se abrió {convocatoria} · Cierra el {fecha}. | GH | Propuesta |
| T-195 | Solicitud respondida: la decisión dentro de T-189 (aprobada · rechazada) | aprobada · rechazada | GH | Propuesta |

### Correos

| Código | Cuándo | Asunto · cuerpo | Dueño | Estado |
| --- | --- | --- | --- | --- |
| T-200 | Bienvenida al dar de alta | Bienvenido a la OE, {nombre} · Ya podés entrar a Mi OE con tu correo institucional en {url}: te llega un código cada vez que entrás. Tus comités: {comités}. Lo hacemos por vos. ¡OE OE OE! | GH | Propuesta |
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

- **COM:** nombre del sitio, textos del inicio, descripciones de los cuatro macroeventos, redes y contacto, plantilla de campaña, campaña de lanzamiento; en la fase 5, la plantilla de etapas del patrocinio (T-966) y los aliados que se cargan; en la fase 6, el nombre de la PWA (T-1173, T-1174), el nombre del calendario (T-1085), el aviso de instalar (T-1092) y los textos de la encuesta (T-1095 a T-1102).
- **GH:** texto de Unirse y del proceso de admisión, pasos del onboarding, descripción de una línea de cada criterio de permanencia, nombres de los criterios y de los cálculos de la fase 4 (T-717 a T-726, T-791, T-792, T-801, T-802), tono de los mensajes sensibles (asamblea obligatoria, prueba, salida, aplicar el cierre), nombres y cortes de los niveles de GH Points, preguntas de la encuesta corta; en la fase 5, las preguntas del formulario de admisión, las etapas reales del proceso, los textos de las solicitudes (T-874 a T-895, T-1002 a T-1006) y de las convocatorias (T-896 a T-907), y los correos de bienvenida (T-200) y de respuesta a una solicitud (T-205); en la fase 6, las variantes de push T-194 y T-195 y el tono de los recordatorios T-182 a T-193.
- **JUNTA:** política de datos y su versión, textos de consentimiento, plazo de respuesta a la eliminación, misión y visión (ya en el manual), pie legal; en la fase 6, el texto de la baja de campañas (T-1104) y del enlace de baja (T-210).
- **Cada comité:** presentación, contacto, y los textos de su tabla de permanencia (nombres de los criterios y de los dos eventos).
- **Mateo:** todo lo marcado MATEO, que no cambia el sentido institucional.

Cuando un texto quede aprobado, se cambia su estado aquí y se anota la fecha en el registro del [roadmap](09-roadmap.md). Los textos con "sensible" se revisan con GH antes de escribir código, porque un error de tono ahí cuesta más que cualquier bug.
