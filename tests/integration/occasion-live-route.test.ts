import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import {
  checkInLink,
  getOccasion,
  rotatingCodeAt,
  secondsUntilRotation,
} from "@/modules/participation";
import {
  currentTermCode,
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
} from "../factories";
import { countQueries } from "../helpers/queries";
import { truncateAll } from "./db";

// El sondeo de la consola en vivo (ADR-035 regla 16): la ruta que la consola pide cada 4 segundos, con
// el dominio de verdad contra Postgres. Solo se simula quién tiene sesión, que la ruta lee de las
// cookies de la solicitud. Lo que responde se fija primero, y después cuánto lee para responderlo
// (DT-308).

let signedIn: { personId: string; isAdmin: boolean } | null = null;

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/modules/identity", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/modules/identity")>();
  return {
    ...mod,
    getActor: () =>
      Promise.resolve(
        signedIn === null
          ? null
          : {
              personId: signedIn.personId,
              sessionId: "sesion-test",
              email: "operadora@test.dev",
              name: "Operadora Sintética",
              firstName: "Operadora",
              membershipStatus: "ACTIVE" as const,
              permissions: [],
              otpVerifiedAt: new Date(),
              sessionLastSeenAt: new Date(),
              sessionRemembered: false,
              isAdmin: signedIn.isAdmin,
            },
      ),
  };
});

const { GET } = await import("@/app/api/ocasiones/[id]/live/route");

/** Un sondeo de la consola, como lo manda el navegador. */
function poll(id: string): Promise<Response> {
  return GET(new Request(`http://casa.test/api/ocasiones/${id}/live`), {
    params: Promise.resolve({ id }),
  });
}

describe("sondeo de la consola en vivo: lo que responde la ruta", () => {
  beforeEach(async () => {
    signedIn = null;
    await truncateAll();
  });
  afterAll(closeDb);

  it("sin sesión responde 401 y nada de la ocasión", async () => {
    const termId = await seedTerm(currentTermCode());
    const { id } = await seedOccasion(termId);

    const response = await poll(id);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "sin sesión" });
  });

  it("una ocasión que no existe responde 404", async () => {
    signedIn = { personId: await seedMember("admin@test.dev"), isAdmin: true };

    const response = await poll("no-existe");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "no existe" });
  });

  it("a quien no opera la ocasión le responde 403 y nada de la ocasión", async () => {
    const termId = await seedTerm(currentTermCode());
    const { id } = await seedOccasion(termId);
    signedIn = { personId: await seedMember("socia@test.dev"), isAdmin: false };

    const response = await poll(id);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "sin permiso" });
  });

  it("a quien la opera por su cargo en el comité de la ocasión le responde el snapshot, y a quien solo es miembro de ese comité, 403", async () => {
    const termId = await seedTerm(currentTermCode());
    const committeeId = await seedCommittee("c1");
    const { id } = await seedOccasion(termId, { committeeId });
    const operator = await seedMember("logistica@test.dev");
    const member = await seedMember("miembro@test.dev");
    // Logística trae la capacidad OCCASIONS (ADR-058); ser miembro del comité no trae ninguna.
    await seedCommitteeMembership(operator, committeeId, termId, "LOGISTICA");
    await seedCommitteeMembership(member, committeeId, termId);

    signedIn = { personId: operator, isAdmin: false };
    const allowed = await poll(id);
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("no-store");
    expect((await allowed.json()).status).toBe((await getOccasion(id))?.status);

    signedIn = { personId: member, isAdmin: false };
    const denied = await poll(id);
    expect(denied.status).toBe(403);
    expect(Object.keys(await denied.json())).toEqual(["error"]);
  });

  it("a quien la opera le responde el snapshot sin caché: estado, conteos, últimos registros y el código vigente en el enlace y el QR", async () => {
    const termId = await seedTerm(currentTermCode());
    const secret = "secreto-de-prueba";
    const { id, publicId } = await seedOccasion(termId, {
      requireRotatingCode: true,
      rotatingSecret: secret,
    });
    const ana = await seedMember("ana@test.dev", { firstName: "Ana", lastName: "Uno" });
    const beto = await seedMember("beto@test.dev", { firstName: "Beto", lastName: "Dos" });
    await seedCheckIn(id, ana);
    await seedCheckIn(id, beto, "PENDING");
    signedIn = { personId: await seedMember("admin@test.dev"), isAdmin: true };

    const response = await poll(id);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual([
      "code",
      "counts",
      "generatedAt",
      "link",
      "qrSvg",
      "recent",
      "status",
    ]);
    expect(body.status).toBe((await getOccasion(id))?.status);
    expect(body.counts).toEqual({ PENDING: 1, APPROVED: 1, REJECTED: 0, CANCELLED: 0, EXCUSED: 0 });
    expect(
      body.recent
        .map((item: { name: string; status: string; source: string }) => [
          item.name,
          item.status,
          item.source,
        ])
        .sort(),
    ).toEqual([
      ["Ana Uno", "APPROVED", "ADMIN"],
      ["Beto Dos", "PENDING", "ADMIN"],
    ]);
    const at = new Date(body.generatedAt);
    expect(body.code).toEqual({
      value: rotatingCodeAt(secret, id, at),
      secondsLeft: secondsUntilRotation(at),
    });
    expect(body.link).toBe(checkInLink(publicId, body.code.value));
    expect(body.qrSvg.startsWith("<svg")).toBe(true);
  });

  it("sin código rotativo el snapshot no trae código y el enlace va limpio", async () => {
    const termId = await seedTerm(currentTermCode());
    const { id, publicId } = await seedOccasion(termId);
    signedIn = { personId: await seedMember("admin@test.dev"), isAdmin: true };

    const body = await (await poll(id)).json();

    expect(body.code).toBeNull();
    expect(body.link).toBe(checkInLink(publicId, null));
    expect(body.recent).toEqual([]);
  });
});

