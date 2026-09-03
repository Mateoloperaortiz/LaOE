import { afterAll, describe, expect, it } from "vitest";
import { deleteObject, headObject, presignRead, presignUpload } from "@/shared/adapters/storage";

// Contra Garage en local (compose): la subida directa del navegador se simula con fetch y FormData.

describe("storage (bucket S3)", () => {
  const key = `pruebas/${Date.now()}.txt`;
  afterAll(async () => {
    await deleteObject(key).catch(() => undefined);
  });

  it("sube con POST prefirmado, comprueba con HEAD y lee por URL prefirmada", async () => {
    const upload = await presignUpload({
      key,
      contentType: "text/plain",
      minBytes: 1,
      maxBytes: 1024,
    });
    const form = new FormData();
    for (const [name, value] of Object.entries(upload.fields)) {
      form.append(name, value);
    }
    form.append("file", new Blob(["hola OE"], { type: "text/plain" }), "hola.txt");
    const response = await fetch(upload.url, { method: "POST", body: form });
    expect([200, 201, 204]).toContain(response.status);

    const info = await headObject(key);
    expect(info).toMatchObject({ byteSize: 7 });

    const url = await presignRead(key, 60);
    const read = await fetch(url);
    expect(read.status).toBe(200);
    expect(await read.text()).toBe("hola OE");

    expect(await headObject("no/existe.txt")).toBeNull();
  });

  it("rechaza un archivo fuera del tamaño permitido", async () => {
    const upload = await presignUpload({
      key: `${key}.grande`,
      contentType: "text/plain",
      minBytes: 1,
      maxBytes: 4,
    });
    const form = new FormData();
    for (const [name, value] of Object.entries(upload.fields)) {
      form.append(name, value);
    }
    form.append("file", new Blob(["demasiado grande"], { type: "text/plain" }), "grande.txt");
    const response = await fetch(upload.url, { method: "POST", body: form });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
