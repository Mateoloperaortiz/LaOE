import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { closeDb } from "@/db/client";
import type { Actor } from "@/db/tx";
import { getEnv } from "@/env";
import {
  type ArticlesJson,
  confirmDocumentAs,
  confirmUploadAs,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIN_BYTES,
  type DocumentListRow,
  getDocumentWithArticles,
  getMedia,
  listDocuments,
  listMedia,
  MEDIA_LIMITS,
  type MediaRow,
  parseArticlesJson,
  prepareDocumentUpload,
  prepareUpload,
  processMedia,
  publishDocumentAs,
  replaceArticlesAs,
} from "@/modules/content";
import { listPermissionsFor } from "@/modules/identity";
import { canParticipate, getMemberSummary } from "@/modules/people";
import { getObject, putObject } from "@/shared/adapters/storage";
import {
  matchNormativaDocument,
  NormativaImportError,
  type NormativaManifestDocument,
  normativaContentChecksum,
  normativaImportIntent,
  normativaManifestSchema,
} from "./lib/normativa-import";

// El manifiesto, los PDF y los JSON revisados permanecen fuera del repositorio (ADR-034).
// No carga .env automáticamente: el operador elige el entorno y sus variables explícitamente.
// --apply solo carga borradores; --apply --publish solo publica cargas previas idénticas.

const HELP = `Uso: npm run normativa:import -- --input <manifiesto privado> [--actor-id <ADMIN>] [--apply [--publish]]
Sin --apply: valida todos los archivos, consulta el entorno y muestra los cambios sin escribir.
--apply: carga o actualiza borradores; las cargas idénticas se conservan.
--apply --publish: publica exclusivamente documentos ya cargados e idénticos; no sube ni reemplaza.
--actor-id: ADMIN existente y habilitado, obligatorio para escribir; no crea personas ni sesiones.
Las rutas del manifiesto se resuelven respecto de su carpeta. Ejemplo de estructura:
{"documents":[{"pdf":"estatutos.pdf","json":"estatutos.json","title":"Estatutos","version":"2026-05-08","audience":"MEMBERS","assets":{"organigrama":{"path":"organigrama.png","sha256":"<64 hex>"}}}]}
`;

interface LocalAsset {
  bytes: Buffer;
  sha256: string;
  filename: string;
  contentType: string;
  existing?: MediaRow;
}

interface LocalDocument {
  manifest: NormativaManifestDocument;
  filename: string;
  bytes: Buffer;
  json: ArticlesJson;
  kind: NonNullable<ArticlesJson["kind"]>;
  sha256: string;
  checksum: string;
  assets: Map<string, LocalAsset>;
}

