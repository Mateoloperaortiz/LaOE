# ADR-048: La autorización de membresía se da en el primer ingreso

- Estado: Aceptada; implementada y verificada en local
- Fecha: 2026-09-08
- Enmienda: ADR-014, ADR-034 (regla de consentimientos), ADR-046 (punto 7) y ADR-047 (punto 3)
- Relacionadas: ADR-002, ADR-030, ADR-037, ADR-039

## Contexto

Hasta hoy la autorización de tratamiento de la persona que entra por el roster la registraba la importación (`Consent` `MEMBERSHIP`, fuente `IMPORT`, `roster.ts:572`), apoyada en la aceptación que cada integrante da al ingresar a la OE ([ADR-047](ADR-047-politica-de-datos-y-habilitacion.md), punto 3). Eso obliga a la OE a poder mostrar esa evidencia por cada persona y deja la autorización a nombre de un tercero.

Mateo pidió que cada persona autorice ella misma la primera vez que entra. Es más fiel a la Ley 1581 de 2012: la autorización es previa, expresa e informada, y queda con su fecha, su versión y su IP, dada por el titular y no por la organización.

## Decisión

1. **La importación deja de registrar consentimientos.** `applyRosterImportAs` no crea `MEMBERSHIP`/`IMPORT`. Sigue exigiendo una versión de política activa: a quien se carga se le va a pedir la aceptación apenas entre, y sin política publicada esa pantalla no existe.
2. **Puerta de entrada en Mi OE.** Si la persona no tiene `MEMBERSHIP` vivo, `/app` muestra la política vigente y pide aceptarla antes de cualquier otra cosa. Aceptar registra `Consent` `MEMBERSHIP` con fuente `SELF`, la versión publicada, la fecha y la IP, por el `recordConsent` que ya existe, con su auditoría y su evento `consent.changed`.
3. **Lo que sigue disponible sin aceptar:** cerrar sesión, leer la política y los derechos del titular —descargar mis datos y solicitar la eliminación—. Los derechos no se condicionan a aceptar. El resto de Mi OE, el carnet, el check-in y los formularios de miembros quedan detrás de la pantalla.
4. **Alcance:** aplica a toda persona sin autorización viva, no solo a las importadas. Las dos personas que ya están en producción verán la pantalla en su próximo ingreso. Quien ya tenga un `MEMBERSHIP` vivo no la ve, y publicar una versión nueva no la vuelve a pedir ([ADR-047](ADR-047-politica-de-datos-y-habilitacion.md), punto 5).
5. **Textos:** la aceptación usa el T-150 que ya existe, con la versión publicada; el título, el botón y el aviso de la pantalla son códigos nuevos y su dueño es JUNTA. T-414 deja de decir que la OE registró la autorización al importar: la persona ve su propia aceptación con fecha y versión, y para retirarla pide la eliminación de sus datos.
6. **Menores de edad.** La aceptación propia de una persona de 17 años no equivale a la autorización de su representante legal. Esta ADR no resuelve ese punto: lo que la OE haga con esos casos se define aparte y se refleja en el texto publicado.

## Consecuencias

- La constancia de la admisión deja de ser el sustento de las autorizaciones nuevas: pasa a respaldar el periodo previo y la carga inicial, que ya no crea ninguna.
- Entre la carga y el primer ingreso de cada persona hay una ventana sin autorización viva. Durante esa ventana la OE conserva sus datos de membresía para gestionarla, sin comunicaciones ni publicación de foto, que dependen de sus propios consentimientos.
- La primera experiencia de cada integrante es una pantalla de autorización; conviene avisarlo por los canales de la OE antes de la asamblea.
- Cambia el orden de la operación: esta pantalla se despliega **antes** de cargar el roster. Cargar primero con el código actual estamparía 453 autorizaciones `IMPORT` que habría que revocar y volver a pedir.

## Implementación

- `src/modules/people/domain/roster.ts`: se quitó el `recordConsent` de cada fila. La importación conserva `requirePrivacyPolicyVersion`.
- `src/app/autorizacion/`: ruta propia **fuera de `/app`** para que el guard del layout no se redirija a sí mismo. La página lee el cuerpo publicado con `findPublicPage("privacidad")` y el estado con `getPrivacyPolicyState()`; su server action llama `recordConsentAs(actor, personId, "MEMBERSHIP", "SELF")`, que estampa versión, fecha e IP. Si la política volvió a `pendiente` entre la vista y el envío, vuelve a la pantalla en vez de romper.
- `src/app/app/layout.tsx`: `hasLiveConsent(personId, "MEMBERSHIP")` y, si no hay, `redirect("/autorizacion")`.
- `docs/14-copy-y-textos.md`: T-2085 a T-2088 nuevos y T-414 reescrito. La aceptación reutiliza T-150 con la versión vigente.
- Pruebas: integración `tests/integration/autorizacion.test.ts` (la aceptación propia registra `SELF` con la versión, auditoría y evento; repetirla no duplica) y `tests/integration/roster.test.ts` (la importación deja cero consentimientos); e2e `tests/e2e/autorizacion.spec.ts` (Mi OE redirige, la pantalla acepta y registra `SELF`; sin política publicada avisa y no ofrece el botón). El `global-setup` deja a las dos identidades sintéticas con su autorización viva, como cualquier persona que ya entró.
