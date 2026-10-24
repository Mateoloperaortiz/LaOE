import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicationAction } from "@/app/admin/documentos/actions";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

const state = vi.hoisted(() => ({
  actor: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/modules/content", () => ({
  publishDocumentAs: state.publish,
  unpublishDocumentAs: state.unpublish,
  parseArticlesJson: vi.fn(),
  replaceArticlesAs: vi.fn(),
}));
// Se simula la sesión, no el guard: `requireAdminActor` corre de verdad, con su regla de licencia.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token-sintetico" }) }),
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));
vi.mock("@/modules/identity/domain/session", () => ({
  resolveActor: state.actor,
  findSessionByToken: vi.fn().mockResolvedValue(null),
  touchSession: vi.fn(),
}));

const documentId = "documentosintetico123";
const actor = {
  personId: "admin-sintetico",
  membershipStatus: "ACTIVE",
  isAdmin: true,
  permissions: [{ code: "ADMIN", committeeId: null }],
};
// La action entrega al dominio quién ejecuta y desde dónde (ADR-082), no el actor de sesión.
const commandActor = { personId: actor.personId, ip: "203.0.113.7" };
function publication(checksum: string | null) {
  const form = new FormData();
  form.set("id", documentId);
  form.set("intent", "publish");
  if (checksum !== null) form.set("contentSha256", checksum);
  return publicationAction(form);
}

beforeEach(() => {
  vi.clearAllMocks();
  state.actor.mockResolvedValue(actor);
  state.publish.mockResolvedValue(undefined);
});

describe("huella revisada en la publicación administrativa", () => {
  it("el ADMIN en licencia no publica aunque conserve su concesión", async () => {
    state.actor.mockResolvedValue({ ...actor, membershipStatus: "ON_LEAVE" });
    await expect(publication("a".repeat(64))).rejects.toThrow("redirect:/app");
    expect(state.publish).not.toHaveBeenCalled();
    expect(state.unpublish).not.toHaveBeenCalled();
    expect(state.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    "",
    null,
  ])("el campo vacío o ausente (%s) exige ausencia de contenido; no omite la revisión", async (checksum) => {
    await expect(publication(checksum)).rejects.toThrow(
      `redirect:/admin/documentos/${documentId}?estado=publicado`,
    );
    expect(state.publish).toHaveBeenCalledWith(commandActor, documentId, null);
  });

  it("conserva la huella de contenido que se revisó", async () => {
    const checksum = "a".repeat(64);
    await expect(publication(checksum)).rejects.toThrow(
      `redirect:/admin/documentos/${documentId}?estado=publicado`,
    );
    expect(state.publish).toHaveBeenCalledWith(commandActor, documentId, checksum);
  });

  it("vuelve al documento con el error de revisión obsoleta", async () => {
    state.publish.mockRejectedValue(new DomainError(t("T-1304")));
    await expect(publication("")).rejects.toThrow(
      `redirect:/admin/documentos/${documentId}?${new URLSearchParams({ error: t("T-1304") })}`,
    );
    expect(state.revalidate).not.toHaveBeenCalled();
  });
});
