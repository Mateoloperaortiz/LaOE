# ADR-071: El GT de macroevento cumple el criterio GAP

- Estado: Aceptada; alcance confirmado el 2026-09-16
- Fecha: 2026-09-15
- Relacionadas: ADR-025, ADR-036, ADR-064, ADR-065
- Enmienda: ADR-065 y ADR-036, regla 3.

## Contexto

La tabla general cuenta GT y GAP como dos criterios independientes: `GT Macroeventos` por tramos 4/6/8 según macroeventos distintos acreditados, solo para veteranos, y `GAP` fijo en 5 % para todos. El cálculo mira únicamente los grupos cuyo tipo coincide con el de la regla, así que una pertenencia `GT_MACROEVENT` era invisible para la regla `GAP`: quien arma un macroevento tenía que registrarse además en el grupo de apoyo para que la tabla lo reflejara.

Esta equivalencia no sale de la normativa ni de una ADR anterior. La revisión del 2026-09-13 mapea los grupos de trabajo de macroevento y los GAP a dos artículos distintos (Est. art. 57 y art. 58) y clasifica el modelado en dos tipos como coincidente, sin conflicto ni vacío. ADR-064 fija que «Un cargo no acredita automáticamente buen desempeño» y ADR-065 que GT y GAP «conservan un grupo por macroevento y semestre, con identidad independiente». La decisión que sigue es de Mateo con GH, no la lectura de un artículo. Si el Estatuto 2026 llegara a establecerlo de forma expresa, el artículo se cita en una enmienda posterior con el texto del PDF firmado.

Antes de publicar se consultaron cuatro efectos del cambio con GH. Las respuestas del 2026-09-16 fijan su alcance: una misma participación puede pagar los dos criterios; ser GT ya cumple la función del GAP, así que no se trata de una inscripción que deja de sumar; el GT también le cuenta a un nuevo; y la regla rige siempre, no a partir de un semestre elegido.

## Decisión

Ser GT de un macroevento cumple la función del GAP: una participación acreditada en el GT cumple, por sí sola, el criterio GAP del término.

- **Acreditada quiere decir `GOOD`.** Una pertenencia GT con desempeño pendiente no acredita el GAP: cuenta como «lo que aún es posible» mientras la ventana de evaluación siga abierta y cae a cero cuando el término cierra, igual que cualquier otro grupo. Una evaluación insuficiente no aporta y tampoco bloquea: la persona puede seguir cumpliendo el criterio por su propio GAP. Se conserva la regla de ADR-065: «El registro pendiente no acredita puntos ni desempeño».
- **Paga los dos criterios.** El GT conserva sus tramos 4/6/8 en su propio criterio y además cumple el GAP. No se descuenta uno del otro.
- **Rige también para los nuevos.** La tabla de nuevos conserva sus sustituciones: el criterio GT sigue sin aplicarles, pero el GAP aplica a todos, y por él les cuenta el GT.
- **La equivalencia es un parámetro de la regla, no una constante del motor.** Un criterio `GROUP_EVALUATED` declara en `params.alsoCounts` qué otros tipos de grupo cuentan para él. Como la regla rige siempre, llega por los tres caminos por los que nace un criterio GAP: la tabla de referencia la trae, copiar la tabla del semestre anterior la conserva y un criterio GAP creado a mano en el editor la trae marcada. GH puede quitarla desde el editor sin desplegar, y la app respeta lo que quede guardado.
- **Alcance limitado al GAP.** El GAP OE de VTG/Assessment conserva su tipo y su cálculo separados, como fijó ADR-065, y el criterio compuesto de barra brava no cambia.
- **Un criterio fijado a un grupo concreto no admite equivalencia.** Si la regla trae un `code`, se evalúa contra ese grupo y `alsoCounts` se ignora.
- **Un macroevento cuenta una vez.** La identidad de un grupo pasa a ser su macroevento para los tipos `GT_MACROEVENT` y `GAP`: quien esté en el GT y en el GAP del mismo macroevento suma uno, no dos. Un GAP de un evento de otro comité, sin macroevento asociado, conserva su identidad propia.
- **«Siempre» no reabre cierres.** La regla rige desde que se publica sobre el semestre abierto y sobre los que vengan. Un semestre con la permanencia cerrada conserva su snapshot congelado y las decisiones que ya se aplicaron: la migración activa el parámetro solo en términos abiertos, no pisa una regla donde GH ya fijó la equivalencia, y encola el recálculo de cada término que toca.

## Consecuencias

Quien tenga un GT acreditado suma el 5 % del GAP además de sus tramos de GT, salvo que ya cumpliera el GAP por su cuenta. Con la tabla de referencia de 2026-2, un veterano con un GT pasa de 4 a 9 sobre 50 y con tres GT llega a 13; un nuevo con un GT pasa de 0 a 5 sobre 45. Quien ya estaba en el GT y en el GAP del mismo macroevento se queda en 9, porque el macroevento cuenta una vez. El máximo de cada tabla no cambia, porque no se agregan criterios ni se reponderan.

Quien es GT no necesita inscribirse al GAP para cumplirlo. Si también se inscribe, el registro sigue siendo válido pero no suma puntos adicionales en ese criterio.

Ese 5 % queda en manos de quien evalúa el GT —el director de GH del frente del macroevento— además de quien evalúa el GAP.

El desglose de permanencia muestra el grupo que acredita el criterio con su tipo, para que un miembro que ve el nombre de un macroevento bajo GAP entienda de dónde sale. No cambian los permisos, la asignación de evaluadores, las ventanas de evaluación, el cierre ni las decisiones.
