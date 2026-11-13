# ADR-165: La paleta ⌘K por rol, con alcance

- Estado: Aceptada el 2026-11-12
- Fecha: 2026-11-12
- Enmienda: [ADR-072](ADR-072-alcance-autorizado-en-el-dominio.md) (regla 6)
- Relacionadas: ADR-035, ADR-036, ADR-058, ADR-159, ADR-164

## Contexto

ADR-072 regla 6 dejó la paleta ⌘K solo para ADMIN: `GET /api/admin/buscar` busca en toda la tabla de personas, también por correo, y cualquier otro rol habría podido usarla para saber si un correo existe. ADR-159 regla 8 dejó fuera la paleta para todos los roles, porque abrirla enmienda ADR-072.

En la Operación nueva (ADR-159), la dirección de un comité, la junta, los líderes y evaluadores de grupo y el personal de The Games entran al mismo marco que GH, con la Mesa y los espacios. Sin paleta, son los únicos que no pueden saltar a una pantalla con el teclado.

El 2026-11-12 Mateo eligió abrirla por rol, con alcance: todos saltan a sus pantallas, y cada uno busca personas solo dentro de lo suyo.

## Decisión

1. **La paleta es de todos los roles de la Operación.** `GET /api/admin/buscar` responde 401 sin sesión y 403 a quien no tiene ningún rol del área (`adminAreaRoles(actor).any`). Para los demás, responde según su rol.
2. **Destinos para todos.** La paleta también busca entre los destinos que el actor ve en su barra lateral, la Mesa incluida, por su etiqueta. Esa lista ya viaja al navegador con el layout, así que se busca ahí, sin preguntarle a la casa.
3. **ADMIN busca como hoy.** Personas por nombre y por correo, comités, ocasiones y organizaciones, en toda la casa.
4. **La dirección de un comité busca a la gente de su comité.**
   - Solo en los comités donde ve el área «Personas» (capacidad `ROSTER`, `DIRECTION` o `PERMANENCE`; ADR-058).
   - Solo a quien tiene una pertenencia viva en ese comité en el término actual.
   - Solo por nombre, nunca por correo, y el resultado no trae el correo.
   - El resultado lleva a la persona dentro del área «Personas» de su comité, no a la Persona 360, que sigue siendo de ADMIN.
   - El dominio recibe los comités del alcance y no busca fuera de ellos (ADR-072 regla 1).
5. **Sus comités, y nada más.** Quien tiene un comité ve sus comités entre los resultados. Las ocasiones y las organizaciones siguen siendo de ADMIN en la paleta.
6. **La junta, los grupos y The Games solo tienen destinos.** Sus búsquedas propias siguen en el servidor de su pantalla, como decía ADR-072 regla 6.

## Consecuencias

- **Enmienda.** ADR-072 regla 6 deja de decir «solo para ADMIN». Su razón sigue en pie: ningún rol que no sea ADMIN busca por correo ni recibe un correo de la paleta.
- **Pruebas.** La prueba del alcance deja de pedir 403 a la dirección y pasa a pedir que no vea a nadie fuera de su comité ni ningún correo.
- **Persistencia.** No hay migración.
