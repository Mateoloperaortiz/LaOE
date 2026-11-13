# ADR-185: Padrinos

- Estado: Propuesta
- Fecha: 2026-11-13
- Relacionadas: ADR-034, ADR-166, ADR-184, plan maestro del rediseño §2 (el nuevo) y §7 (ola 5)

## Contexto

El plan maestro pone al nuevo como el arquetipo que más necesita compañía: inducción, primeras asistencias y saber si va bien. Para él dice «ruta del nuevo y, más adelante, padrino». La ola 2 ya le dio la ruta de permanencia. Faltaba el padrino: alguien que ya conoce la OE y que lo acompaña en su primer semestre.

Con ADR-184 los egresados vuelven a entrar a su red, así que también pueden ser padrinos.

## Decisión

1. **Quién.** El ahijado es un **nuevo del semestre en curso**: membresía activa con ese semestre como el de ingreso (`membership.firstTermId`), que es la definición de «nuevo» de los segmentos. El padrino es un **veterano que participa** (activo u honorario, con otro semestre de ingreso) o un **egresado con acceso** (ADR-184). Nadie es su propio padrino.
2. **Cuántos.** Un nuevo tiene a lo sumo un padrino por semestre: asignar otro lo cambia. Un padrino acompaña a lo sumo a **tres** nuevos por semestre (`MENTEES_PER_MENTOR`). Un candado consultivo por padrino evita que dos asignaciones a la vez pasen el tope.
3. **Quién asigna.** ADMIN, desde la Operación: `/admin/personas/padrinos`, un recurso del kit con crear, cambiar el padrino, quitar y exportar. El exporte lleva nombres, así que tiene datos personales (paso de seguridad y auditoría). Cuando la casa tenga un permiso propio de gestión humana, la asignación pasa a GH.
4. **Qué ve cada uno.** En Mi OE, `/app/padrinos`: el nuevo ve «Tu padrino» y el padrino «Tus ahijados». Solo se ven el nombre y los comités del semestre, más «Egresado» cuando aplica. Sin correo ni celular: el contacto lo hacen ellos, o GH al presentarlos. «Yo» lleva a la página, y un egresado la tiene en su barra.
5. **El aviso.** Asignar, o cambiar el padrino, avisa a los dos por el centro de avisos (ADR-166), con un enlace a la página.
6. **Datos.** La relación vive en `mentorship` (en `people`, migración 0070). Anonimizar a cualquiera de los dos la borra en la misma transacción, porque nombra a dos personas y no es historia institucional.

## Consecuencias

- **Migración 0070.** La tabla `mentorship`, con una relación por nuevo y semestre.
- **Pendiente.** Que la política de datos mencione a los padrinos (contenido pendiente). Y que la junta y GH decidan si el tope de tres les sirve.
