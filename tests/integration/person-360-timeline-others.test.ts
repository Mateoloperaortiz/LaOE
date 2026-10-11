import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import { type InteractionView, listInteractions } from "@/modules/crm";
import { type InteractionKind, interaction } from "@/modules/crm/schema";
import { seedMember } from "../factories";
import { elements } from "../helpers/react-tree";
import { truncateAll } from "./db";

// El filtro «Otros» de la línea de tiempo de la Persona 360 (DT-226 inciso a, ADR-121 regla 10).
// La pantalla pedía las 200 interacciones más recientes de todos los tipos y descartaba en memoria
// las de los tipos con filtro propio: a un miembro con más de 200 filas de participación (asistencias
// y juegos diarios) «Otros» le salía vacía aunque tuviera, más atrás, un cargo o una permanencia.
// La pantalla se monta entera contra Postgres; solo se reemplaza quién tiene la sesión.

const session = vi.hoisted(() => ({ personId: "" }));

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
  return {
    ...mod,
    requireAdminActor: () => Promise.resolve({ personId: session.personId, ip: null }),
  };
});

const { default: PersonaPage } = await import("@/app/admin/personas/[id]/page");
const { TabLinea } = await import("@/app/admin/personas/[id]/_ui/Tabs");

/** El primer instante de la siembra; cada fila que sigue ocurre un minuto después. */
const START = new Date("2031-03-02T15:00:00.000Z");

function minutesAfterStart(minutes: number): Date {
  return new Date(START.getTime() + minutes * 60_000);
}

async function seedInteractions(
  personId: string,
  kind: InteractionKind,
  amount: number,
  firstMinute: number,
): Promise<void> {
  await getDb()
    .insert(interaction)
    .values(
      Array.from({ length: amount }, (_, index) => ({
        personId,
        kind,
        summary: `${kind} ${index + 1}`,
        occurredAt: minutesAfterStart(firstMinute + index),
      })),
    );
}

/** Lo que la pestaña «Línea de tiempo» recibe para pintar con ese filtro en la URL. */
async function timelineShown(personId: string, tipo?: string): Promise<InteractionView[]> {
  const tree = await PersonaPage({
    params: Promise.resolve({ id: personId }),
    searchParams: Promise.resolve({ pestana: "linea", ...(tipo ? { tipo } : {}) }),
  });
  const tab = elements(tree).find((element) => element.type === TabLinea);
  if (!tab) {
    throw new Error("la pantalla no montó la pestaña de la línea de tiempo");
  }
  return tab.props.interactions as InteractionView[];
}

let personId = "";

beforeEach(async () => {
  await truncateAll();
  session.personId = await seedMember("admin.linea@eafit.edu.co");
  personId = await seedMember("miembro.linea@eafit.edu.co");
  // Lo más viejo: un cargo, una permanencia y un permiso, que no tienen filtro propio, y una nota.
  await seedInteractions(personId, "APPOINTMENT", 1, 0);
  await seedInteractions(personId, "PERMANENCE", 1, 1);
  await seedInteractions(personId, "PERMISSION", 1, 2);
  await seedInteractions(personId, "NOTE", 1, 3);
  // Encima, más participación de la que cabe en una lectura: un semestre de asistencias y juegos.
  await seedInteractions(personId, "PARTICIPATION", 205, 10);
});

describe("la línea de tiempo de la Persona 360 con más de 200 filas de participación", () => {
  it("«Otros» trae lo que no tiene filtro propio aunque haya quedado más atrás, lo más reciente primero", async () => {
    const shown = await timelineShown(personId, "OTHER");
    expect(shown.map((item) => item.summary)).toEqual([
      "PERMISSION 1",
      "PERMANENCE 1",
      "APPOINTMENT 1",
    ]);
  });

  it("«Otros» no trae nada de un tipo con filtro propio", async () => {
    await seedInteractions(personId, "OTHER", 1, 400);
    const shown = await timelineShown(personId, "OTHER");
    expect(shown.map((item) => item.kind)).toEqual([
      "OTHER",
      "PERMISSION",
      "PERMANENCE",
      "APPOINTMENT",
    ]);
  });

  // La paginación de «Todos» no es de este arreglo (DT-226 inciso a, segunda parte): sigue cortando.
  it("«Todos» sigue trayendo las 200 más recientes, de todos los tipos", async () => {
    const shown = await timelineShown(personId);
    expect(shown).toHaveLength(200);
    expect(shown[0]?.summary).toBe("PARTICIPATION 205");
    expect(new Set(shown.map((item) => item.kind))).toEqual(new Set(["PARTICIPATION"]));
  });

  it("un filtro propio sigue trayendo solo su tipo", async () => {
    expect((await timelineShown(personId, "NOTE")).map((item) => item.summary)).toEqual(["NOTE 1"]);
    expect(await timelineShown(personId, "PARTICIPATION")).toHaveLength(200);
  });
});

describe("listInteractions sin unos tipos", () => {
  it("descarta en la consulta y corta después: el tope cuenta solo lo que sí va", async () => {
    const rest = await listInteractions(personId, { except: ["PARTICIPATION"] }, 3);
    expect(rest.map((item) => item.summary)).toEqual(["NOTE 1", "PERMISSION 1", "PERMANENCE 1"]);
  });

  it("sin ningún tipo que descartar trae lo mismo que «todos»", async () => {
    const all = await listInteractions(personId, "ALL", 5);
    const none = await listInteractions(personId, { except: [] }, 5);
    expect(none.map((item) => item.id)).toEqual(all.map((item) => item.id));
  });
});
