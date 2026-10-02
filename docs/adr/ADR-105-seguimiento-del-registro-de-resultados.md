# ADR-105: Seguimiento del registro de resultados de The Games

- Estado: Aceptada
- Fecha: 2026-10-02
- Relacionadas: ADR-014, ADR-089, ADR-090, ADR-098, ADR-101, ADR-106

## Contexto

El viernes 2026-10-02, día de la jornada 2, Mateo pidió una lista de qué bases ya registraron su resultado. Quiere ver quiénes se demoran más para insistirles.

**Cómo se registra hoy:**
- En la casa solo registra el líder de la base, que es su `JUDGE` (ADR-101). El calificador, los veedores y el VAR no tienen acceso.
- El líder registra solo en la rotación en curso (ADR-089, regla 10). Lo que quede sin resultado al cerrar la rotación lo registra la operación en la mesa de control.
- La mesa de control muestra qué enfrentamientos faltan, pero no dice de quién es la base ni cuánto se demoró.

**Lo que la casa ya guarda:**
- cada resultado, con la hora y quién lo registró, incluidas las correcciones (`competition_result`);
- el inicio y el cierre de cada rotación;
- cuándo empezó cada base (ADR-098, regla 4);
- el líder y el apoyo de cada base (ADR-101).

**Lo que pasó el jueves:** quedaron registrados los 225 resultados. **La duración del viernes es provisional:** el reloj dice 50 minutos y no es la real (D-043 de DÍAS). Por eso no sirve para decir quién llegó tarde.

**Lo que eligió Mateo:**
- La lista muestra solo nombres, sin celulares.
- El aviso en la pantalla del líder entra el mismo día.

## Decisión

1. **Área «Seguimiento».**
   - Es una pestaña nueva del panel de la competencia y la ve la misma operación que el resto del panel: ADMIN, la Dirección y los operadores.
   - Es solo lectura: no escribe ni audita, y no necesita migración.
   - Se actualiza sola cada 15 segundos, como la mesa de control.

2. **La rotación en curso.** Una fila por base: primero las que faltan y después en el orden de las bases. Arriba va cuántas bases ya registraron.
   - **Falta:** la base no tiene resultado.
   - **Falta, con poderes confirmados:** el líder confirmó los poderes, a tal hora, y todavía no hay resultado (ADR-106).
   - **Registrada:** la hora del primer registro, los minutos desde el inicio de la rotación y quién registró: el líder o la operación.
   - Cada fila trae el líder y el calificador de la base, **solo con nombres**. El celular sigue siendo solo de ADMIN (ADR-014).

3. **Deudas.** Lista los enfrentamientos de rotaciones cerradas que siguen sin resultado, de las dos jornadas. Cada uno dice la rotación, la base, el líder y el calificador. El líder ya no puede registrarlos: le pasa el resultado a la operación, que lo registra en la mesa de control.

4. **Quién se demora más.** Una tabla por jornada con una fila por base.
   - **Qué jornada:** por defecto, la de la rotación en curso. Si no hay ninguna en curso, la de la última rotación que empezó.
   - **Columnas:**
     - la base, el líder y el calificador;
     - cuántos resultados registró el líder;
     - cuántos registró la operación;
     - cuántos faltan en rotaciones cerradas;
     - la mediana de minutos desde el inicio de la rotación hasta el primer registro;
     - cuántas veces fue la última base en registrar su rotación.
   - **Orden:**
     1. las que deben más resultados;
     2. las que más le dejaron a la operación;
     3. la mediana más alta;
     4. las más veces últimas.
   - **Cómo se mide:**
     - Cuenta el **primer** registro de cada enfrentamiento: una corrección después no le suma demora.
     - Se mide desde el **inicio de la rotación**, no contra su duración planeada.
     - Solo cuentan las rotaciones que ya empezaron.
     - «La última» se cuenta solo en las rotaciones cerradas. Si una base quedó sin resultado, la última es esa.
     - «El líder» es un juez actual de esa base. Si registró otra persona, cuenta como «la operación».
   - **Qué no mide:** no separa un juego largo de un líder lento. Sirve para comparar bases y saber a quién llamar. No es una evaluación del GAP.

5. **Aviso en la pantalla del líder.** En `/juez`, mientras su base no tenga resultado en la rotación en curso:
   - si al menos otra base ya registró, dice cuántas de cuántas ya registraron y que falta el suyo;
   - si una rotación cerrada quedó sin el resultado de su base, dice cuál y le pide pasárselo a la operación.
   - Solo cuenta bases; no nombra a nadie.
   - No depende del reloj: el cronómetro ya dice cuándo se cumplió el tiempo.
   - La pantalla ya se actualiza sola cada 10 segundos.

6. **DÍAS no cambia.** La vitrina no muestra nombres ni demoras (ADR-090).

## Consecuencias

- **Sin migración ni escrituras:** lee tablas que ya existen, así que se puede publicar en pleno evento.
- **El jueves ya se ve:** con la jornada 1, la tabla muestra el orden de ese día.
- **Nombres:** son los mismos que la operación ya ve en Personal (ADR-101).
- **Cambio de líder:** si se cambia el líder de una base a mitad de la jornada, lo que registró el anterior cuenta como «la operación».

## Verificación requerida

- **Unitarias:**
  - los tres estados de una base;
  - el primer registro, con correcciones y anulaciones;
  - quién registró;
  - los minutos desde el inicio;
  - la última base de una rotación cerrada, también cuando hay una deuda;
  - el orden de la tabla;
  - el aviso: no sale si ninguna otra base registró, ni si la del líder ya registró.
- **Integración:**
  - la lectura con resultados del líder y de la operación, una corrección, una deuda y una base sin líder;
  - el aviso y las deudas en la pantalla del líder.
- **E2E:** Seguimiento en celular, con axe.
