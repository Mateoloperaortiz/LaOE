# Glosario

Los nombres de la interfaz van en español; los identificadores del código, en inglés. Esta tabla es el contrato entre ambos.

| En la interfaz | En el código | Qué es |
| --- | --- | --- |
| Persona | `Person` | Cualquier ser humano del que la OE guarda datos: estudiante o contacto externo. Eje del CRM |
| Prospecto | `stage=PROSPECT` | Persona que llenó un formulario público sin convocatoria abierta |
| Postulante | `stage=APPLICANT` | Persona con tarjeta en un pipeline de admisión |
| Integrante | `stage=MEMBER` + `Membership` | Persona con membresía: vigente, en licencia u honorario |
| Egresado | `stage=ALUMNI` | Persona que dejó la OE (retiro o graduación); conserva su historia |
| Membresía | `Membership` | Estado de integrante con primer término, fin y motivo; una por persona |
| Vigente / En licencia / Honorario / Retirado | `ACTIVE` / `ON_LEAVE` / `HONORARY` / `INACTIVE` | Estados de la membresía. Entran a Mi OE vigentes y honorarios |
| Comité | `Committee` | Grupo de trabajo con ficha editorial y logo |
| Pertenencia a comité | `CommitteeMembership` | Persona en un comité durante un término; de 1 a 3 activas para vigentes |
| Cargo | `Appointment` | Rol visible con historia: líder de comité, junta, coordinación GH |
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
| Requisito de asambleas | `AssemblyRequirement` | Cuántas asambleas debe firmar una persona en un término |
| Evento | `Event` | Identidad permanente (Días EAFIT, Inventiva) |
| Edición | `EventEdition` | Ocurrencia fechada de un evento, con lugar y organizadores |
| Sesión de edición | `Occasion.kind=EDITION_SESSION` | Momento de una edición con check-in |
| Formulario | `Form` | Formulario propio, público o de integrantes, con campos tipados |
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
| Etiqueta | `Tag` | Marca libre sobre personas u organizaciones |
| Segmento | `Segment` | Filtro guardado que alimenta campañas, exportes y listas |
| Anuncio | `Announcement` | Publicación de la cartelera, pública o de integrantes, con push opcional |
| Campaña | `Campaign` | Envío de una plantilla de correo a un segmento |
| Mensaje | `Message` | Registro de cada correo o push enviado a una persona |
| Consentimiento | `Consent` | Aceptación versionada de la política de datos para un propósito |
| Outbox | `Outbox` | Cola de eventos de dominio escrita en la misma transacción que la mutación |
| Alias legado | `LegacyAlias` | Ruta antigua de GHPOINTS que sigue resolviendo a la ocasión nueva |
| Actor | `Actor` | La persona autenticada con sus permisos, validada en servidor |
| Carnet | `/app/carnet` | QR personal firmado para acreditación en ocasiones |
| Cartelera | `/cartelera`, `/app` | Anuncios de la OE |
| Documento | `Document` | Estatutos, reglamento, actas: PDFs privados con lector |
| Medio | `MediaAsset` | Referencia a un archivo en el bucket (portada, foto, PDF) |
