import type { ReactNode } from "react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { setMailTransportsForTests } from "@/modules/comms";
import { quotaProviderLabel } from "@/modules/comms/admin";
import type { MailProvider, MailTransport } from "@/shared/adapters/mail";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { seedMember, seedSentEmails } from "../factories";
import { elements } from "../helpers/react-tree";
import { truncateAll } from "./db";

// La pantalla del cupo de correo (`/admin/campanas/cupo`) dice a qué hora vuelve a empezar la cuenta
// de hoy, que es la del proveedor y no la de Colombia (ADR-121 regla 5, T-3259). La E2E del cupo corre
// con el transporte de consola, que no lleva cuenta del día, así que ahí esa rama nunca se dibuja:
// acá la pantalla se monta entera contra Postgres, con Resend de pruebas y el reloj fijo. Solo se
// reemplaza quién tiene la sesión.

/** Las 7:00 p. m. del 9 de marzo de 2031 en Colombia: empieza el día 10 del proveedor. */
const PROVIDER_DAY = new Date("2031-03-10T00:00:00.000Z");
/** Las 12:05 a. m. del 10 en Colombia: otro día acá, el mismo para el proveedor. */
const PAST_LOCAL_MIDNIGHT = new Date("2031-03-10T05:05:00.000Z");
/** Las 7:00 p. m. del 10 en Colombia: empieza el día 11 del proveedor. */
const NEXT_PROVIDER_DAY = new Date("2031-03-11T00:00:00.000Z");

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
    requireAdminActor: () => Promise.resolve({ personId: "admin-de-prueba", ip: null }),
  };
});

const { default: QuotaPage } = await import("@/app/admin/campanas/cupo/page");

function useProvider(name: MailProvider): void {
  const primary: MailTransport = {
    name,
    async send() {
      return { id: null };
    },
  };
  setMailTransportsForTests({ primary, overflow: null });
}

/** Correos que ya salieron a esa hora por Resend, sin pasar por el transporte: lo que cuenta el cupo. */
async function seedSent(personId: string, amount: number, sentAt: Date): Promise<void> {
  await seedSentEmails(personId, amount, { provider: "resend", sentAt });
}

interface Shown {
  /** Los datos de «Hoy», por su rótulo. */
  data: Map<unknown, unknown>;
  /** Los párrafos de texto de la pantalla. */
  texts: string[];
}

/** Lo que la pantalla le muestra a quien la abre a esa hora. */
async function shownAt(now: Date): Promise<Shown> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  const tree: ReactNode = await QuotaPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({}),
  });
  const all = elements(tree);
  const labels = all.filter((item) => item.type === "dt").map((item) => item.props.children);
  const values = all.filter((item) => item.type === "dd").map((item) => item.props.children);
  return {
    data: new Map(labels.map((label, index) => [label, values[index]])),
    texts: all
      .filter((item) => item.type === "p")
      .map((item) => item.props.children)
      .filter((children): children is string => typeof children === "string"),
  };
}

beforeEach(async () => {
  await truncateAll();
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(async () => {
  setMailTransportsForTests(undefined);
  await closeDb();
});

describe("la pantalla del cupo de correo dice cuándo vuelve a empezar la cuenta de hoy (ADR-121 regla 5)", () => {
  it("con Resend, pasada la medianoche de Colombia cuenta lo enviado desde las 7:00 p. m. y dice que la cuenta vuelve a empezar a las 7:00 p. m. de ese día", async () => {
    useProvider("resend");
    const ana = await seedMember("ana@eafit.edu.co", { firstName: "Ana" });
    // Las 7:00 p. m. en punto ya son del día del proveedor; un segundo antes es de su día anterior.
    await seedSent(ana, 4, PROVIDER_DAY);
    await seedSent(ana, 3, new Date(PROVIDER_DAY.getTime() - 1_000));
    const proveedor = quotaProviderLabel("resend");
    const [dtProveedor, , dtEnviados] = tList("T-3229");

    const { data, texts } = await shownAt(PAST_LOCAL_MIDNIGHT);

    expect(data.get(dtProveedor)).toBe(proveedor);
    expect(data.get(dtEnviados)).toBe(4);
    // La hora que escribe es la del 10 a las siete de la noche, no la medianoche de Colombia.
    const fecha = formatDateTime(NEXT_PROVIDER_DAY);
    expect(fecha).toMatch(/10.*7:00\sp\.\sm\./);
    expect(texts).toContain(t("T-3259", { proveedor, fecha }));
    expect(texts).not.toContain(t("T-3230", { proveedor }));
  });

  it("a las 7:00 p. m. en punto la cuenta ya es la del día nuevo y la hora que dice es la del otro día", async () => {
    useProvider("resend");
    const ana = await seedMember("ana@eafit.edu.co", { firstName: "Ana" });
    await seedSent(ana, 4, PROVIDER_DAY);
    const [, , dtEnviados] = tList("T-3229");

    const { data, texts } = await shownAt(NEXT_PROVIDER_DAY);

    expect(data.get(dtEnviados)).toBe(0);
    const fecha = formatDateTime(new Date("2031-03-12T00:00:00.000Z"));
    expect(fecha).toMatch(/11.*7:00\sp\.\sm\./);
    expect(texts).toContain(t("T-3259", { proveedor: quotaProviderLabel("resend"), fecha }));
  });

  it("con un proveedor que no lleva cupo del día no promete ninguna hora: dice que el margen no frena las campañas", async () => {
    useProvider("ses");
    const proveedor = quotaProviderLabel("ses");
    const [dtProveedor, , dtEnviados] = tList("T-3229");

    const { data, texts } = await shownAt(PAST_LOCAL_MIDNIGHT);

    expect(data.get(dtProveedor)).toBe(proveedor);
    expect(data.has(dtEnviados)).toBe(false);
    expect(texts).toContain(t("T-3230", { proveedor }));
    expect(texts.some((text) => text.includes(formatDateTime(NEXT_PROVIDER_DAY)))).toBe(false);
  });
});
