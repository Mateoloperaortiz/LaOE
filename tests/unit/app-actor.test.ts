import { describe, expect, it, vi } from "vitest";
import { actorContext, sessionActorContext } from "@/app/_lib/actor";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));

const session = {
  personId: "persona-sintetica",
  email: "sintetica@example.test",
  isAdmin: true,
  permissions: [{ code: "ADMIN", committeeId: null }],
};

describe("actor de un comando", () => {
  it("actorContext entrega solo quién y desde dónde: nada más de la sesión pasa al dominio", async () => {
    expect(await actorContext(session)).toEqual({
      personId: "persona-sintetica",
      ip: "203.0.113.7",
    });
  });

  it("sessionActorContext conserva la sesión para los comandos que autorizan con ella", async () => {
    expect(await sessionActorContext(session)).toEqual({ ...session, ip: "203.0.113.7" });
  });
});
