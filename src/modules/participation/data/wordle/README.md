# Diccionario de Wordle de GH Points

La versión `rla-es-2.9-oe-v1` incluye **9.130 intentos** y **1.429 respuestas revisadas**. El juego solo importa los JSON de `versions/` desde `domain/wordle-dictionary.ts`, marcado `server-only`. No consulta servicios de diccionario ni carga Hunspell, fuentes o frecuencias durante una partida.

## Fuentes y atribución

- **Recursos Lingüísticos Abiertos del Español, v2.9, español internacional**: autores y colaboradores del proyecto [RLA-ES](https://github.com/sbosio/rla-es). `sources/rla-es-2.9.aff` y `.dic` son los bytes originales extraídos de [es.xpi](https://github.com/sbosio/rla-es/releases/download/v2.9/es.xpi). Elegimos **MPL 1.1**, una de las alternativas de su licencia; se conserva su texto completo, aviso original y README. La lista de intentos es una transformación de ese recurso, bajo MPL 1.1, con tres adiciones editoriales indicadas en `accepted-additions.json`.
- **Hermit Dave, FrequencyWords / OPUS OpenSubtitles 2018 / OpenSubtitles**: [lista española de 50.000 entradas](https://github.com/hermitdave/FrequencyWords/blob/525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/es/es_50k.txt), commit `525f9b560de45753a5ea01069454e72e9aa541c6`. Contenido **CC BY-SA 4.0**; se conserva el archivo, README, atribución y licencia completa. Orientó la selección editorial; las frecuencias no deciden si un intento es válido. La selección editorial de respuestas se comparte bajo CC BY-SA 4.0, conservando también el aviso de RLA-ES sobre las palabras de origen.
- **nspell 2.1.5**, de Titus Wormer, licencia MIT: dependencia exclusiva de desarrollo para expandir las reglas de afijos. Sus avisos acompañan al paquete instalado. No se incorpora su código en los datos generados ni en el servidor del juego.
- Las referencias ASALE/RAE de las adiciones documentan palabras individuales y flexiones; no se copian definiciones ni corpus de esas obras.

`source-manifest.json` fija URL, versión, licencia y SHA-256 de cada fuente. El manifiesto de la versión registra los hashes de entradas editoriales y salidas, además de conteos y remapeo. Las fuentes y el generador conservados aquí permiten reproducir la transformación y sus modificaciones sin red.

## Generación y verificación

Después de `npm ci`, ejecutar `npm run wordle:generate` desde `casa-digital`. `npm run wordle:check` repite la expansión y compara los bytes de todos los resultados sin escribir archivos. Ambos comandos trabajan exclusivamente con los archivos locales. No son pasos del build ni del request del juego.

La expansión incluye prefijos, sufijos y continuaciones. El adaptador remapea ocho flags Unicode a caracteres privados BMP porque el parser de flags de nspell 2.1.5 separa unidades UTF-16. Se rechazan directivas o flags nuevos no revisados. Se normaliza a NFC y mayúsculas, se retiran las tildes de las vocales y la diéresis y se conserva Ñ. Solo quedan cinco letras de `A-ZÑ`; las entradas originalmente capitalizadas se descartan antes de normalizar. Esto reduce nombres propios, aunque un corrector amplio puede reconocer homónimos y otras formas poco habituales.

La fuente expandida aporta 9.127 intentos; las tres adiciones documentadas llevan el total a 9.130. Un corrector no contiene todas las palabras posibles: una omisión confirmada se agrega con fuente y prueba de regresión, sin aprobar cadenas arbitrarias de cinco letras.

## Edición y continuidad

`answers-reviewed.txt` es una lista editorial explícita. El generador la valida, pero **no la selecciona ni la sobrescribe**. Criterios y exclusiones en `CURATION.md` y `answers-excluded.txt`.

Una versión usada en partidas es inmutable: conservar sus JSON y su entrada en el registro de `wordle-dictionary.ts`. Para una actualización, asignar un identificador nuevo, guardar las entradas y fuentes de esa revisión, generar un directorio nuevo y añadirlo al registro; cambiar el identificador activo solo para partidas nuevas. No sustituir datos ni reutilizar identificadores de versiones ya publicadas. Una versión desconocida no valida intentos mediante el diccionario actual.
