# Glosario

Los nombres de la interfaz van en español; los identificadores del código, en inglés. Esta tabla es el contrato entre ambos.

| En la interfaz | En el código | Qué es |
| --- | --- | --- |
| Persona | `Person` | Cualquier ser humano del que la OE guarda datos: estudiante o contacto externo. Eje del CRM |
| Correo personal | `Person.personalEmail` | Contacto opcional de egresados y externos; nunca sirve para iniciar sesión |
| Prospecto | `stage=PROSPECT` | Persona que llenó un formulario público o fue creada a mano sin membresía |
| Postulante | `stage=APPLICANT` | Persona con tarjeta en un pipeline de admisión; si no es admitida, sigue postulante con su tarjeta perdida como historia |
| Miembro | `stage=MEMBER` + `Membership` | Persona con membresía: activo, en licencia u honorario |
| Egresado | `stage=ALUMNI` | Persona que dejó la OE (retiro o graduación); no puede entrar (pierde el correo institucional) y conserva su historia como perfil de egresado |
| Perfil de egresado (memorial) | `stage=ALUMNI` + `Consent MEMORIAL` | Historia institucional de quien salió: comités, cargos, años, puntos; visible en la galería de egresados si hay consentimiento |
| Galería de egresados | `/app/egresados` | Lista por año de salida con cartel por año; "memorial" es el nombre interno |
| Membresía | `Membership` | Estado de miembro con primer término, fin y motivo; una por persona |
| Activo / En licencia / Honorario / Retirado | `ACTIVE` / `ON_LEAVE` / `HONORARY` / `INACTIVE` | Estados de la membresía. Entran a Mi OE activos y honorarios. Al terminar, el motivo es graduación, retiro voluntario, permanencia, expulsión (sin reingreso posible), pérdida de la calidad de estudiante u otro |
| Comité | `Committee` | Grupo de trabajo con ficha editorial y logo; activo, inactivo o en prueba (comité creado o reactivado, Regl. art. 25), con avisos de viabilidad según el Regl. art. 26 ([ADR-060](adr/ADR-060-alineacion-con-la-normativa-2026.md) regla 8) |
| Pertenencia a comité | `CommitteeMembership` | Persona en un comité durante un término; de 1 a 3 activas para activos |
| Cargo de junta o de GH | `Appointment` | Rol visible con historia fuera del comité: presidencia, vicepresidencias, GH principal, directores de GH |
| Mesa directiva de macroevento | `Appointment.kind=MACROEVENT_DIRECTOR` + `MacroeventRole` | Cargos de una edición de macroevento elegidos por la Asamblea (Regl. art. 41 a 43): General, Logística, Finanzas, Mercadeo, Publicidad, Gestión Humana, The Games, Carnival, Seguridad o Agenda Académica, con titular y codirección; se registran desde la edición ([ADR-060](adr/ADR-060-alineacion-con-la-normativa-2026.md) regla 9) |
| Cargo en el comité | `CommitteeRoleAssignment` | Lo que la persona desempeña dentro de su comité en el término, uno o varios: General, Logística, Financiero, Relaciones Públicas, Mercadeo o Gestión Humana (los seis de los Estatutos 2026); sin cargos es Miembro; `CommitteeMembership.roleCode` conserva el principal ([ADR-058](adr/ADR-058-direccion-del-comite-por-areas.md)) |
| Inhabilidad para cargos | `inhabilities()` | Lo que impide nombrar a alguien en un cargo directivo (Regl. art. 11 y 27): inhabilidad viva (sanción), ser de la junta, ser nuevo sin aval, dirigir otro macroevento, ser General o Financiero de otro comité, superar dos cargos directivos o tener dos sin codirección; ADMIN registra una excepción con motivo que queda auditada ([ADR-060](adr/ADR-060-alineacion-con-la-normativa-2026.md) regla 11) |
| Cargo retirado | `CommitteeRole.retired` + `replacedByCode` | Cargo que ya no se nombra en los comités (Publicidad, reemplazado por Mercadeo): quien lo tiene lo conserva hasta cerrarlo y el roster lo traduce con aviso ([ADR-060](adr/ADR-060-alineacion-con-la-normativa-2026.md) regla 4) |
| Cargo asignado | `CommitteeRoleAssignment` | Un cargo de una pertenencia: titular o codirección, con inicio y fin; un titular y una codirección por cargo, comité y término |
| Codirección | `CommitteeRoleAssignment.coDirector` | Segunda persona en un cargo de dirección; se muestra como "Codirección de {cargo}" y tiene las mismas capacidades que el titular |
| Capacidad | `CommitteeRole.capabilities` | Lo que un cargo habilita sobre su comité: `ROSTER`, `DIRECTION`, `PERMANENCE`, `OCCASIONS`, `EVENTS`, `BOARD`, `PROFILE`, `PARTNERS`, `FINANCE`; GH las edita por cargo |
| Área del comité | Pestañas de `/admin/comites/[slug]` | Personas, Actividades, Comunicación, Aliados y Finanzas: cada director ve las de sus capacidades |
| Cargo obligatorio | `CommitteeRole.required` | General y Financiero: ningún director deja uno sin titular; ADMIN recibe la alerta |
| General | cargo asignado `GENERAL` | Dirige el comité: un titular por comité y término, con codirección opcional; tiene todas las capacidades y nombra los demás cargos; el permiso técnico de líder se otorga aparte |
| Roster | `ImportJob` de tipo roster | Archivo por término con el que GH carga o actualiza miembros, comités, cargos y estados |
| Permiso | `Permission` | Derecho técnico: `ADMIN`, `BOARD` o `COMMITTEE_LEADER` de un comité (todas las capacidades de ese comité). No es un título |
| Término | `Term` | Semestre académico (`2026-2`) con fechas; reloj universal del sistema |
| Cierre de puntos | `Term.pointsClosedAt` | Momento desde el que el ledger del término no acepta más entradas |
| Ocasión | `Occasion` | Momento con check-in: actividad GH, asamblea o sesión de una edición |
| Check-in | `CheckIn` | Registro de una persona en una ocasión; único por par |
| Modo anfitrión | `CheckIn.source=HOST` | El organizador marca el check-in por la persona |
| Código rotativo | `Occasion.requireRotatingCode`, `Occasion.rotatingSecret` | Código de 6 dígitos derivado del secreto de la ocasión que cambia cada minuto; el QR de la consola lo embebe para evitar QR reenviados |
| Consola de la ocasión | `/admin/ocasiones/[id]` | Pantalla del organizador: QR, contador en vivo, pendientes, asistentes, alta manual y ciclo de vida |
| Cierre automático | `participation.auto-close` | Job horario que cierra una ocasión abierta 24 horas después de vencida su ventana de check-in |
| Serie semanal | `createOccasionSeries` | Reuniones de comité creadas de una vez, mismo día y hora hasta el fin del término, cada una una ocasión independiente |
| Vista del comité | `/admin/comites/[slug]` | Lo que ve quien dirige un comité o es su líder técnico: pestañas por área según sus capacidades ([ADR-058](adr/ADR-058-direccion-del-comite-por-areas.md)) |
| Rubro | `BudgetLine` | Partida del presupuesto anual de un comité con su monto asignado |
| Traslado | `BudgetTransfer` | Movimiento de disponible entre dos rubros del mismo presupuesto, con motivo ([ADR-059](adr/ADR-059-presupuesto-del-comite.md)) |
| Entrada de puntos | `PointEntry` | Fila del ledger: crédito por check-in, ajuste, reversión o legado |
| Ledger | `PointEntry[]` | Historial inmutable de puntos; el saldo es la suma |
| Reversión | `PointEntry.kind=REVERSAL` | Entrada que anula otra; nunca se edita la original |
| Score de comité | `CommitteeParticipation` | Participación relativa de un comité en una ocasión y su promedio por término |
| Tablero | ranking | Clasificación del término: nuevos, veteranos y comités; el miembro ve el top 10 y su propio puesto |
| Nivel | `points.levels` | Tramo del saldo del semestre según cortes configurables (0, 100, 250, 500, 1000) con las etiquetas de T-082 |
| Standing del término | `TermStanding` | Snapshot de los tableros al cerrar los puntos, con ids y nombres congelados |
| Asamblea | `Occasion.kind=ASSEMBLY` | Ocasión sin puntos que cuenta para el requisito del término |
| Requisito de asambleas | `AssemblyRequirement` | Las asambleas obligatorias de una persona en un término: una ordinaria y, en segundo semestre, la elección de junta y su segunda vuelta |
| Asamblea obligatoria | `AssemblyRequirement` | Faltar a una implica expulsión de la OE; la app avisa antes y propone la salida en el cierre. Distinta del criterio del 10 %, que exige tres asistencias |
| Elección de junta | `assemblyKind=BOARD_ELECTION` | Asamblea especial del segundo semestre donde se vota la junta del año siguiente; obligatoria para toda la OE |
| Segunda vuelta | `assemblyKind=RUNOFF` | Repetición de la votación cuando no hay ganador; también obligatoria |
| Tasa suavizada | `CommitteeParticipation.smoothedRate` | Participación relativa corregida hacia la media de la ocasión para no premiar el azar de los comités pequeños |
| Permanencia | `PermanenceSnapshot` | Resultado del término por cada comité: tabla general más tabla del comité frente al umbral de su condición (60, 80 o 70); se recalcula por outbox y el miembro lo ve en vivo |
| Criterio de permanencia | `PermanenceRule` | Fila de una tabla: peso (el máximo que da), a quién aplica, cómo se calcula y sus parámetros |
| Tabla de permanencia | `PermanenceTable` | La general de GH o la de un comité en un término; GH la comenta y la bloquea |
| Lo que aún es posible | `remaining` | Cuánto puede sumar todavía la persona en un criterio con las ocasiones que faltan, los grupos abiertos, los puntajes y los créditos pendientes |
| Grupo de trabajo | `WorkGroup` | Equipo por término: comité de trabajo, GT de macroevento, GAP, GAP OE, barra brava o tarea de nuevos |
| Comité de trabajo | `WorkGroup.kind=WORK_COMMITTEE` | CAP (Acompañamiento Presidencial), CGH (Gestión Humana), CCM (Creatividad y Mercadeo), CAE (Alianzas Estratégicas), CML (Mejoramiento Logístico), CAF (Acompañamiento Financiero) o Athletic; distintos de los comités de pertenencia |
| GT de macroevento | `WorkGroup.kind=GT_MACROEVENT` | Grupo de trabajo de una edición de Inventiva, Días EAFIT o EnFemenino |
| GAP | `WorkGroup.kind=GAP` | Grupo de apoyo a un evento de un comité distinto al propio o a un macroevento |
| GAP OE | `WorkGroup.kind=GAP_OE` | Grupo de apoyo a eventos de la Junta Directiva (VTG, Assessment) |
| Barra brava | `WorkGroup.kind=BARRA_BRAVA` | Apoyo al Athletic OE en al menos tres encuentros con trabajo demostrable |
| Evaluación de desempeño | `WorkGroupMembership.evaluation` | Juicio del evaluador del grupo (director de GH del frente) sobre si la persona cumplió con buen desempeño; insuficiente lleva observación |
| Evaluador | `WorkGroupEvaluator` | Quien evalúa un grupo; entra al admin por esa fila, sin permiso técnico, dentro de la ventana de evaluación |
| Ventana de evaluación | `permanence.evaluationWindowDays` | Las dos semanas antes del fin del término en que los evaluadores registran el desempeño |
| Puntaje del líder | `LeaderScore` | Valor que el líder del comité asigna en un criterio de su tabla, con observación obligatoria si baja del peso |
| Crédito manual | `ManualCredit` | Reconocimiento a mano de GH en un criterio manual, con motivo |
| Decisión de permanencia | `PermanenceDecision` | Lo que GH confirma en el cierre por comité (continúa, prueba, sale del comité) y por persona (continúa, sale de la OE); la app la propone y un job la aplica |
| Categoría de ocasión | `Occasion.category` | Integración, partido del Athletic, reunión de comité, charla, taller, social u otra; la usan los criterios |
| Tabla general | `PermanenceRule.scope=GENERAL` | Criterios de permanencia de la junta, aplicados por GH a toda la OE; vale unos 50 puntos |
| Tabla del comité | `PermanenceRule.scope=COMMITTEE` | Criterios de permanencia propios de un comité, definidos por su líder; vale unos 60 puntos |
| Resultado por comité | `PermanenceSnapshot.results` | Parte general más la tabla de ese comité; una persona con varios comités tiene un resultado en cada uno |
| Periodo de prueba | `MembershipTerm.probation` | Condición de quien cerró por debajo de su umbral dentro de la banda de su condición (activo: 20 puntos; nuevo, prueba y transferencia: sin banda); el término siguiente debe cumplir 80 % en ese comité. Sin comité aplica a todos; con comité (`MembershipTerm.committeeId`) solo a ese ([ADR-060](adr/ADR-060-alineacion-con-la-normativa-2026.md)) |
| Transferencia interna | `CommitteeMembership.transferredIn` | Cambio de comité dentro de la OE, pedido desde Mi OE para el semestre siguiente o hecho por GH; ese término debe cumplir 70 % en el comité nuevo |
| Director de GH | `Appointment.kind=GH_DIRECTOR`, `WorkGroupEvaluator` | Quien evalúa, al cerrar el semestre, el buen desempeño de los grupos de su frente |
| GH principal | `Appointment.kind=GH_HEAD` | Cabeza de Gestión Humana; evalúa las tareas de nuevos y confirma el cierre |
| Reunión de comité | `Occasion.category=COMMITTEE_MEETING` | Reunión semanal del comité con asistencia por modo anfitrión; alimenta el criterio de asistencia |
| Puntaje del líder | `LeaderScore` | Valor que asigna el líder a un criterio como subcomité, liderazgo, destacado o convivencia, con observación si no es completo |
| Evento | `Event` | Identidad permanente (Días EAFIT, Inventiva) |
| Edición | `EventEdition` | Ocurrencia fechada de un evento, con lugar y organizadores |
| Sesión de edición | `Occasion.kind=EDITION_SESSION` | Momento de una edición con check-in |
| Formulario | `Form` | Formulario propio, público o de miembros, con campos tipados y acciones (crear persona, pipeline, edición, etiquetas) |
| Campo | `Form.fields[]` | Pregunta tipada de un formulario: texto, área, correo, teléfono, selección, multiselección, casilla o fecha |
| Acción del formulario | `Form.actions` | Lo que hace una respuesta además de guardarse: crear la persona como prospecto, entrar a un pipeline, inscribir a una edición, etiquetar |
| Respuesta | `Submission` (tabla `form_submission`) | Envío de un formulario, vinculado a una persona por correo |
| Honeypot | campo oculto de `/f/[slug]` | Trampa para bots: si viene llena, la app responde "gracias" sin guardar |
| Inscripción | `EditionRegistration` | Persona inscrita a una edición mediante un formulario |
| Organización (aliado) | `Organization` | Empresa, unidad de EAFIT, grupo estudiantil u otra entidad con la que la OE se relaciona |
| Contacto | `OrganizationContact` | Persona externa (`kind = EXTERNAL`) con rol en una organización; una es la principal |
| Pipeline | `Pipeline` | Proceso por etapas: admisión, patrocinio o personalizado |
| Etapa | `PipelineStage` | Columna del kanban, ordenada, con marca de ganada o perdida |
| Tarjeta | `Card` | Persona u organización avanzando por un pipeline |
| Patrocinio | `Card` en un pipeline `SPONSORSHIP` | Tarjeta de una organización para una edición, con monto, contraprestación y responsable |
| Dar de alta | `people.admitPerson` | Único camino a la membresía junto con el roster: crea la membresía, los comités y el consentimiento y manda la bienvenida |
| Kanban | `/admin/pipelines/[id]` | Tablero de columnas por etapa; las tarjetas se mueven con el selector o arrastrando |
| Interacción | `Interaction` | Entrada de la línea de tiempo de una persona: automática o nota manual |
| Nota | `Interaction.kind=NOTE` | Interacción escrita por alguien del equipo |
| Tarea | `Task` | Pendiente con responsable y vencimiento sobre persona, organización o tarjeta; de tipo general, solicitud de eliminación o solicitud de miembro |
| Solicitud | `Request` | Pedido del miembro desde Mi OE (licencia, retiro voluntario, cambio de comité para el semestre siguiente o excusa válida sobre una ocasión) que GH aprueba; aprobar ejecuta el comando en la misma transacción |
| Representante ante la Asamblea | `CommitteeRepresentative` | Titular y suplente que llevan la voz y el voto del comité a la Asamblea Directiva; miembros activos del comité (Regl. art. 14). El comité cuenta como representado cuando uno de ellos o cualquier cargo de dirección registra asistencia (`CommitteeAssemblyAttendance`); con tres faltas sin excusa en el semestre es causal de desactivación (Regl. art. 64; [ADR-060](adr/ADR-060-alineacion-con-la-normativa-2026.md) regla 7) |
| Sanción | `Sanction` | Llamado de atención, falta leve, falta grave, suspensión o inhabilidad para cargos del Reglamento (cap. 9 y Anexo 1), con causal y descargos, fechas derivadas (suspensión de 7 o 20 días, hasta un mes si es explícita, vigencia de un año) y revocación con motivo; con derechos suspendidos no hay reconocimientos ni avales, y una falta grave más otra sanción viva propone la expulsión en el cierre ([ADR-060](adr/ADR-060-alineacion-con-la-normativa-2026.md) regla 6) |
| Excusa válida | `Request.kind = EXCUSE` + `CheckIn.status = EXCUSED` | Falta justificada por una causal del Anexo 1 del Reglamento, presentada antes de la ocasión o hasta tres días hábiles después; la decide GH o la dirección del comité dueño de la ocasión y, aceptada, no da puntos ni cuenta como falta ni como obligatoria perdida ([ADR-060](adr/ADR-060-alineacion-con-la-normativa-2026.md) regla 5) |
| Convocatoria interna | `InternalCall` | Llamado a inscribirse en un grupo de trabajo con formulario opcional, cupo, ventana y selección por orden de llegada o manual |
| Inscripción a convocatoria | `InternalCallEntry` | Persona apuntada a una convocatoria: aplicada, aceptada, en lista de espera o rechazada; la aceptada crea la pertenencia al grupo por outbox |
| Tablero del admin | `/admin` | Inicio del admin con pendientes, vencidas, solicitudes, respuestas, tarjetas, convocatorias, ocasiones y alertas |
| Onboarding | `OnboardingProgress` | Pasos de la primera semana de un nuevo, ligados a sus criterios de permanencia |
| Reconocimiento | `Recognition` | Destacado del mes u otro mérito; con consentimiento de directorio se publica en la cartelera del comité y como insignia en las tarjetas |
| Cartelera del comité | `Announcement.committeeId` | Anuncios de miembros que solo aparecen en la página interna de ese comité |
| Panel de la junta | `/admin/junta` | Indicadores agregados sin nombres para ADMIN y el permiso `BOARD`: retención, nuevos, permanencia, reuniones, integraciones y asambleas |
| Etiqueta | `Tag` | Marca libre sobre personas u organizaciones |
| Segmento | `Segment` | Filtro guardado que alimenta campañas, exportes y listas |
| Anuncio | `Announcement` | Publicación de la cartelera, pública o de miembros, con push opcional |
| Campaña | `Campaign` | Envío de una plantilla de correo a un segmento, en lotes por minuto, con la audiencia congelada al arrancar |
| Destinatario de campaña | `CampaignRecipient` | Cada persona de una campaña con su estado: pendiente, enviado, fallido u omitido (sin correo, baja, sin consentimiento, cancelada) |
| Plantilla de correo | `EmailTemplate` | Asunto y cuerpo Markdown con variables por persona que alimenta las campañas |
| Mensaje | `Message` | Registro de cada correo o push enviado a una persona, con su tipo (transaccional, anuncio, puntos, recordatorio, encuesta, campaña) |
| Suscripción push | `PushSubscription` | Un dispositivo de una persona que recibe notificaciones web (endpoint y claves) |
| Preferencia de notificación | `NotificationPreference` | Qué quiere recibir cada persona: anuncios, puntos, recordatorios por push y campañas por correo; con su token de baja |
| Bus de notificaciones | `notification.requested` | Evento único con destinatarios, textos, URL y clave de deduplicación que `comms` entrega por push respetando la preferencia |
| Invitación de encuesta | `OccasionSurveyInvite` | Token propio de un asistente para responder la encuesta de una ocasión cerrada; marca que respondió, no qué |
| Respuesta de encuesta | `OccasionSurveyResponse` | Respuesta anónima (sin persona) agregada por ocasión y comité |
| Token del calendario | `CalendarToken` | Capacidad de solo lectura sobre la agenda propia para suscribir el calendario del celular; se regenera desde Ajustes |
| Consentimiento | `Consent` | Aceptación versionada de la política de datos para un propósito |
| Outbox | `Outbox` | Cola de eventos de dominio escrita en la misma transacción que la mutación |
| Alias legado | `LegacyAlias` | Ruta antigua de GHPOINTS (`/asamblea/…` y los `publicId` retirados) que sigue resolviendo a la ocasión nueva |
| Actor | `Actor` | La persona autenticada con sus permisos, validada en servidor |
| Carnet | `/app/carnet` | Acreditación personal: QR `oe1` de 24 horas en Mi OE y pases opcionales de billetera con QR `oe2` persistente |
| Cartelera | `/cartelera`, `/app` | Anuncios de la OE |
| Documento | `Document` | Estatutos, reglamento, actas: PDFs privados en el bucket con lector por artículos |
| Artículo | `DocumentArticle` | Unidad citable de un documento de normativa (capítulo, número, título, cuerpo, páginas), buscable en español |
| Token del carnet de la app | `signCarnet` / `verifyCarnet` | Firma HMAC `oe1` de 24 horas; revocar la billetera no la cambia |
| Token de billetera | `CarnetToken` / `readCarnet` | Capacidad opaca `oe2`, en claro para reemitir; generación y revisión verificadas en servidor, revocable sin cerrar sesiones |
| Pase de billetera | `WalletPass` | Reserva o pase Apple/Google con fechas y snapshots; emisión pendiente si aún no tiene `issuedAt` |
| Generación del carnet | `Membership.walletEpoch` | Contador que sube al salir o anonimizar; reactivar no restaura los pases de generaciones anteriores |
| Revisión del carnet | `CarnetToken.revision` | Número que aumenta al rotar el QR y permite saber si el pase publicado representa el token actual |
| Importación | `ImportJob` | Un archivo del roster (o un ensayo de migración) con su vista previa, su estado y su resumen |
| Solicitud de eliminación | `Person.deletionRequestedAt` + `Task.kind = DELETION_REQUEST` | Pedido del miembro para borrar sus datos; GH lo atiende anonimizando el perfil |
| Segmento guardado | `Segment.filter` | Etapa, estado, ingreso, comités, cargos, etiquetas, consentimiento y programa; alimenta exportes y, después, campañas |
| Medio | `MediaAsset` | Referencia a un archivo en el bucket (portada, foto, PDF) |
| Presupuesto del comité | `CommitteeBudget` | Ordinario anual o extraordinario de una actividad no prevista; se abre con las aprobaciones de Desarrollo Estudiantil y de la Vicepresidencia Financiera (Regl. art. 50) y puede llevar la sanción del 10 % por presentación tardía (art. 66) |
| Rubro | `BudgetLine` | Monto asignado dentro de un presupuesto; disponible = asignado + traslados recibidos − traslados salientes − gastos |
| Presolicitud | `BudgetPrerequest` | Pedido mensual del Financiero para acceder a los recursos; sin ella no hay gasto ese mes (Est. art. 38.3) |
| Aval de evento | `EventApproval` | Aprobación de la Presidencia antes de ejecutar, difundir o comprar para un evento (Regl. art. 35 par. 1); los gastos y traslados del evento se ligan a él |
| Inducción | `Occasion.category = INDUCTION` | Inducción de nuevos al inicio del semestre, obligatoria para ellos (Regl. art. 47); la permanencia y Mi OE muestran si asistió |
| Elegibilidad a honorario | `honoraryEligibility()` | Cuántos de los cinco requisitos del Regl. art. 23 cumple una persona según su historial (cargos completos de comité y macroevento, seis semestres activos, junta completa, un año en CT); informa, la junta decide |
| Premio OE | `Recognition.kind = OE_AWARD` + `award` | Reconocimiento anual en una de las dieciséis categorías del Regl. art. 71, registrado por ADMIN desde la Persona 360 |
| Horario preferencial | `listPreferentialSchedule()` | Junta, mesas directivas (máximo seis por comité) y directores de macroevento del término, exportable con correo para acreditarlo ante la Universidad (Regl. art. 72) |
| Verificación académica | `MembershipTerm.academicVerifiedOn` | Constancia de que Desarrollo Estudiantil o GH verificó los requisitos académicos del término, sin promedio ni materias (Est. art. 6 y 7; Ley 1581) |
| Reto relámpago | `Challenge` | Reto de un término que GH publica para la membresía elegible, con formato presencial (ocasión vinculada), trivia (1 a 5 preguntas) o misión con evidencia; premio base de 0 a 20 GH Points; estados `DRAFT`, `PUBLISHED`, `CANCELLED` y, derivados de sus fechas, programado, abierto y vencido ([ADR-067](adr/ADR-067-retos-boosters-y-coleccion.md)) |
| Participación en reto | `ChallengeParticipation` | Una por reto y persona: pendiente de revisión, completada, rechazada o anulada; guarda la entrega (respuestas o texto y evidencias) y el premio que reservó |
| Premio | `Reward` | Fila que reserva y luego confirma, libera o revierte los puntos de una participación o de una asistencia impulsada: base, extra, porcentajes, día y semana de Colombia y topes vigentes al reservar |
| Booster | `BoosterItem` | Impulso (+50 %) o Superimpulso (+100 %) personal de un uso, otorgado por un nivel de insignia o por GH con motivo; vence al terminar el semestre de emisión; se elige antes de participar |
| Campaña de puntos | `BoostCampaign` | +25 %, +50 % o +100 % que GH programa sobre un reto o una actividad durante una ventana; si coinciden aplica la más favorable |
| Tope diario y semanal | `gamification.caps` | Máximo de puntos extra por miembro (20 por día civil y 60 por semana desde el lunes, en Colombia) que suma el premio base de los retos y los extras de boosters; la asistencia normal, el Wordle, el 2048 y el Sudoku quedan fuera |
| Partida de 2048 | `Game2048Run` | Una partida del juego, con su semilla, la lista de movimientos, el puntaje que calculó el servidor y, si acreditó, el día y los puntos; se puede jugar sin límite y solo la primera del día que alcance el primer umbral acredita |
| Replay verificado | `replayGame2048()` | El servidor no lee el puntaje del cliente: rejuega la partida entera desde la semilla que él mismo repartió y la lista de movimientos, y el puntaje que sale de ahí es el único que vale |
| Partida de Sudoku | `SudokuRun` | Un tablero repartido a una persona, con su dificultad, su modo, las dadas, la solución que guarda el servidor y, si acreditó, el día y los puntos; se puede jugar sin límite y solo el primer tablero resuelto del día acredita |
| Dadas | `givens` | Los números con los que nace un tablero de Sudoku: 81 dígitos por filas donde 0 es una casilla vacía |
| Modo con ayudas | `assisted` | Partida de Sudoku que marca los errores al instante y da pistas a cambio de la mitad del premio; se fija al crear la partida y es el único caso en que la solución viaja al navegador |
| Dificultad del Sudoku | `difficulty` | La técnica más cara que el tablero exige: único lugar (`EASY`), único candidato (`MEDIUM`) o candidatos bloqueados y pares (`HARD`); no es la cantidad de dadas |
| Insignia | `BadgeDefinition` | Pieza del catálogo de la colección: familia (En parche, Explorador OE, Relámpago, Palabra a palabra) con tres niveles y umbral, o edición especial ligada a una ocasión o reto |
| Logro | `Achievement` | Nivel de insignia desbloqueado por una persona, con fecha, origen, semestre y si fue reconocido por la conciliación histórica; hasta tres se destacan en el directorio |
| Conciliación histórica | `BadgeReconciliationRun` | Corrida simulable, reanudable y repetible que reconoce logros a partir de asistencias aprobadas, retos completados y Wordles resueltos de cualquier semestre, sin puntos, boosters ni notificaciones retroactivas |
| Actividad voluntaria | `isVoluntaryOccasion()` | Ocasión `ACTIVITY` o `EDITION_SESSION` cuya categoría no es reunión de comité ni inducción; cuenta para En parche aunque no dé puntos y admite boosters solo si da puntos |
| Competencia (The Games) | `Competition` | La competencia por equipos de una edición de Días EAFIT; la de ensayo se opera igual y se archiva ([ADR-089](adr/ADR-089-the-games-competencia-por-equipos.md)) |
| Base (The Games) | `CompetitionBase` | Una estación de una jornada donde se enfrentan dos equipos por rotación; las de inflables son macro y valen doble |
| Rotación | `CompetitionRotation` | Una ronda de una jornada: cada base con un enfrentamiento y todos los equipos jugando, con su reloj |
| Enfrentamiento | `CompetitionMatchup` | Dos equipos en una base durante una rotación; su desenlace da los puntos |
| Código del equipo | `CompetitionTeam.codeHash` | Ocho caracteres que el capitán lleva impresos y que el operador pide para actuar en nombre del equipo; la casa guarda solo el hash |
| Apuesta (The Games) | `CompetitionMarket`, `CompetitionBet` | Una pregunta que abre el operador con dos o más equipos; cada equipo apuesta puntos virtuales por un ganador y la bolsa se reparte entre los que aciertan ([ADR-091](adr/ADR-091-apuestas-de-the-games.md)) |
| Vitrina | `getShowcase()` | El JSON público de una competencia que lee dias.oeeafit.com/the-games ([ADR-090](adr/ADR-090-api-publica-v1-vitrina-de-the-games.md)) |
