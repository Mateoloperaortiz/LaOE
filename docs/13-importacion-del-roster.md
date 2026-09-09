# Importación del roster

El roster entra a la casa digital por un archivo que GH exporta de su base (CSV o Excel). Es la única puerta de entrada masiva de miembros: el login no crea personas ([ADR-002](adr/ADR-002-persona-como-eje.md)). El asistente de importación (fase 2) lee este formato, valida fila por fila, muestra qué va a cambiar y aplica todo en una transacción con auditoría. Reglas del cargo en [ADR-029](adr/ADR-029-cargos-de-comite-y-roster.md).

En el arranque limpio ([ADR-039](adr/ADR-039-arranque-limpio-fase-7.md)), el primer ADMIN se habilita mediante un bootstrap sin consentimiento. El roster real entra **desde este asistente**, después de publicar la política y activar `privacy.policyVersion`; una versión pendiente bloquea la aplicación antes de registrar personas.

## Columnas

### Ampliación del roster real (2026-09-08, ADR-046)

Se reconocen además `TIPO DE DOCUMENTO` (CC, TI, CE, PPT; también sus nombres completos), `DOCUMENTO`, `ID EPIK` y `FECHA DE NACIMIENTO` (AAAA-MM-DD). Son opcionales; documento e ID EPIK se conservan como texto. Una celda opcional vacía o inválida en estas cuatro columnas no borra el dato existente; los inválidos se advierten. ADMIN puede corregirlos desde la ficha y cada titular puede consultarlos y descargarlos. No se muestran en directorios ni carnés.

NUEVO y JUNTA equivalen a Activo; PERÍODO DE PRUEBA a Activo en prueba; PRÁCTICA e INTERCAMBIO a Licencia. JUNTA no concede cargos ni permisos. GRADUADO queda pendiente hasta contar con fecha o semestre de salida. Las diferencias de semestre de ingreso frente a una membresía ya registrada bloquean esa fila. Solo se crean semestres históricos necesarios para filas válidas.

Quienes estén en licencia pueden consultar Mi OE y gestionar sus datos personales; participación, nuevas credenciales y funciones administrativas siguen suspendidas. Ver [ADR-046](adr/ADR-046-integracion-roster-y-acceso-en-licencia.md).

Para la primera carga se prepara un CSV privado con A–L, físicamente sin CARNE, Columna1 ni hojas auxiliares: ignorar una columna en el asistente no la elimina del original que se guarda. Los errores de formato de fechas de Excel se corrigen desde valores comprobados antes de subirlo. Duplicados equivalentes se unifican; los conflictos, datos obligatorios faltantes y graduados permanecen en un reporte privado para una segunda carga. El CSV conserva el estado original.

### Contrato base

Las cabeceras se reconocen sin importar mayúsculas ni tildes. Un archivo por término.

| Columna | Obligatoria | Formato esperado | A dónde va |
| --- | --- | --- | --- |
| `NOMBRE` | Sí | Texto | `Person.firstName` |
| `APELLIDO` | Sí | Texto | `Person.lastName` (el nombre completo se arma con ambos) |
| `CORREO` | Sí | Correo institucional `@eafit.edu.co`, uno por persona | `Person.email`: es la identidad de acceso; se guarda en minúsculas |
| `CELULAR` | No | Dígitos, con o sin `+57`; se normaliza | `Person.phone`; visible solo para ADMIN |
| `PREGRADO` | No | Nombre del programa | `Person.program`; se sugiere el nombre del catálogo de programas EAFIT si coincide |
| `COMITES` | Sí | Siglas separadas por coma o punto y coma, por ejemplo `A3, PIXEL` | Una `CommitteeMembership` por sigla en el término del archivo; entre 1 y 3 |
| `ENTRADA A LA OE` | Sí | Término de ingreso `2024-2` (una fecha se convierte al término que la contiene) | `Membership.firstTermId`: define nuevo o veterano y su umbral de permanencia |
| `ESTADO` | Sí | `Activo`, `Licencia`, `Honorario`, `Retirado`, `Prueba` (vocabulario confirmado por GH) | `Membership.status`; `Prueba` además marca `MembershipTerm.probation` en el término del archivo |
| `CARGO` | No (columna nueva; la base actual de GH no la tiene, llegará en una entrega posterior) | Cargo dentro del comité, exactamente uno de estos seis: `General`, `Financiero`, `Publicidad`, `Relaciones Públicas`, `Logística`, `Gestión Humana`. Si la persona tiene varios comités, se indica en cuál: `General de A3; Logística de PIXEL` | `CommitteeMembership.role`; sin valor es `Miembro` |

Columnas opcionales que el asistente también reconoce si aparecen: `TRANSFERENCIA` (sigla del comité al que la persona se transfirió este término: umbral 70 %), `CORREO PERSONAL` (contacto, nunca acceso) y `OBSERVACIONES` (queda como nota en la línea de tiempo).

**Modo actualización.** Un archivo que trae `CORREO` y solo algunas columnas actualiza únicamente esas columnas en las personas que ya existen y no toca el resto. Así GH puede mandar primero el roster sin `CARGO` y después un archivo con `CORREO` y `CARGO` para completar los cargos. Las personas nuevas sí necesitan todas las obligatorias.

## Ejemplo

```text
NOMBRE;APELLIDO;CORREO;CELULAR;PREGRADO;COMITES;ENTRADA A LA OE;ESTADO;CARGO
Mateo;Lopera;mloperao1@eafit.edu.co;3001234567;Ingeniería de Sistemas;A3, PIXEL;2024-2;Activo;General de A3
Ana;Pérez;aperezg@eafit.edu.co;;Derecho;IUS;2026-2;Activo;
Juan;Gómez;jgomezr@eafit.edu.co;3109876543;Economía;ECO;2023-1;Licencia;Financiero
```