describe("sondeo de la consola en vivo: cuánto lee la ruta (DT-308)", () => {
  beforeEach(async () => {
    signedIn = null;
    await truncateAll();
  });
  afterAll(closeDb);

  it("lee la ocasión una sola vez: la que leyó para decidir el permiso es la que arma el snapshot", async () => {
    const termId = await seedTerm(currentTermCode());
    const { id } = await seedOccasion(termId);
    await seedCheckIn(id, await seedMember("ana@test.dev", { firstName: "Ana", lastName: "Uno" }));
    signedIn = { personId: await seedMember("admin@test.dev"), isAdmin: true };

    const { result, queries } = await countQueries(() => poll(id));

    expect(result.status).toBe(200);
    expect(
      queries.map((query) => query.text).filter((text) => text.includes('from "occasion"')),
    ).toHaveLength(1);
    // La ocasión, los conteos por estado, los últimos registros y sus personas. Eran 5.
    expect(queries.length).toBeLessThanOrEqual(4);
  });

  it("a quien la opera por su cargo, y no por ser admin, también le lee la ocasión una sola vez", async () => {
    const termId = await seedTerm(currentTermCode());
    const committeeId = await seedCommittee("c1");
    const { id } = await seedOccasion(termId, { committeeId });
    const operator = await seedMember("logistica@test.dev");
    await seedCommitteeMembership(operator, committeeId, termId, "LOGISTICA");
    signedIn = { personId: operator, isAdmin: false };

    const { result, queries } = await countQueries(() => poll(id));

    expect(result.status).toBe(200);
    // Decidir el permiso por el cargo suma sus lecturas de `people`; ninguna vuelve por la ocasión.
    expect(
      queries.map((query) => query.text).filter((text) => text.includes('from "occasion"')),
    ).toHaveLength(1);
  });
});
