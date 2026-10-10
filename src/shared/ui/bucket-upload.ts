import { UploadError } from "./upload-error";

// Subida directa al bucket (ADR-022; un solo protocolo, ADR-121 regla 14): la casa firma, el navegador
// le manda el archivo al bucket con los campos firmados y, si el subidor lo pide, la casa confirma.
// Los bytes no pasan por la app. Qué archivo se admite, qué se muestra y qué pasa después son de cada
// subidor: acá solo vive lo que los cuatro hacían igual.

/** Lo que la casa firma para una subida: adónde va el archivo y con qué campos. */
interface PreparedUpload {
  key: string;
  url: string;
  fields: Record<string, string>;
}

/** Un POST con cuerpo JSON a una ruta de la casa: la ruta y el cuerpo que cada subidor arma con lo suyo. */
interface JsonPost {
  url: string;
  body: Record<string, unknown>;
}

interface UploadPlan {
  presign: JsonPost;
  /** Lo que se dice cuando el paso que falla no trae un mensaje propio. */
  fallback: string;
}

interface ConfirmedUploadPlan extends UploadPlan {
  /** A este cuerpo se le antepone la `key` que firmó la casa. */
  confirm: JsonPost;
}

function postJson(call: JsonPost): Promise<Response> {
  return fetch(call.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(call.body),
  });
}

/** El mensaje con que la casa rechazó; sin cuerpo JSON o sin `error`, el de siempre. */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/** Los campos firmados en su orden y el archivo al final: el bucket ignora lo que venga después. */
function uploadForm(fields: Record<string, string>, file: File): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }
  form.append("file", file, file.name);
  return form;
}

/**
 * Sube un archivo al bucket y devuelve su `key`; con `confirm`, también la respuesta de la casa, sin
 * leer, para quien necesite el `id`.
 *
 * Un rechazo de la casa sale como `UploadError` con su mensaje, y uno del bucket con `fallback`: lo que
 * el bucket responda no se lee. Una falla de red o una respuesta que no es JSON salen tal cual, para
 * que el subidor las pase por `uploadErrorMessage`.
 */
export async function uploadToBucket(
  file: File,
  plan: ConfirmedUploadPlan,
): Promise<{ key: string; confirmation: Response }>;
export async function uploadToBucket(file: File, plan: UploadPlan): Promise<{ key: string }>;
export async function uploadToBucket(
  file: File,
  plan: UploadPlan & { confirm?: JsonPost },
): Promise<{ key: string; confirmation?: Response }> {
  const presign = await postJson(plan.presign);
  if (!presign.ok) {
    throw new UploadError(await readError(presign, plan.fallback));
  }
  const prepared = (await presign.json()) as PreparedUpload;
  const stored = await fetch(prepared.url, {
    method: "POST",
    body: uploadForm(prepared.fields, file),
  });
  if (!stored.ok) {
    throw new UploadError(plan.fallback);
  }
  if (!plan.confirm) {
    return { key: prepared.key };
  }
  const confirmation = await postJson({
    url: plan.confirm.url,
    body: { key: prepared.key, ...plan.confirm.body },
  });
  if (!confirmation.ok) {
    throw new UploadError(await readError(confirmation, plan.fallback));
  }
  return { key: prepared.key, confirmation };
}
