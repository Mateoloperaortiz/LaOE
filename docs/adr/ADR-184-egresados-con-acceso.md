# ADR-184: Egresados con acceso

- Estado: Aceptada (2026-11-13)
- Fecha: 2026-11-13
- Enmienda: ADR-051 (quién recibe el enlace de la junta), ADR-034 (qué depura una baja)
- Relacionadas: ADR-030, ADR-048, ADR-085, ADR-164, plan maestro del rediseño §7 (ola 5) y decisión abierta 8

## Contexto

La ola 5 del rediseño, «Hacia afuera», abre la casa a quienes ya no participan: egresados, padrinos, aliados y externos. La decisión abierta 8 del plan maestro preguntaba si los egresados vuelven a entrar y con qué.

Hoy la baja (`endMembership`) deja la membresía `INACTIVE`, la persona en `stage = ALUMNI` y, por el evento `membership.changed`, borra su contraseña, sus enlaces, sus sesiones y sus permisos (ADR-034, ADR-051). Nadie con la membresía inactiva vuelve a entrar.

Dos datos pesan en el «con qué»:

- El correo a EAFIT lo retiene Check Point (ADR-051). Por eso la casa no manda códigos por correo y entra con contraseña y con el enlace de un solo uso que emite la junta.
- `person.personalEmail` es contacto, nunca identidad: así quedó desde el esquema.

## Decisión

1. **Quién entra.** Un miembro activo, en licencia u honorario, como hasta hoy. Y un **egresado**: membresía `INACTIVE` con `endReason = GRADUATION` y sin anonimizar. La renuncia, la permanencia, la expulsión y la pérdida de la calidad de estudiante no vuelven a entrar. La regla vive en una sola función, `signInAccess`, en `people`, y responde `MEMBER`, `ALUMNI` o nada.
2. **Con qué.** Con la misma identidad, el correo institucional de `person.email`, y la contraseña. No se entra con el correo personal. El egresado no necesita recibir correo en la cuenta institucional: la junta le emite el **mismo enlace de un solo uso** de ADR-051, que ahora también se emite para un egresado, y él elige su contraseña.
3. **La baja depura lo de antes.** El efecto de la baja sobre identidad borra la contraseña, los enlaces y las sesiones de un egresado **hasta el instante de su salida** (`membership.endedAt`). El evento puede llegar después de que la junta le emitió el enlace y de que él eligió su contraseña, y lo nuevo no es de la baja. Para las demás salidas no cambia nada: después de la baja no se puede crear nada nuevo.
4. **Qué ve.** Un egresado no participa (`canParticipate` sigue siendo falso) y no tiene permisos: `resolveActor` no se los carga a quien no participa. Entra solo a las rutas de su red:
   - `/app/egresados`, que es su inicio;
   - `/app/oportunidades` (ADR-186);
   - `/app/padrinos` (ADR-185);
   - `/app/yo/trayectoria`;
   - `/app/avisos`;
   - `/app/ajustes`.

   `requireActor` lo manda a `/app/egresados` desde cualquier otra ruta, también desde la operación. Las acciones de Mi OE que son de quien participa usan `getMemberActor`, que para un egresado responde como sin sesión. Así la acción no llega al dominio aunque alguien arme el envío a mano.
5. **Su barra.** Red · Oportunidades · Padrinos · Tú (T-5008). En la red, una bienvenida dice que sigue en la red (T-5009). No ve el cambio de área a la operación.
6. **La autorización.** Entra con la autorización de tratamiento de datos que dio como miembro (ADR-048): la baja no la retira. Si la retiró, pasa primero por `/autorizacion`, como cualquiera. Que la política de datos nombre a los egresados queda en el contenido pendiente, junto con la política que ya bloquea la ola 3.

## Consecuencias

- **Sin migración.** La regla lee `membership.endReason`, `membership.endedAt` y `person.anonymizedAt`, que ya existen.
- **El actor lleva `access`.** `Actor.access` es `MEMBER` o `ALUMNI`. Las pruebas que arman un actor a mano lo llevan.
- **Lo que la baja depura en otros módulos no cambia.** Una suscripción push que el egresado registre antes de que corra el evento de su baja se borra con ella, y la vuelve a registrar.
- **Pendiente con la junta.** Que la política de datos incluya a los egresados y que la junta acepte emitir enlaces para ellos (contenido pendiente).
