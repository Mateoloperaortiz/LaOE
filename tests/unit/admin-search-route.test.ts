import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/buscar/route";

// La paleta ⌘K es solo de ADMIN (ADR-072): otro rol no busca personas ni confirma si un correo existe.

const identity = vi.hoisted(() => ({ getActor: vi.fn() }));
const people = vi.hoisted(() => ({ searchPeople: vi.fn(), searchCommittees: vi.fn() }));
const participation = vi.hoisted(() => ({ searchOccasions: vi.fn() }));
const crm = vi.hoisted(() => ({ searchOrganizations: vi.fn() }));

vi.mock("@/env", () => ({ getEnv: () => ({ APP_TIMEZONE: "America/Bogota" }) }));
vi.mock("@/modules/identity", () => identity);
vi.mock("@/modules/people", () => people);
vi.mock("@/modules/participation", () => participation);
vi.mock("@/modules/crm", () => crm);

function search(q: string): Request {
  return new Request(`http://localhost/api/admin/buscar?q=${encodeURIComponent(q)}`);
}

function expectNoSearch(): void {
  expect(people.searchPeople).not.toHaveBeenCalled();
  expect(people.searchCommittees).not.toHaveBeenCalled();
  expect(participation.searchOccasions).not.toHaveBeenCalled();
  expect(crm.searchOrganizations).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  people.searchPeople.mockResolvedValue([
    {
      id: "personasintetica",
      fullName: "Persona Sintética",
      email: "persona@oe-sintetica.example",
    },
  ]);
  people.searchCommittees.mockResolvedValue([]);
  participation.searchOccasions.mockResolvedValue([]);
  crm.searchOrganizations.mockResolvedValue([]);
});

describe("buscador de la paleta ⌘K", () => {
  it("sin sesión responde 401 sin buscar", async () => {
    identity.getActor.mockResolvedValue(null);
    const response = await GET(search("persona"));
    expect(response.status).toBe(401);
    expectNoSearch();
  });

  it("la dirección de un comité y el líder técnico reciben 403 sin buscar", async () => {
    for (const actor of [
      { isAdmin: false, permissions: [] },
      {
        isAdmin: false,
        permissions: [{ code: "COMMITTEE_LEADER", committeeId: "comitesintetico" }],
      },
    ]) {
      identity.getActor.mockResolvedValue(actor);
      const response = await GET(search("persona@oe-sintetica.example"));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ results: [] });
    }
    expectNoSearch();
  });

  it("ADMIN recibe personas con correo y organizaciones, sin caché", async () => {
    identity.getActor.mockResolvedValue({ isAdmin: true, permissions: [{ code: "ADMIN" }] });
    const response = await GET(search("persona"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).results).toEqual([
      {
        type: "person",
        id: "personasintetica",
        title: "Persona Sintética",
        subtitle: "persona@oe-sintetica.example",
        href: "/admin/personas/personasintetica",
      },
    ]);
    expect(crm.searchOrganizations).toHaveBeenCalledWith("persona");
  });
});
