import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { GalleryImportError } from "./gallery-import-model";
import { prepareGallery } from "./gallery-import-prepare";

const HELP = `Uso: npm run fotos:importar -- preparar --source <carpeta> --output <carpeta privada> --collection <slug> --title <título> --description <texto> --banner <ruta relativa> [--highlights <manifiesto de selección>] [--expected-source <cantidad>] [--expected-unique <cantidad>] [--concurrency 3]
Preparar verifica SHA256, excluye carpetas de jugadores y videos, y genera WebP sin metadatos. No requiere credenciales ni consulta la base.
Las copias y checkpoints deben quedar fuera del repositorio. Repetir el mismo comando reanuda y verifica los archivos ya preparados.
Importar: npm run fotos:importar -- importar --output <carpeta privada> --actor-id <ADMIN existente> --target-origin <origen explícito> [--publish] [--concurrency 3]
Importar exige preparación completa. Sin --publish guarda borradores privados; publicar valida todos los conteos del plan.
Verificar: npm run fotos:importar -- verificar --output <carpeta privada> --actor-id <ADMIN existente> --target-origin <origen explícito> [--concurrency 3]
Verificar comprueba colección publicada, selección, pertenencias, paginación y objetos sin modificar la base ni el bucket.
--max-photos permite un ensayo local parcial y nunca habilita la importación.
`;

function count(value: string | undefined, fallback?: number): number | undefined {
  if (value === undefined) return fallback;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1)
    throw new GalleryImportError("Una cantidad no es un entero positivo");
  return result;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      source: { type: "string" },
      output: { type: "string" },
      collection: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      banner: { type: "string" },
      highlights: { type: "string" },
      "expected-source": { type: "string" },
      "expected-unique": { type: "string" },
      "max-photos": { type: "string" },
      concurrency: { type: "string", default: "3" },
      "actor-id": { type: "string" },
      "target-origin": { type: "string" },
      publish: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const mode = positionals[0];
  const concurrency = count(values.concurrency, 3) ?? 3;
  if (!values.output || positionals.length !== 1 || concurrency > (mode === "preparar" ? 8 : 4))
    throw new GalleryImportError(HELP);
  if (mode === "preparar") {
    if (
      !values.source ||
      !values.collection ||
      !values.title ||
      !values.description ||
      !values.banner ||
      values.publish ||
      values["actor-id"]
    )
      throw new GalleryImportError(HELP);
    const expectedSourceCount = count(values["expected-source"]);
    const expectedUniqueCount = count(values["expected-unique"]);
    const maxPhotos = count(values["max-photos"]);
    await prepareGallery({
      source: values.source,
      output: resolve(values.output),
      collection: { slug: values.collection, title: values.title, description: values.description },
      banner: values.banner,
      concurrency,
      ...(values.highlights ? { highlights: values.highlights } : {}),
      ...(expectedSourceCount ? { expectedSourceCount } : {}),
      ...(expectedUniqueCount ? { expectedUniqueCount } : {}),
      ...(maxPhotos ? { maxPhotos } : {}),
    });
  } else if (mode === "importar" || mode === "verificar") {
    if (!values["actor-id"] || !values["target-origin"] || values.source || values["max-photos"])
      throw new GalleryImportError(HELP);
    if (mode === "verificar" && values.publish) throw new GalleryImportError(HELP);
    const { importGallery } = await import("./gallery-import-remote");
    await importGallery({
      output: resolve(values.output),
      actorId: values["actor-id"],
      targetOrigin: values["target-origin"],
      publish: values.publish,
      concurrency,
      verifyOnly: mode === "verificar",
    });
  } else throw new GalleryImportError(HELP);
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof GalleryImportError ? error.message : "No se completó el proceso; revisá los archivos privados y el entorno elegido"}\n`,
  );
  process.exitCode = 1;
}
