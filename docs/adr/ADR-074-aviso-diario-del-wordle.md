# ADR-074: Aviso diario del Wordle

- Estado: Aceptada
- Fecha: 2026-09-17
- Enmienda: ADR-041 (regla 6: el Wordle no emitía ningún push) y ADR-038 (reglas 2 y 5: un tipo de notificación y una preferencia más)
- Relacionadas: ADR-012, ADR-020, ADR-030, ADR-035, ADR-038, ADR-041, ADR-067

## Contexto

El 2026-09-17 Mateo pidió que el Wordle avise «tipo 9 am hora de Bogotá».

Hoy no avisa nada, y no por descuido: ADR-041 regla 6 dejó escrito que la jugada ganadora «no emite asistencia, recompute de comité ni push», y ningún otro camino del juego menciona una notificación. La partida se renueva a la medianoche de Colombia y se pierde al cambiar de día (ADR-041 regla 2): quien no entra a `/app/gh-points` por su cuenta, no juega, y hasta seis GH Points diarios dependen de acordarse.

El bus de notificaciones (ADR-038 regla 2) ya resuelve lo difícil —deduplicación por clave, preferencia por tipo, varios dispositivos por persona, borrado de las suscripciones muertas y una fila en `message`—, así que lo único que falta decidir es quién dispara el aviso, quién lo recibe y con qué interruptor se apaga.

Mateo decidió el 2026-09-17, sobre dos alternativas planteadas: interruptor propio en vez de colgarse de `pushPoints` o de `pushReminders`, y no avisarle a quien ya jugó ese día.

## Decisión

1. **Un programado a las 9:00.** Entrada `wordle` en `SCHEDULE` con cron `0 9 * * *` en `America/Bogota` (el huso del scheduler, ADR-020), que encola `participation.wordle-reminder`. Son cuatro horas después de que empiece el día del Wordle (05:00 UTC), con doce por delante para jugarlo.
2. **Solo si hay algo que jugar.** El handler no manda nada si no hay término vigente que contenga el día, o si ese término ya cerró sus puntos: es la misma condición `AVAILABLE` de `getTodayWordle` (ADR-041 regla 1). Sin ella el push llevaría a un tablero apagado.
3. **A quién.** Activos y honorarios no anonimizados —la audiencia de `listActiveMemberRefs`, la misma de un anuncio general— menos quien ya tenga partida de ese día, ganada, perdida o en curso: si ya abrió el tablero, el recordatorio sobra. Quien está en licencia sigue fuera del push (ADR-038 regla 15). Los destinatarios se parten en lotes de 1000 como el resto del bus.
4. **Interruptor propio.** Tipo `WORDLE`, gobernado por `pushWordle`, la quinta preferencia, encendida por defecto como las otras cuatro. Es el único push diario de la casa digital: colgarlo de `pushPoints` obligaría a callar también los puntos, los retos y las insignias, y de `pushReminders`, las asambleas obligatorias y la permanencia. El catálogo T-1080 se amplía al final para conservar los índices de las cuatro existentes, como ya se hizo con T-085 y T-667 (ADR-041 regla 9).
5. **Clave y texto.** `dedupeKey` `wordle:<día>` —una persona recibe el aviso una sola vez por día aunque el programado corra de nuevo—, texto T-2620, `tag` `wordle` para que el del día reemplace al que quedó sin abrir, y URL `/app/gh-points`, que es donde está el tablero. El aviso no dice nada de la palabra ni de la partida: la respuesta sigue sin salir del servidor (ADR-041 regla 8).
6. **El juego sigue sin emitir push.** ADR-041 regla 6 se mantiene tal cual para `wordle.completed`: lo que avisa es el programado, no la jugada. El aviso tampoco crea la partida ni reserva una respuesta; la asignación sigue ocurriendo cuando la persona pulsa jugar (ADR-041 regla 4), así que el catálogo del día no se agota por avisar.

## Consecuencias

- Migración aditiva `0034_aviso_diario_del_wordle`: el valor `WORDLE` en el enum `message_kind` y la columna `push_wordle` en `notification_preference` con `default true`. Ninguna fila existente cambia de sentido y las que no existen siguen naciendo perezosas con todo encendido.
- La preferencia nueva aparece en Ajustes, en el export de `GET /api/mis-datos` y en la pestaña Comunicaciones de la Persona 360 (ADR-038 regla 11), porque las tres leen la misma proyección.
- Para quien tenga las notificaciones activadas, el Wordle pasa a ser el push más frecuente que manda la casa digital: uno por día. Por eso el interruptor propio y por eso se salta a quien ya jugó.
- A las 9:00 también corre `notices` (ADR-038 regla 10), así que quien tenga un aviso de permanencia ese día recibirá dos notificaciones seguidas. Los de permanencia son de días contados y hoy ya conviven con los recordatorios de las 7:00.
- Un semestre sin término vigente, o con los puntos cerrados, deja de avisar solo: no hay que apagar el programado a mano entre semestres.
- Queda fuera, por decisión: recordar por correo, una segunda insistencia en el día, avisar a quien empezó la partida y no la terminó, y hacer configurable la hora. Cambiarla es editar el cron de `SCHEDULE`.
- Pruebas: unitaria de `shouldDeliver` con el tipo nuevo y de las preferencias por defecto; integración del programado (sin término, con los puntos cerrados, salta a quien ya jugó, respeta la preferencia apagada y no repite en el mismo día); E2E de la casilla en Ajustes.
