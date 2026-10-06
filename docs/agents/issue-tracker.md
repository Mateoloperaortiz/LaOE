# Issue tracker: GitHub

Los issues y las specs de este repo viven como issues de GitHub en `Mateoloperaortiz/LaOE`. Todas las operaciones van con la CLI `gh`.

## Cómo encaja con el flujo de este repo

- Los issues son la cola de trabajo; no reemplazan la documentación. Una decisión nueva sigue yendo primero a una ADR en `docs/adr/`, y el seguimiento sigue en `docs/09-roadmap.md`: al cerrar un tramo se marca la casilla y se agrega la fila al registro de avances.
- Un ticket de implementación se cierra cuando su cambio está en producción, no al mezclar el PR. El código entra a `main` por PR y de ahí se promueve a `production` (`docs/15-runbook.md`). En el PR nombrá el ticket con `Refs #<número>` y no uses `Closes`, `Fixes` ni `Resolves`: GitHub cerraría el issue al mezclar a `main`. Mezclado el PR, el ticket sigue abierto; se cierra con `gh issue close <número> --comment "..."`, citando el PR y el SHA, cuando producción ya sirve ese SHA. Lo que no lleva código, como un ticket de decisión de `/wayfinder` o un `wontfix` de `/triage`, se cierra de una.
- Títulos, cuerpos y comentarios van en español, con el vocabulario de `docs/glosario.md`.
- Nada de datos personales reales en un issue (nombres, correos, documentos, celulares). El repo es privado, pero la regla de `AGENTS.md` aplica igual.
- La carpeta `LaOE/` que contiene este checkout no es un repo. Corré `gh` desde adentro del checkout (`casa-digital/` o uno de sus worktrees) o con `-R Mateoloperaortiz/LaOE`. `gh api` no acepta `-R`: ahí escribí el repo en la ruta (`repos/Mateoloperaortiz/LaOE/...`) o anteponé `GH_REPO=Mateoloperaortiz/LaOE` para que resuelva `{owner}/{repo}`. El sitio de DÍAS es otro repo, `Mateoloperaortiz/dias`, con su propio tracker.

## Convenciones

- **Crear un issue**: `gh issue create --title "..." --body "..."`. Para cuerpos de varias líneas, un heredoc.
- **Leer un issue**: `gh issue view <número> --comments`, filtrando los comentarios con `jq` y trayendo también las etiquetas.
- **Listar issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`, con los filtros `--label` y `--state` que hagan falta y un `--limit` mayor que la cantidad de issues abiertos (sin él, `gh` trae solo los 30 más recientes).
- **Hacer de un issue un sub-issue de otro**: `gh issue create --parent <padre> ...`, o después `gh issue edit <padre> --add-sub-issue <hijo>` (`gh` 2.94 o posterior). Con un `gh` más viejo: `gh api --method POST repos/<owner>/<repo>/issues/<padre>/sub_issues -F sub_issue_id=<id-del-hijo>` (el id de base de datos, como en **Bloqueos** más abajo). Sin sub-issues, poné `Part of #<padre>` al inicio del cuerpo del hijo.
- **Comentar un issue**: `gh issue comment <número> --body "..."`
- **Poner o quitar etiquetas**: `gh issue edit <número> --add-label "..."` / `--remove-label "..."`
- **Cerrar**: `gh issue close <número> --comment "..."`

## Pull requests como superficie de triage

**PRs as a request surface: no.** _(Cambialo a `yes` si este repo llega a tratar los PR externos como solicitudes; `/triage` lee esta bandera.)_

Con `yes`, los PR pasan por las mismas etiquetas y estados que los issues, con los equivalentes de `gh pr`:

- **Leer un PR**: `gh pr view <número> --comments` y `gh pr diff <número>` para el diff.
- **Listar los PR externos por triar**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comentar, etiquetar o cerrar**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub usa una sola numeración para issues y PR, así que un `#42` suelto puede ser cualquiera de los dos: resolvelo con `gh pr view 42` y, si falla, con `gh issue view 42`.

## Cuando una skill dice «publish to the issue tracker»

Creá un issue de GitHub.

## Cuando una skill dice «fetch the relevant ticket»

Corré `gh issue view <número> --comments`.

## Operaciones de wayfinding («Wayfinding operations»)

Las usa `/wayfinder`. El **mapa** es un solo issue y sus tickets son issues **hijos**. Sus cinco etiquetas (`wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` y `wayfinder:task`) no vienen creadas, y `gh issue create --label` falla con una etiqueta que no existe: antes del primer mapa, mirá con `gh label list` cuáles faltan y crealas con `gh label create <nombre>`.

- **Mapa**: un solo issue con la etiqueta `wayfinder:map`, que lleva el cuerpo de Notes / Decisions-so-far / Fog. `gh issue create --label wayfinder:map`.
- **Ticket hijo**: un issue ligado al mapa como sub-issue de GitHub (ver **Hacer de un issue un sub-issue de otro**). Donde no haya sub-issues, agregá el hijo a una lista de tareas en el cuerpo del mapa y poné `Part of #<mapa>` al inicio del cuerpo del hijo. Etiquetas: `wayfinder:<tipo>` (`research`/`prototype`/`grilling`/`task`). Una vez reclamado, el ticket queda asignado a quien lo lleva.
- **Bloqueos**: las **dependencias nativas entre issues** de GitHub, que son la representación canónica y la que se ve en la interfaz. Una arista se agrega con `gh api --method POST repos/<owner>/<repo>/issues/<hijo>/dependencies/blocked_by -F issue_id=<id-del-bloqueador>`, donde `<id-del-bloqueador>` es el **id de base de datos** del issue que bloquea (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _no_ el `#número` ni el `node_id`). GitHub reporta `issue_dependencies_summary.blocked_by` (solo los bloqueadores abiertos, que es la compuerta viva). Donde no haya dependencias, usá una línea `Blocked by: #<n>, #<n>` al inicio del cuerpo del hijo. Un ticket queda desbloqueado cuando todos sus bloqueadores están cerrados.
- **Consulta de frontera**: listá los hijos del mapa con `gh api --paginate repos/<owner>/<repo>/issues/<mapa>/sub_issues`, que trae de cada hijo `state`, `assignees` e `issue_dependencies_summary` (`gh issue list --json` no acepta ese campo); donde no haya sub-issues, salí de la lista de tareas del mapa. Quedate con los abiertos y descartá los que tengan un bloqueador abierto (`issue_dependencies_summary.blocked_by > 0`, o un issue abierto en la línea `Blocked by`) o alguien asignado; gana el primero en el orden del mapa.
- **Reclamar**: `gh issue edit <n> --add-assignee @me`, la primera escritura de la sesión.
- **Resolver**: `gh issue comment <n> --body "<respuesta>"`, después `gh issue close <n>`, y por último agregá un puntero de contexto (resumen y enlace) a Decisions-so-far del mapa.
