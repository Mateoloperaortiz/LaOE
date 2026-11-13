# ADR-194: La junta del semestre y sus comités de trabajo

- Estado: Propuesta
- Fecha: 2026-11-13
- Enmienda: [ADR-036](ADR-036-permanencia-fase-4.md) regla 6 (quién lidera el CCM) y [ADR-057](ADR-057-vicepresidencia-de-comunicaciones-y-publicidad.md) regla 2 (lo que quedó pendiente de confirmar)
- Relacionadas: ADR-034, ADR-060, ADR-188

## Contexto

Mateo pidió una forma de ver si los cargos de la junta están creados, junto con sus comités de trabajo. Hoy un cargo de junta se ve persona por persona, en la Persona 360 o en el directorio. Los comités de trabajo se ven aparte, en Grupos. Nada junta las dos cosas.

Al revisarlo apareció un error. Los Estatutos 2026 dicen quién dirige cada comité de trabajo:

| Comité | Lo dirige | Estatutos |
| --- | --- | --- |
| CAP | Presidencia | art. 23.10 |
| CML | Vicepresidencia Administrativa | art. 24.10 |
| CAE | Vicepresidencia de Relaciones Públicas | art. 26.8 |
| CCM | Vicepresidencia de Comunicaciones y Mercadeo | art. 27.8 |
| CGH | Vicepresidencia de Gestión Humana | art. 28.4 |
| CAF | Vicepresidencia Financiera | Reglamento art. 4.2 |

El catálogo de la casa (ADR-036 regla 6) le da el CCM a la Vicepresidencia de Relaciones Públicas. La ADR-057 dejó pendiente cambiarlo «cuando GH lo confirme». Los Estatutos ya lo confirman, y Mateo lo confirmó el 2026-11-13 con la lista completa: Presidencia, CAP; Gestión Humana, CGH; Comunicaciones y Mercadeo, CCM; Administrativa, CML; Relaciones Públicas, CAE; Financiera, CAF.

## Decisión

1. **El CCM lo lidera la Vicepresidencia de Comunicaciones y Mercadeo** (Estatutos art. 27.8). Al sembrar los comités de trabajo de un semestre, el CCM toma como líder a quien tenga ese cargo. Los comités que ya existen no cambian solos: la vista de la regla 2 los marca, y se corrigen desde el grupo.
2. **Una vista de la junta del semestre**, en el espacio Junta de la Operación (`/admin/junta/composicion`). Por cada uno de los seis cargos del art. 21, en ese orden:
   - quién lo tiene, o «Vacante»; y si su membresía no está activa (licencia, salida);
   - su comité de trabajo: si está creado en el semestre, quién lo lidera y en qué estado está.

   Los estados del comité son: al día, no está creado, sin líder, y lo lidera otra persona que no tiene el cargo.
3. **Arriba, un resumen.** Dice cuántas cosas hay por revisar, o que todo está al día. Cada nombre lleva a su Persona 360 y cada comité a su grupo, que es donde se corrige.
4. **Solo ADMIN.** La vista tiene nombres. El panel de la junta (`/admin/junta`) sigue mostrando solo agregados para BOARD ([ADR-036](ADR-036-permanencia-fase-4.md) regla 12). La nueva vista no se le abre a BOARD.
5. **Solo lectura.** Sembrar los comités que faltan sigue en Grupos, y los cargos se nombran desde la Persona 360. El Athletic no entra en la vista: no es un comité de la junta (Estatutos art. 43 par. 1; Reglamento art. 30).

## Consecuencias

- En producción, un CCM ya sembrado con la VP de Relaciones Públicas como líder aparecerá como «Lo lidera otra persona» hasta que se cambie el líder en el grupo.
- La semilla demo nombra una Vicepresidencia de Comunicaciones y Mercadeo, para que el CCM tenga líder también ahí.
- El aval de los comités de trabajo para candidatos a la junta (Reglamento art. 1.8) solo aplica si el comité está activo (par. 4). Esta vista muestra qué comités existen en el semestre, pero no registra avales: las elecciones siguen fuera de la casa.
