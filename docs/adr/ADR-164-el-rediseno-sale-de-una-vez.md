# ADR-164: El rediseño sale de una vez, sin bandera

- Estado: Aceptada el 2026-11-12
- Fecha: 2026-11-12
- Enmienda: [ADR-158](ADR-158-la-marca-en-dos-capas.md) y [ADR-159](ADR-159-la-operacion-es-de-escritorio.md) (consecuencia «Transición»); [ADR-160](ADR-160-la-navegacion-de-mi-oe.md) (consecuencia «Publicación»); [ADR-161](ADR-161-densidad-de-escritorio-en-la-operacion.md) y [ADR-163](ADR-163-aspecto-sobrio-de-la-capa-funcional.md) (consecuencia «Alcance»); las enmiendas de 2026-11-08 de [ADR-043](ADR-043-experiencia-administrativa.md) y [ADR-044](ADR-044-experiencia-del-portal-y-mi-oe.md)
- Relacionadas: ADR-053, ADR-054, ADR-158, ADR-160

## Contexto

ADR-159, ADR-161 y ADR-163 decían que el rediseño saldría detrás de una bandera por persona: primero para la junta y GH, y después para todos. El plan del 2026-11-09 lo completaba así: el código llega a `main` en ramas cortas, y ninguna pantalla vieja cambia hasta que exista la bandera.

El 2026-11-12, con la propuesta de la bandera escrita, Mateo decidió otra cosa: construir todo el rediseño primero en local y después publicarlo para todos. Ante la pregunta de si la primera salida era la ola 1, para tener Mi OE nuevo en la inducción de 2027-1, respondió que no: sale todo el rediseño junto.

Lo que ya está en `main` no cambia ninguna pantalla. La capa funcional de R6-A y R6-A2 (tokens, componentes y pruebas) solo se ve en `/marca`, que existe únicamente en desarrollo.

## Decisión

1. **Sin bandera y una sola salida.** La vista anterior y la nueva no conviven en producción. El rediseño sale para todos de una vez y completo: las olas 1 a 5 del roadmap. Las olas ordenan la construcción, pero ninguna sale sola. La propuesta de la bandera se descarta.
2. **Una rama de integración.** El rediseño se construye en la rama `feat/rediseno`, que sale de `main`.
   - Cada tramo es un commit propio con `npm run check` en verde, su casilla en el roadmap y su fila en el registro de avances.
   - La rama se sube a GitHub como respaldo y para que corra el CI, pero no se abre un PR a `main` hasta la salida.
   - Las pantallas viejas se reemplazan en la misma rama: no quedan dos versiones de una pantalla.
3. **`main` entra a la rama cada semana.** `main` se mezcla en `feat/rediseno` al menos una vez por semana y antes de cada tramo que toque un layout. Así el choque final es pequeño. En un conflicto manda la conducta de `main`: el rediseño cambia la presentación, no las reglas.
4. **Las migraciones son aditivas.** Si el rediseño necesita guardar datos nuevos, como la Mesa con estado de leído, sus migraciones solo agregan. Así la versión anterior sigue funcionando contra la base nueva, y volver atrás no exige tocar datos.
5. **Prueba antes de salir.** Al cerrar cada ola, la rama se despliega en staging con datos sintéticos y se prueba con usuarios lo que esa ola cambió. Antes de la salida se repite la prueba completa, con las mismas tareas de la medición de base. La medición de base se corre antes, contra producción o contra staging con `main`, porque mide la casa de hoy.
6. **La salida.** Un PR de `feat/rediseno` a `main`, con su CI. Mezclar y promover a producción piden la frase de Mateo, y se verifica el SHA en `/api/health`. La salida ocurre cuando las cinco olas están en la rama y pasaron su prueba.
   - **La fecha** la fija Mateo con GH, fuera de un cierre de semestre y de los días de admisión, roster y activación del inicio de un semestre. Esas pantallas cambian de marco con la salida, y sin bandera GH ya no puede quedarse con el anterior mientras las usa ([22-inventario-de-pantallas](../22-inventario-de-pantallas.md), punto 6).
7. **Volver atrás.** Si algo grave falla en producción, se promueve el SHA anterior. La regla 4 garantiza que se pueda.

## Consecuencias

- **Revisión.** El PR final es grande. Se revisa por tramos: cada commit de la rama tiene su fila en el registro y su verificación.
- **Riesgo de conflictos.** `main` se mueve rápido: en las dos semanas antes del 9 de noviembre cambió 332 archivos, 128 de ellos en zonas del rediseño, y sumó tres migraciones. La mezcla semanal es obligatoria. Si una semana no se hace, el tramo siguiente empieza por ella.
- **Visibilidad.** Nadie fuera de la rama ve el avance hasta staging. El lienzo de maquetas sigue siendo el lugar para mostrar el diseño.
- **Sin aprendizaje gradual.** No hay un primer grupo que use la casa nueva antes que todos. Lo reemplazan la prueba en staging y la medición de base.
- **Mi OE nuevo no llega a la inducción de 2027-1.** Los nuevos de 2027-1 aprenden la casa de hoy y la cambian con la salida, como todos.
- **La rama vive mucho.** El plan pone la ola 4 en 2027-2 y la ola 5 de 2027-2 en adelante, así que `feat/rediseno` dura más de un semestre. La mezcla semanal de `main` es la que evita que el choque final crezca con el tiempo.
- **Las olas 3 a 5 traen funciones, no solo pantallas**, y algunas dependen de otras decisiones: la política de datos para la capa social, el tiempo real y los frentes de ADR-085. Cada una conserva su ADR, pero no sale antes que el resto.
- **La fecha importa más.** Con la bandera, GH podía conservar el marco anterior durante un cierre. Sin ella, la salida tiene que caer en una semana sin cierre ni activación (regla 6).
- **Lo que ya está en `main`** (R6-A y R6-A2) se queda: solo agrega tokens y componentes que ninguna pantalla usa todavía.
- **Enmiendas aplicadas el 2026-11-12:** ADR-043, ADR-044, ADR-158, ADR-159, ADR-160, ADR-161 y ADR-163 cierran con su sección «Enmienda»; 06-mapa-del-sitio, 07-marca, el inventario de pantallas y 11-contenido-pendiente lo dicen, y el roadmap cambia la casilla de la bandera por la de la rama de integración.
