import { eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { checkIn, occasion } from "@/modules/participation/schema";
import { t } from "@/shared/copy";
import { ActionForm } from "@/shared/ui/ActionForm";
import {
  currentTermCode,
  seedCheckIn,
  seedMembership,
  seedOccasion,
  seedPerson,
  seedTerm,
} from "../factories";
import { elements } from "../helpers/react-tree";
import { truncateAll } from "./db";

// El `r` de la dirección de `/a/[publicId]` (ADR-120 regla 6): la action redirige con él recién
// escrita la asistencia, pero cualquiera con sesión lo puede escribir a mano. Un resultado que
// anuncia un registro vale solo con la fila que lo respalda; sin ella no pinta nada y decide la fila.
// Esta matriz fija, por cada resultado de éxito y cada estado de la asistencia, qué texto sale, con
// qué marca y si lleva el sello, antes de juntar las dos listas que la página tenía de esos
// resultados (DT-312, inciso 6). La pantalla se monta entera contra Postgres; solo se reemplaza quién
// tiene la sesión.

const db = () => getDb();

let session = { personId: "" };

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
    requireActor: () =>
      Promise.resolve({
        personId: session.personId,
        sessionId: "sesion-test",
        email: "miembro@test.dev",
        name: "Miembro Sintético",
        firstName: "Miembro",
        membershipStatus: "ACTIVE",
        permissions: [],
        otpVerifiedAt: new Date(),
        sessionLastSeenAt: new Date(),
      }),
  };
});

const { default: CheckInPage } = await import("@/app/a/[publicId]/page");

const POINTS = 5;
const FORM = { mark: "(formulario)", text: "", seal: false };

type Existing = "APPROVED" | "PENDING" | "REJECTED" | null;

/** Lo que la pantalla muestra: la marca del resultado, su texto y si lleva el sello de la marca. */
async function shown(publicId: string, result: string) {
  const tree: ReactNode = await CheckInPage({
    params: Promise.resolve({ publicId }),
    searchParams: Promise.resolve({ r: result }),
  });
  const all = elements(tree);
  const message = all.find((item) => item.props["data-resultado"] !== undefined);
  if (!message) {
    return all.some((item) => item.type === ActionForm)
      ? FORM
      : { mark: "(nada)", text: "", seal: false };
  }
  return {
    mark: message.props["data-resultado"],
    text: message.props.children,
    seal: all.some((item) => typeof item.type === "function" && item.type.name === "SelloOE"),
  };
}

/** Una ocasión abierta con puntos, un miembro activo y, si se pide, su asistencia en ese estado. */
async function seedClaim(existing: Existing): Promise<string> {
  const termId = await seedTerm(currentTermCode());
  const personId = await seedPerson("quien.registra@eafit.edu.co");
  await seedMembership(personId, termId, "ACTIVE");
  const seeded = await seedOccasion(termId, { status: "OPEN", points: POINTS });
  const [row] = await db().select().from(occasion).where(eq(occasion.id, seeded.id));
  if (!row) throw new Error("sin ocasión");
  expect(row.points).toBe(POINTS);
  if (existing) {
    await seedCheckIn(row.id, personId, existing, { source: "SELF_QR" });
  }
  session = { personId };
  return row.publicId;
}

const withPoints = () => t("T-092", { n: POINTS }).replace(/\s*¡OE OE OE!$/, "");

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeDb();
});

describe("el resultado que trae la dirección de un check-in", () => {
  it.each([
    { status: "APPROVED", attendanceExtent: "PARTIAL", attendanceList: "FIRST" },
    { status: "EXCUSED", attendanceExtent: "PARTIAL", attendanceList: "SECOND" },
    { status: "EXCUSED", attendanceExtent: null, attendanceList: null },
  ] as const)("$status/$attendanceExtent no anuncia asistencia completa en la información de puntos", async ({
    status,
    attendanceExtent,
    attendanceList,
  }) => {
    const termId = await seedTerm(currentTermCode());
    const personId = await seedPerson("parcial.pantalla@eafit.edu.co");
    await seedMembership(personId, termId, "ACTIVE");
    const assembly = await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      points: 0,
      status: "CLOSED",
    });
    const checkInId = await seedCheckIn(assembly.id, personId);
    await db()
      .update(checkIn)
      .set({ status, attendanceExtent, attendanceList })
      .where(eq(checkIn.id, checkInId));
    session = { personId };
    const tree = await CheckInPage({
      params: Promise.resolve({ publicId: assembly.publicId }),
      searchParams: Promise.resolve({ r: "registrado" }),
    });
    const values = elements(tree)
      .filter((item) => item.type === "dd")
      .map((item) => item.props.children);
    expect(values).not.toContain(t("T-530"));
    expect(values).toContain("Sin puntos");
  });

  it.each<[result: string, existing: Existing, mark: string, text: () => string, seal: boolean]>([
    // Con la fila que lo respalda, el resultado pinta su texto y su marca.
    ["puntos", "APPROVED", "puntos", withPoints, true],
    ["registrado", "APPROVED", "registrado", () => t("T-093"), false],
    ["pendiente", "PENDING", "pendiente", () => t("T-094"), false],
    // Con una asistencia en otro estado no pinta nada: decide la fila, y la marca es la del estado.
    ["puntos", "PENDING", "estado", () => t("T-094"), false],
    ["registrado", "PENDING", "estado", () => t("T-094"), false],
    ["pendiente", "APPROVED", "estado", () => t("T-095"), false],
    ["puntos", "REJECTED", "estado", () => t("T-532"), false],
    ["registrado", "REJECTED", "estado", () => t("T-532"), false],
    ["pendiente", "REJECTED", "estado", () => t("T-532"), false],
    // Un resultado que no anuncia un registro conserva su marca y deja decidir a la fila.
    ["repetido", "APPROVED", "repetido", () => t("T-095"), false],
  ])("«%s» con una asistencia %s sale con la marca «%s»", async (result, existing, mark, text, seal) => {
    const publicId = await seedClaim(existing);
    expect(await shown(publicId, result)).toEqual({ mark, text: text(), seal });
  });

  it.each([
    "puntos",
    "registrado",
    "pendiente",
  ])("«%s» sin asistencia no anuncia nada: sale el formulario de registro", async (result) => {
    const publicId = await seedClaim(null);
    expect(await shown(publicId, result)).toEqual(FORM);
  });

  it("el texto de los puntos no repite el grito que ya trae el sello", () => {
    expect(withPoints()).not.toContain("¡OE OE OE!");
    expect(withPoints()).toContain(String(POINTS));
  });
});
