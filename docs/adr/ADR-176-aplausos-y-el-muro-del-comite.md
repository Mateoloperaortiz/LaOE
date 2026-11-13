# ADR-176: Aplausos y el muro del comité

- Estado: Propuesta
- Fecha: 2026-11-13
- Relacionadas: ADR-058, ADR-160, ADR-166, ADR-175

## Contexto

El plan maestro (§7, ola 3) pide **reconocimientos y muro del comité**, al estilo de los kudos de Strava. La casa ya tiene reconocimientos formales: el miembro del mes y los premios de la OE, que otorga la dirección y se publican en la cartelera. Lo que falta es lo pequeño y entre pares: decirle a alguien del comité «gracias por la logística de ayer».

## Decisión

1. **Un aplauso** es un mensaje corto (hasta 140 caracteres) de un miembro a otro miembro de su mismo comité en el semestre. Se guarda quién, a quién, el comité, el mensaje y cuándo.
   - Nadie se aplaude a sí mismo.
   - Hasta 5 aplausos por persona al día, para que no se vuelva ruido.
   - Quien lo recibe lo ve siempre en «Yo» y le llega al centro de avisos (ADR-166) como momento de la casa.
2. **El muro del comité.** `/app/comites/<comité>/muro` lo ven los miembros del comité en el semestre. Muestra, del más reciente al más viejo:
   - los aplausos dentro del comité cuando quien aplaude y quien recibe tienen la actividad prendida (ADR-175);
   - los reconocimientos formales del comité, que ya son públicos;
   - las metas colectivas del comité con su avance.
3. **«Comunidad» no entra a la barra.** El plan dejó abierto si «Comunidad» reemplaza a «Juegos» en la barra de Mi OE. Se queda dentro: «Hoy» muestra la meta colectiva del momento y «Yo» lleva a los aplausos y al muro de cada comité. Los juegos son lo que más se abre cada día, y la barra de cinco ya está (ADR-160).
4. **Borrar.** Quien aplaudió puede borrar su aplauso. Al anonimizar a una persona se borran los aplausos que dio y recibió.

## Consecuencias

- **Migración aditiva.** Una tabla nueva, `applause`, en `participation`.
- **Pruebas.** Integración del tope diario, del comité compartido, de la visibilidad del muro con la actividad apagada y del borrado al anonimizar. E2E de aplaudir desde el comité y verlo en el muro y en «Yo».
