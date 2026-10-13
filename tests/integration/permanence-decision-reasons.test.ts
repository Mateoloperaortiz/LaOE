import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  closeTermPermanenceAs,
  confirmAllProposedAs,
  confirmDecisionsAs,
  getPersonPermanence,
  listClosingRows,
  listPersonDecisions,
  recomputeSnapshots,
} from "@/modules/permanence";
import { permanenceDecision } from "@/modules/permanence/schema";
import { seedTerm } from "../factories";
import { type ClosingWorld, closingWorld, type Profile } from "../helpers/closing-world";
import { truncateAll } from "./db";

// El motivo automático con que el cierre de permanencia propuso una decisión se guarda con la decisión
// (ADR-128 regla 1; DT-392). Va por el camino de verdad, contra Postgres: el cierre propone sobre los
// snapshots, GH confirma con los comandos del módulo, y lo que quedó guardado se lee por las filas del
// cierre, que traen la decisión confirmada de cada comité y la de la persona.

describe("el motivo con que el cierre propuso se guarda con la decisión confirmada", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("confirmar en bloque guarda, con la decisión de cada comité y con la de la persona, el motivo de su propuesta", async () => {
    const { termId, actor, member, closePoints, proposedReasons, savedReasons } =
      await closingWorld();
    const people = {
      meets: await member("cumple.guardado@eafit.edu.co", { level: "MEETS" }),
      onProbation: await member("prueba.guardado@eafit.edu.co", { level: "BAND" }),
      below: await member("no-alcanza.guardado@eafit.edu.co", { level: "BELOW" }),
      absent: await member("falto.guardado@eafit.edu.co", { level: "MEETS", attends: false }),
      warned: await member("sancionado.guardado@eafit.edu.co", {
        level: "MEETS",
        sanctioned: true,
      }),
    };
    await closePoints();
    // Los seis motivos de T-801, cada uno donde el cierre lo propone: 0 a 2 por comité y 0, 3, 4 y 5 por persona.
    const proposed = {
      meets: { committee: 0, person: 0 },
      onProbation: { committee: 1, person: 0 },
      below: { committee: 2, person: 3 },
      absent: { committee: 0, person: 4 },
      warned: { committee: 0, person: 5 },
    };
    for (const [who, personId] of Object.entries(people)) {
      expect(await proposedReasons(personId), who).toEqual(proposed[who as keyof typeof proposed]);
      // Sin confirmar no hay decisión, y por eso tampoco motivo guardado.
      expect(await savedReasons(personId), who).toEqual({
        committee: undefined,
        person: undefined,
      });
    }

    expect(await confirmAllProposedAs(actor, termId)).toBe(5);

    for (const [who, personId] of Object.entries(people)) {
      expect(await savedReasons(personId), who).toEqual(proposed[who as keyof typeof proposed]);
    }
  });

  it("cuando GH cambia la propuesta se guarda el motivo de lo que el cierre propuso, no uno de lo que GH decidió", async () => {
    const { termId, a3, actor, member, closePoints, closingRow, savedReasons } =
      await closingWorld();
    const below = await member("cambiada.guardado@eafit.edu.co", { level: "BELOW" });
    const absent = await member("perdonada.guardado@eafit.edu.co", {
      level: "MEETS",
      attends: false,
    });
    await closePoints();
    const written = "Se queda en prueba: entregó su plan de mejora";
    await confirmDecisionsAs(actor, termId, {
      personId: below,
      person: "CONTINUES",
      committees: [{ committeeId: a3, decision: "PROBATION" }],
      reason: written,
    });
    await confirmDecisionsAs(actor, termId, {
      personId: absent,
      person: "CONTINUES",
      committees: [{ committeeId: a3, decision: "CONTINUES" }],
      reason: "La asamblea se cruzó con un parcial",
    });

    // Se propuso sacarlo del comité por quedar fuera de la banda y de la OE por quedarse sin comité.
    expect(await closingRow(below)).toMatchObject({
      overridden: true,
      committees: [{ decision: { proposed: "EXIT_COMMITTEE", decision: "PROBATION" } }],
      personDecision: { proposed: "EXIT_OE", decision: "CONTINUES", reason: written },
    });
    expect(await savedReasons(below)).toEqual({ committee: 2, person: 3 });
    // Se propuso sacarlo de la OE por la asamblea perdida, y eso es lo que queda guardado.
    expect(await savedReasons(absent)).toEqual({ committee: 0, person: 4 });
  });

  it("volver a confirmar después de que cambian los hechos guarda el motivo de la propuesta de ese momento, y sin volver a confirmar se conserva el de antes", async () => {
    const { termId, a3, actor, member, setLevel, closePoints, proposedReasons, savedReasons } =
      await closingWorld();
    const below = await member("reconfirmada.guardado@eafit.edu.co", { level: "BELOW" });
    await closePoints();
    await confirmAllProposedAs(actor, termId);
    expect(await savedReasons(below)).toEqual({ committee: 2, person: 3 });

    // GH le reconoce después los créditos que le faltaban: hoy el cierre le propondría continuar.
    await setLevel(below, "MEETS");
    await recomputeSnapshots(termId);
    expect(await proposedReasons(below)).toEqual({ committee: 0, person: 0 });
    // Confirmar en bloque no toca a quien ya tiene decisión: rige la confirmada, con su motivo.
    expect(await confirmAllProposedAs(actor, termId)).toBe(0);
    expect(await savedReasons(below)).toEqual({ committee: 2, person: 3 });

    await confirmDecisionsAs(actor, termId, {
      personId: below,
      person: "CONTINUES",
      committees: [{ committeeId: a3, decision: "CONTINUES" }],
      reason: "",
    });
    expect(await savedReasons(below)).toEqual({ committee: 0, person: 0 });
  });

  it("la lectura de las decisiones de una persona rechaza el resultado de otra persona o el de otro término, en vez de resolver con él un motivo (DT-398)", async () => {
    const { termId, actor, member, closePoints } = await closingWorld();
    const exits = await member("sale.ajeno@eafit.edu.co", { level: "MEETS", sanctioned: true });
    const stays = await member("sigue.ajeno@eafit.edu.co", { level: "MEETS" });
    await closePoints();
    await confirmAllProposedAs(actor, termId);
    const otherTermId = await seedTerm("2025-1");
    const [own, ofAnother, ofAnotherTerm] = [
      await getPersonPermanence(exits, termId),
      await getPersonPermanence(stays, termId),
      await getPersonPermanence(exits, otherTermId),
    ];
    if (!own || !ofAnother || !ofAnotherTerm) {
      throw new Error("falta una vista de permanencia");
    }

    // Con la vista de esa persona en ese término responde, y trae el motivo de su salida.
    const decisions = await listPersonDecisions(exits, termId, own);
    expect(decisions.find((decision) => decision.committeeId === null)?.proposalReason).toBe(5);
    // Con la de otra persona o la de otro término no resuelve nada: lanza antes de leer.
    const refusal = "no es el de esa persona en ese término";
    await expect(listPersonDecisions(exits, termId, ofAnother)).rejects.toThrow(refusal);
    await expect(listPersonDecisions(exits, termId, ofAnotherTerm)).rejects.toThrow(refusal);
    // También cuando no hay ninguna decisión que leer: la comprobación no depende de las filas.
    await expect(listPersonDecisions(exits, otherTermId, own)).rejects.toThrow(refusal);
  });
});

