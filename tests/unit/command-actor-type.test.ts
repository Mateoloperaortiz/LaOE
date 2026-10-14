import { describe, expect, expectTypeOf, it } from "vitest";
import type { CommandActor } from "@/app/_lib/actor";
import { type Actor, SYSTEM_ACTOR } from "@/db/tx";
import type { KitActor } from "@/shared/admin-kit/types";

// La IP del actor de un comando es obligatoria en el tipo (ADR-121 regla 1): un actor armado a mano
// como `{ personId }` no compila, lo escriba quien lo escriba y con el nombre que sea. No reemplaza a
// la guarda de texto de los recursos del admin kit (`admin-kit-command-actor.test.ts`), que se queda
// para lo que el tipo no ve: el actor rearmado con `ip: null`. Las afirmaciones de tipos las juzga el
// compilador (`npm run typecheck`), no la corrida: si alguien vuelve opcional el campo, este archivo
// deja de compilar.

describe("el actor de un comando lleva siempre su IP", () => {
  it("el tipo la exige, como texto o como nulo, y no la acepta ausente", () => {
    expectTypeOf<Actor["ip"]>().toEqualTypeOf<string | null>();
    expectTypeOf<{ personId: string }>().not.toExtend<Actor>();
    expectTypeOf<{ personId: string; ip?: string | null }>().not.toExtend<Actor>();
    expectTypeOf<{ personId: string; ip: null }>().toExtend<Actor>();
    // Los actores que arman el kit de actions y el admin kit son actores de un comando.
    expectTypeOf<CommandActor>().toExtend<Actor>();
    expectTypeOf<KitActor>().toExtend<Actor>();
  });

  it("el actor del sistema la lleva en nulo", () => {
    expect(SYSTEM_ACTOR).toEqual({ personId: null, ip: null });
  });
});
