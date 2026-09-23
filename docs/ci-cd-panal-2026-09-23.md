# Publicación de Panal · 2026-09-23

PR [#83](https://github.com/Mateoloperaortiz/LaOE/pull/83). Candidato: `246356984b79a8db7b14de73af7e645fbcd61a7d`. Mateo probó el juego local y autorizó publicarlo, con 6 GH Points al alcanzar Genio una vez al día.

## Validación

- `npm run check` completo: 719 pruebas unitarias, 546 de integración, 11 del extractor y build. Repetido después de actualizar la expectativa de cuatro juegos en la prueba de Sudoku; ese caso también pasó contra el build de producción.
- CI del PR [35884305838](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35884305838), aprobado.
- CI del push a main [35885202939](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35885202939), aprobado en su tercer intento; detalle operativo abajo.
- Ejecución completa adicional del mismo SHA [35887289054](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35887289054), aprobada. Sus informes verifican 719 unitarias, 546 de integración y 207 escenarios E2E (209 casos únicos al incluir los dos de autenticación), con outbox sano.
- Promoción [35889429855](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35889429855), aprobada reutilizando la evidencia completa del push a main.

## Despliegues

| Entorno | Deployment de Railway | Verificación |
| --- | --- | --- |
| Staging | `5c6c6721-5212-42d4-8dad-1b39c0082402` | SUCCESS; migraciones aplicadas y 126 índices verificados; healthcheck con el SHA esperado, smoke HTTP 6/6 y [smoke remoto aprobado](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35889036108). `/app/juegos/panal` redirige a ingreso conservando su destino. |
| Producción | `f5a340c0-d662-4897-8ddb-6b8e886bf7a1` | SUCCESS; migraciones aplicadas y 126 índices verificados; healthcheck con el SHA esperado, smoke HTTP 6/6 y [smoke remoto aprobado](https://github.com/Mateoloperaortiz/LaOE/actions/runs/35890576473). `/app/juegos/panal` redirige a ingreso conservando su destino. |

Verificación final de producción a las 16:42:51 UTC: `status: ok`, SHA `246356984b79a8db7b14de73af7e645fbcd61a7d`, latencia de PostgreSQL 1 ms. La publicación aplicó únicamente la migración aditiva `0038`; no se sembraron datos ni se jugaron partidas o acreditaron puntos de personas reales para verificarla.

## Reintento de CI e informes duplicados

El primer CI de main agotó los 30 segundos del caso que juega dos partidas de 2048. La traza seguía procesando jugadas; el reintento del grupo aprobó los 48 casos, sin modificar código. Sin embargo, quedaron dos artefactos `ci-e2e-4` del mismo run: el cierre los descargó con `merge-multiple` y leyó el informe anterior (47 aprobados y un timeout). La ejecución nueva y completa aprobó, pero la protección de `production` seguía rechazando el CI original fallido.

Se descargaron y conservaron ambos archivos antes de retirar exclusivamente el artefacto obsoleto `10763035401`. El informe vigente `10762739469` contiene los 48 casos aprobados, cero inesperados, cero omitidos y cero inestables. Se relanzó solo el cierre de CI, que verificó el inventario completo y aprobó el run original. No se alteraron informes, pruebas, requisitos de CI ni protecciones de ramas. El timeout y sus logs permanecen en el primer intento de GitHub.

Copias locales en `/Users/mateo/.codex/deployment-evidence/panal-2026-09-23/`:

- `panal-e2e4-attempt1.zip`: SHA-256 `910207d4fd29d93c1134801e2496a1d729fd690f82685edf0c33ee7c33b0037a`.
- `panal-e2e4-attempt2.zip`: SHA-256 `a136d3065ab2450fc38f41fcb05aeda7b5c0d31c9f50ad56a11807ac83756ae0`.

Railway había marcado SKIPPED el primer intento de staging por el CI fallido. Tras la aprobación se inició un despliegue desde la fuente configurada, se comprobó el SHA exacto y se promovió ese mismo commit mediante un push normal a `production`.