// LA TABLA DE COMPARACIÓN (ticket 346, criterio 3). Recorre cada salida que el cierre sabe proponer y
// cada cosa que puede cambiar después de confirmar, con los comandos de verdad, y compara lo que la
// lectura de la Persona 360 devuelve (`listPersonDecisions` sobre el resultado de `getPersonPermanence`,
// como la llama la pestaña) con (a) el motivo con que se propuso y (b) lo que mostraba la pestaña antes
// del ciclo 16, que es lo que hay en producción. Lo hace dos veces: con el motivo guardado, y con las
// decisiones como quedaron las confirmadas antes de la columna, sin él.

const KINDS = ["CONTINUES", "PROBATION", "EXIT_COMMITTEE", "EXIT_OE"] as const;
type Kind = (typeof KINDS)[number];

/** Los seis motivos de T-801, con un nombre corto para leer la tabla. */
const REASONS = [
  "cumplió",
  "en prueba",
  "fuera de la banda",
  "sin comité",
  "asamblea perdida",
  "sanciones",
] as const;

/**
 * (b) Lo que mostraba la pestaña antes del ciclo 16 (`TabPermanencia.tsx` en `refactor/ciclo-15`): la
 * posición de lo propuesto en su lista de decisiones y, para la salida de la OE, el 3 o el 4 según
 * `mandatory.met` del resultado que la pestaña muestra.
 */
