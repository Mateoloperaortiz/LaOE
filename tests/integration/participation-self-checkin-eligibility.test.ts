import { eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { checkInSelfAs } from "@/modules/participation";
import { occasion } from "@/modules/participation/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { formatDate, formatTime } from "@/shared/lib/dates";
import { elements } from "../helpers/react-tree";
import { truncateAll } from "./db";
import { currentTermCode, seedMembership, seedOccasion, seedPerson, seedTerm } from "./factories";

// El registro propio (ADR-035 regla 5) responde dos veces a la misma pregunta: el comando decide si
// la asistencia nace y la pantalla de `/a/[publicId]` decide qué texto o formulario muestra antes de
// que la persona toque nada. Esta matriz fija, por cada motivo de rechazo y por el caso que pasa, las
// dos respuestas juntas (DT-021). La pantalla se monta entera contra Postgres; solo se reemplaza
// quién tiene la sesión.

const db = () => getDb();

type Status = "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";

let session: { personId: string; status: Status } = { personId: "", status: "ACTIVE" };

// La pantalla monta componentes de marca que cargan sus fuentes con `next/font`, que fuera de Next no
// existe; ninguno se ejecuta acá, solo se lee el árbol que la página devuelve.
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
        membershipStatus: session.status,
        permissions: [],
        otpVerifiedAt: new Date(),
        sessionLastSeenAt: new Date(),
      }),
  };
});

const { default: CheckInPage } = await import("@/app/a/[publicId]/page");

const FORM = "el formulario de registro";

/** Lo que la pantalla le muestra a la persona: el formulario o el texto que lo reemplaza. */
async function shown(publicId: string, search: Record<string, string> = {}): Promise<string> {
  const tree: ReactNode = await CheckInPage({
    params: Promise.resolve({ publicId }),
    searchParams: Promise.resolve(search),
  });
  const all = elements(tree);
  if (all.some((item) => item.type === "form")) {
    return FORM;
  }
  const text = all.find((item) => item.type === "p")?.props.children;
  return typeof text === "string" ? text : "(nada)";
}

const HOUR = 3_600_000;

interface Case {
  /** Quién abre el QR: su membresía (o ninguna) y si entró a la OE en el término de la ocasión. */
  persona: { estado: Status | null; nueva: boolean };
  ocasion: {
    estado?: "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
    terminoCerrado?: boolean;
    ventana?: "sin abrir" | "cerrada";
    soloNuevos?: boolean;
    pideCodigo?: boolean;
  };
  /** Lo que responde `checkInSelfAs`: `ok` o el motivo. */
  comando: string;
  /** Lo que muestra la pantalla antes de enviar nada. */
  pantalla: (opensAt: Date) => string;
}

const activa = { estado: "ACTIVE", nueva: true } as const;
const veterana = { estado: "ACTIVE", nueva: false } as const;
const honoraria = { estado: "HONORARY", nueva: false } as const;
const enLicencia = { estado: "ON_LEAVE", nueva: true } as const;
const deBaja = { estado: "INACTIVE", nueva: true } as const;
const deBajaVeterana = { estado: "INACTIVE", nueva: false } as const;
const sinMembresia = { estado: null, nueva: false } as const;

const texto = (text: string) => () => text;
const noAbre = (opensAt: Date) =>
  t("T-097", { fecha: formatDate(opensAt), hora: formatTime(opensAt) });
const formulario = () => FORM;
const noEstaActiva = () => t("T-673", { nombre: "" }).trim();

async function seedCase(item: Case) {
  const termId = await seedTerm(currentTermCode());
  const previousTermId = await seedTerm("2019-1");
  const personId = await seedPerson("quien.registra@eafit.edu.co");
  if (item.persona.estado) {
    await seedMembership(
      personId,
      item.persona.nueva ? termId : previousTermId,
      item.persona.estado,
    );
  }
  const now = Date.now();
  const window =
    item.ocasion.ventana === "sin abrir"
      ? { checkInOpensAt: new Date(now + HOUR), checkInClosesAt: new Date(now + 2 * HOUR) }
      : item.ocasion.ventana === "cerrada"
        ? { checkInOpensAt: new Date(now - 2 * HOUR), checkInClosesAt: new Date(now - HOUR) }
        : {};
  const seeded = await seedOccasion(termId, {
    status: item.ocasion.estado ?? "OPEN",
    newMembersOnly: item.ocasion.soloNuevos ?? false,
    requireRotatingCode: item.ocasion.pideCodigo ?? false,
    rotatingSecret: item.ocasion.pideCodigo ? "secreto-de-prueba" : null,
    ...window,
  });
  if (item.ocasion.terminoCerrado) {
    await db().update(term).set({ pointsClosedAt: new Date() }).where(eq(term.id, termId));
  }
  const [row] = await db().select().from(occasion).where(eq(occasion.id, seeded.id));
  if (!row) throw new Error("seed case");
  session = { personId, status: item.persona.estado ?? "INACTIVE" };
  return { personId, row };
}