interface PlannedDocument {
  local: LocalDocument;
  existing: DocumentListRow | undefined;
  intent: ReturnType<typeof normativaImportIntent>;
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readBounded(path: string, maxBytes: number): Promise<Buffer> {
  const info = await stat(path);
  if (!info.isFile() || info.size > maxBytes) {
    throw new NormativaImportError("Un archivo no es regular o supera el tamaño permitido");
  }
  const bytes = await readFile(path);
  if (bytes.length > maxBytes)
    throw new NormativaImportError("Un archivo supera el tamaño permitido");
  return bytes;
}

async function readLocalDocuments(inputPath: string): Promise<LocalDocument[]> {
  const parsedManifest = normativaManifestSchema.safeParse(
    JSON.parse((await readBounded(inputPath, 100_000)).toString("utf8")),
  );
  if (!parsedManifest.success)
    throw new NormativaImportError("El manifiesto no cumple el formato requerido");
  const base = dirname(inputPath);
  const documents: LocalDocument[] = [];
  const identities = new Set<string>();
  for (const manifest of parsedManifest.data.documents) {
    const pdfPath = resolve(base, manifest.pdf);
    const bytes = await readBounded(pdfPath, DOCUMENT_MAX_BYTES);
    if (
      extname(pdfPath).toLowerCase() !== ".pdf" ||
      bytes.length < DOCUMENT_MIN_BYTES ||
      bytes.subarray(0, 5).toString("ascii") !== "%PDF-"
    ) {
      throw new NormativaImportError("El archivo original no cumple el formato o tamaño de un PDF");
    }
    const parsed = parseArticlesJson(
      (await readBounded(resolve(base, manifest.json), 10 * 1024 * 1024)).toString("utf8"),
    );
    if (!parsed.ok) throw new NormativaImportError(`JSON de normativa inválido: ${parsed.detail}`);
    const json = parsed.data;
    const sha256 = hash(bytes);
    if (json.format !== "oe-normativa/2" || !json.kind || json.sha256 !== sha256) {
      throw new NormativaImportError(
        "La importación exige JSON v2 con tipo y SHA256 del PDF original",
      );
    }
    const identity = `${json.kind}:${manifest.version}`;
    if (identities.has(identity)) {
      throw new NormativaImportError("El manifiesto repite un tipo y versión de documento");
    }
    identities.add(identity);
    const references = new Set(
      json.articles.flatMap((article) =>
        article.blocks.flatMap((block) => (block.type === "image" ? [block.assetId] : [])),
      ),
    );
    const assets = new Map<string, LocalAsset>();
    for (const [placeholder, asset] of Object.entries(manifest.assets)) {
      if (!references.has(placeholder)) {
        throw new NormativaImportError(
          "El manifiesto incluye una imagen que no aparece en el JSON",
        );
      }
      const assetBytes = await readBounded(resolve(base, asset.path), MEDIA_LIMITS.maxBytes);
      if (hash(assetBytes) !== asset.sha256 || assetBytes.length < MEDIA_LIMITS.minBytes) {
        throw new NormativaImportError("Una imagen no coincide con su SHA256 o tamaño permitido");
      }
      const metadata = await sharp(assetBytes).metadata();
      const format = metadata.format === "jpeg" ? "jpg" : metadata.format;
      if (
        !format ||
        !["png", "jpg", "webp"].includes(format) ||
        !metadata.width ||
        !metadata.height
      ) {
        throw new NormativaImportError("Una imagen no tiene un formato o dimensiones admitidos");
      }
      assets.set(placeholder, {
        bytes: assetBytes,
        sha256: asset.sha256,
        filename: `normativa-${asset.sha256}.${format}`,
        contentType: metadata.format === "jpeg" ? "image/jpeg" : `image/${format}`,
      });
    }
    if ([...references].some((reference) => !assets.has(reference))) {
      throw new NormativaImportError(
        "Cada imagen del JSON debe tener archivo y SHA256 en el manifiesto",
      );
    }
    documents.push({
      manifest,
      filename: basename(pdfPath),
      bytes,
      json,
      kind: json.kind,
      sha256,
      assets,
      checksum: normativaContentChecksum(
        json.articles,
        new Map([...assets].map(([key, asset]) => [key, asset.sha256])),
      ),
    });
  }
  return documents;
}

async function readAllDocuments(): Promise<DocumentListRow[]> {
  const rows: DocumentListRow[] = [];
  for (let page = 1; ; page++) {
    const result = await listDocuments({ q: "", page, pageSize: 100 });
    rows.push(...result.rows);
    if (rows.length >= result.total || result.rows.length === 0) return rows;
  }
}

async function reusableAsset(asset: LocalAsset): Promise<MediaRow | undefined> {
  const candidates: MediaRow[] = [];
  for (let page = 1; ; page++) {
    const result = await listMedia({ q: asset.filename, page, pageSize: 100 });
    candidates.push(...result.rows);
    if (page * 100 >= result.total || result.rows.length === 0) break;
  }
  const existing = candidates
    .filter(
      (candidate) =>
        candidate.originalFilename === asset.filename && candidate.visibility === "PRIVATE",
    )
    .sort(
      (a, b) =>
        Number(b.status === "READY") - Number(a.status === "READY") || a.id.localeCompare(b.id),
    )[0];
  if (existing && hash(await getObject(existing.objectKey)) !== asset.sha256) {
    throw new NormativaImportError("La imagen existente en el bucket no coincide con su SHA256");
  }
  return existing;
}

async function persistedChecksum(id: string): Promise<string> {
  const detail = await getDocumentWithArticles(id);
  if (!detail)
    throw new NormativaImportError("El documento dejó de existir durante la verificación");
  const images = new Map<string, string>();
  for (const article of detail.articles) {
    for (const block of article.blocks) {
      if (block.type !== "image" || images.has(block.assetId)) continue;
      const asset = await getMedia(block.assetId);
      if (!asset || asset.visibility !== "PRIVATE" || asset.status !== "READY") {
        throw new NormativaImportError(
          "El documento existente referencia una imagen privada no disponible",
        );
      }
      images.set(block.assetId, hash(await getObject(asset.objectKey)));
    }
  }
  return normativaContentChecksum(detail.articles, images);
}

async function planDocuments(
  locals: LocalDocument[],
  publish: boolean,
): Promise<PlannedDocument[]> {
  const rows = await readAllDocuments();
  const planned: PlannedDocument[] = [];
  for (const local of locals) {
    const existing = matchNormativaDocument(
      { ...local.manifest, kind: local.kind, sha256: local.sha256 },
      rows,
    );
    if (existing && hash(await getObject(existing.fileKey)) !== local.sha256) {
      throw new NormativaImportError("El PDF del bucket no coincide con el original revisado");
    }
    const identical = existing
      ? Boolean(existing.contentSha256) && (await persistedChecksum(existing.id)) === local.checksum
      : false;
    const intent = normativaImportIntent(
      existing ? { status: existing.status, identical } : undefined,
      publish,
    );
    if (intent === "create" || intent === "replace") {
      for (const asset of local.assets.values()) {
        const existingAsset = await reusableAsset(asset);
        if (existingAsset) asset.existing = existingAsset;
      }
    }
    planned.push({ local, existing, intent });
  }
  return planned;
}

async function requireExistingAdmin(id: string): Promise<Actor> {
  if (!/^[a-z0-9]{10,40}$/.test(id)) throw new NormativaImportError("El ID del ADMIN no es válido");
  const [member, permissions] = await Promise.all([getMemberSummary(id), listPermissionsFor(id)]);
  if (
    !member?.canSignIn ||
    !canParticipate(member.membershipStatus) ||
    !permissions.some((permission) => permission.code === "ADMIN")
  ) {
    throw new NormativaImportError("El actor debe ser un ADMIN existente y habilitado");
  }
  return { personId: id };
}

async function resolveAsset(actor: Actor, asset: LocalAsset): Promise<string> {
  // Otro documento del mismo lote puede haber confirmado este hash después del preflight.
  let id = asset.existing?.id ?? (await reusableAsset(asset))?.id;
  if (!id) {
    const prepared = await prepareUpload({
      filename: asset.filename,
      contentType: asset.contentType,
      byteSize: asset.bytes.length,
      visibility: "PRIVATE",
    });
    await putObject(prepared.key, asset.bytes, asset.contentType);
    // `requireExistingAdmin` ya comprobó al actor: el alcance se declara como tal (ADR-113 regla 5).
    const confirmed = await confirmUploadAs(
      actor,
      { key: prepared.key, filename: asset.filename, visibility: "PRIVATE", purpose: "media" },
      { by: "ADMIN" },
    );
    id = confirmed.id;
  }
  await processMedia(id);
  const ready = await getMedia(id);
  if (!ready || ready.status !== "READY" || ready.visibility !== "PRIVATE") {
    throw new NormativaImportError(
      "La imagen no terminó de procesarse; la carga se puede reanudar",
    );
  }
  return id;
}

async function applyDocument(actor: Actor, plan: PlannedDocument): Promise<string> {
  if (plan.intent === "unchanged") return plan.existing?.id ?? "";
  if (plan.intent === "publish") {
    const id = plan.existing?.id;
    const expectedContentSha256 = plan.existing?.contentSha256;
    if (!id || !expectedContentSha256 || (await persistedChecksum(id)) !== plan.local.checksum) {
      throw new NormativaImportError("El contenido cambió después de revisarse; no se publicó");
    }
    await publishDocumentAs(actor, id, expectedContentSha256);
    return id;
  }
  const { local } = plan;
  const assetIds = new Map<string, string>();
  for (const [placeholder, asset] of local.assets) {
    assetIds.set(placeholder, await resolveAsset(actor, asset));
  }
  let id = plan.existing?.id;
  if (!id) {
    const prepared = await prepareDocumentUpload({
      filename: local.filename,
      byteSize: local.bytes.length,
    });
    await putObject(prepared.key, local.bytes, "application/pdf");
    const confirmed = await confirmDocumentAs(actor, {
      key: prepared.key,
      filename: local.filename,
      title: local.manifest.title,
      version: local.manifest.version,
      audience: local.manifest.audience,
      kind: local.kind,
    });
    id = confirmed.id;
  }
  const json: ArticlesJson = {
    ...local.json,
    articles: local.json.articles.map((article) => ({
      ...article,
      blocks: article.blocks.map((block) =>
        block.type === "image"
          ? { ...block, assetId: assetIds.get(block.assetId) ?? block.assetId }
          : block,
      ),
    })),
  };
  await replaceArticlesAs(actor, id, json);
  if ((await persistedChecksum(id)) !== local.checksum) {
    throw new NormativaImportError(
      "La lectura posterior a la carga no coincide con el contenido revisado",
    );
  }
  return id;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      "actor-id": { type: "string" },
      apply: { type: "boolean", default: false },
      publish: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (!values.input || (values.publish && !values.apply) || (values.apply && !values["actor-id"])) {
    throw new NormativaImportError(HELP);
  }
  // Todas las comprobaciones de archivos y del lote preceden a la primera escritura.
  const locals = await readLocalDocuments(resolve(values.input));
  const actor = values["actor-id"] ? await requireExistingAdmin(values["actor-id"]) : undefined;
  const planned = await planDocuments(locals, values.publish);
  process.stdout.write(
    `Entorno: ${new URL(getEnv().APP_URL).origin} · ${values.apply ? "APLICAR" : "SIMULACIÓN"}\n`,
  );
  for (const plan of planned) {
    process.stdout.write(
      `${plan.local.kind} · ${plan.local.manifest.version} · ${plan.intent} · ${plan.local.json.articles.length} unidades · PDF ${plan.local.sha256} · contenido ${plan.local.checksum}\n`,
    );
  }
  if (!values.apply || !actor) return;
  for (const plan of planned) {
    const id = await applyDocument(actor, plan);
    process.stdout.write(`OK · ${plan.local.kind} · ${plan.intent} · ${id}\n`);
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof NormativaImportError ? error.message : "No se completó la importación; revisá los archivos, las variables y la conexión del entorno elegido"}\n`,
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
