# ADR-106: La base empieza con la rotación y el líder confirma poderes y resultado

- Estado: Aceptada
- Fecha: 2026-10-02
- Relacionadas: ADR-089, ADR-098, ADR-101, ADR-105
- Enmienda:
  - ADR-098, regla 4: el líder ya no empieza la base. Los poderes se registran con la rotación en curso hasta que el líder los confirma o registra el resultado.
  - ADR-089, regla 10: el juez registra el resultado una sola vez. Cambiarlo es de la operación.

## Contexto

En la jornada 1, Mateo vio que a muchos líderes se les olvidaba tocar «Empezar la base» cuando él iniciaba la rotación.

**Qué pasaba con eso:**
- Si algún equipo tenía tarjetas, el líder no veía los botones del resultado hasta empezar la base.
- Mientras tanto, los poderes seguían abiertos durante el juego.
- Además, el líder podía cambiar el resultado hasta que la operación cerraba la rotación.

**Lo que pidió Mateo el 2026-10-02:**
- La base empieza sola cuando él inicia la rotación.
- Los poderes se registran después de ese inicio. El líder los confirma con un aviso de «¿seguro?», y desde ahí quedan bloqueados.
- El resultado lleva el mismo aviso y queda bloqueado. Si hay que cambiarlo, el líder llama a la operación, que es quien lo cambia.

## Decisión

1. **La base empieza con la rotación.** Con la rotación en curso, la pantalla del líder trae de una vez los poderes y el resultado; el líder ya no empieza nada.

2. **Poderes hasta que el líder los confirma.**
   - El líder registra las tarjetas que le entregan, como en ADR-098, y después toca «Confirmar poderes».
   - Un aviso le pregunta si está seguro: después ya no se agregan ni se quitan poderes en esa base.
   - Al confirmar, `competition_matchup.startedAt` toma esa hora. Desde ahí se cierran los poderes y cuenta «1 min tarde».
   - Registrar el resultado también cierra los poderes, como ya pasaba.
   - **Si algún equipo registró un poder,** el líder confirma los poderes antes de ver los botones del resultado, porque esos poderes cambian el juego.
   - **Si nadie registró poderes,** ve los botones de una vez y no tiene que confirmar nada.
   - Una base inflable no tiene poderes.

3. **Resultado con aviso y bloqueado para el líder.**
   - Cada opción pide confirmar. El aviso dice qué queda y, con poderes, el resultado oficial y los puntos.
   - Ya registrado, el líder ve el resultado y la indicación de llamar a la operación si hay un error. No lo puede cambiar.
   - Si el líder repite el mismo resultado, no cambia nada, para que un doble toque no falle. Si manda otro, se rechaza.

4. **La operación cambia lo que haga falta.**
   - ADMIN, la Dirección y los operadores siguen corrigiendo o anulando el resultado en la mesa de control.
   - También siguen quitando un poder en Poderes, con motivo y volviendo a calcular el resultado (ADR-098).
   - Si la operación anula un resultado con la rotación en curso, el líder lo puede volver a registrar.
   - Agregar un poder después de cerrarlos sigue sin poderse, como en ADR-098.

5. **Sin migración.**
   - `startedAt` sigue siendo el momento en que se cierran los poderes; antes lo marcaba «Empezar la base».
   - Lo que dependía de ese momento queda igual: la cuenta de «1 min tarde» y el bloqueo para editar los cruces de una rotación con poderes.

6. **Seguimiento (ADR-105).** Una base sin resultado sale como «Falta», o como «Falta: poderes confirmados a las…» si el líder ya los confirmó.

## Consecuencias

- Desaparece el paso que se olvidaba. Los líderes ven el resultado desde el inicio, salvo cuando hay poderes por confirmar.
- **Corregir un resultado del líder** pasa a ser siempre de la operación, también cuando cambia el líder de la base a mitad de la rotación.
- **El cambio llega a mitad del evento.** Hay que avisarles a los líderes por su grupo: la base ya no se empieza; si hay tarjetas, se confirman los poderes; y el resultado se registra una sola vez.
- Los textos de «Empezar la base» pasan a ser los de «Confirmar poderes», con los mismos códigos.

## Verificación requerida

- **Unitarias:** qué ve el líder sin tarjetas, con tarjetas sin registrar, con poderes sin confirmar, con los poderes confirmados, con el resultado registrado y en una base inflable.
- **Integración:**
  - el líder repite el mismo resultado sin cambios y no puede cambiarlo;
  - la operación lo corrige;
  - después de que la operación lo anula, el líder lo vuelve a registrar;
  - el líder nuevo de una base no cambia el resultado del anterior.
- **E2E:**
  - el líder registra el resultado confirmándolo y después ve que quedó bloqueado;
  - con poderes, los confirma antes del resultado y la cuenta del minuto sigue al recargar.