## Validaciones

Errores (la fila no se importa hasta corregirla en la vista previa):

- Correo vacío, repetido en el archivo, o fuera de los dominios institucionales configurados.
- Sigla de comité que no existe (la vista previa sugiere la más parecida).
- Más de 3 comités o ninguno.
- `ENTRADA A LA OE` vacía o con un término que no existe.
- `ESTADO` fuera del vocabulario.
- Cargo desconocido (se puede agregar al catálogo desde la vista previa) o cargo sin comité cuando la persona tiene más de uno.
- Dos `General` para el mismo comité en el mismo término.

Advertencias (se importa, pero se marca):

- Programa que no coincide con el catálogo; celular con formato raro; nombre en mayúsculas sostenidas (se conserva tal cual, se sugiere corregir).

## Qué hace la importación

1. **Vista previa** con tres grupos: personas nuevas, personas existentes con cambios (estado, comités, cargo, celular, programa) y sin cambios. Nada se aplica hasta confirmar.
2. **Consentimiento:** la importación **no** registra autorizaciones ([ADR-048](adr/ADR-048-autorizacion-en-el-primer-ingreso.md)). Cada persona autoriza en su primer ingreso a Mi OE, con fuente `SELF` y la versión publicada. Por eso la carga sigue exigiendo la política publicada y su versión activa: sin ellas esa pantalla no puede pedir nada.
3. **Comités por término:** crea las pertenencias del término del archivo; a quien ya existía y no aparece en un comité, le cierra esa pertenencia (`leftAt`) en el término. Quien no aparece en el archivo no se toca: darlo de baja es un comando aparte.
4. **Cargos:** guarda el cargo en la pertenencia. Para cada `General`, la vista previa propone otorgar el permiso técnico de líder de ese comité, marcado por defecto; ADMIN confirma.
5. **Nuevos y veteranos:** `ENTRADA A LA OE` fija el primer término; nuevo es quien entra en el término del archivo ([ADR-008](adr/ADR-008-tableros-derivados.md)).
6. **Auditoría e historia:** una transacción por lote, `AuditLog` por entidad, interacción "importado desde el roster 2026-2" en cada persona, `ImportJob` con el resumen y el archivo original en el bucket privado.
7. **Idempotente:** volver a subir el mismo archivo no duplica nada; la clave es el correo.

Cada semestre se sube el archivo nuevo con el mismo formato: así se actualizan comités, cargos y estados del término sin tocar el pasado.

## Precisiones de la fase 2 (2026-09-03, [ADR-034](adr/ADR-034-personas-y-mi-oe-fase-2.md))

- **Archivo.** CSV (UTF-8 con o sin BOM, separado por `;` o `,`, con comillas RFC 4180) o Excel `.xlsx` (se lee la primera hoja), de menos de 5 MB. Se sube desde `/admin/personas/importar`; el servidor lo guarda original en el bucket privado (`imports/AAAA/MM/<id>.<ext>`) y lo lee.
- **Tres pasos.** Archivo y semestre → columnas (las cabeceras se reconocen solas; el admin puede corregir el mapeo o ignorar una columna) → revisión y confirmación. La vista previa vive en un `ImportJob` en estado `PREVIEW`; confirmar aplica todo en una transacción y exige un código nuevo (step-up), porque escribe datos personales y puede otorgar permisos.
- **Semestres que no existen.** `ENTRADA A LA OE` puede traer semestres viejos: la vista previa los lista y al confirmar se crean con fechas por semestre calendario (1: 1 de enero a 30 de junio; 2: 1 de julio a 31 de diciembre). Son una convención, no una fecha real: se corrigen en `/admin/terminos`.
- **`Retirado`.** Una persona nueva con ese estado se crea como egresada (`INACTIVE`, motivo `OTHER`); una existente se da de baja con el comando de salida, motivo "roster {término}" y sin consentimientos (se capturan después). `Prueba` deja la membresía `ACTIVE` y marca `MembershipTerm.probation` en el término del archivo.
- **Celular.** Diez dígitos que empiezan en 3 se guardan como `+57…`; cualquier otro formato se conserva tal cual con advertencia.
- **Permisos de líder.** Se otorgan después de confirmar, uno por uno, con el mismo comando que usa `/admin/permisos`; si uno falla el resto sigue y queda en el resumen.
- **Modo actualización.** Una persona nueva en un archivo sin las columnas obligatorias es un error de fila; un archivo sin `CORREO` es un error del archivo. Un archivo con `CORREO` y `CARGO` aplica los cargos sobre los comités que la persona ya tiene en el término. Sin la columna `CARGO`, los cargos que ya existen se conservan (con la columna, un valor vacío es `Miembro`); sin la columna `TRANSFERENCIA`, se conserva la transferencia registrada.
- **Aplicar relee el archivo.** Al confirmar se vuelve a leer el original del bucket y a validar contra la base de ese momento; las filas con error se saltan y quedan contadas en el resumen, las demás se aplican en una sola transacción.
- **Cargos nuevos.** Un cargo desconocido se puede agregar al catálogo desde la vista previa; se crea al confirmar.

## Confirmado con GH (2026-09-02)

Los cinco valores de `ESTADO` son los que usa GH y los cargos son exactamente esos seis (más `Miembro` por defecto). `CARGO` no está en la base actual: llegará en una segunda entrega con el modo actualización. Queda una sola pregunta, de Mateo: si `General` otorga el permiso de líder sin confirmación ([decisiones-abiertas.md](decisiones-abiertas.md)).
