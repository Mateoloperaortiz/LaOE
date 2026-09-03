# Visión

## La OE

La Organización Estudiantil es el grupo estudiantil más grande de la Universidad EAFIT: fundada en **1987**, alrededor de **700 integrantes** y **25 comités**, con áreas de mercadeo, gestión humana, finanzas, logística y publicidad. Sus macroeventos de marca son **Días EAFIT**, **Inventiva**, **EnFemenino** y **Subsidios-OE**. Contacto institucional: Bloque 29, oficina 525, oe@eafit.edu.co.

## Qué se construye

Una sola aplicación web con tres capas y una columna vertebral.

| Capa | Quién | Qué ve |
| --- | --- | --- |
| Portal público | Visitantes | La OE, cartelera, eventos y ediciones, comités, cómo unirse |
| Mi OE | Integrantes vigentes y honorarios del roster | Agenda, directorio, GH Points, progreso de permanencia, normativa, carnet, check-in por QR |
| Administración | Personas con permiso ADMIN y líderes de comité | Personas (CRM), contenido, participación, comunicaciones, sistema |

La columna vertebral es el **CRM de comunidad**: la persona como eje, con su ciclo de vida completo (prospecto, postulante, integrante, egresado), sus comités por semestre, sus cargos, su participación, sus formularios y sus comunicaciones en un solo lugar. Ver [02-crm.md](02-crm.md).

## Por qué ahora

GHPOINTS ya sirve [oeeafit.com](https://oeeafit.com) con portal, Mi OE, GH Points, asambleas y normativa. Funciona, pero sus reglas nacieron desde GH Points y acumuló dependencias: tres canales de login (Clerk, OTP, Entra), Teams, OpenAI y Railway Pro. La casa digital nueva parte de la persona y del principio "un solo lugar", con código y reglas nuevas.

## Principio rector: un solo lugar

Una app, una base de datos, un bucket, un admin, un proveedor de correo. Toda la infraestructura vive en un solo proyecto de Railway (app, Postgres y bucket), en el workspace que ya se paga.

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
| 2026-09-02 | Hosting: Railway, en el workspace Pro que ya se paga por GHPOINTS. Se evaluó Vercel + Neon + R2 y se descartó el mismo día ([ADR-021](adr/ADR-021-infraestructura-railway.md)) |
| 2026-09-02 | Esta iteración solo documenta; el código empieza después, fase por fase |
| 2026-09-02 | La carpeta del repositorio pasa de `Untitled` a `casa-digital`; el nombre del remoto sigue abierto |
| 2026-09-02 | Sin licencias de fuentes: Sofia Sans Extra Condensed y Plus Jakarta Sans (OFL) sustituyen a TT Bluescreens y NouvelR; el isotipo se usa como favicon con aval |
| 2026-09-02 | Medios: subida directa al bucket con `POST` prefirmado y CORS, entrega por redirección prefirmada ([ADR-022](adr/ADR-022-medios-prefirmados.md)) |
| 2026-09-02 | Entorno `staging` persistente desde la fase 0; `production` se crea en la fase 7; entornos de PR apagados ([ADR-023](adr/ADR-023-operacion-entornos-respaldo-correo.md)) |
| 2026-09-02 | Copia mensual cifrada (base + bucket) a Cloudflare R2 desde un servicio cron de Railway |
| 2026-09-02 | Repositorio remoto en GitHub: `LaOE`; la carpeta local sigue siendo `casa-digital` |
| 2026-09-02 | La política de tratamiento de datos ya está aprobada por la OE; falta subir su texto al repositorio |
| 2026-09-02 | Correo: Resend para transaccional con desbordamiento automático a SES; campañas por SES |
| 2026-09-02 | Tras el cutover se sigue en Railway Pro; sin Cloudflare delante por ahora |
| 2026-09-02 | Se evaluó mover toda la infraestructura a Cloudflare y se descartó: no tiene Postgres gestionado ni proceso permanente |
| 2026-09-02 | Reglas de GH confirmadas ([ADR-024](adr/ADR-024-reglas-de-participacion.md)): 1 a 3 comités; 2 asambleas ordinarias por término más la elección de junta y su segunda vuelta, obligatorias en el segundo semestre; código rotativo opcional por ocasión; score de comité por participación relativa con suavizado; las medallas de GHPOINTS no se migran; los egresados no entran en v1 |
| 2026-09-02 | Permanencia: la tabla de GH se vuelve criterios configurables por término, con umbral de 60 % y progreso visible para cada integrante ([ADR-025](adr/ADR-025-permanencia-scorecard.md)) |
| 2026-09-02 | Cada comité tiene su propia tabla de permanencia dentro de un presupuesto fijado por GH; el total de la persona suma la parte de la OE y la de su comité principal ([ADR-026](adr/ADR-026-permanencia-por-comite.md)) |
| 2026-09-02 | GH confirmó las reglas de permanencia ([ADR-027](adr/ADR-027-permanencia-reglas-de-gh.md)): resultado por cada comité (general ≈ 50 más la tabla de ese comité ≈ 60), umbrales fijos 60 % vigente, 80 % nuevo o en prueba, 70 % transferencia interna; periodo de prueba con margen de 10 puntos; GT por cantidad; asambleas obligatorias dos y tres para el 10 %; evalúan los directores de GH |
| 2026-09-02 | Consecuencias confirmadas por GH ([ADR-028](adr/ADR-028-permanencia-consecuencias.md)): más de 10 puntos por debajo sale del comité, y de la OE si no le queda otro donde cumpla; faltar a una asamblea obligatoria es expulsión; obligatorias una ordinaria en primer semestre y ordinaria más elección en segundo; evaluación al cerrar el semestre; Athletic con capitán y DT |

Hechos que sustentan varias de estas decisiones:

- `eafit.edu.co` corre en Microsoft 365 (MX en `outlook.com`); Google OAuth no verifica ese dominio para la mayoría de las personas.
- Railway Pro cuesta US$20 al mes con US$20 de uso incluidos; el workspace ya se paga por GHPOINTS y consume unos US$3 a 5, así que la app nueva cabe sin gasto adicional. RAM US$10 por GB-mes, CPU US$20 por vCPU-mes, volumen US$0,15 por GB-mes, buckets US$0,015 por GB-mes con operaciones y egreso gratis.
- Los respaldos programados de volúmenes (diario, semanal, mensual) existen en todos los planes de Railway; el PITR ya está configurado en el Postgres de GHPOINTS.
- Vercel + Neon + R2 se evaluó y descartó el mismo día: costaba lo mismo, repartía la infraestructura en tres paneles y obligaba a diseñar sin worker permanente (crons por minuto solo en Pro, cuerpo de 4,5 MB por función, Neon gratis con 100 CU-horas y suspensión a los 5 minutos).

## Alcance v1 (fases 0 a 7)

Portal público y contenido editable · Personas y Mi OE · Participación y GH Points con asambleas · Permanencia (la tabla de GH visible para cada integrante) · Formularios, admisión y aliados · Comunicaciones y PWA · Migración y cutover. Detalle y seguimiento en [09-roadmap.md](09-roadmap.md).

## Fuera de v1

Pagos y boletería, chat, feed social, Graph o sincronización con el directorio EAFIT, galería masiva de fotos de personas, sanciones automáticas por asambleas, WhatsApp Business API, passkeys (mejora posterior), LLM sobre normativa, reto relámpago, boosters, palabra del día y badges persistidos (su historia se conserva en el ledger como entradas `LEGACY`).