function shownBeforeCycle16(mandatoryMet: boolean, proposed: Kind): number {
  if (proposed === "EXIT_OE") {
    return mandatoryMet ? 3 : 4;
  }
  return KINDS.indexOf(proposed);
}

/** Con qué llega cada persona al cierre: la que continúa y cada salida, sola y de a dos causas. */
const ARRIVALS: ReadonlyArray<{ name: string; profile: Profile }> = [
  { name: "continúa", profile: { level: "MEETS" } },
  { name: "sin comité", profile: { level: "BELOW" } },
  { name: "asamblea perdida", profile: { level: "MEETS", attends: false } },
  { name: "sanciones", profile: { level: "MEETS", sanctioned: true } },
  { name: "asamblea perdida y sin comité", profile: { level: "BELOW", attends: false } },
  { name: "sanciones y sin comité", profile: { level: "BELOW", sanctioned: true } },
  {
    name: "asamblea perdida y sanciones",
    profile: { level: "MEETS", attends: false, sanctioned: true },
  },
];

/** Lo que puede cambiar después de confirmar, cada cosa con su comando y solo para quien aplica. */
const DRIFTS: ReadonlyArray<{
  name: string;
  applies: (profile: Profile) => boolean;
  apply: (w: ClosingWorld, personId: string) => Promise<unknown>;
}> = [
  { name: "nada cambia", applies: () => true, apply: async () => {} },
  {
    name: "le ajustan el requisito",
    applies: () => true,
    apply: (w, personId) => w.adjustRequirement(personId),
  },
  {
    name: "le revocan la falta grave",
    applies: (profile) => profile.sanctioned === true,
    apply: (w, personId) => w.revokeMajor(personId),
  },
  {
    name: "lo sancionan después",
    applies: (profile) => !profile.sanctioned,
    apply: (w, personId) => w.sanction(personId),
  },
  {
    name: "su comité deja de cumplir",
    applies: (profile) => profile.level === "MEETS",
    apply: (w, personId) => w.setLevel(personId, "BELOW"),
  },
  {
    name: "su comité pasa a cumplir",
    applies: (profile) => profile.level === "BELOW",
    apply: (w, personId) => w.setLevel(personId, "MEETS"),
  },
];

/** Cada caso de la tabla: una persona, veterana o nueva con la inducción pendiente, y un cambio. */
const CASES = ARRIVALS.flatMap(({ name, profile }) =>
  [false, true].flatMap((isNew) =>
    DRIFTS.filter((drift) => drift.applies(profile)).map((drift) => ({
      name: `${name} (${isNew ? "nuevo" : "veterano"}) · ${drift.name}`,
      profile: { ...profile, isNew },
      drift,
    })),
  ),
);

interface Line {
  /** Lo que se propuso y quedó confirmado. */
  proposed: Kind;
  /** (a) El motivo con que se propuso. */
  atConfirm: number;
  /** Lo que la lectura devuelve. */
  shown: number;
  /** (b) Lo que mostraba la pestaña antes del ciclo 16. */
  before: number;
  /** Lo que el cierre propone hoy, y con qué motivo. */
  nowProposed: Kind;
  nowReason: number;
}

