# Visión

## La OE

La Organización Estudiantil es el grupo estudiantil más grande de la Universidad EAFIT: fundada en **1987**, alrededor de **700 integrantes** y **25 comités**, con áreas de mercadeo, gestión humana, finanzas, logística y publicidad. Sus macroeventos de marca son **Días EAFIT**, **Inventiva**, **EnFemenino** y **Subsidios-OE**. Contacto institucional: Bloque 29, oficina 525, oe@eafit.edu.co.

## Qué se construye

Una sola aplicación web con tres capas y una columna vertebral.

| Capa | Quién | Qué ve |
| --- | --- | --- |
| Portal público | Visitantes | La OE, cartelera, eventos y ediciones, comités, cómo unirse |
| Mi OE | Integrantes vigentes y honorarios del roster | Agenda, directorio, GH Points, normativa, carnet, check-in por QR |
| Administración | Personas con permiso ADMIN y líderes de comité | Personas (CRM), contenido, participación, comunicaciones, sistema |

La columna vertebral es el **CRM de comunidad**: la persona como eje, con su ciclo de vida completo (prospecto, postulante, integrante, egresado), sus comités por semestre, sus cargos, su participación, sus formularios y sus comunicaciones en un solo lugar. Ver [02-crm.md](02-crm.md).

## Por qué ahora

GHPOINTS ya sirve [oeeafit.com](https://oeeafit.com) con portal, Mi OE, GH Points, asambleas y normativa. Funciona, pero sus reglas nacieron desde GH Points y acumuló dependencias: tres canales de login (Clerk, OTP, Entra), Teams, OpenAI y Railway Pro. La casa digital nueva parte de la persona y del principio "un solo lugar", con código y reglas nuevas.

## Principio rector: un solo lugar

Una app, una base de datos, un bucket, un admin, un proveedor de correo. La infraestructura son tres paneles (Vercel, Neon, R2), pero el producto es uno.

| Hoy | En la casa digital |
| --- | --- |
| Excel/CSV del roster | Personas (CRM) con historial por semestre |
| Microsoft Forms + Power Automate + import CSV | Formularios propios: la respuesta cae directo en la persona |
| App GH Points aparte | Módulo Participación (misma persona, mismo ledger) |
| Clerk + OTP + Entra | Un solo acceso: OTP al correo del roster |
| Teams webhook / correos masivos | Cartelera + push web; correo solo transaccional y campañas segmentadas |
| Chat LLM de normativa (OpenAI) | Lector de documentos con búsqueda local en Postgres |
| Links sueltos (inscripciones, Linktree) | Ediciones con inscripción propia o enlace externo, desde el portal |

Fuera, a propósito: WhatsApp e Instagram (solo enlaces), pagos y boletería, Azure/Graph de EAFIT, Redis o colas de terceros.

## Decisiones cerradas

| Fecha | Decisión |
| --- | --- |
| 2026-09-01 | Público + integrantes; sin registro abierto: solo entra quien está en el roster |
| 2026-09-01 | GH Points automáticos al marcar asistencia a una actividad publicada |
| 2026-09-01 | Next.js (App Router) + TypeScript + PostgreSQL + Prisma; línea gráfica como primera clase |
| 2026-09-02 | La app nueva reemplaza y absorbe a GHPOINTS; migra sus datos y hereda oeeafit.com |
| 2026-09-02 | Todo el código y las reglas son nuevos; las ADR de GHPOINTS son referencia, no contrato |
| 2026-09-02 | Proyecto personal: sin Azure/Entra de EAFIT; identidad por correo del roster con OTP; presupuesto ~US$20/mes |
| 2026-09-02 | CRM v1 cubre postulantes y admisión, egresados y retirados, aliados y patrocinadores, contactos institucionales |
| 2026-09-02 | Hosting: Vercel Pro + Neon + Cloudflare R2 (elegido sobre Railway) |
| 2026-09-02 | Esta iteración solo documenta; el código empieza después, fase por fase |

Hechos que sustentan varias de estas decisiones:

- `eafit.edu.co` corre en Microsoft 365 (MX en `outlook.com`); Google OAuth no verifica ese dominio para la mayoría de las personas.
- En Vercel, los crons por minuto existen solo en Pro (Hobby: una vez al día, precisión de una hora); el cuerpo de request y de respuesta de una función tope en 4,5 MB; no hay procesos permanentes.
- Neon gratis: 0,5 GB por proyecto, 100 CU-horas al mes, suspensión del compute tras 5 minutos sin uso (no se puede desactivar), ventana de restauración de 6 horas.
- Cloudflare R2 gratis: 10 GB, 1 millón de operaciones de escritura y 10 millones de lectura al mes, egreso gratis.

## Alcance v1 (fases 0 a 6)

Portal público y contenido editable · Personas y Mi OE · Participación y GH Points con asambleas · Formularios, admisión y aliados · Comunicaciones y PWA · Migración y cutover. Detalle y seguimiento en [09-roadmap.md](09-roadmap.md).

## Fuera de v1

Pagos y boletería, chat, feed social, Graph o sincronización con el directorio EAFIT, galería masiva de fotos de personas, sanciones automáticas por asambleas, WhatsApp Business API, passkeys (mejora posterior), LLM sobre normativa, reto relámpago, boosters, palabra del día y badges persistidos (su historia se conserva en el ledger como entradas `LEGACY`).