const CASES: Record<string, Case> = {
  // Un motivo por fila, con una persona activa que entró este semestre.
  "una ocasión en borrador no recibe registros": {
    persona: activa,
    ocasion: { estado: "DRAFT" },
    comando: "DRAFT",
    pantalla: texto(t("T-526")),
  },
  "una ocasión cancelada no recibe registros": {
    persona: activa,
    ocasion: { estado: "CANCELLED" },
    comando: "CANCELLED",
    pantalla: texto(t("T-524")),
  },
  "una ocasión cerrada no recibe registros": {
    persona: activa,
    ocasion: { estado: "CLOSED" },
    comando: "CLOSED",
    pantalla: texto(t("T-096")),
  },
  "con los puntos del término cerrados no hay registro": {
    persona: activa,
    ocasion: { terminoCerrado: true },
    comando: "TERM_CLOSED",
    pantalla: texto(t("T-525")),
  },
  "antes de la ventana responde cuándo abre": {
    persona: activa,
    ocasion: { ventana: "sin abrir" },
    comando: "NOT_OPEN_YET",
    pantalla: noAbre,
  },
  "después de la ventana el registro ya cerró": {
    persona: activa,
    ocasion: { ventana: "cerrada" },
    comando: "WINDOW_CLOSED",
    pantalla: texto(t("T-096")),
  },
  "una veterana no entra a una ocasión solo para nuevos": {
    persona: veterana,
    ocasion: { soloNuevos: true },
    comando: "NEW_MEMBERS_ONLY",
    pantalla: texto(t("T-523")),
  },

  // Los casos que pasan.
  "quien entró este semestre se registra en una ocasión solo para nuevos": {
    persona: activa,
    ocasion: { soloNuevos: true },
    comando: "ok",
    pantalla: formulario,
  },
  "una persona activa se registra": {
    persona: veterana,
    ocasion: {},
    comando: "ok",
    pantalla: formulario,
  },
  "una persona honoraria se registra": {
    persona: honoraria,
    ocasion: {},
    comando: "ok",
    pantalla: formulario,
  },

  // El código rotativo va después de la elegibilidad y es solo del comando: la pantalla lo pide.
  "la ocasión con código rotativo muestra el formulario y el comando pide el código": {
    persona: activa,
    ocasion: { pideCodigo: true },
    comando: "CODE_REQUIRED",
    pantalla: formulario,
  },
  "solo nuevos se responde antes de pedir el código": {
    persona: veterana,
    ocasion: { soloNuevos: true, pideCodigo: true },
    comando: "NEW_MEMBERS_ONLY",
    pantalla: texto(t("T-523")),
  },

  // El orden cuando aplican varios motivos: estado, término, ventana, membresía, solo nuevos.
  "el estado de la ocasión se responde antes que el término y la ventana": {
    persona: veterana,
    ocasion: { estado: "DRAFT", terminoCerrado: true, ventana: "cerrada", soloNuevos: true },
    comando: "DRAFT",
    pantalla: texto(t("T-526")),
  },
  "el término cerrado se responde antes que la ventana": {
    persona: veterana,
    ocasion: { terminoCerrado: true, ventana: "cerrada", soloNuevos: true },
    comando: "TERM_CLOSED",
    pantalla: texto(t("T-525")),
  },
  "la ventana cerrada se responde antes que solo nuevos": {
    persona: veterana,
    ocasion: { ventana: "cerrada", soloNuevos: true },
    comando: "WINDOW_CLOSED",
    pantalla: texto(t("T-096")),
  },
  "la ventana sin abrir se responde antes que la membresía": {
    persona: deBaja,
    ocasion: { ventana: "sin abrir" },
    comando: "NOT_OPEN_YET",
    pantalla: noAbre,
  },

  // En licencia la pantalla dice T-2041 antes de mirar la ocasión; el comando sigue su orden.
  "en licencia el comando no la admite y la pantalla dice que la acción no está disponible": {
    persona: enLicencia,
    ocasion: {},
    comando: "NOT_ELIGIBLE",
    pantalla: texto(t("T-2041")),
  },
  "en licencia y con la ocasión cerrada la pantalla sigue hablando de la licencia": {
    persona: enLicencia,
    ocasion: { estado: "CLOSED" },
    comando: "CLOSED",
    pantalla: texto(t("T-2041")),
  },

  // Una membresía que no admite el registro. Ninguna sesión llega acá: de baja o sin membresía no
  // se entra (`SIGN_IN_STATUSES`). El comando es la autoridad; la pantalla responde lo mismo.
  "de baja el comando no la admite": {
    persona: deBaja,
    ocasion: {},
    comando: "NOT_ELIGIBLE",
    pantalla: noEstaActiva,
  },
  "de baja la membresía se responde antes que solo nuevos": {
    persona: deBajaVeterana,
    ocasion: { soloNuevos: true },
    comando: "NOT_ELIGIBLE",
    pantalla: noEstaActiva,
  },
  "de baja y nueva en una ocasión solo para nuevos tampoco se registra": {
    persona: deBaja,
    ocasion: { soloNuevos: true },
    comando: "NOT_ELIGIBLE",
    pantalla: noEstaActiva,
  },
  "de baja la membresía se responde antes de pedir el código": {
    persona: deBaja,
    ocasion: { pideCodigo: true },
    comando: "NOT_ELIGIBLE",
    pantalla: noEstaActiva,
  },
  "sin membresía el comando no la admite": {
    persona: sinMembresia,
    ocasion: {},
    comando: "NOT_ELIGIBLE",
    pantalla: noEstaActiva,
  },
  "sin membresía la falta de membresía se responde antes que solo nuevos": {
    persona: sinMembresia,
    ocasion: { soloNuevos: true },
    comando: "NOT_ELIGIBLE",
    pantalla: noEstaActiva,
  },
};