/**
 * Arma el mundo entero de la tabla, confirma en bloque, aplica a cada persona su cambio y lee dos veces:
 * con el término abierto, que resuelve en vivo, y con el término cerrado, que lee el resultado congelado.
 * Con `saved` en falso las decisiones quedan sin el motivo de la propuesta, como las confirmadas antes
 * de la migración 0051, que no se rellenaron.
 */
async function observe(saved: boolean) {
  const w = await closingWorld();
  const people: string[] = [];
  for (const [index, item] of CASES.entries()) {
    people.push(await w.member(`caso${index}.tabla@eafit.edu.co`, item.profile));
  }
  await w.closePoints();
  const proposals = async () =>
    new Map((await listClosingRows(w.termId)).rows.map((row) => [row.personId, row]));
  const confirmed = await proposals();
  expect(await confirmAllProposedAs(w.actor, w.termId)).toBe(CASES.length);
  if (!saved) {
    await getDb()
      .update(permanenceDecision)
      .set({ proposalReason: null })
      .where(eq(permanenceDecision.termId, w.termId));
  }
  for (const [index, item] of CASES.entries()) {
    await item.drift.apply(w, people[index] as string);
  }
  await recomputeSnapshots(w.termId);

  async function read() {
    const now = await proposals();
    const lines: Array<{ committee: Line; person: Line }> = [];
    for (const personId of people) {
      const [before, today] = [confirmed.get(personId), now.get(personId)];
      const view = await getPersonPermanence(personId, w.termId);
      if (!before || !today || !view) {
        throw new Error("el cierre o la Persona 360 no traen a la persona");
      }
      const decisions = await listPersonDecisions(personId, w.termId, view);
      const [committee, person] = [
        decisions.find((decision) => decision.committeeId !== null),
        decisions.find((decision) => decision.committeeId === null),
      ];
      const [committeeBefore, committeeToday] = [before.committees[0], today.committees[0]];
      if (!committee || !person || !committeeBefore || !committeeToday) {
        throw new Error("a la persona le falta la decisión de su comité o la suya");
      }
      const met = view.result.mandatory.met;
      lines.push({
        committee: {
          proposed: committee.proposed,
          atConfirm: committeeBefore.reason,
          shown: committee.proposalReason,
          before: shownBeforeCycle16(met, committee.proposed),
          nowProposed: committeeToday.proposed,
          nowReason: committeeToday.reason,
        },
        person: {
          proposed: person.proposed,
          atConfirm: before.personReason,
          shown: person.proposalReason,
          before: shownBeforeCycle16(met, person.proposed),
          nowProposed: today.personProposed,
          nowReason: today.personReason,
        },
      });
    }
    return lines;
  }

  const open = await read();
  await closeTermPermanenceAs(w.actor, w.termId);
  const closed = await read();
  return CASES.map((item, index) => {
    const [whenOpen, whenClosed] = [open[index], closed[index]];
    if (!whenOpen || !whenClosed) {
      throw new Error("falta la lectura de un caso");
    }
    return { name: item.name, open: whenOpen, closed: whenClosed };
  });
}

type Row = readonly [string, string, string, string, Kind];

/**
 * Los casos donde una decisión SIN motivo guardado no muestra el motivo con que se propuso o no muestra
 * lo que mostraba la pestaña de antes. Cada fila: el caso, el motivo de la propuesta (a), lo que
 * mostraba la pestaña antes del ciclo 16 (b), lo que la lectura muestra, y lo que el cierre propone hoy.
 * Los 30 casos que no están acá muestran el motivo de su propuesta, igual que antes. Sin el motivo
 * guardado no hay de dónde sacar por qué se propuso cuando los hechos cambian: los tres últimos grupos
 * son lo que deja el respaldo de las filas viejas (DT-401).
 */
const WITHOUT_SAVED_REASON: Record<
  "proposalReasonNow" | "sameAsBefore" | "todaysCause" | "todaysCauseLosesProposalReason",
  readonly Row[]
