import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { callEntryChanged, requestDecided } from "@/domain-events/crm";
import { eventOf } from "@/domain-events/define";
import { permissionGranted } from "@/domain-events/identity";
import { boosterGranted } from "@/domain-events/participation";
import {
  appointmentChanged,
  consentChanged,
  membershipChanged,
  personUpdated,
  sanctionRecorded,
  stageChanged,
} from "@/domain-events/people";
import { permanenceDecided } from "@/domain-events/permanence";
import "@/modules/crm/jobs";
import { interaction } from "@/modules/crm/schema";
import { outbox } from "@/modules/system/schema";
import { tList } from "@/shared/copy";
import { seedMember } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { PAIRS, UNZIPPED_FIELDS, ZIP_PAIRS } from "../unit/enum-label-pairs.table";
import { truncateAll } from "./db";

// El resumen de una interacción automática queda guardado en `interaction.summary` con la etiqueta
// de un valor del evento: el estado, la etapa, la decisión, el cargo, el permiso. Esas etiquetas las
// arma `labels()` de src/modules/crm/jobs.ts, que no se exporta. Las unitarias de la línea de tiempo
// (tests/unit/crm-pure.test.ts) le pasan a la regla un `Record` escrito a mano, así que ninguna veía
// qué etiqueta le toca de verdad a cada valor (spec #242, «Testing Decisions»). Acá cada evento entra
// por el outbox, lo cuenta el handler de producción y se lee lo que quedó guardado. La posición de
// cada valor es la de la tabla de tests/unit/enum-label-pairs.table.ts, que no compara redacciones
// (DT-011, ADR-126 regla 1).

type Event = ReturnType<typeof eventOf>;

interface Case {
  /** El evento que lleva `value` en el campo que la regla lee con esa etiqueta. */
  event(personId: string, value: string): Event;
  /** El valor del payload guardado en el outbox, para saber de qué evento es cada resumen. */
  read(payload: Record<string, unknown>): string;
  /** El resumen que tiene que quedar guardado cuando la etiqueta del valor es `label`. */
  summary(label: string, value: string): string;
  /** Lo que la regla escribe cuando el valor no tiene etiqueta; si falta, el valor tal cual. */
  fallback?: (list: readonly string[], value: string) => string;
}

/** Los marcadores de un texto del catálogo, como los llena la línea de tiempo. */
function fill(text: string | undefined, values: Record<string, string>): string {
  return (text ?? "").replace(/\{([^{}]+)\}/g, (match, key: string) => values[key.trim()] ?? match);
}

const actorId = null;
const TERM = "termino-que-no-existe";

const CASES: Record<string, Case> = {
  // La regla cuenta la baja y el reingreso con otro texto, sin la etiqueta del estado: `INACTIVE`
  // nunca llega a leer la suya.
  statuses: {
    event: (personId, value) =>
      eventOf(membershipChanged, { actorId, personId, from: value, to: value, reason: "Viaje" }),
    read: (payload) => String(payload.from),
    summary: (label, value) =>
      value === "INACTIVE"
        ? fill(tList("T-458")[2], { motivo: "Viaje" })
        : fill(tList("T-458")[1], { de: label, a: label, motivo: "Viaje" }),
  },
  stages: {
    event: (personId, value) =>
      eventOf(stageChanged, { actorId, personId, from: "PROSPECT", to: value }),
    read: (payload) => String(payload.to),
    summary: (label) => fill(tList("T-1046")[4], { etapa: label }),
  },
  requestStatuses: {
    event: (personId, value) =>
      eventOf(requestDecided, {
        actorId,
        personId,
        requestId: `solicitud-${value}`,
        kind: "LEAVE",
        kindLabel: tList("T-894")[0],
        status: value,
        reason: "Viaje",
        email: "miembro.etiquetas@eafit.edu.co",
        firstName: "Miembro",
      }),
    read: (payload) => String(payload.status),
    summary: (label) =>
      fill(tList("T-1046")[7], {
        tipo: tList("T-894")[0],
        estado: label.toLowerCase(),
        motivo: "Viaje",
      }),
  },
  callEntryStatuses: {
    event: (personId, value) =>
      eventOf(callEntryChanged, {
        actorId,
        personId,
        callId: "convocatoria",
        callTitle: "Monitores",
        groupId: "grupo",
        status: value,
      }),
    read: (payload) => String(payload.status),
    summary: (label) =>
      fill(tList("T-1046")[8], { convocatoria: "Monitores", estado: label.toLowerCase() }),
  },
  decisions: {
    event: (personId, value) =>
      eventOf(permanenceDecided, {
        actorId,
        personId,
        termId: TERM,
        committeeId: null,
        decision: value,
        reason: "",
      }),
    read: (payload) => String(payload.decision),
    summary: (label) => fill(tList("T-832")[6], { término: "", decisión: label }),
  },
  appointmentKinds: {
    event: (personId, value) =>
      eventOf(appointmentChanged, {
        actorId,
        personId,
        action: "REMOVED",
        kind: value,
        termId: TERM,
      }),
    read: (payload) => String(payload.kind),
    summary: (label) => fill(tList("T-458")[6], { cargo: label }),
  },
  permissions: {
    event: (personId, value) =>
      eventOf(permissionGranted, { actorId, personId, code: value, committeeId: null }),
    read: (payload) => String(payload.code),
    summary: (label) => fill(tList("T-458")[14], { permiso: label }),
  },
  purposes: {
    event: (personId, value) =>
      eventOf(consentChanged, { actorId, personId, purpose: value, action: "GRANTED" }),
    read: (payload) => String(payload.purpose),
    summary: (label) => fill(tList("T-458")[7], { propósito: label }),
  },
  fields: {
    event: (personId, value) => eventOf(personUpdated, { actorId, personId, fields: [value] }),
    read: (payload) => String((payload.fields as string[])[0]),
    summary: (label) => fill(tList("T-458")[9], { campos: label }),
  },
  sanctionKinds: {
    event: (personId, value) =>
      eventOf(sanctionRecorded, {
        actorId,
        personId,
        sanctionId: `sancion-${value}`,
        termId: TERM,
        committeeId: null,
        kind: value,
        cause: "Causal de prueba",
        occurredOn: "2026-03-02",
        suspendedUntil: null,
        expiresOn: "2027-03-02",
      }),
    read: (payload) => String(payload.kind),
    summary: (label) => fill(tList("T-2234")[0], { tipo: label, causal: "Causal de prueba" }),
  },
  // El booster que GH entrega a mano. Un tipo sin nombre no cae al valor: cae al primer nombre de la
  // lista, y solo si la lista no lo trae, al valor (decisión abierta 75).
  boosterNames: {
    event: (personId, value) =>
      eventOf(boosterGranted, {
        boosterId: `booster-${value}`,
        personId,
        termId: TERM,
        kind: value,
        source: "MANUAL",
      }),
    read: (payload) => String(payload.kind),
    summary: (label) => fill(tList("T-667")[10], { booster: label }),
    fallback: (list, value) => list[0] ?? value,
  },
};

