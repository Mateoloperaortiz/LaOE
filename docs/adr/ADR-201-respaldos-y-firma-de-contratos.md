# ADR-201 · El contrato y sus dos respaldos para la firma

- Estado: Aceptada (2026-11-18)
- Desarrolla los contratos de A5 en [ADR-195](ADR-195-los-avales-de-la-junta.md). La aprobación de cada compra se rige por [ADR-200](ADR-200-aval-de-cada-compra.md).

## Decisión

El art. 75 del Reglamento exige el análisis del abogado de la Universidad y el visto bueno del coordinador del macroproceso interesado antes de que la VP Financiera o la Presidencia firme en nombre de la OE. Mateo confirmó que el comité adjunta el contrato y los dos respaldos en la casa.

1. Finanzas del comité identifica el objeto, el proveedor y el monto. Adjunta un archivo en cada uno de los tres campos y envía el expediente a la Mesa de ambos cargos.
2. La VP Financiera o la Presidencia pueden registrar su propia firma, aun cuando ambos cargos tengan titular. También pueden rechazar con motivo. La primera decisión queda en el expediente con persona, cargo y fecha. Se trata del registro de una firma hecha por la persona en el contrato. Para corregir los documentos se presenta otra solicitud.
3. El comité consulta el expediente y recibe la decisión. La formalización de un contrato y el pago de una compra tienen registros propios. Para cargar el pago al presupuesto se sigue el flujo de la ADR-200.
4. El navegador sube cada archivo al bucket privado por POST prefirmado, con el límite de 20 MB por archivo de la [ADR-022](ADR-022-medios-prefirmados.md). El servidor verifica el contenido por su SHA-256 y archiva una copia que el navegador solo puede descargar. La app autoriza la descarga a Finanzas del comité, la VP Financiera, la Presidencia o ADMIN. La copia temporal se retira al enviar el expediente. El outbox también limpia las subidas abandonadas al cabo de un día.
