# ADR-101: Personal de The Games desde la hoja del GAP

- Estado: Aceptada
- Fecha: 2026-09-29
- Relacionadas: ADR-014, ADR-034, ADR-051, ADR-065, ADR-071, ADR-072, ADR-089, ADR-095, ADR-098
- Enmienda: ADR-089, regla 10: la operación carga desde la hoja del GAP a los líderes de base como jueces y al apoyo de cada base, que no tiene acceso.

## Contexto

La OE mandó dos hojas, «GAP JUEVES» y «GAP VIERNES», con el grupo de apoyo (GAP) de Días EAFIT que trabaja en The Games.

- **Columnas A a C:** Persona, Base y Función. La base va solo en la fila del líder y vale para las filas de abajo.
- **Funciones por base:** un líder, un calificador, dos o tres veedores y, en algunas bases, VAR.
- **Cuántos:** unas 100 personas. 35 trabajan los dos días, y hay 19 líderes distintos.
- **Numeración:** las bases van del 1 al 15 el jueves y del 16 al 30 el viernes, como en las fichas y en `the-games-2026`.
- **Personas:** las hojas traen solo nombres, a veces incompletos o sin tildes.

El GAP es el grupo de apoyo de un macroevento, un criterio de permanencia (`docs/12-permanencia.md`). Hay un solo GAP por macroevento y semestre (ADR-065).

**Lo que había en la casa:**
- El personal de una competencia solo tenía operadores y jueces, asignados de a uno.
- No había dónde poner al calificador, a los veedores ni al VAR.
- Nada convertía un nombre en una persona de la casa.
- El juez entra con su contraseña, que se pone con el enlace de activación que emite ADMIN o la junta (ADR-051).

**Lo que decidió Mateo el 2026-09-29:**
- Cada líder de base es el juez de su base en su jornada, y solo el líder registra.
- Todas las personas de las hojas entran al GAP de Días EAFIT del semestre, en el área The Games.
- El calificador, los veedores y el VAR de cada base se ven en Personal y en la pantalla del líder, sin acceso a nada.
- Vale la tabla por base de la hoja, no las listas de la derecha.

## Decisión

1. **Líder de base.** Es el `JUDGE` de su base, como ya dice ADR-098. La carga crea las filas `JUDGE` de la jornada.

2. **Apoyo de la base.** El calificador, los veedores y el VAR van en una tabla nueva, `competition_support`: la base, la persona y el rol (`GRADER`, `OVERSEER` o `VAR`). Una persona va una sola vez por base.
   - Ninguna lectura que da acceso la consulta. El acceso sigue saliendo solo de `competition_staff`.
   - Así, el apoyo no puede registrar, empezar una base ni entrar a `/admin`.

3. **Carga por jornada.** En Personal se elige la jornada y se pegan las columnas A a C de la hoja.
   - **Lectura:**
     - Un solo separador para todo el texto (tabulador, `;` o `,`), respetando las comillas.
     - Se saltan el encabezado, las filas sin persona y las de totales.
     - La base de la fila del líder vale para las de abajo. Una fila sin base arriba es un error.
   - **Función:** líder o líder de base, calificador, veedor o veedores, y VAR. Da igual cómo vengan las tildes, las mayúsculas, el plural y los espacios de más.
   - **Base, dentro de la jornada elegida:**
     - primero la que se llama «Base N»;
     - si no, la del puesto N;
     - el viernes también vale del 16 al 30 (el puesto N − 15);
     - un número de la otra jornada es un error.
   - **Persona**, entre los miembros `ACTIVE` u `HONORARY`:
     - **Exacta:** el nombre coincide sin mayúsculas, tildes ni espacios de más.
     - **Parcial:** los nombres coinciden en orden, pero a uno de los dos le sobran palabras, o una letra suelta vale como inicial. Exige al menos dos palabras de dos letras o más y un solo candidato. Queda para revisar.
     - **Ninguna o varias:** es un error, con hasta tres sugerencias. Se corrige escribiendo el nombre como está en la casa o el correo institucional.
   - **También son errores:** la misma persona dos veces en la jornada, las columnas de más y una persona que no es miembro activo ni honorario.
   - **Todo o nada:** cada error dice su línea, y si hay alguno no se guarda nada.

