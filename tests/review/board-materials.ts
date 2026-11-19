import { copyFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { minimalPdf } from "../helpers/pdf";
import type { prepareBoardScenarios } from "./board-scenarios";

type Scenarios = Awaited<ReturnType<typeof prepareBoardScenarios>>;

export async function writeReviewMaterials(
  dir: string,
  appUrl: string,
  d: Scenarios,
  revision: string,
) {
  await copyFile("public/icons/icon-192.png", join(dir, "pieza-de-ensayo.png"));
  for (const [filename, title] of [
    ["contrato", "Contrato de ensayo"],
    ["revision-juridica", "Revision del abogado"],
    ["visto-bueno", "Visto bueno del coordinador"],
  ] as const) {
    await writeFile(
      join(dir, `${filename}.pdf`),
      minimalPdf([[title, "Documento ficticio para el ensayo de la Junta."]]),
      { mode: 0o600, flag: "wx" },
    );
  }
  await writeFile(
    join(dir, "accesos.json"),
    `${JSON.stringify(
      d.accounts.map(({ label, email, password }) => ({
        cargo: label,
        correo: email,
        clave: password,
      })),
      null,
      2,
    )}\n`,
    { mode: 0o600, flag: "wx" },
  );
  const rows = [
    ["A1 · Evento", "Dirección General y Presidencia"],
    ["A2 · Falta", "GH del comité y VP de GH"],
    ["A3 · Postulación", "Miembro nuevo y VP de GH"],
    ["A4 · Reasignación", "Dirección Financiera y VP Financiera"],
    ["A4 · Presupuesto extraordinario", "Dirección Financiera, VP Financiera y Operación"],
    ["A5 · Compra y pago", "Dirección Financiera y VP Financiera"],
    ["A5 · Contrato", "Dirección Financiera y VP Financiera o Presidencia"],
    ["A6 · Pieza y acompañamiento", "Mercadeo, VP de Comunicaciones y CCM"],
    ["A7 · Préstamo y devolución", "Logística, VP Administrativa y CML"],
    [
      "A8 · Cruces",
      "GH de INVENTIVA, GH de DÍAS, Dirección General del comité, VP de GH y VP Administrativa",
    ],
    ["A8 · Espacio", "Logística y VP Administrativa"],
  ];
  const guide = relative(dir, resolve("docs/revision-avales-junta.md"))
    .split(sep)
    .map(encodeURIComponent)
    .join("/");
  const minutes = `# Acta de revisión de la Junta

Sesión del semestre ${d.termCode} preparada el ${d.day} a partir de la revisión \`${revision}\`. La fecha de preparación corresponde a los datos ficticios. La Junta registra la fecha en que realiza cada recorrido. La [guía de los once avales](${guide}) indica los pasos y el resultado esperado por cargo.

## Datos de esta sesión

- Inicio de sesión y avisos en [Mi OE](${appUrl}/app). Cada cargo tiene una cuenta en el [archivo privado de accesos](accesos.json).
- [Mesa de la Junta](${appUrl}/admin/mesa) y [área financiera del comité](${appUrl}/admin/comites/${d.slug}?area=finanzas). Presidencia puede abrir [Encuentro pendiente de Presidencia](${appUrl}/admin/avales?aval=${d.eventId}). [Jornada del comité de ensayo](${appUrl}/admin/avales?aval=${d.approvedEventId}) ya tiene aval y sirve para la reasignación y el préstamo.
- [Presupuesto ordinario](${appUrl}/admin/presupuestos/${d.budgetId}) con los rubros Escenario y Materiales. [Presupuesto extraordinario en borrador](${appUrl}/admin/presupuestos/${d.extraId}). El contrato, la revisión jurídica y el visto bueno ficticios están en los tres PDF de esta carpeta.
- [Comunicación del comité](${appUrl}/admin/comites/${d.slug}?area=comunicacion). Cargar \`pieza-de-ensayo.png\`, elegir el feed de Instagram y la Dirección de Mercadeo de ensayo. Tras el aval, el comité registra la publicación simulada. El CCM comenta desde [Acompañamiento de Mercadeo](${appUrl}/app/mercadeo).
- [Solicitud de materiales](${appUrl}/admin/inventario/prestamos#${d.loanId}) de dos extensiones para el evento del ${d.startDay} al ${d.endDay}. El retiro queda habilitado desde ${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date(d.pickup))} de Colombia. Fecha límite de devolución ${d.returnDay}. Logística confirma en [Inventario](${appUrl}/app/inventario), el CML entrega dos y recibe una. Carnet de Logística \`${d.cardUid}\`. Etiqueta del material \`${d.barcode}\`.
- [Semana de los cruces](${appUrl}/app/coordinacion?fecha=${d.startDay}). «Ensayo de INVENTIVA», «Ensayo de DÍAS» y «Planeación del comité de ensayo» coinciden de 10 a 11 el ${d.startDay}. La dirección de GH de INVENTIVA eleva el par de macroeventos. La Dirección General eleva el cruce entre su comité e INVENTIVA.
- [Catálogo de espacios](${appUrl}/app/coordinacion?fecha=${d.startDay}#espacios). La VP crea «Sala de ensayo» y Logística presenta dos solicitudes para la misma franja.

## Resultado que registra la Junta de 2027

Quien facilite la sesión anota fecha y cargo presente, marca **Conforme** o **Requiere ajuste** e identifica el expediente o la observación. Si hay un ajuste, registra quién lo retoma y el resultado al repetir el recorrido.

| Recorrido | Cargos convocados | Fecha y cargo presente | Resultado | Evidencia, ajuste y seguimiento |
| --- | --- | --- | --- | --- |
${rows.map(([flow, who]) => `| ${flow} | ${who} | | Pendiente | |`).join("\n")}

**Conclusión de la Junta y fecha** · Pendiente.

**Salida conjunta del rediseño** · Pendiente. Registrar el SHA publicado, la fecha y la verificación del despliegue cuando se ejecute.
`;
  await writeFile(join(dir, "acta.md"), minutes, { flag: "wx", mode: 0o600 });
}
