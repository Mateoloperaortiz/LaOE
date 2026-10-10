import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import type { Actor } from "@/modules/identity";
import { consent } from "@/modules/people/schema";
import { getPersonPermanence } from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { type CountedQuery, countQueries } from "../helpers/queries";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Cuántas veces leen el término el inicio de Mi OE y Mi permanencia (DT-226 incisos b y e, ADR-121
// regla 11). El layout y cada página se llaman como funciones contra Postgres y se cuenta lo que
// mandan; solo se reemplaza quién tiene la sesión. Es la cuenta de esas funciones, no la de un request
// entero: los componentes async que devuelven no corren acá. Tampoco hay render de servidor, así que
// lo que React comparte dentro de un request (`cache`) no se ve en estas cuentas: eso lo cuenta
// `render-shared-reads.test.ts`, en un proceso con el servidor de componentes. Acá queda lo que la
// página se ahorra pasando el término que ya leyó, y que fuera de un render y dentro de una
// transacción nada queda guardado.

const session = vi.hoisted(() => ({ actor: null as unknown }));

vi.mock("next/font/local", () => ({ default: () => ({ className: "", variable: "" }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
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
  return { ...mod, requireActor: () => Promise.resolve(session.actor) };
});

const { default: AppLayout } = await import("@/app/app/layout");
const { default: AppHome } = await import("@/app/app/page");
const { default: PermanenciaPage } = await import("@/app/app/permanencia/page");

function memberActor(personId: string): Actor {
  const now = new Date();
  return {
    personId,
    sessionId: "sesion-de-prueba",
    email: "miembro.inicio@eafit.edu.co",
    name: "Persona",
    firstName: "Persona",
    membershipStatus: "ACTIVE",
    permissions: [],
    otpVerifiedAt: now,
    sessionLastSeenAt: now,
    sessionRemembered: false,
    isAdmin: false,
  };
}

/** Las lecturas de `term` de una cuenta, en orden: la del día de hoy, la de un término por su id o la lista. */
function termReads(queries: CountedQuery[]): string[] {
  return queries
    .filter((query) => /from "term"/.test(query.text))
    .map((query) => {
      if (query.text.includes('"starts_on" <=')) {
        return "por fecha";
      }
      return query.text.includes('"term"."id" =') ? "por id" : "todos";
    });
}

let personId = "";

beforeEach(async () => {
  await truncateAll();
  personId = await seedMember("miembro.inicio@eafit.edu.co");
  await getDb()
    .insert(consent)
    .values({ personId, purpose: "MEMBERSHIP", source: "SELF", policyVersion: "prueba-v1" });
  session.actor = memberActor(personId);
});

describe("las lecturas del término en el inicio de Mi OE", () => {
  it("la página lo lee una vez: la permanencia usa el término que ya trajo la membresía", async () => {
    const { queries } = await countQueries(() => AppHome());
    expect(termReads(queries)).toEqual(["por fecha"]);
  });

  it("el layout lo lee una vez, para los roles del área de administración", async () => {
    const { queries } = await countQueries(() =>
      AppLayout({ children: null, params: Promise.resolve({}) }),
    );
    expect(termReads(queries)).toEqual(["por fecha"]);
  });

  it("Mi permanencia trae la lista y el de hoy, y la permanencia no lo vuelve a leer por su id", async () => {
    const { queries } = await countQueries(() =>
      PermanenciaPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }),
    );
    expect(termReads(queries)).toEqual(["todos", "por fecha"]);
  });
});

describe("la permanencia de una persona con el término ya leído", () => {
  it("da lo mismo que con su id y no lo vuelve a leer", async () => {
    const now = new Date();
    const current = await getCurrentTerm(now);
    if (!current) {
      throw new Error("la siembra no dejó un término que contenga hoy");
    }
    // La configuración se guarda en el proceso tras la primera lectura: se lee antes de contar.
    await getPersonPermanence(personId, current.id, now);
    const byId = await countQueries(() => getPersonPermanence(personId, current.id, now));
    const byRow = await countQueries(() => getPersonPermanence(personId, current, now));
    expect(byRow.result).toEqual(byId.result);
    expect(byRow.result).not.toBeNull();
    expect(termReads(byId.queries)).toEqual(["por id"]);
    expect(termReads(byRow.queries)).toEqual([]);
    expect(byRow.queries).toHaveLength(byId.queries.length - 1);
  });
});

describe("getCurrentTerm fuera de un render", () => {
  it("consulta la base en cada llamada: un trabajo o un script no guardan el término", async () => {
    const { queries } = await countQueries(async () => {
      await getCurrentTerm();
      await getCurrentTerm();
    });
    expect(termReads(queries)).toEqual(["por fecha", "por fecha"]);
  });

  it("con el ejecutor de una transacción lee por ella y ve lo que ella escribió, sin compartirlo", async () => {
    const current = await getCurrentTerm();
    const farAway = new Date("2099-03-01T17:00:00.000Z");
    const seen: { inside: string | null; outside: string | null } = { inside: "", outside: "" };
    const rollback = new Error("deshacer");
    await expect(
      getDb().transaction(async (tx) => {
        await tx
          .update(term)
          .set({ startsOn: "2099-01-01", endsOn: "2099-06-30" })
          .where(eq(term.id, current?.id ?? ""));
        seen.inside = (await getCurrentTerm(farAway, tx))?.id ?? null;
        seen.outside = (await getCurrentTerm(farAway))?.id ?? null;
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(current).not.toBeNull();
    expect(seen).toEqual({ inside: current?.id, outside: null });
    expect((await getCurrentTerm())?.id).toBe(current?.id);
  });
});
