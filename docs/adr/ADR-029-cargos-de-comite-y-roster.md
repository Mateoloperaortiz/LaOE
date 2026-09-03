# ADR-029: Cargos dentro del comité y formato del roster

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-002, ADR-005, ADR-008, ADR-011, ADR-014

## Contexto

GH va a enviar el roster con las columnas `NOMBRE`, `APELLIDO`, `CORREO`, `CELULAR`, `PREGRADO`, `COMITES`, `ENTRADA A LA OE` y `ESTADO`. Mateo quiere agregar una columna con el cargo que la persona desempeña dentro de su comité: general del comité, financiero, publicidad, relaciones públicas, logística, gestión humana y otros que aparezcan. Una persona puede estar en hasta tres comités y tener un cargo distinto en cada uno.

## Decisión

1. **El cargo vive en la pertenencia al comité.** `CommitteeMembership.role` guarda el cargo por persona, comité y término, con un catálogo editable `CommitteeRole` sembrado con `GENERAL`, `FINANCIERO`, `PUBLICIDAD`, `RELACIONES_PUBLICAS`, `LOGISTICA`, `GESTION_HUMANA` e `INTEGRANTE` (por defecto). GH agrega cargos desde el admin; un cargo desconocido en un archivo se agrega desde la vista previa.
2. **General es el líder del comité.** Es un cargo visible con historia; el permiso técnico `COMMITTEE_LEADER` sigue siendo aparte (ADR-011). La importación propone otorgarlo a cada General, marcado por defecto, y ADMIN confirma. Un solo General por comité y término.
3. **Nombre y apellido separados.** `Person` gana `firstName` y `lastName`; `fullName` se compone de ambos y se usa en directorio y rankings; `preferredName` sigue siendo opcional.
4. **Formato del roster** definido en [13-importacion-del-roster.md](../13-importacion-del-roster.md): un archivo por término, cabeceras tolerantes a mayúsculas y tildes, `COMITES` con siglas separadas por coma o punto y coma, `ENTRADA A LA OE` como término, `ESTADO` con vocabulario cerrado, `CARGO` como "cargo de SIGLA" cuando hay varios comités. Columnas opcionales reconocidas: `TRANSFERENCIA`, `CORREO PERSONAL`, `OBSERVACIONES`.
5. **La importación no da de baja.** Quien no aparece en el archivo no se toca; darlo de baja es un comando explícito (ADR-003). Sí cierra pertenencias a comités que ya no figuran para ese término.
6. **Los datos sensibles siguen la regla de privacidad:** celular solo para ADMIN; el archivo original se guarda en el bucket privado y se conserva con el `ImportJob`.

## Consecuencias

- El directorio interno muestra "General de A3" o "Logística de PIXEL" junto a cada persona.
- El catálogo de cargos alimenta segmentos y campañas ("todos los financieros de los comités").
- Falta confirmar con GH el vocabulario de `ESTADO`, la lista completa de cargos y si General otorga el permiso sin confirmación.

## Precisiones (2026-09-02, respuesta de GH)

El vocabulario de `ESTADO` es `Activo`, `Licencia`, `Honorario`, `Retirado` y `Prueba`. Los cargos son exactamente los seis del punto 1. La base actual no tiene `CARGO`: llegará en una segunda entrega, por lo que la importación admite un **modo actualización** (archivo con `CORREO` y un subconjunto de columnas que solo toca esas columnas en personas existentes). Sigue pendiente, de Mateo, si General otorga el permiso de líder sin confirmación.
