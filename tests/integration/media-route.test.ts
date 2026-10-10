import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { confirmUploadAs, getMedia, prepareUpload } from "@/modules/content";
import { DELIVERY } from "@/modules/content/domain/media-pure";
import { lockPersonAnonymization } from "@/modules/people";
import { deleteObject } from "@/shared/adapters/storage";
import { noisePng, uploadAsBrowser } from "../helpers/media";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// La ruta que entrega un medio (ADR-022, ADR-114 regla 8) con el dominio de verdad, contra Postgres y
// Garage en local. Solo se simula quién tiene sesión, que la ruta lee de las cookies de la solicitud.

const keys: string[] = [];

/** Lo que compone la capa de la app: content pregunta y people responde con la persona tomada. */
const ownerCheck = { lockOwner: lockPersonAnonymization };
let signedInAs: string | null = null;

vi.mock("@/modules/identity", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/modules/identity")>();
  return {
    ...mod,
    getActor: () =>
      Promise.resolve(
        signedInAs === null
          ? null
          : {
              personId: signedInAs,
              sessionId: "sesion-test",
              email: "miembro@test.dev",
              name: "Miembro Sintético",
              firstName: "Miembro",
              membershipStatus: "ACTIVE" as const,
              permissions: [],
              otpVerifiedAt: new Date(),
              sessionLastSeenAt: new Date(),
            },
      ),
  };
});

const { GET } = await import("@/app/api/media/[id]/route");

/** Sube como hace el navegador, confirma y procesa por el outbox. Devuelve el medio y su original. */
async function upload(
  personId: string,
  purpose: "media" | "photo",
  bytes: Buffer,
): Promise<{ id: string; originalKey: string }> {
  const visibility = purpose === "photo" ? "PRIVATE" : "PUBLIC";
  const contentType = "image/png";
  const prepared = await prepareUpload(
    { filename: "imagen", contentType, byteSize: bytes.byteLength, visibility, purpose },
    { personId },
  );
  keys.push(prepared.key);
  await uploadAsBrowser(prepared, { bytes, contentType, filename: "imagen" });
  const { id } = await confirmUploadAs(
    { personId, ip: null },
    { key: prepared.key, filename: "imagen", visibility, purpose },
    purpose === "photo" ? { by: "SELF" } : { by: "ADMIN" },
    ownerCheck,
  );
  await drainOutbox();
  keys.push(...Object.values((await getMedia(id))?.variants ?? {}).map((variant) => variant.key));
  return { id, originalKey: prepared.key };
}

/** Lo que responde la ruta a `/api/media/<id><búsqueda>`. */
function request(id: string, search = ""): Promise<Response> {
  return GET(new Request(`https://oeeafit.com/api/media/${id}${search}`), {
    params: Promise.resolve({ id }),
  });
}

/** El objeto del bucket al que redirige la respuesta: la ruta de la dirección firmada. */
function target(response: Response): string {
  expect(response.status).toBe(302);
  return decodeURIComponent(new URL(response.headers.get("location") ?? "").pathname);
}

afterAll(async () => {
  await Promise.all(keys.map((key) => deleteObject(key).catch(() => undefined)));
  await closeDb();
});

describe("GET /api/media/[id]", () => {
  beforeEach(async () => {
    await truncateAll();
    signedInAs = null;
  });

  it("la foto de un miembro sale en su variante completa y nunca en su original, se pida lo que se pida", async () => {
    const member = await seedMember("foto.ruta@eafit.edu.co");
    // De menos de 480 px: no tiene variantes de ancho, y antes salía entera con cualquier ancho.
    const photo = await upload(member, "photo", await noisePng(300, 200));
    signedInAs = member;

    for (const search of [
      "",
      "?w=480",
      "?w=96",
      "?w=1600",
      "?w=",
      "?w=abc",
      "?w=1",
      "?w=99999",
      "?w=-480",
      "?w=4.5",
      "?w=480&w=960",
      "?ancho=480",
    ]) {
      const response = await request(photo.id, search);
      const key = target(response);
      expect(key.endsWith(`/variants/${photo.id}/full.webp`), search).toBe(true);
      expect(key, search).not.toContain(photo.originalKey);
      expect(response.headers.get("cache-control")).toBe(DELIVERY.PRIVATE.cacheControl);
    }
  });

  it("con un ancho de dos a cuatro cifras entrega la variante de ese ancho, y con lo demás la completa", async () => {
    const admin = await seedMember("medios.ruta@eafit.edu.co");
    const media = await upload(admin, "media", await noisePng(1200, 800));
    const variant = (name: string) => `/variants/${media.id}/${name}.webp`;

    // Un medio público sale sin sesión.
    for (const [search, name] of [
      ["?w=480", "w480"],
      ["?w=0480", "w480"],
      ["?w=700", "w480"],
      ["?w=960", "w960"],
      ["?w=9999", "w960"],
      ["?w=96", "w480"],
      ["", "full"],
      ["?w=", "full"],
      ["?w=abc", "full"],
      ["?w=1", "full"],
      ["?w=96000", "full"],
      ["?w=-480", "full"],
      ["?w=480px", "full"],
    ] as const) {
      const response = await request(media.id, search);
      expect(target(response).endsWith(variant(name)), search).toBe(true);
      expect(response.headers.get("cache-control")).toBe(DELIVERY.PUBLIC.cacheControl);
    }
  });

  it("un medio privado no sale sin sesión, y lo que no existe responde 404 sin caché", async () => {
    const member = await seedMember("foto.privada@eafit.edu.co");
    const photo = await upload(member, "photo", await noisePng(300, 200));

    const anonymous = await request(photo.id, "?w=480");
    expect(anonymous.status).toBe(403);
    expect(anonymous.headers.get("location")).toBeNull();
    expect(anonymous.headers.get("cache-control")).toBe("no-store");

    signedInAs = member;
    const unknown = await request("a".repeat(24));
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("cache-control")).toBe("no-store");
    for (const malformed of ["ABC", "corto", `${photo.id}.webp`, "..", "a".repeat(41)]) {
      const response = await request(malformed);
      expect(response.status, malformed).toBe(404);
      expect(response.headers.get("location")).toBeNull();
    }
  });
});
