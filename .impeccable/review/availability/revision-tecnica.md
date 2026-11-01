# Revisión de disponibilidad privada

Fecha: 2026-11-01. Base acordada: estado inicial de la tarea, HEAD `17101fd3ca34cb7a150103ec466c11988207a52c`, conservando los cambios previos del usuario. Dos revisores independientes revisaron el cambio preparado para el commit.

## Standards

- **Privacidad, corregido:** la comparación esparcía la proyección interna del miembro e incluía su estado de membresía. Ahora proyecta explícitamente identificador, nombre y bloques. La prueba de la interfaz de comparación comprueba que no salga `status`.
- **Revisiones, corregido:** retirar y recrear una respuesta reutilizaba la revisión numérica inicial. Ahora cada guardado recibe una revisión opaca nueva; una pestaña antigua no puede modificar ni retirar la respuesta recreada.
- **Sugerencia de diseño:** el revisor observó un posible duplicado entre los protocolos de guardado de semana y propuesta. Se conservan operaciones separadas porque sus autorizaciones, ventanas, bloqueos y tablas son distintos; no se introduce una abstracción genérica de persistencia para dos operaciones pequeñas.

Resultado del eje: dos incumplimientos corregidos y una heurística opcional. El hallazgo más grave era el campo de membresía innecesario en el navegador.

## Spec

- **Revisiones, corregido:** el revisor reprodujo la sobrescritura posterior al retiro y recreación, presente en ambas modalidades. Dos regresiones de las interfaces públicas quedaron primero en rojo y después en verde; también rechazan el retiro desde la pestaña antigua.
- No encontró otros incumplimientos concretos ni ampliaciones relevantes de alcance. Confirmó lectura autorizada por grupo y ambas modalidades; su revisión estática no sustituye las pruebas E2E.

Resultado del eje: un incumplimiento corregido. El hallazgo más grave era la sobrescritura silenciosa entre pestañas.

## Verificación de las correcciones

Las 17 pruebas de integración de disponibilidad pasan: lectura y escritura propias, comparación de comité y seis tipos de grupo, líder y evaluador, ausencia de sesión, persona ajena con ADMIN, salida del grupo, autorización revocada, licencia, ventanas y semestre, cierre, retiro, exporte propio y anonimización. No usan datos personales reales.

Las E2E sobre la aplicación compilada pasan: guardar y recuperar la semana, crear y responder una propuesta, rechazar GET y acción POST anónimos, no compartir caché, teclado, ancho y axe en 390/1440 px y temas claro/oscuro. Cuatro casos aprobados, incluidas dos preparaciones de sesión.

La migración aditiva `0062_disponibilidad_privada` se probó únicamente en bases locales desechables. No se desplegó ni se aplicó a producción.

El cierre completo `npm run check` quedó en verde sobre una copia aislada del índice: lint, tipos, dependencias, código muerto, 2.702 unitarias en 207 archivos, 11 del extractor, 2.094 integraciones en 227 archivos y build. Esta copia excluye los cambios previos del usuario que no forman parte del commit.

Integración para publicar: la migración no desplegada se regeneró como `0062` sobre `main`, sin el inventario del PR #392; la ADR se renumeró a ADR-156. Los nuevos formularios y enlaces adoptan `ActionForm` y `AppLink` conforme a ADR-154/155. La nueva validación se registra en el PR.

Validación de la integración sobre `main`: `npm run check` aprobado, con 2.703 unitarias, 2.072 integraciones, 11 del extractor y build. Se conserva la evidencia visual de la implementación inicial; las envolturas de navegación no alteran estilos ni composición.

E2E de la integración contra build: 4/4 (dos sesiones y dos recorridos); incluye conservación del desplazamiento al guardar, GET/POST anónimos rechazados y axe en los dos tamaños y temas.
