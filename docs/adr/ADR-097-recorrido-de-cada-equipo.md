# ADR-097: Recorrido de cada equipo en la vitrina y en el hub

- Estado: Aceptada (enmendada por ADR-098)
- Fecha: 2026-09-28
- Relacionadas: ADR-089, ADR-090, ADR-094, ADR-096
- Enmienda:
  - ADR-090, regla 1: la API pública suma el recorrido de un equipo.
  - ADR-096, regla 1: el estado del hub incluye el recorrido del equipo de la sesión.

## Contexto

La vitrina (ADR-090) solo muestra la rotación en curso y la siguiente, con los 15 enfrentamientos de cada una. Para saber a qué base le toca ir, un equipo tiene que buscarse entre ellos, y no ve el resto del día. El hub de capitanes (ADR-096) solo tiene apuestas.

El 2026-09-28 Mateo pidió que cada equipo vea su recorrido: las bases que le tocan en el día, contra quién y cómo le fue. El calendario completo ya está en la casa (ADR-089, regla 8, y ADR-094), y no es secreto: la OE reparte sus hojas de rotaciones.

## Decisión

1. **`GET /api/v1/the-games/<slug>/equipos/<número>`** devuelve el recorrido de un equipo en JSON versionado (`version: 1`), validado con Zod antes de salir:
   - el equipo, con su número, nombre y color;
   - una parada por rotación de las dos jornadas, en orden: la jornada, el número de rotación, el estado (`PENDING`, `ACTIVE` o `CLOSED`), la base con su nombre, tipo y lugar, y el rival;
   - el resultado desde el punto de vista del equipo (`WIN`, `DRAW` o `LOSS`) y los puntos que le dio. Si no hay resultado todavía, los dos van en `null`.

   Si el equipo no juega en una rotación, esa parada no aparece.
2. **Lectura pública, igual que la vitrina.**
   - Sin sesión ni datos personales: sin ids, sin capitanes y sin nada del formulario.
   - Caché de 5 segundos más un memo de 3 segundos por equipo en el proceso.
   - CORS de origen fijo para DÍAS.
   - Una competencia en `DRAFT`, que no existe, o un número sin equipo responden 404 en JSON.
   - Un equipo retirado sigue mostrando su recorrido.
3. **Sin horas.** Las rotaciones arrancan cuando el operador las inicia y las duraciones todavía son provisionales, así que el recorrido va por número de rotación. La rotación en curso se marca con su estado.
4. **El hub también.** El estado del hub suma `route`, con las mismas paradas del equipo de la sesión. Es un campo nuevo, así que el hub sigue en `version: 1`.

## Consecuencias

- **Sin migración.** Todo sale del calendario y los resultados que ya existen.
- **DÍAS** suma «Buscá tu equipo» en `/the-games/` (con `?equipo=N` para compartir el enlace) y «Tu recorrido» en el hub (D-040 de `dias`).
- **Si se corrige una rotación a mano** o se reimporta una jornada, el recorrido cambia con ella. No hay copia aparte que se desactualice.

## Verificación requerida

- **Unitarias:**
  - el armado del recorrido: equipo A o B, puntos por tipo de base, empate, sin resultado, sin ids;
  - la ruta: 404 con un número inválido, 200 con CORS y caché.
- **Integración:**
  - el recorrido de un equipo con el calendario generado y un resultado registrado;
  - el hub incluye el recorrido.
- **E2E:** la ruta pública con el origen de DÍAS.

## Enmienda (2026-09-29, ADR-098)

Regla 1: el resultado y los puntos de cada parada son los oficiales. Por ejemplo, ganar con Multiplicador x2 da «WIN» y 2000, y un Cambio de resultados del rival invierte el resultado. La forma no cambia. Ver [ADR-098](ADR-098-poderes-de-the-games.md).
