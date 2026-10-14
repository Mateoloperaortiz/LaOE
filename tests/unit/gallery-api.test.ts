import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  consent: vi.fn(),
  photo: vi.fn(),
  album: vi.fn(),
}));
vi.mock("@/modules/identity", () => ({ getActor: mocks.actor }));
vi.mock("@/modules/people", () => ({ hasLiveConsent: mocks.consent }));
vi.mock("@/modules/content", () => ({
  openGalleryPhoto: mocks.photo,
  getGalleryAlbum: mocks.album,
}));

import { GET as photoGet } from "@/app/api/fotos/[id]/route";
import { GET as albumGet } from "@/app/api/fotos/colecciones/[collection]/albumes/[album]/route";

const photoContext = { params: Promise.resolve({ id: "fotoprueba12345" }) };
const albumContext = { params: Promise.resolve({ collection: "prueba", album: "momentos" }) };
const privateRequest = () => new Request("https://oe.example/api/fotos/fotoprueba12345?w=480");

describe("API de fotos privada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ personId: "miembroprueba", membershipStatus: "ACTIVE" });
    mocks.consent.mockResolvedValue(true);
  });

  it.each([
    "sin sesión",
    "sin consentimiento",
    "retirado",
  ])("rechaza bytes y metadata: %s", async (condition) => {
    if (condition === "sin sesión") mocks.actor.mockResolvedValue(null);
    if (condition === "sin consentimiento") mocks.consent.mockResolvedValue(false);
    if (condition === "retirado")
      mocks.actor.mockResolvedValue({ personId: "miembroprueba", membershipStatus: "INACTIVE" });
    const photo = await photoGet(privateRequest(), photoContext);
    const album = await albumGet(
      new Request("https://oe.example/api/fotos/colecciones/prueba/albumes/momentos"),
      albumContext,
    );
    expect(photo.status).toBe(condition === "sin sesión" ? 401 : 403);
    expect(album.status).toBe(photo.status);
    expect(photo.headers.get("cache-control")).toBe("private, no-store");
    expect(album.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.photo).not.toHaveBeenCalled();
    expect(mocks.album).not.toHaveBeenCalled();
  });

  it.each([
    "ACTIVE",
    "HONORARY",
    "ON_LEAVE",
  ])("entrega stream sin URL del bucket a %s y revalida al cerrar sesión", async (status) => {
    mocks.actor.mockResolvedValue({ personId: "miembroprueba", membershipStatus: status });
    mocks.photo.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
      byteSize: 3,
    });
    const response = await photoGet(privateRequest(), photoContext);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(mocks.photo).toHaveBeenCalledWith("fotoprueba12345", 480, expect.any(AbortSignal));
    mocks.actor.mockResolvedValue(null);
    expect((await photoGet(privateRequest(), photoContext)).status).toBe(401);
    expect(mocks.photo).toHaveBeenCalledTimes(1);
  });

  it("rechaza ancho inválido y fotos no publicadas, también sus miniaturas", async () => {
    expect(
      (
        await photoGet(
          new Request("https://oe.example/api/fotos/fotoprueba12345?w=../original"),
          photoContext,
        )
      ).status,
    ).toBe(404);
    expect(mocks.photo).not.toHaveBeenCalled();
    mocks.photo.mockResolvedValue(null);
    expect((await photoGet(privateRequest(), photoContext)).status).toBe(404);
    expect(
      (await photoGet(new Request("https://oe.example/api/fotos/fotoprueba12345"), photoContext))
        .status,
    ).toBe(404);
  });

  it("pagina sin caché y rechaza query inválida sin consultar el álbum", async () => {
    mocks.album.mockResolvedValue({ photos: [], page: 2, totalPages: 2 });
    const response = await albumGet(
      new Request("https://oe.example/api/fotos/colecciones/prueba/albumes/momentos?pagina=2"),
      albumContext,
    );
    expect(response.status).toBe(200);
    expect(mocks.album).toHaveBeenCalledWith("prueba", "momentos", { page: 2 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const bad = await albumGet(
      new Request("https://oe.example/api/fotos/colecciones/prueba/albumes/momentos?pagina=-1"),
      albumContext,
    );
    expect(bad.status).toBe(400);
    expect(mocks.album).toHaveBeenCalledTimes(1);
  });
});
