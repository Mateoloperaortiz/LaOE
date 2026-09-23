# Diccionario de Panal

`rla-es-2.9-panal-v1` contiene 326 tableros. Cada uno tiene siete letras distintas, central obligatoria, 25–80 respuestas y al menos un pangrama. Se comparte un tablero por día civil de Colombia y el catálogo se recorre sin repetir durante 326 días. Es una versión inmutable: cambios posteriores requieren otra carpeta y conservar la anterior para partidas existentes.

## Fuentes y licencias

Reutiliza las fuentes originales locales y los avisos conservados en [Wordle](../wordle/README.md): **RLA-ES v2.9**, autores y colaboradores, bajo **MPL 1.1**, y **FrequencyWords / Hermit Dave / OPUS OpenSubtitles 2018**, commit `525f9b560de45753a5ea01069454e72e9aa541c6`, bajo **CC BY-SA 4.0**. Los archivos de licencias completos, atribuciones, URLs y SHA-256 están en `../wordle/sources/` y `../wordle/source-manifest.json`, también referenciados en el manifiesto generado. Las listas de palabras transformadas conservan MPL 1.1; la selección y organización de tableros se comparte bajo CC BY-SA 4.0, con los avisos RLA-ES de origen.

## Transformación reproducible

`npm run panal:generate` expande RLA-ES con nspell 2.1.5 (solo desarrollo), conserva formas originalmente minúsculas y normaliza NFC, mayúsculas y vocales sin acentos; Ñ se conserva. Admite palabras de 4–32 letras, flexiones y conjugaciones. Los pangramas candidatos están entre las 20.000 formas más frecuentes de FrequencyWords, tienen hasta 12 letras y pertenecen a RLA-ES. Se genera un centro por conjunto de letras, el que más acerca el tablero a 45 respuestas. Todas las formas del diccionario que cumplen las letras y la central se incluyen, aunque sean poco frecuentes; no se usa la frecuencia para rechazar intentos. Un corrector amplio no es un catálogo exhaustivo del español; puede omitir regionalismos y aceptar formas poco habituales.

La ordenación final usa SHA-256 de versión e identificador. `npm run panal:check` reconstruye y compara bytes sin red ni escrituras. El servidor importa solo los JSON finales; ninguna fuente ni nspell se ejecuta en una partida. Los componentes no importan el catálogo y las lecturas públicas solo exponen letras y totales.
