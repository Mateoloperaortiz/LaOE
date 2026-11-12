# ADR-160: La navegación de Mi OE: Hoy, Agenda, Asistencia, Juegos y Yo

- Estado: Aceptada el 2026-11-08; se implementa por olas desde la ola 1 (enmendada por ADR-164)
- Fecha: 2026-11-06
- Enmienda: [ADR-044](ADR-044-experiencia-del-portal-y-mi-oe.md) reglas 5 y 6; [06-mapa-del-sitio](../06-mapa-del-sitio.md), sección Mi OE
- Relacionadas: ADR-040, ADR-044, ADR-047, ADR-049, ADR-067, ADR-074, ADR-075, ADR-158, ADR-159

## Contexto

La barra de Mi OE lleva Inicio, Agenda, Carnet, GH Points y Juegos (`src/app/app/layout.tsx`), y el menú «Más» agrupa el resto en Comunidad, Tu participación y Tu cuenta (ADR-044 regla 5).

El inicio está ordenado por bloques de módulo: saldo, agenda, carnet, próximo reto, permanencia, onboarding, comités y cartelera (ADR-044 regla 6). Lo que la persona tiene que hacer, como una encuesta, una evidencia, su disponibilidad o una convocatoria, queda repartido en esas páginas, y hay que ir a buscarlo.

Lo que más hace un miembro en el celular es registrar su asistencia, y hoy lo hace desde el carnet o con el código de la ocasión. Los avisos le llegan por push y por correo, pero en la app no hay un lugar donde verlos después.

El 2026-11-06 Mateo pidió una app usable, pensada como las grandes apps de comunidad. Unas maquetas con datos ficticios del mismo día probaron esta barra, la portada «Hoy» y la pantalla de asistencia registrada.

## Decisión

1. **La barra** pasa a ser Hoy · Agenda · Asistencia · Juegos · Yo.
   - **Hoy** reemplaza a Inicio (regla 2).
   - **Asistencia** es el botón central: escanear el QR de la ocasión, escribir el código rotativo o mostrar el carnet para que te registre el anfitrión. El carnet ([ADR-040](ADR-040-carnet-en-billeteras-fase-8.md)) vive aquí.
   - **Juegos** se queda ([ADR-075](ADR-075-biblioteca-de-juegos-y-2048.md)).
   - **Yo** recoge lo que hoy está en «Más»: GH Points, ranking e insignias, carnet, permanencia completa, comités, disponibilidad, solicitudes, convocatorias, fotos, egresados, normativa y ajustes. GH Points deja la barra, y su saldo pasa a Hoy y a Yo.
   - **El enlace a la Operación** para quien tiene un rol se conserva en la cabecera y también aparece en Yo ([ADR-049](ADR-049-navegacion-entre-mi-oe-y-administracion.md)).
2. **Hoy** ordena sus bloques por urgencia, y un bloque sin contenido no aparece:
   1. **Lo que sigue:** la próxima ocasión, con su registro y un solo botón principal.
   2. **Te toca:** lo pendiente de todos los módulos en una sola lista, con su fecha límite: encuestas, evidencias, disponibilidad, solicitudes y convocatorias. Los pasos de onboarding de los nuevos entran aquí mientras estén pendientes.
   3. **Tu permanencia:** cada comité con su umbral y una frase con lo que falta para llegar.
   4. **Cartelera.**
   5. **Juegos de hoy y tu próximo reto.**
   6. **Tus comités.**
3. **El centro de avisos.**
   - **Qué muestra:** la campana de Hoy abre los avisos que llegaron por push o por correo, con leído y no leído y filtros por tipo.
   - **Preferencias:** las de cada tipo siguen en Ajustes ([ADR-074](ADR-074-aviso-diario-del-wordle.md)).
   - **Persistencia:** guardar los avisos de cada persona y decidir cuánto tiempo se conservan va con su propia ADR, por la política de datos ([ADR-047](ADR-047-politica-de-datos-y-habilitacion.md)).
4. **Asistencia** usa las rutas actuales de check-in y del carnet. No cambia cómo se valida un registro: código rotativo, QR y modo anfitrión siguen como están.
5. **Momentos de marca** ([ADR-158](ADR-158-la-marca-en-dos-capas.md)): la asistencia registrada, el reto aprobado y la insignia nueva tienen su propia pantalla de éxito, con el «¡OE OE OE!».
6. **Bienvenida.** La primera vez que alguien ve la barra nueva le aparece una sola pantalla que explica dónde quedó cada cosa.

## Consecuencias

- **Alcance.** La barra, Hoy y Asistencia no cambian el dominio ni los permisos: leen lo que ya existe. El centro de avisos sí necesita guardar datos nuevos, y por eso va aparte.
- **Lecturas nuevas.** «Te toca» necesita que cada módulo exponga, por su API pública, los pendientes de una persona. Cada módulo se suma con su propia lectura.
- **Textos.** Los nombres de las pestañas, los bloques y la bienvenida entran a 14-copy con su código `T-…`.
- **Pruebas.** Las E2E que navegan por la barra de Mi OE cambian de destino y se ajustan en el mismo tramo.
- **Publicación.** Sale con la ola 1 del roadmap, antes de la inducción de 2027-1. Ese semestre empieza el 1 de enero de 2027; la fecha de la inducción es un dato pendiente de la OE.
- **Enmiendas aplicadas el 2026-11-08:**
  - ADR-044 suma esta ADR a las que la enmiendan y cierra con su sección «Enmienda».
  - 06-mapa-del-sitio anuncia la barra nueva al comienzo de su sección de Mi OE.

## Enmienda (2026-11-12, ADR-164)

La consecuencia «Publicación» cambia ([ADR-164](ADR-164-el-rediseno-sale-de-una-vez.md)). La barra nueva no sale con la ola 1 ni antes de la inducción de 2027-1: se construye en la rama `feat/rediseno` y sale con todo el rediseño, para todos de una vez.
