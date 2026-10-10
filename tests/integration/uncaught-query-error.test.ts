import { createRequire } from "node:module";
import { format } from "node:util";
import { DrizzleQueryError } from "drizzle-orm/errors";
import type { InstrumentationModule } from "next/dist/server/instrumentation/types";
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import * as instrumentation from "@/instrumentation";
import { requestOtp, signInWithPassword } from "@/modules/identity";
import { captureLogs, expectNoEmail, recordsOf } from "../helpers/logs";

// Un error de consulta que nadie captura durante el ingreso (DT-102, ADR-120 regla 12). Las actions
// del ingreso llaman a `signInWithPassword` y a `requestOtp` sin `try/catch`
// (`src/modules/identity/actions.ts`), así que lo que el comando lanza es lo que escapa, y de un
// error que escapa se ocupa Next. Acá corre el código de Next 16.3.4 que lo hace, sin levantar la
// app: el `onRequestError` de su módulo de rutas, que primero imprime el error con `console.error`
// y después le avisa a `src/instrumentation.ts`. Lo único que se reemplaza es cómo encuentra ese
// archivo, que en producción sale del directorio de la compilación.

const { RouteModule } = createRequire(import.meta.url)(
  "next/dist/server/route-modules/route-module",
) as typeof import("next/dist/server/route-modules/route-module");

const EMAIL = "valor.privado@eafit.edu.co";
const IP = "203.0.113.7";

afterAll(closeDb);

/** La base se cae en la primera consulta del ingreso; devuelve lo que el comando deja escapar. */
async function uncaughtFrom(run: () => Promise<unknown>): Promise<Error> {
  const down = Object.assign(new Error("terminating connection due to administrator command"), {
    code: "57P01",
  });
  const spy = vi.spyOn(getDb().$client, "query").mockRejectedValue(down);
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
  } finally {
    spy.mockRestore();
  }
  throw new Error("el ingreso no falló y debía");
}

/** Lo que Next hace con ese error; devuelve lo que imprimió por `console.error`. */
async function asNextReportsIt(error: Error, routePath: string): Promise<string> {
  const printed: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    printed.push(format(...args));
  });
  const found: InstrumentationModule = instrumentation;
  const host = {
    async instrumentationOnRequestError(
      _req: unknown,
      ...args: Parameters<NonNullable<InstrumentationModule["onRequestError"]>>
    ) {
      await found.onRequestError?.(...args);
    },
  };
  try {
    await RouteModule.prototype.onRequestError.call(
      host as never,
      {
        url: "/ingresar?next=%2Fapp%2Fcarnet",
        method: "POST",
        headers: { cookie: "oe_session=galleta-sintetica" },
      } as never,
      error,
      {
        routerKind: "App Router",
        routePath,
        routeType: "action",
        renderSource: "react-server-components-payload",
        revalidateReason: undefined,
      },
      false,
    );
  } finally {
    spy.mockRestore();
  }
  return printed.join("\n");
}

describe.each([
  [
    "entrar con contraseña",
    "/ingresar",
    () =>
      signInWithPassword({
        email: EMAIL,
        password: "clave-sintetica",
        ip: IP,
        userAgent: null,
        remember: false,
      }),
  ],
  ["pedir el código", "/ingresar/codigo", () => requestOtp({ email: EMAIL, ip: IP })],
])("la base se cae al %s y nadie captura el error", (_name, routePath, run) => {
  it("el error que escapa es el de la consulta, con el correo tecleado entre sus valores", async () => {
    const error = await uncaughtFrom(run);
    expect(error).toBeInstanceOf(DrizzleQueryError);
    // El error no se toca: el serializador del registro lee sus `params` para recortarlos.
    expect((error as DrizzleQueryError).params).toContain(EMAIL);
    expect(error.message).toContain(EMAIL);
  });

  it("lo que Next imprime por fuera del registro no trae el correo, y conserva el SQL y el código", async () => {
    const error = await uncaughtFrom(run);
    const { result: printed } = await captureLogs(() => asNextReportsIt(error, routePath));
    expect(printed).toContain("Failed query: select");
    expect(printed).toContain("57P01");
    expect(printed).toContain("terminating connection due to administrator command");
    expect(printed).not.toContain(EMAIL);
    expect(printed).not.toContain("valor.privado");
    expect(printed).not.toContain("params");
  });

  it("queda en el registro de la casa, por su serializador, con la ruta y sin la dirección pedida ni la cookie", async () => {
    const error = await uncaughtFrom(run);
    const { lines } = await captureLogs(() => asNextReportsIt(error, routePath));
    const records = recordsOf(lines, "error sin capturar en una ruta");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: 50,
      route: routePath,
      routeType: "action",
      method: "POST",
      err: { type: "DrizzleQueryError", code: "57P01" },
    });
    const err = records[0]?.err as Record<string, unknown>;
    expect(String(err.message)).toContain("Failed query: select");
    expect(err).not.toHaveProperty("params");
    expectNoEmail(lines, EMAIL);
    for (const { line } of lines) {
      for (const written of [IP, "galleta-sintetica", "next=", "cookie"]) {
        expect(line).not.toContain(written);
      }
    }
  });
});

// Decisión abierta 42: qué se hace con un error sin manejar (registrarlo, avisarle a alguien, darle
// una referencia a la persona) no está decidido. El gancho registra lo que pidió #251, el error de
// consulta, y lo demás queda como antes: lo imprime Next y la casa no escribe nada.
describe("un error sin capturar que no es de consulta (decisión abierta 42)", () => {
  it("no deja línea en el registro de la casa: lo imprime Next, como antes", async () => {
    const error = new TypeError("no se pudo leer el formulario");
    const { result: printed, lines } = await captureLogs(() => asNextReportsIt(error, "/ingresar"));
    expect(printed).toContain("no se pudo leer el formulario");
    expect(recordsOf(lines, "error sin capturar en una ruta")).toEqual([]);
  });

  it("el error de consulta que llega como causa de otro sí queda en el registro, sin sus valores", async () => {
    const cause = await uncaughtFrom(() => requestOtp({ email: EMAIL, ip: IP }));
    const error = new Error("no se pudo pedir el código", { cause });
    const { lines } = await captureLogs(() => asNextReportsIt(error, "/ingresar/codigo"));
    expect(recordsOf(lines, "error sin capturar en una ruta")).toHaveLength(1);
    expectNoEmail(lines, EMAIL);
  });
});
