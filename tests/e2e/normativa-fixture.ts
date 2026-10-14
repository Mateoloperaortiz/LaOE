import { randomBytes } from "node:crypto";
import sharp from "sharp";
import {
  confirmDocumentAs,
  prepareDocumentUpload,
  publishDocumentAs,
  replaceArticlesAs,
} from "@/modules/content/domain/documents";
import { parseArticlesJson } from "@/modules/content/domain/documents-pure";
import { processMedia } from "@/modules/content/domain/media-process";
import { putObject } from "@/shared/adapters/storage";
import { seedMediaAsset } from "../factories";
import {
  sampleArticlesJson,
  sampleNormativaPdf,
  sampleNormativaV2Json,
  sampleNormativaV2Pdf,
} from "../helpers/pdf";

/** Los lectores preparan su propio documento; la publicación por UI tiene sus pruebas separadas. */
export async function prepareReaderDocument(title: string, version: 1 | 2): Promise<void> {
  let assetId = "";
  if (version === 2) {
    const image = await sharp({
      create: { width: 800, height: 360, channels: 3, background: "#10264c" },
    })
      .png()
      .toBuffer();
    const key = `media/e2e-${randomBytes(12).toString("hex")}.png`;
    await putObject(key, image, "image/png");
    assetId = await seedMediaAsset(key, {
      visibility: "PRIVATE",
      originalFilename: "e2e-organigrama.png",
      contentType: "image/png",
      byteSize: image.length,
      status: "PENDING",
    });
    await processMedia(assetId);
  }
  const bytes = version === 1 ? sampleNormativaPdf() : sampleNormativaV2Pdf();
  const filename = "e2e-normativa.pdf";
  const upload = await prepareDocumentUpload({ filename, byteSize: bytes.length });
  await putObject(upload.key, bytes, "application/pdf");
  const actor = { personId: null, ip: null };
  const document = await confirmDocumentAs(actor, {
    key: upload.key,
    filename,
    title,
    kind: "ESTATUTOS",
    version: "2026-05-08",
    audience: "MEMBERS",
  });
  const parsed = parseArticlesJson(
    version === 1 ? sampleArticlesJson() : sampleNormativaV2Json(assetId),
  );
  if (!parsed.ok) throw new Error("Contenido sintético inválido");
  await replaceArticlesAs(actor, document.id, parsed.data);
  await publishDocumentAs(actor, document.id);
}
