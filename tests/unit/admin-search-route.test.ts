import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/admin/buscar/route";
import { tList } from "@/shared/copy";

// La paleta ⌘K por rol (ADR-165, que enmienda ADR-072 regla 6): ADMIN busca en toda la casa; la
// dirección de un comité, solo a la gente de sus comités, por nombre y sin correo; los demás roles no
// buscan en el servidor. Nadie que no sea ADMIN confirma si un correo existe.

const identity = vi.hoisted(() => ({ getActor: vi.fn() }));
const authz = vi.hoisted(() => ({ adminAreaRoles: vi.fn() }));
const terms = vi.hoisted(() => ({ getCurrentTerm: vi.fn() }));
const people = vi.hoisted(() => ({
  searchPeople: vi.fn(),
  searchCommittees: vi.fn(),
  searchCommitteeMembers: vi.fn(),
}));
const participation = vi.hoisted(() => ({ searchOccasions: vi.fn() }));
const crm = vi.hoisted(() => ({
  searchOrganizations: vi.fn(),
  ORGANIZATION_KINDS: ["COMPANY", "EAFIT_UNIT", "STUDENT_GROUP", "OTHER"],
}));

vi.mock("@/env", () => ({ getEnv: () => ({ APP_TIMEZONE: "America/Bogota" }) }));
vi.mock("@/modules/identity", () => identity);
vi.mock("@/app/_authz/admin-area", () => authz);
vi.mock("@/modules/terms", () => terms);
// Qué área ve cada capacidad es la regla de verdad: la ruta la usa para recortar el alcance.
vi.mock("@/modules/people", async () => {
  const capabilities = await vi.importActual<typeof import("@/modules/people/domain/capabilities")>(
    "@/modules/people/domain/capabilities",
  );
  return { ...people, areasFor: capabilities.areasFor };
});
vi.mock("@/modules/participation", () => participation);
vi.mock("@/modules/crm", () => crm);

function search(q: string): Request {
  return new Request(`http://localhost/api/admin/buscar?q=${encodeURIComponent(q)}`);
}

function expectNoSearch(): void {
  expect(people.searchPeople).not.toHaveBeenCalled();
  expect(people.searchCommitteeMembers).not.toHaveBeenCalled();
  expect(people.searchCommittees).not.toHaveBeenCalled();
  expect(participation.searchOccasions).not.toHaveBeenCalled();
  expect(crm.searchOrganizations).not.toHaveBeenCalled();
}

const committee = (id: string, slug: string, name: string, capabilities: string[]) => ({
  committee: { id, slug, name },
  capabilities,
  isLeader: false,
});

beforeEach(() => {
  vi.resetAllMocks();
  authz.adminAreaRoles.mockImplementation(async (actor: { isAdmin: boolean }) => ({
    isAdmin: actor.isAdmin,
    isBoard: false,
    any: actor.isAdmin,
    committees: [],
  }));
  terms.getCurrentTerm.mockResolvedValue({ id: "terminosintetico" });
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

  it("sin ningún rol de la Operación responde 403 sin buscar", async () => {
    identity.getActor.mockResolvedValue({ isAdmin: false, permissions: [] });
    const response = await GET(search("persona@oe-sintetica.example"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ results: [] });
    expectNoSearch();
  });

  it("la dirección busca solo a la gente de sus comités con «Personas», por nombre y sin correo", async () => {
    identity.getActor.mockResolvedValue({ isAdmin: false, permissions: [] });
    authz.adminAreaRoles.mockResolvedValue({
      isAdmin: false,
      isBoard: false,
      any: true,
      committees: [
        committee("comitea3", "a3", "A3", ["ROSTER"]),
        committee("comitepixel", "pixel", "PIXEL", ["OCCASIONS"]),
      ],
    });
    people.searchCommitteeMembers.mockResolvedValue([
      { id: "personasintetica", fullName: "Persona Sintética", committeeId: "comitea3" },
    ]);
    const response = await GET(search("persona"));
    expect(response.status).toBe(200);
    expect(people.searchCommitteeMembers).toHaveBeenCalledWith(
      "persona",
      ["comitea3"],
      "terminosintetico",
    );
    expect(people.searchPeople).not.toHaveBeenCalled();
    expect(participation.searchOccasions).not.toHaveBeenCalled();
    expect(crm.searchOrganizations).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.results).toEqual([
      {
        type: "person",
        id: "personasintetica-comitea3",
        title: "Persona Sintética",
        subtitle: "A3",
        href: "/admin/comites/a3?area=personas#persona-personasintetica",
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("sus comités salen por nombre, sin mirar acentos ni mayúsculas", async () => {
    identity.getActor.mockResolvedValue({ isAdmin: false, permissions: [] });
    authz.adminAreaRoles.mockResolvedValue({
      isAdmin: false,
      isBoard: false,
      any: true,
      committees: [committee("comitepixel", "pixel", "PÍXEL", ["OCCASIONS"])],
    });
    const response = await GET(search("pixel"));
    expect((await response.json()).results).toEqual([
      {
        type: "committee",
        id: "comitepixel",
        title: "PÍXEL",
        subtitle: "pixel",
        href: "/admin/comites/pixel",
      },
    ]);
    expect(people.searchCommitteeMembers).not.toHaveBeenCalled();
  });

  it("la junta, sin comités, no busca nada en el servidor", async () => {
    identity.getActor.mockResolvedValue({ isAdmin: false, permissions: [{ code: "BOARD" }] });
    authz.adminAreaRoles.mockResolvedValue({
      isAdmin: false,
      isBoard: true,
      any: true,
      committees: [],
    });
    const response = await GET(search("persona@oe-sintetica.example"));
    expect(response.status).toBe(200);
    expect((await response.json()).results).toEqual([]);
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

  // El subtítulo sale de la casa en el JSON de la paleta: la etiqueta del tipo es la pieza de T-949
  // de su posición, y un tipo sin etiqueta sale tal cual (DT-011; ese respaldo espera la decisión
  // abierta 75).
  it("una organización lleva de subtítulo la etiqueta de su tipo y sus contactos, y un tipo sin etiqueta sale tal cual", async () => {
    identity.getActor.mockResolvedValue({ isAdmin: true, permissions: [{ code: "ADMIN" }] });
    people.searchPeople.mockResolvedValue([]);
    const kinds = ["COMPANY", "EAFIT_UNIT", "STUDENT_GROUP", "OTHER", "NO_EXISTE", "constructor"];
    crm.searchOrganizations.mockResolvedValue(
      kinds.map((kind, index) => ({
        id: `organizacion${index}`,
        name: `Organización sintética ${index}`,
        kind,
        contactCount: index,
      })),
    );
    const response = await GET(search("sintética"));
    const results: { subtitle: string }[] = (await response.json()).results;
    const labels = tList("T-949");
    expect(results.map((item) => item.subtitle)).toEqual([
      `${labels[0]} · 0`,
      `${labels[1]} · 1`,
      `${labels[2]} · 2`,
      `${labels[3]} · 3`,
      "NO_EXISTE · 4",
      "constructor · 5",
    ]);
  });
});