> = {
  // Muestra el motivo de la propuesta, y la pestaña de antes mostraba otro: los dos defectos que
  // arregló el ticket 340 (la salida por sanciones y el nuevo con la inducción pendiente).
  proposalReasonNow: [
    ["sin comité (nuevo) · nada cambia", "sin comité", "asamblea perdida", "sin comité", "EXIT_OE"],
    [
      "sin comité (nuevo) · le ajustan el requisito",
      "sin comité",
      "asamblea perdida",
      "sin comité",
      "EXIT_OE",
    ],
    ["sanciones (veterano) · nada cambia", "sanciones", "sin comité", "sanciones", "EXIT_OE"],
    [
      "sanciones (veterano) · le ajustan el requisito",
      "sanciones",
      "sin comité",
      "sanciones",
      "EXIT_OE",
    ],
    [
      "sanciones (veterano) · su comité deja de cumplir",
      "sanciones",
      "sin comité",
      "sanciones",
      "EXIT_OE",
    ],
    ["sanciones (nuevo) · nada cambia", "sanciones", "asamblea perdida", "sanciones", "EXIT_OE"],
    [
      "sanciones (nuevo) · le ajustan el requisito",
      "sanciones",
      "asamblea perdida",
      "sanciones",
      "EXIT_OE",
    ],
    [
      "sanciones (nuevo) · su comité deja de cumplir",
      "sanciones",
      "asamblea perdida",
      "sanciones",
      "EXIT_OE",
    ],
    [
      "sanciones y sin comité (veterano) · nada cambia",
      "sanciones",
      "sin comité",
      "sanciones",
      "EXIT_OE",
    ],
    [
      "sanciones y sin comité (veterano) · le ajustan el requisito",
      "sanciones",
      "sin comité",
      "sanciones",
      "EXIT_OE",
    ],
    [
      "sanciones y sin comité (veterano) · su comité pasa a cumplir",
      "sanciones",
      "sin comité",
      "sanciones",
      "EXIT_OE",
    ],
    [
      "sanciones y sin comité (nuevo) · nada cambia",
      "sanciones",
      "asamblea perdida",
      "sanciones",
      "EXIT_OE",
    ],
    [
      "sanciones y sin comité (nuevo) · le ajustan el requisito",
      "sanciones",
      "asamblea perdida",
      "sanciones",
      "EXIT_OE",
    ],
    [
      "sanciones y sin comité (nuevo) · su comité pasa a cumplir",
      "sanciones",
      "asamblea perdida",
      "sanciones",
      "EXIT_OE",
    ],
  ],
  // Muestra lo mismo que la pestaña de antes, que no es el motivo de la propuesta. En los cuatro donde
  // hoy se propondría continuar es el respaldo; en los otros dos coincide con la causa de hoy.
  sameAsBefore: [
    [
      "sin comité (nuevo) · su comité pasa a cumplir",
      "sin comité",
      "asamblea perdida",
      "asamblea perdida",
      "CONTINUES",
    ],
    [
      "asamblea perdida (veterano) · le ajustan el requisito",
      "asamblea perdida",
      "sin comité",
      "sin comité",
      "CONTINUES",
    ],
    [
      "sanciones (veterano) · le revocan la falta grave",
      "sanciones",
      "sin comité",
      "sin comité",
      "CONTINUES",
    ],
    [
      "sanciones (nuevo) · le revocan la falta grave",
      "sanciones",
      "asamblea perdida",
      "asamblea perdida",
      "CONTINUES",
    ],
    [
      "asamblea perdida y sin comité (veterano) · le ajustan el requisito",
      "asamblea perdida",
      "sin comité",
      "sin comité",
      "EXIT_OE",
    ],
    [
      "sanciones y sin comité (veterano) · le revocan la falta grave",
      "sanciones",
      "sin comité",
      "sin comité",
      "EXIT_OE",
    ],
  ],
  // La salida se sigue proponiendo por otra causa, y muestra esa: ni el motivo de la propuesta ni lo
  // que mostraba la pestaña de antes, que tampoco lo era.
  todaysCause: [
    [
      "sin comité (nuevo) · lo sancionan después",
      "sin comité",
      "asamblea perdida",
      "sanciones",
      "EXIT_OE",
    ],
    [
      "sanciones y sin comité (nuevo) · le revocan la falta grave",
      "sanciones",
      "asamblea perdida",
      "sin comité",
      "EXIT_OE",
    ],
    [
      "asamblea perdida y sanciones (veterano) · le ajustan el requisito",
      "asamblea perdida",
      "sin comité",
      "sanciones",
      "EXIT_OE",
    ],
  ],
  // Lo mismo, y acá la pestaña de antes SÍ mostraba el motivo de la propuesta: los tres casos donde
  // una fila vieja deja de mostrarlo. Cumplen lo que pide el ticket (hoy se sigue proponiendo la
  // salida y se muestra su causa de hoy), y no se distinguen de los de arriba sin el motivo guardado:
  // «sin comité, y lo sancionan después» llega a la lectura igual que «sanciones y sin comité».
  todaysCauseLosesProposalReason: [
    [
      "sin comité (veterano) · lo sancionan después",
      "sin comité",
      "sin comité",
      "sanciones",
      "EXIT_OE",
    ],
    [
      "asamblea perdida y sin comité (nuevo) · le ajustan el requisito",
      "asamblea perdida",
      "asamblea perdida",
      "sin comité",
      "EXIT_OE",
    ],
    [
      "asamblea perdida y sanciones (nuevo) · le ajustan el requisito",
      "asamblea perdida",
      "asamblea perdida",
      "sanciones",
      "EXIT_OE",
    ],
  ],
};

