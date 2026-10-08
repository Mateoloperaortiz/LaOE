import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { getConfig, reviseConfig } from "@/modules/system";
import { truncateAll } from "./db";

// Cambiar una clave según el valor que tiene (`reviseConfig`): es lo que sostiene que el corte por
// cuota de las campañas nunca retroceda (ADR-115 regla 6). La clave de la prueba no se siembra.

const KEY = "campaigns.quotaExhaustedAt";
const at = (minute: number): string => new Date(Date.UTC(2031, 2, 10, 5, minute)).toISOString();

/** La regla del corte: queda la hora más tardía. */
const latest =
  (candidate: string) =>
  (current: string | null): string | undefined =>
    current !== null && current >= candidate ? undefined : candidate;

beforeEach(truncateAll);
afterAll(() => closeDb());

describe("cambiar una clave de configuración según el valor que tiene", () => {
  it("doce cambios a la vez sobre una clave sin fila deciden uno después del otro: queda la hora más tardía", async () => {
    const minutes = [7, 3, 11, 1, 9, 5, 12, 2, 10, 4, 8, 6];

    await Promise.all(minutes.map((minute) => reviseConfig(SYSTEM_ACTOR, KEY, latest(at(minute)))));

    expect(await getConfig(KEY)).toBe(at(12));
  });

  it("un cambio que no devuelve valor deja la clave como estaba, y el siguiente la ve sin esperar la caché", async () => {
    await reviseConfig(SYSTEM_ACTOR, KEY, latest(at(30)));
    expect(await getConfig(KEY)).toBe(at(30));

    await reviseConfig(SYSTEM_ACTOR, KEY, latest(at(10)));
    expect(await getConfig(KEY)).toBe(at(30));

    await reviseConfig(SYSTEM_ACTOR, KEY, latest(at(45)));
    expect(await getConfig(KEY)).toBe(at(45));
  });
});
