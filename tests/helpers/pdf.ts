// Un PDF mínimo escrito a mano (sin dependencias) con texto en Helvetica: sirve para las pruebas de
// normativa y para ensayar el extractor. Solo ASCII: la codificación de fuentes queda fuera de alcance.

function escapePdf(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Construye un PDF de `pages.length` páginas; cada página es una lista de líneas. */
export function minimalPdf(pages: string[][]): Buffer {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = add("<< /Type /Pages /Kids [] /Count 0 >>"); // se completa al final
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];
  for (const lines of pages) {
    const text = lines
      .map((line, index) => `BT /F1 11 Tf 56 ${760 - index * 16} Td (${escapePdf(line)}) Tj ET`)
      .join("\n");
    const stream = `<< /Length ${Buffer.byteLength(text, "latin1")} >>\nstream\n${text}\nendstream`;
    const content = add(stream);
    const page = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
    );
    pageIds.push(page);
  }
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let out = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Dos páginas con un capítulo y tres artículos, como un estatuto sintético. */
export function sampleNormativaPdf(): Buffer {
  return minimalPdf([
    [
      "ESTATUTOS DE PRUEBA DE LA ORGANIZACION ESTUDIANTIL",
      "CAPITULO I",
      "NATURALEZA Y OBJETO",
      "ARTICULO 1. NATURALEZA. La Organizacion Estudiantil es una organizacion",
      "de estudiantes de la Universidad EAFIT, sin animo de lucro.",
      "ARTICULO 2. OBJETO. Promover la participacion estudiantil y organizar",
      "actividades para la comunidad universitaria.",
      "PARAGRAFO. Las actividades se rigen por el reglamento.",
    ],
    [
      "CAPITULO II",
      "ASAMBLEA GENERAL",
      "ARTICULO 3. ASAMBLEA. La Asamblea General es la maxima autoridad de la",
      "Organizacion y se reune al menos una vez por semestre.",
      "1. Convoca la Junta Directiva.",
      "2. Decide por mayoria simple.",
    ],
  ]);
}

/** El JSON del extractor para el PDF de ejemplo, tal como lo cargaria el admin. */
export function sampleArticlesJson(): string {
  return JSON.stringify({
    format: "oe-normativa/1",
    kind: "ESTATUTOS",
    source: "estatutos-prueba.pdf",
    pages: 2,
    articles: [
      {
        key: "art-1",
        chapterKey: "cap-1",
        chapterTitle: "NATURALEZA Y OBJETO",
        number: "1",
        title: "NATURALEZA",
        body: "La Organización Estudiantil es una organización de estudiantes de la Universidad EAFIT, sin ánimo de lucro.",
        pages: [1],
      },
      {
        key: "art-2",
        chapterKey: "cap-1",
        chapterTitle: "NATURALEZA Y OBJETO",
        number: "2",
        title: "OBJETO",
        body: "Promover la participación estudiantil y organizar actividades para la comunidad universitaria.\n\nPARÁGRAFO. Las actividades se rigen por el reglamento.",
        pages: [1],
      },
      {
        key: "art-3",
        chapterKey: "cap-2",
        chapterTitle: "ASAMBLEA GENERAL",
        number: "3",
        title: "ASAMBLEA",
        body: "La Asamblea General es la máxima autoridad de la Organización y se reúne al menos una vez por semestre.\n\n1. Convoca la Junta Directiva.\n\n2. Decide por mayoría simple.",
        pages: [2],
      },
    ],
  });
}
