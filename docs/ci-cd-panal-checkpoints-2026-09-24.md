# Publicación de Panal con checkpoints · 2026-09-24

Mateo confirmó 1 GH Point con 5 palabras, 2 adicionales con 10 y 3 adicionales en Genio. Pidió que el 23 conserve el juego original y la nueva política empiece el **24 de septiembre a las 00:00 de Colombia (05:00 UTC)**. La activación está en el código por día civil; no depende de un cron ni modifica partidas del 23.

PR [#85](https://github.com/Mateoloperaortiz/LaOE/pull/85). Candidato integrado: `6a35b5f39a0ed20b7d17efd85d76998c8f808a3f`.

## Validación

- `npm run check` aprobado: 721 unitarias, 552 de integración, 11 del extractor y build.
- Los dos catálogos son reproducibles; V1 conserva exactamente sus bytes. V2: 126 tableros de 20–30 palabras, promedio 25,42; el del 24 tiene 26.
- Tres flujos E2E aprobados con fecha real del 23 y adelantando 24 horas el reloj de los procesos Node locales: guardado, salida y retorno, premios parciales, premio total, reintento de red y accesibilidad clara/oscura. No se cambió el reloj del sistema ni de los entornos publicados.
- Revisión independiente de la extensión: `ship`. Brief, capturas y notas en `.impeccable/review/panal-checkpoints/`.
- [CI del PR](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35930882744) aprobado: 721 unitarias, 552 de integración y 207 escenarios E2E; outbox sin fallos.

- [CI completo del push a main](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35931551961) aprobado para el candidato.
- Staging `2a4865ef-8df6-4227-a5cb-d6f8817c4d6b` SUCCESS desde el 23 a las 23:15 UTC. Migración verificada con 127 índices y [smoke remoto aprobado](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35932646611). Smoke HTTP local repetido el 24: 6/6.

## Momento de publicación

La promoción a producción seguía pendiente al retomar el trabajo el 24 a las 13:25 UTC. Por tanto, **no estuvo activa en producción a medianoche**. El cambio entra al completar el despliegue del 24. Quienes ya iniciaron ese día con V1 conservan su tablero, palabras y créditos; las partidas nuevas usan el catálogo corto. Si había avance sin premio en una partida del 24, la acción explícita de guardar o la siguiente palabra liquidan las metas alcanzadas. Los créditos previos de 6 no se repiten. Los juegos del 23 mantienen su política original.

## Compatibilidad

La migración aditiva `0039_panal_checkpoints` agrega la meta al ledger y sus restricciones, sin modificar partidas ni créditos históricos. El catálogo y los textos originales siguen vigentes el 23 incluso para partidas empezadas después del despliegue. Desde el 24, los créditos de 1/2/3 comparten la transacción con la palabra guardada. El crédito histórico de 6 excluye pagos adicionales. Las lecturas no acreditan puntos.

Después de activar los premios parciales, una reversión de aplicación debe conservar este contrato del ledger: la versión previa desconoce los checkpoints. Preferir una corrección hacia adelante; no volver al código anterior sobre partidas parciales sin revisar el impacto.

## Producción verificada

- [Promoción](https://github.com/Mateoloperaortiz/LaOE/actions/runs/36005652607) aprobada reutilizando el CI completo del mismo SHA en main.
- Railway `b85b1641-0027-4775-be9a-4fd9b69c9f57`: **SUCCESS** a las **13:30:49 UTC del 24 (08:30:49 de Colombia)**, SHA `6a35b5f39a0ed20b7d17efd85d76998c8f808a3f`.
- Pre-deploy a las 13:30:28 UTC: migraciones aplicadas y esquema verificado, 127 índices y `pg_trgm`. No se sembraron datos.
- Smoke HTTP de producción: **6/6**, salud/SHA, HTTPS/CSP/indexación, robots, sitemap, manifest y calendario público.
- Verificación de la ruta autenticada: al actualizar la pestaña existente de Panal, mostró fecha 24, **0 de 26 palabras**, las metas de **5/+1, 10/+2 y Genio/+3**, total **0 de 6 GH Points** y el enlace para volver a Juegos. Solo se leyó la página: no se inició una partida ni se enviaron palabras o acreditaron premios para probar producción.