/** Las claves de `labels()` con su lista: los diez pares del `zip` y los nombres de booster. */
const KEYS = [
  ...ZIP_PAIRS.map(({ key, code }) => ({ key, code })),
  { key: "boosterNames", code: "T-2451" as const },
];

/** La posición literal que la tabla le da a cada valor de la lista de esa clave. */
function positionsOf(key: string, code: string): Record<string, number> {
  const pairs = key === "fields" ? [UNZIPPED_FIELDS] : PAIRS.filter((pair) => pair.code === code);
  expect(pairs).toHaveLength(1);
  return pairs[0]?.positions ?? {};
}

/** Emite un evento por valor, deja que el handler de producción los cuente y devuelve, por valor, el
 * resumen que quedó guardado en la línea de tiempo. */
async function storedSummaries(key: string, values: readonly string[]) {
  const item = CASES[key];
  if (!item) {
    throw new Error(`Falta el caso de ${key}`);
  }
  const personId = await seedMember("miembro.etiquetas@eafit.edu.co");
  await runCommand(SYSTEM_ACTOR, async (ctx) => {
    for (const value of values) {
      await ctx.emit(item.event(personId, value));
    }
  });
  await drainOutbox();
  const rows = await getDb()
    .select({ payload: outbox.payload, summary: interaction.summary })
    .from(outbox)
    .innerJoin(
      interaction,
      and(eq(interaction.refType, "outbox"), eq(interaction.refId, outbox.id)),
    )
    .where(eq(interaction.personId, personId));
  return Object.fromEntries(rows.map((row) => [item.read(row.payload), row.summary]));
}

describe("las etiquetas que labels() de crm/jobs.ts le da a la línea de tiempo", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("trae un caso por cada clave del zip y uno por los nombres de booster", () => {
    expect(Object.keys(CASES).sort()).toEqual(KEYS.map(({ key }) => key).sort());
  });

  it.each(
    KEYS,
  )("el resumen guardado lleva en $key la pieza de $code que le toca a cada valor", async ({
    key,
    code,
  }) => {
    const list: readonly string[] = tList(code);
    const positions = positionsOf(key, code);
    const values = Object.keys(positions);
    expect(values.length).toBeGreaterThan(1);

    const stored = await storedSummaries(key, values);

    expect(stored).toEqual(
      Object.fromEntries(
        values.map((value) => [
          value,
          CASES[key]?.summary(list[positions[value] ?? -1] ?? "", value),
        ]),
      ),
    );
    // Cada valor guarda un resumen distinto: ninguno lee la pieza de otro.
    const labelled = values.filter((value) => !(key === "statuses" && value === "INACTIVE"));
    expect(new Set(labelled.map((value) => stored[value])).size).toBe(labelled.length);
  });

  // Lo que queda guardado cuando no hay etiqueta para un valor espera la decisión abierta 75: hasta
  // entonces es lo de hoy, el valor tal cual (o el primer nombre, en los boosters).
  it.each(KEYS)("un valor que $code no trae queda en $key como hoy (decisión abierta 75)", async ({
    key,
    code,
  }) => {
    const item = CASES[key];
    const stranger = "NO_EXISTE";

    const stored = await storedSummaries(key, [stranger]);

    const label = item?.fallback ? item.fallback(tList(code), stranger) : stranger;
    expect(stored).toEqual({ [stranger]: item?.summary(label, stranger) });
  });
  // El `zip` armaba un objeto literal, que hereda de `Object.prototype`: un valor llamado como una de
  // sus propiedades no caía al respaldo, leía una función, y el resumen guardaba su código fuente o
  // el handler fallaba al pasarla a minúsculas (ADR-126 regla 6). Leído por valor cae al respaldo
  // como cualquier otro valor sin etiqueta.
  it.each(
    KEYS,
  )("un valor que se llama como una propiedad de Object queda en $key como cualquier otro sin etiqueta", async ({
    key,
    code,
  }) => {
    const item = CASES[key];
    const strangers = ["constructor", "toString", "hasOwnProperty", "valueOf", "__proto__"];

    const stored = await storedSummaries(key, strangers);

    expect(strangers.map((value) => [value, stored[value]])).toEqual(
      strangers.map((value) => [
        value,
        item?.summary(item.fallback ? item.fallback(tList(code), value) : value, value),
      ]),
    );
  });
});
