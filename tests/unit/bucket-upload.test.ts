import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadToBucket } from "@/shared/ui/bucket-upload";
import { UploadError, uploadErrorMessage } from "@/shared/ui/upload-error";

// El protocolo de subida directa al bucket que comparten los cuatro subidores (ADR-121 regla 14).
// La casa y el bucket se simulan con `fetch`: lo que se prueba es qué pide el navegador, en qué
// orden, y qué hace con cada respuesta. Corre en node: `File`, `FormData` y `Response` son globales.

const FALLBACK = "No se pudo subir el archivo de prueba.";
const PRESIGN = "/api/prueba/presign";
const CONFIRM = "/api/prueba/confirm";
const BUCKET = "http://bucket.invalid/casa";
const PREPARED = {
  key: "uploads/prueba/abc123.png",
  url: BUCKET,
  // El orden importa: el bucket lee la política antes que el archivo.
  fields: { key: "uploads/prueba/abc123.png", "Content-Type": "image/png", Policy: "firmada" },
};

const file = () => new File([new Uint8Array([1, 2, 3])], "prueba.png", { type: "image/png" });
const json = (body: unknown, status = 200) => Response.json(body, { status });
const html = (status: number) =>
  new Response("<h1>Bad Gateway</h1>", { status, headers: { "content-type": "text/html" } });

interface Call {
  url: string;
  init: RequestInit;
}

/** Responde, en orden, con lo que se le dé; un `Error` es una falla de red. Devuelve las llamadas. */
function network(...replies: Array<Response | Error>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const reply = replies.shift();
      if (!reply) throw new Error(`llamada de más a ${url}`);
      if (reply instanceof Error) throw reply;
      return reply;
    }),
  );
  return calls;
}

const sentJson = (call: Call | undefined) => JSON.parse(String(call?.init.body)) as unknown;

const plan = () => ({
  presign: { url: PRESIGN, body: { contentType: "image/png", byteSize: 3 } },
  fallback: FALLBACK,
});

const confirmedPlan = () => ({
  ...plan(),
  confirm: { url: CONFIRM, body: { filename: "prueba.png", visibility: "PRIVATE" } },
});

describe("subir un archivo directo al bucket", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pide la firma, le manda al bucket los campos firmados en su orden con el archivo al final y devuelve la llave", async () => {
    const calls = network(json(PREPARED), new Response(null, { status: 204 }));

    const result = await uploadToBucket(file(), plan());

    expect(result).toEqual({ key: PREPARED.key });
    expect(calls.map((call) => [call.url, call.init.method])).toEqual([
      [PRESIGN, "POST"],
      [BUCKET, "POST"],
    ]);
    expect(calls[0]?.init.headers).toEqual({ "content-type": "application/json" });
    expect(sentJson(calls[0])).toEqual({ contentType: "image/png", byteSize: 3 });
    const form = calls[1]?.init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect([...form.keys()]).toEqual(["key", "Content-Type", "Policy", "file"]);
    expect(form.get("Policy")).toBe("firmada");
    const sent = form.get("file") as File;
    expect(sent.name).toBe("prueba.png");
    expect(sent.type).toBe("image/png");
    expect(sent.size).toBe(3);
    // El navegador pone el content-type con su frontera: el subidor no lo fija.
    expect(calls[1]?.init.headers).toBeUndefined();
  });

  it("con confirmación, la casa recibe la llave antes de lo que arma el subidor y su respuesta vuelve sin leer", async () => {
    const calls = network(
      json(PREPARED),
      new Response(null, { status: 204 }),
      json({ id: "asset1" }, 201),
    );

    const result = await uploadToBucket(file(), confirmedPlan());

    expect(calls.map((call) => call.url)).toEqual([PRESIGN, BUCKET, CONFIRM]);
    expect(calls[2]?.init.method).toBe("POST");
    expect(calls[2]?.init.headers).toEqual({ "content-type": "application/json" });
    expect(Object.entries(sentJson(calls[2]) as object)).toEqual([
      ["key", PREPARED.key],
      ["filename", "prueba.png"],
      ["visibility", "PRIVATE"],
    ]);
    expect(result.key).toBe(PREPARED.key);
    expect(result.confirmation.bodyUsed).toBe(false);
    expect(await result.confirmation.json()).toEqual({ id: "asset1" });
  });

  it("si la casa no firma, el error lleva lo que la casa dijo y al bucket no le llega nada", async () => {
    const calls = network(json({ error: "Solo ADMIN" }, 403));

    const failure = await uploadToBucket(file(), confirmedPlan()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UploadError);
    expect(uploadErrorMessage(failure, FALLBACK)).toBe("Solo ADMIN");
    expect(calls).toHaveLength(1);
  });

  it.each([
    ["no trae cuerpo JSON", () => html(502)],
    ["trae un JSON sin mensaje", () => json({ code: "x" }, 500)],
  ])("si la casa no firma y su respuesta %s, el error lleva el texto de siempre", async (_case, reply) => {
    network(reply());

    const failure = await uploadToBucket(file(), plan()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UploadError);
    expect((failure as UploadError).message).toBe(FALLBACK);
  });

  it("si el bucket rechaza, el error lleva el texto de siempre aunque el bucket diga por qué, y no se confirma", async () => {
    const calls = network(
      json(PREPARED),
      new Response("<Error><Code>EntityTooLarge</Code><Message>Too large</Message></Error>", {
        status: 400,
        headers: { "content-type": "application/xml" },
      }),
    );

    const failure = await uploadToBucket(file(), confirmedPlan()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UploadError);
    expect((failure as UploadError).message).toBe(FALLBACK);
    expect(calls.map((call) => call.url)).toEqual([PRESIGN, BUCKET]);
  });

  it("si la casa no confirma, el error lleva lo que la casa dijo, y sin cuerpo JSON el texto de siempre", async () => {
    network(
      json(PREPARED),
      new Response(null, { status: 204 }),
      json({ error: "La imagen no llegó." }, 400),
    );
    const told = await uploadToBucket(file(), confirmedPlan()).catch((error: unknown) => error);
    expect(told).toBeInstanceOf(UploadError);
    expect((told as UploadError).message).toBe("La imagen no llegó.");

    network(json(PREPARED), new Response(null, { status: 204 }), html(502));
    const silent = await uploadToBucket(file(), confirmedPlan()).catch((error: unknown) => error);
    expect(silent).toBeInstanceOf(UploadError);
    expect((silent as UploadError).message).toBe(FALLBACK);
  });

  it("una falla de red sale tal cual, y el subidor la muestra con su texto de siempre", async () => {
    const offline = new TypeError("Failed to fetch");
    const calls = network(json(PREPARED), offline);

    const failure = await uploadToBucket(file(), confirmedPlan()).catch((error: unknown) => error);

    expect(failure).toBe(offline);
    expect(uploadErrorMessage(failure, FALLBACK)).toBe(FALLBACK);
    expect(calls).toHaveLength(2);
  });

  it("una firma que no es JSON falla antes de llegar al bucket y no pasa por mensaje de la casa", async () => {
    const calls = network(html(200));

    const failure = await uploadToBucket(file(), plan()).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(UploadError);
    expect(uploadErrorMessage(failure, FALLBACK)).toBe(FALLBACK);
    expect(calls).toHaveLength(1);
  });
});