4. **Revisar y guardar.**
   - **Revisar muestra:**
     - los totales;
     - cada base con su líder, su calificador, sus veedores y su VAR;
     - los nombres parciales;
     - quiénes salen;
     - los avisos: una base sin líder o con dos, y un líder que sale de una base en juego.
   - **Guardar** vuelve a mandar el texto con una huella de lo revisado. Si algo cambió, muestra la revisión nueva en lugar de guardar.
   - **Al guardar:**
     - en una transacción con el bloqueo de la competencia, se reemplazan los jueces y el apoyo **de esa jornada** por los de la hoja;
     - los operadores y la otra jornada no se tocan;
     - las filas que siguen conservan su id;
     - la casa no guarda el texto pegado.

5. **Quién.**
   - Cargan ADMIN y la Dirección de The Games, con la misma vara que para asignar operadores.
   - Cualquier operador quita a una persona del apoyo.
   - Asignar un juez de a uno sigue como antes.

6. **Contraseña.** Personal marca a los líderes que todavía no tienen contraseña, porque sin ella no pueden registrar. ADMIN tiene ahí mismo el enlace a la jornada de activación (ADR-051).

7. **Pantalla del líder.** Muestra el calificador, los veedores y el VAR de sus bases, solo con nombres.

8. **Mis datos.** Incluye las filas de apoyo de la persona (ADR-034).

9. **Auditoría.** Nunca lleva nombres.
   - `competition.staff.import`: los conteos y los ids de los jueces que entran y salen, porque esos dan acceso. Si no cambió nada, no se audita.
   - `competition.support.remove`: la fila quitada.

10. **GAP de Días EAFIT.** ADMIN suma a todo el personal de la competencia al GAP del macroevento de su edición, en el semestre de la edición y con el área The Games. Cuenta a los jueces y el apoyo de las dos jornadas, sin los operadores.
    - A quien no está, lo agrega.
    - A quien ya está, le suma el área sin tocar su evaluación.
    - Se salta a quien no es miembro activo y a quien ya salió del grupo, y los lista.
    - La evaluación sigue siendo de GH (ADR-065, ADR-071).
    - Se implementa después del evento, porque no afecta la operación.

## Consecuencias

- **Migración `0044`, aditiva:** un enum y una tabla.
- **Ningún nombre entra al repositorio.** La hoja se pega en producción y no se guarda. Las pruebas y las semillas usan nombres inventados.
- **El ensayo no lleva nombres reales.** Cargar las hojas en `ensayo-2026` volvería jueces del ensayo a los líderes. El ensayo se prueba con miembros sintéticos.
- **Cambiar un juez a mitad del evento** le quita el acceso a la base, pero sus resultados y sus poderes quedan: guardan la persona, no la fila.
- **Queda pendiente** que el acceso de los jueces termine al archivar la competencia. Hoy sigue mientras existan sus filas.
- **Las diferencias de la hoja** entre la tabla por base y las listas de la derecha se le avisan a la OE.

## Verificación requerida

- **Unitarias:**
  - separadores, comillas, encabezado, base que baja y filas que se saltan;
  - funciones;
  - bases de las dos jornadas;
  - personas exactas, parciales, ambiguas y por correo, con sugerencias;
  - la misma persona escrita de dos maneras;
  - el cálculo de quién entra, sale o sigue;
  - la huella.
- **Integración:**
  - revisar y guardar;
  - reemplazar solo la jornada;
  - una huella vieja no guarda;
  - un error no guarda nada;
  - los permisos;
  - el apoyo no da ningún acceso;
  - un líder que sale en plena rotación;
  - el equipo en la pantalla del líder;
  - Mis datos;
  - quitar a alguien del apoyo.
- **E2E:** la carga con una línea mala y un nombre parcial, la vista por base y la pantalla del líder, con axe.
