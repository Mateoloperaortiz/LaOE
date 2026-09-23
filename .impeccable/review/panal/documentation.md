# Panal: documentación de cierre local

Extensión de Juegos en el sistema existente de Mi OE. Fuente del producto: `PRODUCT.md`; contrato local: `.impeccable/surfaces/panal.md`; reglas: ADR-088.

- Paleta heredada: navy, blue, yellow, paper y superficies semánticas para ambos temas. No hay tokens globales nuevos.
- Títulos con Sofia Sans Extra Condensed; cuerpo y controles con Plus Jakarta Sans. Se reutilizan display-lg, titulo-md y las clases de botones de la casa.
- Firma funcional: siete botones hexagonales; centro amarillo subrayado, seis exteriores azules. Centro y controles tienen nombres accesibles; no hace falta distinguir colores para jugar.
- Dos columnas desde 64rem; una columna en celular, con botones de letras de 72 px y controles dentro del primer viewport de 390 × 844. Resultado aria-live encima del campo; lista con puntaje total por palabra.
- Capturas finales desde arriba: `desktop.png`, `mobile.png`, `mobile-dark.png`. Datos sintéticos de E2E; no son datos de miembros reales. No se incorporaron recursos raster al producto.

El documenter independiente comprobó herencia contra tokens, página, componente y capturas. No hay cambio de mundo: DESIGN.md y el sistema global se preservan. La ausencia previa de DESIGN.md y los tokens globales de eyebrow/sello no se reparan como efecto lateral.

Validación funcional: reglas y catálogo, 10 pruebas de integración de Panal, flujo completo hasta premio y todas las palabras, retoma, teclado y botones, mezclar conservando central, envío fallido y reintento. Axe sin violaciones en claro y oscuro. Detector de los archivos modificados: `[]`. Publicación pendiente.
