# ADR-161: Densidad de escritorio en la Operación

- Estado: Aceptada el 2026-11-09
- Fecha: 2026-11-09
- Enmienda: [ADR-158](ADR-158-la-marca-en-dos-capas.md) regla 2 (la escala de la capa funcional), solo en la Operación
- Relacionadas: ADR-043, ADR-158, ADR-159, ADR-160

## Contexto

ADR-158 fijó una sola escala para la capa funcional: título de pantalla 28/34, sección 20/26, cuerpo 16/24, secundario 14/20 y etiqueta corta 12/16. Es una escala de celular, pensada para Mi OE.

La Operación es de escritorio ([ADR-159](ADR-159-la-operacion-es-de-escritorio.md)), y sus referentes son Linear, Attio, Stripe y Polaris: tablas densas, listas largas y varias columnas a la vista. Las maquetas de la Mesa, Personas y la Persona 360 del 2026-11-06 se hicieron con esos referentes y usan otra medida:
- cuerpo de 14 px y tablas de 13 px;
- títulos de pantalla de 24/30 y el nombre de la ficha de 28/34;
- secciones de 18 a 22 px y rótulos de grupo de 11 px;
- botones de 40 px con letra de 14 y botones compactos de 32 a 36 px con letra de 13;
- esquinas de 10 px.

El primer tramo de código (R6-A) aplicó la escala de ADR-158 en todas partes, y la Operación quedó con texto de celular. El 2026-11-09 Mateo pidió ajustarlo antes de publicarlo.

## Decisión

1. **Dos densidades en la capa funcional:**

   | Uso | Mi OE (ADR-158) | La Operación |
   | --- | --- | --- |
   | Título de pantalla | 28/34 · 800 | 24/30 · 800 |
   | Nombre en una ficha | 28/34 · 800 | 28/34 · 800 |
   | Sección | 20/26 · 800 | 18/24 · 800 |
   | Cuerpo | 16/24 · 400 | 14/20 · 400 |
   | Secundario y celdas de tabla | 14/20 · 500 | 13/18 · 500 |
   | Etiqueta corta | 12/16 · 700 | 11/16 · 700 |

   Todo sigue en Plus Jakarta Sans y en tipo oración; la etiqueta corta, en mayúsculas espaciadas 0,12 em.
2. **Cómo se aplica.** El marco de la Operación lleva `data-densidad="escritorio"`, y adentro las mismas utilidades (`text-cuerpo`, `titulo-pantalla`, `etiqueta-corta`…) toman la medida de escritorio. Los componentes base no cambian de nombre ni piden otra propiedad para el texto.
3. **Botones de la Operación:** 40 px de alto con letra de 14. El compacto, para barras de herramientas, filtros y filas, mide 32 px con letra de 13. En Mi OE siguen los de 44 px.
4. **Esquinas.** Las superficies y los botones rectos miden 10 px en las dos áreas; los botones de Mi OE siguen redondos.
5. **Filas de tabla:** 40 px en la densidad cómoda y 32 px en la compacta, como ya dice ADR-159 regla 5.
6. **El modo de campo** (ADR-159 regla 6) no lleva la densidad de escritorio: es el celular, con las medidas de Mi OE.

## Consecuencias

- **Alcance.** Solo cambia la presentación. Ninguna pantalla vieja cambia: la densidad entra con el marco nuevo de la Operación, detrás de la bandera por persona.
- **Contraste.** Los colores no cambian, así que la prueba de contraste de la capa funcional sigue valiendo. A 11 y 13 px no rige la excepción de 3:1, y todos los pares ya pasan 4,5:1.
- **Pruebas.** Una prueba lee `tokens.css` y comprueba los valores de las dos densidades.
- **07-marca** suma la tabla de densidades a su sección «Dos capas», y ADR-158 cierra con su sección «Enmienda».
