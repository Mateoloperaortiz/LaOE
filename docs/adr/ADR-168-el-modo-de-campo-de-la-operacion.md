# ADR-168: El modo de campo de la Operación

- Estado: Aceptada (2026-11-13)
- Fecha: 2026-11-13
- Desarrolla: [ADR-159](ADR-159-la-operacion-es-de-escritorio.md) (regla 6, «Modo de campo»)
- Relacionadas: ADR-035, ADR-037, ADR-058, ADR-089, ADR-118, ADR-167

## Contexto

ADR-159 regla 6 decidió que, por debajo de 1024 px, la Operación solo tiene pantallas propias para lo que se hace de pie, y el plan maestro (§5.6) las nombra: la consola de la ocasión como anfitrión, escanear un carnet, entregar y recibir inventario, aprobar una solicitud rápida y ver la tabla de The Games. El resto sigue funcionando en el celular, pero sin diseño propio.

Casi todo eso ya existe por separado. El modo anfitrión (ADR-035 regla 8) es móvil desde el principio: escanea el carnet y registra por nombre. La tabla de The Games tiene su panel de operador y la base del juez (ADR-089). Lo que falta es un lugar que lo reúna para el día, y decidir qué solicitud es «rápida». El inventario todavía no está integrado a la casa, así que entregar y recibir espera.

## Decisión

1. **Una pantalla de campo.** `/admin/campo` reúne lo de hoy que el actor puede operar. Cada cosa abre su pantalla de siempre, que vuelve a exigir su permiso:
   - **Sus ocasiones de hoy**: las abiertas y las que empiezan hoy aunque sigan en borrador, en la hora de la OE, que puede operar según ADR-058 (ADMIN, el líder técnico o la capacidad de ocasiones por cargo). Cada una muestra cuántos van registrados y cuántos esperan aprobación, y lleva a la consola de anfitrión, que escanea el carnet, y a la consola completa.
   - **Las excusas por aprobar**: solo para ADMIN, que es quien decide solicitudes (ADR-037 regla 9).
   - **The Games**: las competencias donde opera o juzga, con su tabla o su base.

   Un bloque vacío no aparece. Si no hay nada, la pantalla lo dice y manda a la Mesa.
2. **Qué solicitud es rápida.** Solo la excusa a tiempo. Aprobarla justifica una falta sin cambiar la pertenencia de nadie, y su motivo de aprobación es opcional, así que se aprueba con un toque y el mismo comando de la bandeja. Una excusa tardía pide motivo para aprobarse (ADR-060 regla 5) y rechazar cualquiera también, así que esas se abren en la bandeja. Las licencias, los retiros y los traslados cambian la pertenencia, así que siempre se abren en la bandeja, con su explicación.
3. **Pendientes en el modo anfitrión.** La consola de anfitrión suma la lista de asistencias por aprobar, con aprobar y rechazar, para quien las decide (ADMIN, como en la consola completa). Al decidir vuelve al modo anfitrión y no a la consola.
4. **El celular primero.** Las zonas táctiles miden al menos 44 px y la acción principal de cada tarjeta va abajo. Cuando hay una sola ocasión abierta, una barra fija abajo lleva a escanear un carnet en ella.
5. **Cómo se llega.** El menú del celular lleva «Modo de campo» debajo de la Mesa, y la Mesa lo ofrece por debajo de 1024 px. En el escritorio la pantalla también abre, pero no se anuncia.
6. **Después.** Entregar y recibir inventario entra cuando se integre el inventario, y la cola de registros sin señal llega en la ola 4, con su propia ADR.

## Consecuencias

- **Sin migración.** Lee lo que ya existe: ocasiones, asistencias, solicitudes y competencias.
- **Permisos.** La pantalla de campo no da permisos nuevos: muestra solo lo que el actor ya podía operar, y cada acción pasa por el mismo comando.
- **Pruebas.** E2E en el ancho de un celular: la ocasión de hoy con su conteo y el camino al modo anfitrión, aprobar una excusa con un toque, los pendientes del modo anfitrión y el aviso cuando no hay nada.
