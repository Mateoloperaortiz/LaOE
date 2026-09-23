# Verificación de Panal por avances · 2026-09-23

- `npm run check`: aprobado; 721 unitarias, 552 de integración, 11 del extractor y build.
- Integración específica de Panal: 16 casos; límites 5/10/Genio, concurrencia, cierre, versiones anteriores, créditos históricos, guardado pendiente y corte exacto a las 05:00 UTC del 24.
- `npm run panal:check`: ambas versiones reproducibles; V1 sin diferencias de bytes. V2: 126 tableros, 20–30 palabras, promedio 25,42; mañana 26.
- E2E con el reloj real del 23: 3 escenarios y 2 accesos aprobados. Se mantiene el premio único original.
- E2E con reloj Node adelantado 24 horas en un proceso local aislado: 3 escenarios y 2 accesos aprobados. Salida y regreso con 1 punto guardado, los tres premios sumando 6, reintento de red y accesibilidad clara/oscura.
- Las capturas de esta carpeta pertenecen a esa segunda ejecución: cinco palabras, primer premio guardado, fecha 24. Escritorio 1440×1000, celular 390×844, páginas completas desde arriba. No se cambió el reloj del sistema ni se alteraron datos de producción.
- Detector Impeccable: `[]`, sin hallazgos.

La política nueva comienza por fecha de Colombia, no por momento de despliegue: el 23 conserva catálogo, premio y copy anteriores. El catálogo anterior permanece disponible. No se acreditaron premios a personas reales para verificarlo.
