# ADR-173: «Tu semestre en la OE»

- Estado: Propuesta
- Fecha: 2026-11-13
- Relacionadas: ADR-067, ADR-075, ADR-158, ADR-160

## Contexto

El plan maestro (§4.4 y §7) pide **«Tu semestre en la OE»** al cierre de 2027-1, al estilo de Spotify Wrapped: un resumen del semestre de cada persona contado como momento de marca. Es uno de los pocos lugares de Mi OE en la capa de marca (ADR-158): letra condensada, colores de la OE y el sello «¡OE OE OE!».

Todo lo que cuenta ya está en la casa: las asistencias aprobadas, los GH Points del semestre, los retos completados, las insignias, los comités y los juegos.

## Decisión

1. **Una pantalla por semestre.** `/app/semestre` muestra el último semestre cerrado de la persona y `/app/semestre/<código>` uno anterior. Se abre cuando la permanencia del semestre cerró (el cierre de ADR-036), porque antes los números todavía cambian.
2. **Lo que cuenta**, cada cosa en su tarjeta y solo si tiene algo:
   - las asistencias aprobadas;
   - los GH Points que sumó en el semestre;
   - los retos que completó;
   - las insignias que desbloqueó;
   - sus comités y sus cargos;
   - las partidas de los juegos.

   Cierra con el sello «¡OE OE OE!». Una tarjeta en cero no sale: el resumen no compara ni avergüenza.
3. **Es solo de la persona.** No hay ranking ni comparación con otros, y la pantalla no se comparte desde la casa. Si la persona quiere, toma una captura.
4. **Cómo se llega.** Al cerrar la permanencia, el centro de avisos (ADR-166) lo anuncia una vez a cada persona, y «Yo» lo deja a la mano. «Hoy» no suma una lectura más del semestre: la campana ya cuenta el aviso.

## Consecuencias

- **Sin migración.** Lee lo que ya existe por persona y semestre.
- **Pruebas.** Unitarias de qué tarjetas salen. E2E de un semestre cerrado con sus tarjetas y de uno abierto, que todavía no se ve.
