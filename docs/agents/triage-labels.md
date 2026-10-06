# Etiquetas de triage

Las skills hablan de cinco roles canónicos de triage. Este archivo dice qué etiqueta del tracker de este repo corresponde a cada uno.

| Rol en mattpocock/skills | Etiqueta en nuestro tracker | Significado |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Falta que quien mantiene el repo evalúe el issue |
| `needs-info` | `needs-info` | Se espera más información de quien lo reportó |
| `ready-for-agent` | `ready-for-agent` | Especificado del todo, listo para un agente sin supervisión |
| `ready-for-human` | `ready-for-human` | Requiere que lo implemente una persona |
| `wontfix` | `wontfix` | No se va a hacer |

Cuando una skill nombra un rol (por ejemplo, «apply the AFK-ready triage label»), usá la etiqueta de esta tabla.

Para cambiar el vocabulario, editá la columna del medio.

## Qué existe ya en GitHub

Las cinco de estado y las dos de categoría (`bug` y `enhancement`) existen en `Mateoloperaortiz/LaOE`: `bug`, `enhancement` y `wontfix` venían con el repo y las otras cuatro se crearon el 2026-10-06. Si se cambia un nombre en la tabla, creá la etiqueta nueva con `gh label create <nombre>` antes de usarla: `gh issue edit --add-label` falla con una etiqueta que no existe.
