# ADR-088: Panal diario en español

- Estado: Aceptada; implementación local, publicación pendiente
- Fecha: 2026-09-23
- Relacionadas: ADR-041, ADR-075, ADR-078, ADR-081, ADR-084, ADR-086
- Enmienda: ADR-075 (biblioteca y disponibilidad), ADR-007 (tipo de crédito)

## Contexto

Mateo pidió incorporar a los juegos una versión en español del juego de formar palabras con siete letras y una central obligatoria. Se llama **Panal**, con interfaz propia de Mi OE y sin recursos ni diccionarios del NYT.

## Decisión

1. `/app/juegos/panal` y una cuarta tarjeta en la biblioteca. Un reto por día civil de Colombia, compartido por todos; una partida por persona y día, persistida en servidor. GET no crea partidas.
2. Siete letras distintas, central obligatoria, mínimo cuatro letras, repeticiones permitidas. NFC, mayúsculas, vocales sin tildes ni diéresis; Ñ sigue distinta de N. Se aceptan flexiones y conjugaciones del diccionario; no cadenas arbitrarias ni nombres propios capitalizados en la fuente.
3. Cuatro letras valen 1 punto; desde cinco, el largo; usar las siete letras suma 7 adicionales. Cada palabra cuenta una vez. Los rangos corresponden al 0, 2, 5, 8, 15, 25, 40, 50 y 70 % del máximo; completar todas las palabras da «Panal completo». Los puntos de juego se distinguen de GH Points.
4. Dataset inmutable `rla-es-2.9-panal-v1`, generado fuera del request a partir de las fuentes locales de RLA-ES y FrequencyWords ya atribuidas en Wordle. Los pangramas candidatos salen de las 20.000 palabras más frecuentes válidas de hasta 12 letras; se eligen tableros con 25–80 respuestas y al menos un pangrama. La frecuencia orienta el tablero, nunca invalida una respuesta del diccionario. Se conserva fuente, transformación reproducible, licencias y hashes. Las versiones publicadas no se sustituyen. La selección diaria determinista recorre el catálogo en un orden mezclado fijado por versión.
5. El navegador recibe letras, totales, rangos y palabras encontradas, nunca las respuestas pendientes. El servidor calcula toda validación, puntaje y premio. La versión y el identificador del tablero quedan estampados en la partida.
6. Premio de 6 GH Points al llegar a Genio (70 %), una vez por día, sin consumir topes de retos ni aplicar boosters. Se puede continuar buscando hasta completar el panal. Mateo confirmó expresamente este premio el 2026-09-23.
7. Elegibilidad y semestre abierto iguales a los demás juegos. Escrituras bajo lock compartido del semestre y lock de persona; entrada única por partida en el ledger. Envíos idempotentes por palabra normalizada: un reintento devuelve el progreso sin sumar otra vez. Pasada la medianoche no se admiten palabras nuevas para el día anterior; los reintentos de palabras ya guardadas siguen siendo seguros.
8. La acreditación emite `panal.completed` con resumen sin respuestas, y alimenta la línea de tiempo de CRM. Sin nuevas notificaciones ni insignias. Mis datos incluye el progreso propio, sin el catálogo de respuestas.
9. Teclado físico, entrada de texto y siete botones reales en panal; mezclar cambia solo el orden de las seis letras exteriores. Centro marcado por color y texto accesible; foco visible, estados de envío/reintento, cambio de día, tema oscuro y celular.

## Consecuencias

Migración aditiva de partida, palabras encontradas y crédito `PANAL`. Pruebas de reglas, catálogo, concurrencia, crédito único, propiedad, cierre, medianoche y flujo de navegador. No se cambia el comportamiento de los otros juegos.