describe("la tabla de comparación del motivo de una decisión: al confirmar, antes del ciclo 16 y hoy (DT-392)", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("con el motivo guardado, cada decisión muestra el motivo con que se propuso, cambie lo que cambie después de confirmar y con el término abierto o cerrado", async () => {
    const cases = await observe(true);
    expect(cases).toHaveLength(56);
    for (const item of cases) {
      for (const [phase, lines] of [
        ["abierto", item.open],
        ["cerrado", item.closed],
      ] as const) {
        for (const line of [lines.committee, lines.person]) {
          expect(line.shown, `${item.name} · ${phase} · ${line.proposed}`).toBe(line.atConfirm);
        }
      }
    }
  });

  it("sin el motivo guardado, cada decisión muestra lo que mostraba la pestaña antes del ciclo 16, salvo donde hoy se sigue proponiendo lo decidido, que muestra el motivo de hoy", async () => {
    const cases = await observe(false);
    expect(cases).toHaveLength(56);
    const notable = {
      proposalReasonNow: [] as Row[],
      sameAsBefore: [] as Row[],
      todaysCause: [] as Row[],
      todaysCauseLosesProposalReason: [] as Row[],
    };
    for (const item of cases) {
      // Cerrar el término no cambia nada: congela el resultado que ya se mostraba.
      expect(item.closed, item.name).toEqual(item.open);
      for (const line of [item.open.committee, item.open.person]) {
        const label = `${item.name} · ${line.proposed}`;
        // Lo que el ticket pide: donde difiere de la pestaña de antes, hoy se sigue proponiendo lo
        // decidido, y lo que muestra es el motivo de hoy.
        if (line.shown !== line.before) {
          expect(line.nowProposed, label).toBe(line.proposed);
          expect(line.shown, label).toBe(line.nowReason);
        }
        if (line.shown === line.atConfirm && line.shown === line.before) {
          continue;
        }
        const row: Row = [
          item.name,
          REASONS[line.atConfirm] ?? "",
          REASONS[line.before] ?? "",
          REASONS[line.shown] ?? "",
          line.nowProposed,
        ];
        if (line.shown === line.atConfirm) {
          notable.proposalReasonNow.push(row);
        } else if (line.shown === line.before) {
          notable.sameAsBefore.push(row);
        } else if (line.before === line.atConfirm) {
          notable.todaysCauseLosesProposalReason.push(row);
        } else {
          notable.todaysCause.push(row);
        }
      }
    }
    expect(notable).toEqual(WITHOUT_SAVED_REASON);
  });
});
