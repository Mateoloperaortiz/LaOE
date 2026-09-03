# Glosario

Los nombres de la interfaz van en español; los identificadores del código, en inglés. Esta tabla es el contrato entre ambos.

| En la interfaz | En el código | Qué es |
| --- | --- | --- |
| Persona | `Person` | Cualquier ser humano del que la OE guarda datos: estudiante o contacto externo. Eje del CRM |
| Correo personal | `Person.personalEmail` | Contacto opcional de egresados y externos; nunca sirve para iniciar sesión |
| Prospecto | `stage=PROSPECT` | Persona que llenó un formulario público sin convocatoria abierta |
| Postulante | `stage=APPLICANT` | Persona con tarjeta en un pipeline de admisión |
| Miembro | `stage=MEMBER` + `Membership` | Persona con membresía: activo, en licencia u honorario |
| Egresado | `stage=ALUMNI` | Persona que dejó la OE (retiro o graduación); no puede entrar (pierde el correo institucional) y conserva su historia como perfil de egresado |
| Perfil de egresado (memorial) | `stage=ALUMNI` + `Consent MEMORIAL` | Historia institucional de quien salió: comités, cargos, años, puntos; visible en la galería de egresados si hay consentimiento |
| Galería de egresados | `/app/egresados` | Lista por año de salida con cartel por año; "memorial" es el nombre interno |
| Membresía | `Membership` | Estado de miembro con primer término, fin y motivo; una por persona |
| Activo / En licencia / Honorario / Retirado | `ACTIVE` / `ON_LEAVE` / `HONORARY` / `INACTIVE` | Estados de la membresía. Entran a Mi OE activos y honorarios |
| Comité | `Committee` | Grupo de trabajo con ficha editorial y logo |
| Pertenencia a comité | `CommitteeMembership` | Persona en un comité durante un término; de 1 a 3 activas para activos |
| Cargo de junta o de GH | `Appointment` | Rol visible con historia fuera del comité: presidencia, vicepresidencias, GH principal, directores de GH |
| Cargo en el comité | `CommitteeMembership.roleCode` | Lo que la persona desempeña dentro de su comité en el término: General (líder), Financiero, Publicidad, Relaciones Públicas, Logística, Gestión Humana o Miembro |
| General | `roleCode=GENERAL` | Líder del comité; uno por comité y término; el permiso técnico de líder se otorga aparte |
| Roster | `ImportJob` de tipo roster | Archivo por término con el que GH carga o actualiza miembros, comités, cargos y estados |
| Permiso | `Permission` | Derecho técnico: `ADMIN` o `COMMITTEE_LEADER` de un comité. No es un título |
| Término | `Term` | Semestre académico (`2026-2`) con fechas; reloj universal del sistema |
| Cierre de puntos | `Term.pointsClosedAt` | Momento desde el que el ledger del término no acepta más entradas |
| Ocasión | `Occasion` | Momento con check-in: actividad GH, asamblea o sesión de una edición |
| Check-in | `CheckIn` | Registro de una persona en una ocasión; único por par |
| Modo anfitrión | `CheckIn.source=HOST` | El organizador marca el check-in por la persona |
| Código rotativo | `Occasion.requireRotatingCode` | Código en pantalla que cambia cada minuto para evitar QR reenviados |
| Entrada de puntos | `PointEntry` | Fila del ledger: crédito por check-in, ajuste, reversión o legado |
| Ledger | `PointEntry[]` | Historial inmutable de puntos; el saldo es la suma |
| Reversión | `PointEntry.kind=REVERSAL` | Entrada que anula otra; nunca se edita la original |
| Score de comité | `CommitteeParticipation` | Participación relativa de un comité en una ocasión y su promedio por término |
| Tablero | ranking | Clasificación del término: nuevos, veteranos y comités |
| Asamblea | `Occasion.kind=ASSEMBLY` | Ocasión sin puntos que cuenta para el requisito del término |
| Requisito de asambleas | `AssemblyRequirement` | Las asambleas obligatorias de una persona en un término: una ordinaria y, en segundo semestre, la elección de junta y su segunda vuelta |
| Asamblea obligatoria | `AssemblyRequirement` | Faltar a una implica expulsión de la OE; la app avisa antes y propone la salida en el cierre. Distinta del criterio del 10 %, que exige tres asistencias |
| Elección de junta | `assemblyKind=BOARD_ELECTION` | Asamblea especial del segundo semestre donde se vota la junta del año siguiente; obligatoria para toda la OE |
| Segunda vuelta | `assemblyKind=RUNOFF` | Repetición de la votación cuando no hay ganador; también obligatoria |
| Tasa suavizada | `CommitteeParticipation.smoothedRate` | Participación relativa corregida hacia la media de la ocasión para no premiar el azar de los comités pequeños |
| Permanencia | `PermanenceSnapshot` | Porcentaje del término según la tabla de GH; con 60 % la persona permanece en la OE |
| Criterio de permanencia | `PermanenceRule` | Fila de la tabla de GH: peso, a quién aplica y cómo se calcula |
| Grupo de trabajo | `WorkGroup` | Equipo por término: comité de trabajo, GT de macroevento, GAP, GAP OE, barra brava o tarea de nuevos |
| Comité de trabajo | `WorkGroup.kind=WORK_COMMITTEE` | CAP (Acompañamiento Presidencial), CGH (Gestión Humana), CCM (Creatividad y Mercadeo), CAE (Alianzas Estratégicas), CML (Mejoramiento Logístico), CAF (Acompañamiento Financiero) o Athletic; distintos de los 27 comités de pertenencia |
| GT de macroevento | `WorkGroup.kind=GT_MACROEVENT` | Grupo de trabajo de una edición de Inventiva, Días EAFIT o EnFemenino |
| GAP | `WorkGroup.kind=GAP` | Grupo de apoyo a un evento de un comité distinto al propio o a un macroevento |
| GAP OE | `WorkGroup.kind=GAP_OE` | Grupo de apoyo a eventos de la Junta Directiva (VTG, Assessment) |
| Barra brava | `WorkGroup.kind=BARRA_BRAVA` | Apoyo al Athletic OE en al menos tres encuentros con trabajo demostrable |
| Evaluación de desempeño | `WorkGroupMembership.evaluation` | Juicio del líder o de GH sobre si la persona cumplió con buen desempeño |
| Decisión de permanencia | `PermanenceDecision` | Resultado del cierre del término: continúa, continúa con compromiso o retiro |
| Categoría de ocasión | `Occasion.category` | Integración, partido del Athletic, reunión de comité, charla, taller, social u otra; la usan los criterios |
| Tabla general | `PermanenceRule.scope=GENERAL` | Criterios de permanencia de la junta, aplicados por GH a toda la OE; vale unos 50 puntos |
| Tabla del comité | `PermanenceRule.scope=COMMITTEE` | Criterios de permanencia propios de un comité, definidos por su líder; vale unos 60 puntos |
| Resultado por comité | `PermanenceSnapshot.results` | Parte general más la tabla de ese comité; una persona con varios comités tiene un resultado en cada uno |
| Periodo de prueba | `MembershipTerm.probation` | Condición de quien cerró hasta 10 puntos por debajo de su umbral; el término siguiente debe cumplir 80 % |
| Transferencia interna | `CommitteeMembership.transferredIn` | Cambio de comité dentro de la OE; ese término debe cumplir 70 % en el comité nuevo |
| Director de GH | `Appointment.kind=GH_DIRECTOR`, `WorkGroupEvaluator` | Quien evalúa, al cerrar el semestre, el buen desempeño de los grupos de su frente |
| GH principal | `Appointment.kind=GH_HEAD` | Cabeza de Gestión Humana; evalúa las tareas de nuevos y confirma el cierre |
| Reunión de comité | `Occasion.category=COMMITTEE_MEETING` | Reunión semanal del comité con asistencia por modo anfitrión; alimenta el criterio de asistencia |
| Puntaje del líder | `LeaderScore` | Valor que asigna el líder a un criterio como subcomité, liderazgo, destacado o convivencia, con observación si no es completo |
| Evento | `Event` | Identidad permanente (Días EAFIT, Inventiva) |
| Edición | `EventEdition` | Ocurrencia fechada de un evento, con lugar y organizadores |
| Sesión de edición | `Occasion.kind=EDITION_SESSION` | Momento de una edición con check-in |
| Formulario | `Form` | Formulario propio, público o de miembros, con campos tipados |
| Respuesta | `Submission` | Envío de un formulario, vinculado a una persona por correo |
| Inscripción | `EditionRegistration` | Persona inscrita a una edición mediante un formulario |
| Organización | `Organization` | Empresa, unidad de EAFIT, grupo estudiantil u otra entidad |
| Contacto | `OrganizationContact` | Persona externa con rol en una organización |
| Pipeline | `Pipeline` | Proceso por etapas: admisión, patrocinio o personalizado |
| Etapa | `PipelineStage` | Columna del kanban, ordenada, con marca de ganada o perdida |
| Tarjeta | `Card` | Persona u organización avanzando por un pipeline |
| Interacción | `Interaction` | Entrada de la línea de tiempo de una persona: automática o nota manual |
| Nota | `Interaction.kind=NOTE` | Interacción escrita por alguien del equipo |
| Tarea | `Task` | Pendiente con responsable y vencimiento sobre persona, organización o tarjeta |
| Solicitud | `Request` | Pedido del miembro desde Mi OE (licencia, retiro, cambio de comité, transferencia) que GH aprueba; aprobar ejecuta el comando |
| Convocatoria interna | `InternalCall` | Llamado a inscribirse en un grupo de trabajo con cupo y cierre; la inscripción aceptada crea la pertenencia al grupo |
| Onboarding | `OnboardingProgress` | Pasos de la primera semana de un nuevo, ligados a sus criterios de permanencia |
| Reconocimiento | `Recognition` | Destacado del mes u otro mérito, publicado en la cartelera y en el perfil |
| Panel de la junta | `/admin/junta` | Indicadores agregados para los cargos de junta: retención, nuevos, permanencia, asistencia a reuniones |
| Etiqueta | `Tag` | Marca libre sobre personas u organizaciones |
| Segmento | `Segment` | Filtro guardado que alimenta campañas, exportes y listas |
| Anuncio | `Announcement` | Publicación de la cartelera, pública o de miembros, con push opcional |
| Campaña | `Campaign` | Envío de una plantilla de correo a un segmento |
| Mensaje | `Message` | Registro de cada correo o push enviado a una persona |
| Consentimiento | `Consent` | Aceptación versionada de la política de datos para un propósito |
| Outbox | `Outbox` | Cola de eventos de dominio escrita en la misma transacción que la mutación |
| Alias legado | `LegacyAlias` | Ruta antigua de GHPOINTS que sigue resolviendo a la ocasión nueva |
| Actor | `Actor` | La persona autenticada con sus permisos, validada en servidor |
| Carnet | `/app/carnet` | QR personal firmado para acreditación en ocasiones |
| Cartelera | `/cartelera`, `/app` | Anuncios de la OE |
| Documento | `Document` | Estatutos, reglamento, actas: PDFs privados en el bucket con lector por artículos |
| Artículo | `DocumentArticle` | Unidad citable de un documento de normativa (capítulo, número, título, cuerpo, páginas), buscable en español |
| Token del carnet | `signCarnet` / `verifyCarnet` | Firma HMAC de 24 horas dentro del QR del carnet; solo la consola anfitrión lo lee |
| Importación | `ImportJob` | Un archivo del roster (o un ensayo de migración) con su vista previa, su estado y su resumen |
| Solicitud de eliminación | `Person.deletionRequestedAt` + `Task.kind = DELETION_REQUEST` | Pedido del miembro para borrar sus datos; GH lo atiende anonimizando el perfil |
| Segmento guardado | `Segment.filter` | Etapa, estado, ingreso, comités, cargos, etiquetas, consentimiento y programa; alimenta exportes y, después, campañas |
| Medio | `MediaAsset` | Referencia a un archivo en el bucket (portada, foto, PDF) |