describe("registro propio: lo que responde el comando y lo que muestra la pantalla", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it.each(Object.entries(CASES))("%s", async (_title, item) => {
    const { personId, row } = await seedCase(item);

    // La pantalla primero: todavía no hay asistencia y no escribe nada.
    expect(await shown(row.publicId), "pantalla").toBe(item.pantalla(row.checkInOpensAt));

    const result = await checkInSelfAs({ personId, ip: null }, { publicId: row.publicId });
    expect(result.ok ? "ok" : result.reason, "comando").toBe(item.comando);
    if (!result.ok && result.reason === "NOT_OPEN_YET") {
      expect(result.opensAt).toEqual(row.checkInOpensAt);
    }
  });

  it("un enlace que no es de ninguna ocasión responde lo mismo en los dos lados", async () => {
    const termId = await seedTerm(currentTermCode());
    const personId = await seedPerson("quien.registra@eafit.edu.co");
    await seedMembership(personId, termId);
    session = { personId, status: "ACTIVE" };

    expect(await shown("zzzzzzzzzz")).toBe(t("T-527"));
    expect(await checkInSelfAs({ personId, ip: null }, { publicId: "zzzzzzzzzz" })).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
  });

  it("quien ya se registró lo sabe aunque la ocasión haya cerrado después", async () => {
    const { personId, row } = await seedCase({
      persona: activa,
      ocasion: {},
      comando: "ok",
      pantalla: formulario,
    });
    expect((await checkInSelfAs({ personId, ip: null }, { publicId: row.publicId })).ok).toBe(true);
    await db().update(occasion).set({ status: "CLOSED" }).where(eq(occasion.id, row.id));

    expect(await shown(row.publicId)).toBe(t("T-095"));
    const again = await checkInSelfAs({ personId, ip: null }, { publicId: row.publicId });
    expect(again.ok ? "ok" : again.reason).toBe("ALREADY");
  });

  it("el `r=inactivo` de la dirección sigue eligiendo su texto (ADR-120 regla 6)", async () => {
    const { row } = await seedCase({
      persona: activa,
      ocasion: {},
      comando: "ok",
      pantalla: formulario,
    });

    expect(await shown(row.publicId, { r: "inactivo" })).toBe(noEstaActiva());
  });
});
