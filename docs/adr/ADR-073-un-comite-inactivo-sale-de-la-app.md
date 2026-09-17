# ADR-073: Un comité inactivo sale de la app

- Estado: Aceptada; en producción desde el 2026-09-17 (`8343855`)
- Fecha: 2026-09-17
- Enmienda: ADR-060 (reglas 7 y 8)
- Relacionadas: ADR-005, ADR-009, ADR-029, ADR-034, ADR-036, ADR-037, ADR-058, ADR-070, ADR-072

## Contexto

El 2026-09-16 Mateo pidió revisar que nueve comités que ya no funcionan (AXOLOT, IUS, IGPHI, SOS, BIG, VIP, COINCI, MERC y CIM) no aparezcan en la app. La revisión del código y una consulta de solo lectura a producción, con totales, mostraron esto:

- Seis de los nueve nunca se crearon. BIG está `INACTIVE` desde el 2026-06-01, e IUS y SOS desde el 2026-06-30. Los tres tienen la ficha publicada, pero el portal ya los ocultaba porque la lectura pública exige `ACTIVE` u `ON_TRIAL` (ADR-033).
- Aun así seguían apareciendo adentro. En el término 2026-2, **SOS iba 7.º en el ranking de comités** —el que se ve en el podio de Mi OE (ADR-070) y en `/admin/rankings`— con ocho ocasiones, 0 % de asistencia real y 2,19 % después del suavizado, por encima de once comités activos; **BIG iba 18.º** con cinco ocasiones. Todas esas filas son de ocasiones posteriores a la desactivación. En `/admin/asambleas`, **SOS sumaba cinco faltas sin excusa** del término, o sea la escalera del Regl. art. 64 corriendo sobre un comité que ya no existe.
- La causa de fondo es que el estado del comité no se usa fuera del portal. `listAllCommittees()` no filtra y alimenta unos veinte selectores, entre ellos el de transferencia de Mi OE, que le ofrecía los tres comités a cualquier miembro. `rankCommittees` y `listCommitteeRepresentation` tampoco filtran, y el cálculo de participación y de asistencia a asambleas sigue produciendo filas para un comité inactivo mientras le quede un miembro activo. Ninguna escritura comprueba el estado: ni la importación del roster, ni `admitPerson`, ni `setCommitteeMemberships`.
- Lo que sí filtraba: el portal, el directorio de Mi OE (ADR-069) y las alertas de viabilidad y de dirección (ADR-058, ADR-060 regla 8).

ADR-060 regla 8 definió el ciclo de vida (`ON_TRIAL`, `deactivatedOn`, avisos de las causales) pero no dijo qué deja de hacer un comité desactivado. Esto lo dice.

El 2026-09-17, antes de este cambio, Gestión Humana sacó a las tres personas que seguían con pertenencia vigente en IUS y en SOS, y publicó la ficha de ECO, que estaba activo en borrador.

## Decisión

1. **Vivos y desactivados.** Un comité `ACTIVE` u `ON_TRIAL` está vivo: se ofrece para elegir y recibe pertenencias. Uno `INACTIVE` no se ofrece en ningún selector de asignación y no recibe pertenencias nuevas; cerrar o quitar lo que ya existe sigue permitido, porque salir nunca se bloquea.
2. **Dos lecturas.** `listCommitteesForSelection(incluir)` devuelve los vivos más los ids que el registro que se está editando ya tiene, para no perder un valor guardado. Eso lo usan las pantallas que conocen el registro: la Persona 360 con los comités de la persona y el editor de un reto con su audiencia guardada. Los recursos del admin kit, que arman sus campos sin la fila, ofrecen solo los vivos. `listAllCommittees()` se queda para resolver nombres, para los filtros de búsqueda del admin, para el recurso Comités y para el historial.
3. **Escrituras.** `setCommitteeMemberships` rechaza abrir o reabrir una pertenencia en un comité inactivo (T-2618), y con eso quedan cubiertos el roster, la Persona 360, el alta y la transferencia aprobada. La importación del roster marca la fila como error en la vista previa, nombrando la sigla (T-2619), en vez de fallar al aplicar. La solicitud de transferencia comprueba el comité al crearse, porque el id llega del cliente (ADR-072 regla 1).
4. **Cálculos.** Un comité desactivado no compite ni acumula faltas. `rankCommittees` y `listCommitteeRepresentation` excluyen los `INACTIVE`, y el cálculo de participación por ocasión y de asistencia a asambleas no produce filas nuevas para ellos. Las filas ya calculadas se conservan como historia: dejan de leerse, no se borran. Si la junta reactiva un comité (Regl. art. 64: dos meses y periodo de prueba), vuelve a contar desde que queda `ON_TRIAL`.
5. **Dónde se sigue viendo.** En `/admin/comites` y su ficha, que es donde se desactiva y se reactiva; en el buscador ⌘K de ADMIN; en los filtros de búsqueda de Personas, presupuestos y ocasiones; en la Persona 360, el historial de cargos, la galería de egresados y las pertenencias ya cerradas. Nada de esto asigna nada. Un comité inactivo con la ficha publicada sigue fuera del portal, como ya era.
6. **El catálogo del seed refleja la realidad.** El seed deja de crear un comité por cada archivo de logo y usa el catálogo real: dieciocho activos y tres inactivos (BIG, IUS y SOS), con nadie asignado a los inactivos. Los logos de los seis comités que nunca existieron salen del repositorio, así que tampoco se ofrecen al elegir logo. Esto cierra el pendiente de `11-contenido-pendiente.md` sobre la lista de comités con logo.

## Consecuencias

- Sin migración, sin dependencias nuevas y con dos textos nuevos (T-2618 y T-2619).
- SOS y BIG salen del podio de 2026-2 y de la escalera de `/admin/asambleas` aunque sus filas sigan en la base.
- Gestión Humana no puede mover a nadie a un comité inactivo sin reactivarlo antes. Es el efecto buscado: reactivar es una decisión de la junta con periodo de prueba, no un efecto lateral de editar una persona.
- Desactivar un comité no cierra las pertenencias vivas: cerrarlas dejaría a alguien sin comité y el mínimo es uno (ADR-024). Siguen visibles en la Persona 360 hasta que Gestión Humana las mueva, y mientras tanto ese comité ya no compite ni acumula faltas.
- Un comité nuevo en periodo de prueba se comporta como uno activo en todo lo anterior; lo único propio de la prueba son sus umbrales (ADR-060 regla 8).
- La jornada de activación deja de mostrar el chip de un comité desactivado. Quien siga con una pertenencia viva ahí sigue contando en el total del semestre, porque el total se gobierna por quién puede entrar, no por el comité.
- La importación del roster es más estricta que el dominio: rechaza la sigla desactivada aunque la persona ya esté adentro. Un archivo del semestre no debería nombrar un comité que ya no existe, y el aviso dice qué hacer.
- Pruebas: integración del rechazo al asignar (roster, alta, 360 y transferencia), del ranking y de la escalera sin los inactivos, y de las lecturas de selección; unitarias de la validación del roster; E2E de la transferencia en Mi OE, que ya no ofrece un comité desactivado.
