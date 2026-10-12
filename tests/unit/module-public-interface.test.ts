import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type ModuleInterface,
  type ModuleInterfaces,
  moduleInterfaces,
} from "../../scripts/lib/module-interface-metrics";

// El `index.ts` de un módulo es su interfaz pública (ADR-080 regla 1) y exporta lo que se usa afuera:
// lo que importa por nombre un archivo de `src`, `scripts` o `.railway` de fuera del módulo, o un
// componente del propio módulo, que no puede importar `domain/` (regla `componentes-sin-servidor`).
// Los tipos siguen el mismo criterio. Esta prueba lee el código y lo vigila: por cada módulo de
// `src/modules` saca los nombres que su `index.ts` exporta y que nadie de producción importa así, y
// los compara con `EXCEPTIONS`. Un nombre nuevo sin consumidor la pone en rojo, y una excepción que
// sobra también (ADR-125 reglas 1 y 5). Lo que importa una prueba no cuenta como uso: decide la clase.
//
// La poda del ciclo 13 cerró (spec #238, DT-012): lo que no importaba nadie de afuera, ni las
// pruebas, salió de los `index.ts`, y la lista dejó de admitirlo. Un nombre así no se exporta: se
// importa de `domain/` dentro del módulo. Lo vigila también knip, que analiza los exports de trece
// `index.ts` desde que salieron de `entry` en `knip.ts`, y esta prueba no deja que vuelvan.
//
// En la lista queda solo lo que espera una decisión del dueño. Cada excepción tiene su clase, y la
// clase es su motivo: dice qué decisión espera, y `WAITS` la nombra con su fila del ledger.
//
// - `solo-pruebas`: lo importa algún archivo de `tests/` y nadie más de afuera. Se queda en el
//   `index.ts` hasta la decisión abierta 73, que dice por dónde entran las pruebas a esos nombres.
// - `competition`: es de `competition` y no lo importa nadie de afuera. El módulo está quieto hasta
//   la decisión abierta 8 y no se poda; por eso su `index.ts` es el único que knip toma de entrada.
//
// La clase no se elige: sale del código. Si la prueba que importaba un nombre de `solo-pruebas` deja
// de hacerlo, el nombre pasa a no importarlo nadie y sale del `index.ts`. La lista va por módulo, con
// un nombre por renglón y en el orden de `sort()` (mayúsculas primero), para que podar sea borrar
// renglones.

/** La clase de un nombre que producción no importa de afuera. Sale del código. */
type FoundClass = "nadie" | "solo-pruebas" | "competition";
/** Las clases que la lista admite: las que esperan una decisión. `nadie` cerró con la poda. */
type ExceptionClass = Exclude<FoundClass, "nadie">;

/** El motivo de cada clase: la decisión abierta que espera y su fila del ledger. */
const WAITS: Record<ExceptionClass, { decision: number; ledger: string }> = {
  "solo-pruebas": { decision: 73, ledger: "DT-359" },
  competition: { decision: 8, ledger: "DT-360" },
};

const CLASSES = Object.keys(WAITS) as ExceptionClass[];
/** El módulo que no se poda mientras la decisión abierta 8 no diga otra cosa. */
const QUIET_MODULE = "competition";

type Exceptions = Record<string, Partial<Record<ExceptionClass, string>>>;
/** Una lista como llega escrita, antes de comprobar que sus clases son de las que se admiten. */
type WrittenExceptions = Record<string, Partial<Record<string, string>>>;

const EXCEPTIONS: Exceptions = {
  comms: {
    "solo-pruebas": `
      DEFAULT_PREFERENCES
      createCampaignAs
      deliverNotification
      processCampaignBatch
      runCampaignTick
      setMailTransportsForTests
      setPushSenderForTests
      splitPush
      startDueCampaigns
      updateCampaignAs
    `,
  },
  competition: {
    competition: `
      BASE_KINDS
      BaseKind
      COMPETITION_STATUSES
      CompetitionStatus
      Day
      DelayRow
      EnterHubResult
      ExtraRubricTeam
      HubState
      HubTeam
      ImportDayResult
      ImportPowersResult
      JudgeNudge
      JudgeStage
      JuryTeamResult
      MARKET_STATUSES
      MarketStatus
      OUTCOMES
      POINTS
      PlaceBetResult
      PowerBoardTeam
      PowerBoardUse
      PowerDetail
      RecordedBy
      RotationMatchupsResult
      RouteStop
      RubricLevel
      SCHEDULE_ERROR_KINDS
      SHOWCASE_VERSION
      Showcase
      StaffPreviewBase
      StandingRow
      TEAM_CODE_LENGTH
      TEAM_NAME_FIELD
      TeamRoute
      listTeamBetReturns
      normalizeTeamCode
      pairCountKey
      pairCounts
      showcaseSchema
      teamRouteSchema
      updateTeamAs
    `,
    "solo-pruebas": `
      ImportStaffResult
      clearRouteMemo
      clearShowcaseMemo
      getHubTeam
      hubStateSchema
    `,
  },
  content: {
    "solo-pruebas": `
      getAnnouncement
      publishAndPushAnnouncement
      requestAnnouncementPush
    `,
  },
  crm: {
    "solo-pruebas": `
      countPendingRequests
      createOrganizationAs
      listOrganizationsOfPerson
      listStages
      updateOrganizationAs
    `,
  },
  forms: {
    "solo-pruebas": `
      createForm
      setFormActions
      setFormFields
    `,
  },
  identity: {
    "solo-pruebas": `
      CarnetMetadata
      getOrCreateCarnetToken
      grantPermission
      requestOtp
      resolveActor
      revokePermission
      signInWithPassword
      signOut
      verifyOtp
    `,
  },
  participation: {
    "solo-pruebas": `
      CheckInSource
      checkInLink
      grantReward
      listCheckInsForExport
      releaseReward
      rereserveReward
      reserveReward
      reverseReward
      rotatingCodeAt
      runReminders
      runWordleReminder
      secondsUntilRotation
    `,
  },
  people: {
    "solo-pruebas": `
      SanctionScope
      createCommittee
      createPersonAs
    `,
  },
  permanence: {
    "solo-pruebas": `
      applyDecisions
      computePerson
      countPendingFor
      createGroupAs
      freezeSnapshots
      getSnapshot
      listGroups
      loadPeopleFacts
      loadTermFacts
      parseResults
      recomputeSnapshots
      runNotices
    `,
  },
  system: {
    "solo-pruebas": `
      ConfigKey
      ConfigValue
      checkBackup
      setConfig
    `,
  },
  terms: {
    "solo-pruebas": `
      updateTerm
    `,
  },
};

const PRODUCTION_DIRS = ["src", "scripts", ".railway"];

function sources(dir: string) {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((name) => /\.(ts|tsx|mts|mjs)$/.test(name))
    .map((name) => ({ path: `${dir}/${name}`, text: readFileSync(`${dir}/${name}`, "utf8") }));
}

function namesOf(list: string | undefined): string[] {
  return (list ?? "").split(/\s+/).filter(Boolean);
}

/** La clase sale del código: quién importa el nombre y de qué módulo es. */
function classOf(found: ModuleInterface, name: string): FoundClass {
  if (found.testOnly.includes(name)) {
    return "solo-pruebas";
  }
  return found.module === QUIET_MODULE ? "competition" : "nadie";
}

/**
 * Lo que separa a la lista del código, una frase por caso; vacío cuando coinciden. Falla cerrado:
 * una clase que no espera una decisión se rechaza, aunque sus nombres coincidan con el código, y un
 * nombre que no importa nadie de afuera no tiene clase donde entrar (ADR-125 regla 5).
 */
function mismatches(modules: ModuleInterface[], exceptions: WrittenExceptions): string[] {
  const problems: string[] = [];
  const admitted = CLASSES.map((kind) => `«${kind}»`).join(" y ");
  for (const found of modules) {
    const written = Object.entries(exceptions[found.module] ?? {});
    for (const [kind] of written) {
      if (!(kind in WAITS)) {
        problems.push(
          `${found.module}: la lista no admite la clase «${kind}»: solo guarda lo que espera una decisión (${admitted})`,
        );
      }
    }
    const listed = new Map(
      written.flatMap(([kind, names]) => namesOf(names).map((name) => [name, kind] as const)),
    );
    for (const name of found.unused) {
      const kind = classOf(found, name);
      const where = listed.get(name);
      if (where === kind) {
        continue;
      }
      if (where) {
        problems.push(`${found.module}: \`${name}\` está como «${where}» y hoy es «${kind}»`);
      } else if (kind === "nadie") {
        problems.push(
          `${found.module}: \`${name}\` se exporta y no lo importa nadie de afuera, ni las pruebas: sale del \`index.ts\` (la lista no admite «nadie»: la poda cerró)`,
        );
      } else {
        const { decision, ledger } = WAITS[kind];
        problems.push(
          `${found.module}: \`${name}\` se exporta y nadie de producción lo importa de afuera; no está en la lista (sería «${kind}», que espera la decisión abierta ${decision}, ${ledger})`,
        );
      }
    }
    for (const [name, kind] of listed) {
      if (!found.unused.includes(name)) {
        const why = found.exported.includes(name)
          ? "ya lo importa producción de afuera o un componente del módulo"
          : "el `index.ts` ya no lo exporta";
        problems.push(`${found.module}: \`${name}\` sobra en «${kind}»: ${why}`);
      }
    }
  }
  const known = new Set(modules.map((found) => found.module));
  for (const module of Object.keys(exceptions)) {
    if (!known.has(module)) {
      problems.push(`${module}: está en la lista y no es un módulo de \`src/modules\``);
    }
  }
  return problems;
}

/**
 * Las entradas que `knip.ts` escribe en `entry`, leídas del texto. Recorre la lista pieza por pieza
 * (un texto entre comillas dobles, una coma, un comentario de renglón) hasta su `]`, y falla ante
 * cualquier otra cosa: lo que se arme de otro modo no se puede comparar con la lista.
 */
function knipEntries(text: string): string[] {
  const opening = /\bentry:\s*\[/.exec(text);
  if (!opening) {
    throw new Error("No se puede leer `entry` en knip.ts: no es una lista escrita ahí");
  }
  const piece = /\s+|,|\/\/[^\n]*|"([^"\n]*)"|(\])/y;
  const entries: string[] = [];
  let at = opening.index + opening[0].length;
  for (;;) {
    piece.lastIndex = at;
    const match = piece.exec(text);
    if (!match) {
      const unread = text.slice(at, at + 40).split("\n")[0];
      throw new Error(
        `No se puede leer \`entry\` en knip.ts: tiene algo que no es un texto (${unread})`,
      );
    }
    if (match[2]) {
      return entries;
    }
    if (match[1] !== undefined) {
      entries.push(match[1]);
    }
    at = piece.lastIndex;
  }
}

const MODULE_ENTRY = /^src\/modules\/([a-z0-9-]+)\/index\.ts$/;
/** Una entrada de knip que alcanza `src`: lo nombra o empieza por un comodín. */
const REACHES_SRC = /^(\.\/)?(src\b|[*{?[!])/;

/**
 * Lo que separa a `entry` de `knip.ts` de la lista, una frase por caso; vacío cuando coinciden.
 * knip no analiza los exports de una entrada, así que el `index.ts` de un módulo es entrada solo si
 * tiene nombres en la clase `competition`: los marcaría en cuanto saliera. Ninguna otra clase deja a
 * un módulo de entrada, tampoco una que la lista no admite (ADR-125 reglas 3 y 5).
 */
function entryMismatches(
  entry: string[],
  modules: string[],
  exceptions: WrittenExceptions,
): string[] {
  const problems: string[] = [];
  const named: string[] = [];
  for (const pattern of entry) {
    const module = MODULE_ENTRY.exec(pattern)?.[1];
    if (module && named.includes(module)) {
      problems.push(`${module}: su \`index.ts\` está dos veces en \`entry\` de knip`);
    } else if (module) {
      named.push(module);
    } else if (REACHES_SRC.test(pattern)) {
      problems.push(
        `\`${pattern}\`: una entrada de knip que alcanza \`src\` nombra el \`index.ts\` de un módulo, no un patrón ni otro archivo`,
      );
    }
  }
  for (const module of modules) {
    const quiet = namesOf(exceptions[module]?.competition).length > 0;
    if (quiet && !named.includes(module)) {
      problems.push(
        `${module}: tiene nombres en «competition» y su \`index.ts\` no está en \`entry\` de knip, que así los marcaría`,
      );
    } else if (!quiet && named.includes(module)) {
      problems.push(
        `${module}: no tiene nada en «competition» y su \`index.ts\` sigue en \`entry\` de knip, que así no analiza sus exports`,
      );
    }
  }
  for (const module of named) {
    if (!modules.includes(module)) {
      problems.push(`${module}: está en \`entry\` de knip y no es un módulo de \`src/modules\``);
    }
  }
  return problems;
}

/** Los `vi.mock` de un `index.ts` que no se dejan leer o sobrescriben un nombre que no se exporta. */
function staleMocks(found: ModuleInterfaces): string[] {
  const exported = new Map(found.modules.map((each) => [each.module, new Set(each.exported)]));
  return found.mocks.flatMap((mock) =>
    mock.names === null
      ? [`${mock.path}:${mock.line}: no se puede leer qué sobrescribe de @/modules/${mock.module}`]
      : mock.names
          .filter((name) => !exported.get(mock.module)?.has(name))
          .map(
            (name) =>
              `${mock.path}:${mock.line}: sobrescribe \`${name}\`, que @/modules/${mock.module} no exporta`,
          ),
  );
}

const file = (path: string, text: string) => ({ path, text });
const lines = (...text: string[]) => text.join("\n");

// Una casa de mentira, con cada forma de exportar un nombre y de importarlo.
const HOUSE = [
  file(
    "src/modules/alpha/index.ts",
    lines(
      'export { aliased, nobody, onlyDomain, onlyOwn, onlyTests, reexported, used } from "./domain/things";',
      'export type { QueriedType, UnusedType, UsedType } from "./domain/things";',
      'export { inner as renamed } from "./domain/things";',
      'export * from "./domain/star";',
    ),
  ),
  file(
    "src/modules/alpha/domain/star.ts",
    lines(
      "export function fromStar() {}",
      "export const starOne = 1,",
      "  starTwo = 2;",
      "export type StarType = string;",
      "export default function ignored() {}",
    ),
  ),
  file("src/modules/alpha/components/Card.tsx", 'import { onlyOwn } from "@/modules/alpha";'),
  file("src/modules/alpha/domain/reads.ts", 'import { onlyDomain } from "..";'),
  file("src/modules/beta/index.ts", 'export { reexported } from "@/modules/alpha";'),
  file(
    "src/app/page.tsx",
    lines(
      "import {",
      "  aliased as local,",
      "  type UsedType,",
      "  used,",
      '} from "@/modules/alpha";',
      'import type { StarType } from "@/modules/alpha/index";',
      'export let row: import("@/modules/alpha").QueriedType;',
      'export const label = "@/modules/alpha";',
    ),
  ),
  file("scripts/seed.ts", 'import { fromStar } from "../src/modules/alpha";'),
];
const HOUSE_TESTS = [
  file(
    "tests/unit/alpha.test.ts",
    lines(
      'import { onlyTests, used } from "@/modules/alpha";',
      'const { starTwo } = await import("@/modules/alpha");',
    ),
  ),
];
// La misma casa después de la poda: el `index.ts` de `alpha` ya no exporta lo que no importaba nadie
// de afuera, y a lo que exporta `beta` le salió un consumidor.
const PRUNED_HOUSE = [
  ...HOUSE.filter((source) => source.path !== "src/modules/alpha/index.ts"),
  file(
    "src/modules/alpha/index.ts",
    lines(
      'export { aliased, onlyOwn, onlyTests, reexported, used } from "./domain/things";',
      'export type { QueriedType, UsedType } from "./domain/things";',
      'export { fromStar, starTwo } from "./domain/star";',
      'export type { StarType } from "./domain/star";',
    ),
  ),
  file("src/app/beta/page.tsx", 'import { reexported } from "@/modules/beta";'),
];
const HOUSE_EXCEPTIONS: Exceptions = {
  alpha: { "solo-pruebas": "onlyTests starTwo" },
};
/** El aviso de un nombre que no importa nadie de afuera, ni las pruebas: no cabe en la lista. */
const nobodyImports = (module: string, name: string) =>
  `${module}: \`${name}\` se exporta y no lo importa nadie de afuera, ni las pruebas: sale del \`index.ts\` (la lista no admite «nadie»: la poda cerró)`;
/** El aviso de una clase que la lista no admite. */
const classRefused = (module: string, kind: string) =>
  `${module}: la lista no admite la clase «${kind}»: solo guarda lo que espera una decisión («solo-pruebas» y «competition»)`;

const production = PRODUCTION_DIRS.flatMap(sources);
const tests = sources("tests");
const today = moduleInterfaces(production, tests);

describe("la interfaz pública de los módulos, sobre el código de hoy", () => {
  it("un index.ts exporta lo que producción importa de afuera, más la lista de excepciones: ni un nombre más ni uno menos", () => {
    expect(mismatches(today.modules, EXCEPTIONS)).toEqual([]);
  });

  it("recorre cada módulo de src/modules, y cada uno exporta algo", () => {
    const folders = readdirSync("src/modules", { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(today.modules.map((found) => found.module)).toEqual(folders);
    expect(today.modules.filter((found) => found.exported.length === 0)).toEqual([]);
  });

  it("de los index.ts, knip solo toma de entrada el de competition, que está quieto: los otros trece salieron con la poda y knip analiza sus exports", () => {
    const entry = knipEntries(readFileSync("knip.ts", "utf8"));
    expect(
      entryMismatches(
        entry,
        today.modules.map((found) => found.module),
        EXCEPTIONS,
      ),
    ).toEqual([]);
    expect(entry.filter((pattern) => MODULE_ENTRY.test(pattern))).toEqual([
      `src/modules/${QUIET_MODULE}/index.ts`,
    ]);
  });

  it("la poda cerró: ningún index.ts exporta un nombre que no importe nadie de afuera, ni las pruebas, y en la lista solo queda lo que espera una decisión", () => {
    const nobody = today.modules.flatMap((found) =>
      found.unused
        .filter((name) => classOf(found, name) === "nadie")
        .map((name) => `${found.module}: ${name}`),
    );
    expect(nobody).toEqual([]);
    const written = new Set(Object.values(EXCEPTIONS).flatMap((classes) => Object.keys(classes)));
    expect([...written].sort()).toEqual(["competition", "solo-pruebas"]);
  });

  it("cada nombre de la lista está una sola vez en su módulo y en orden", () => {
    for (const [module, classes] of Object.entries(EXCEPTIONS)) {
      const all = CLASSES.flatMap((kind) => namesOf(classes[kind]));
      expect(
        all.filter((name, position) => all.indexOf(name) !== position),
        module,
      ).toEqual([]);
      for (const kind of CLASSES) {
        const names = namesOf(classes[kind]);
        expect(names, `${module} · ${kind}`).toEqual([...names].sort());
      }
    }
  });

  it("nadie toma un index.ts entero: un import *, un import() sin desestructurar o un typeof import() usan nombres que la cuenta no ve", () => {
    expect(today.opaque).toEqual([]);
  });

  it("un vi.mock de un index.ts se deja leer y solo sobrescribe nombres que ese index.ts exporta: sobre un nombre podado no tendría efecto", () => {
    expect(staleMocks(today)).toEqual([]);
    expect(today.mocks.length).toBeGreaterThan(0);
  });

  it("una clave sembrada en el objeto que un vi.mock de verdad esparce con `...`, sin tocar el archivo, sale como nombre que el index.ts no exporta", () => {
    const path = "tests/unit/competition-hub-api.test.ts";
    const hoisted = "const competitionModule = vi.hoisted(() => ({";
    const seeded = tests.map((source) =>
      source.path === path
        ? file(path, source.text.replace(hoisted, `${hoisted}\n  seededKey: vi.fn(),`))
        : source,
    );
    const stale = staleMocks(moduleInterfaces(production, seeded));
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain(`${path}:`);
    expect(stale[0]).toContain("sobrescribe `seededKey`, que @/modules/competition no exporta");
  });

  it("un export sembrado en un index.ts de verdad, sin tocar el archivo, pone la lista en rojo, y no se tapa escribiéndolo en la lista ni devolviendo el módulo a la entrada de knip", () => {
    const seeded = moduleInterfaces(
      production.map((source) =>
        source.path === "src/modules/terms/index.ts"
          ? file(source.path, `${source.text}\nexport { seededExport } from "./domain/terms";\n`)
          : source,
      ),
      tests,
    ).modules;
    expect(mismatches(seeded, EXCEPTIONS)).toEqual([nobodyImports("terms", "seededExport")]);

    const covered = { ...EXCEPTIONS, terms: { ...EXCEPTIONS.terms, nadie: "seededExport" } };
    expect(mismatches(seeded, covered)).toEqual([classRefused("terms", "nadie")]);
    expect(
      entryMismatches(
        [...knipEntries(readFileSync("knip.ts", "utf8")), "src/modules/terms/index.ts"],
        seeded.map((found) => found.module),
        covered,
      ),
    ).toEqual([
      "terms: no tiene nada en «competition» y su `index.ts` sigue en `entry` de knip, que así no analiza sus exports",
    ]);
  });
});

describe("la cuenta de la interfaz pública, sobre una casa de mentira", () => {
  it("cuenta como uso el import con nombre, el de tipo, el alias, el reexport, el relativo y el tipo consultado; el de un componente propio salva el nombre; el de un archivo de dominio del módulo y el de una prueba, no", () => {
    expect(moduleInterfaces(HOUSE, HOUSE_TESTS).modules).toEqual([
      {
        module: "alpha",
        exported: [
          "QueriedType",
          "StarType",
          "UnusedType",
          "UsedType",
          "aliased",
          "fromStar",
          "nobody",
          "onlyDomain",
          "onlyOwn",
          "onlyTests",
          "reexported",
          "renamed",
          "starOne",
          "starTwo",
          "used",
        ],
        unused: [
          "UnusedType",
          "nobody",
          "onlyDomain",
          "onlyTests",
          "renamed",
          "starOne",
          "starTwo",
        ],
        testOnly: ["onlyTests", "starTwo"],
        ownComponentOnly: ["onlyOwn"],
      },
      {
        module: "beta",
        exported: ["reexported"],
        unused: ["reexported"],
        testOnly: [],
        ownComponentOnly: [],
      },
    ]);
  });

  it("un export nuevo que nadie importa pone la lista en rojo, y deja de hacerlo cuando alguien de afuera lo importa", () => {
    const pruned = moduleInterfaces(PRUNED_HOUSE, HOUSE_TESTS).modules;
    expect(mismatches(pruned, HOUSE_EXCEPTIONS)).toEqual([]);

    const seeded = PRUNED_HOUSE.map((source) =>
      source.path === "src/modules/alpha/index.ts"
        ? file(source.path, `${source.text}\nexport { seeded } from "./domain/things";`)
        : source,
    );
    expect(mismatches(moduleInterfaces(seeded, HOUSE_TESTS).modules, HOUSE_EXCEPTIONS)).toEqual([
      nobodyImports("alpha", "seeded"),
    ]);

    const consumed = [
      ...seeded,
      file("src/app/other/page.tsx", 'import { seeded } from "@/modules/alpha";'),
    ];
    expect(mismatches(moduleInterfaces(consumed, HOUSE_TESTS).modules, HOUSE_EXCEPTIONS)).toEqual(
      [],
    );
  });

  it("la lista no guarda lo que no importa nadie: la casa sin podar cae en rojo nombre por nombre, y una clase que no espera una decisión se rechaza aunque sus nombres coincidan con el código", () => {
    const unpruned = moduleInterfaces(HOUSE, HOUSE_TESTS).modules;
    expect(mismatches(unpruned, HOUSE_EXCEPTIONS)).toEqual([
      nobodyImports("alpha", "UnusedType"),
      nobodyImports("alpha", "nobody"),
      nobodyImports("alpha", "onlyDomain"),
      nobodyImports("alpha", "renamed"),
      nobodyImports("alpha", "starOne"),
      nobodyImports("beta", "reexported"),
    ]);
    expect(
      mismatches(unpruned, {
        alpha: {
          nadie: "UnusedType nobody onlyDomain renamed starOne",
          "solo-pruebas": "onlyTests starTwo",
        },
        beta: { nadie: "reexported", pendiente: "" },
      }),
    ).toEqual([
      classRefused("alpha", "nadie"),
      classRefused("beta", "nadie"),
      classRefused("beta", "pendiente"),
    ]);
  });

  it("una excepción que sobra, una que perdió la prueba que la importaba y un módulo que no existe ponen la lista en rojo", () => {
    const listed: Exceptions = {
      alpha: { "solo-pruebas": "gone onlyTests starTwo used" },
      gamma: { "solo-pruebas": "anything" },
    };
    expect(mismatches(moduleInterfaces(PRUNED_HOUSE, HOUSE_TESTS).modules, listed)).toEqual([
      "alpha: `gone` sobra en «solo-pruebas»: el `index.ts` ya no lo exporta",
      "alpha: `used` sobra en «solo-pruebas»: ya lo importa producción de afuera o un componente del módulo",
      "gamma: está en la lista y no es un módulo de `src/modules`",
    ]);
    expect(mismatches(moduleInterfaces(PRUNED_HOUSE, []).modules, HOUSE_EXCEPTIONS)).toEqual([
      "alpha: `onlyTests` está como «solo-pruebas» y hoy es «nadie»",
      "alpha: `starTwo` está como «solo-pruebas» y hoy es «nadie»",
    ]);
  });

  it("la entrada de knip sigue a la lista: solo entra el index.ts del módulo con nombres en «competition»; un patrón, un módulo podado que sigue de entrada, el quieto que falta, uno repetido y uno que no existe la ponen en rojo", () => {
    const modules = ["alpha", "beta", "competition", "gamma"];
    const exceptions: Exceptions = {
      alpha: { "solo-pruebas": "onlyTests" },
      competition: { competition: "quiet" },
    };
    const index = (module: string) => `src/modules/${module}/index.ts`;
    const elsewhere = ["scripts/bench.ts", "tests/e2e/auth.setup.ts", ".railway/**/*.ts"];
    const stays = (module: string) =>
      `${module}: no tiene nada en «competition» y su \`index.ts\` sigue en \`entry\` de knip, que así no analiza sus exports`;
    const missing =
      "competition: tiene nombres en «competition» y su `index.ts` no está en `entry` de knip, que así los marcaría";
    const pattern = (entry: string) =>
      `\`${entry}\`: una entrada de knip que alcanza \`src\` nombra el \`index.ts\` de un módulo, no un patrón ni otro archivo`;
    expect(entryMismatches([...elsewhere, index("competition")], modules, exceptions)).toEqual([]);
    expect(entryMismatches([], ["alpha", "beta", "gamma"], exceptions)).toEqual([]);

    expect(entryMismatches(["src/modules/*/index.ts"], modules, exceptions)).toEqual([
      pattern("src/modules/*/index.ts"),
      missing,
    ]);
    for (const entry of ["**/index.ts", "{src,scripts}/**/*.ts", "src/modules/alpha/admin.ts"]) {
      expect(entryMismatches([entry, index("competition")], modules, exceptions)).toEqual([
        pattern(entry),
      ]);
    }
    // Lo que solo importan las pruebas no deja a un módulo de entrada, y escribirle «nadie» tampoco.
    const both = [index("alpha"), index("competition")];
    expect(entryMismatches(both, modules, exceptions)).toEqual([stays("alpha")]);
    expect(entryMismatches(both, modules, { ...exceptions, alpha: { nadie: "nobody" } })).toEqual([
      stays("alpha"),
    ]);
    expect(
      entryMismatches(
        [index("alpha"), index("beta"), index("gamma"), index("alpha"), index("delta")],
        modules,
        exceptions,
      ),
    ).toEqual([
      "alpha: su `index.ts` está dos veces en `entry` de knip",
      stays("alpha"),
      stays("beta"),
      missing,
      stays("gamma"),
      "delta: está en `entry` de knip y no es un módulo de `src/modules`",
    ]);
  });

  it("lee las entradas de knip del texto de knip.ts, sin los comentarios, y falla si entry no es una lista de textos escritos ahí", () => {
    const config = (entry: string) =>
      lines("const config: KnipConfig = {", entry, '  project: ["src/**/*.ts"],', "};");
    expect(
      knipEntries(
        config(
          lines(
            "  entry: [",
            '    // Un comentario que nombra "src/modules/*/index.ts" no es una entrada.',
            "    // Tampoco corta la lista un comentario con un corchete: [nota].",
            '    "scripts/bench.ts",',
            '    "src/modules/alpha/index.ts",',
            '    ".railway/**/*.ts",',
            "  ],",
          ),
        ),
      ),
    ).toEqual(["scripts/bench.ts", "src/modules/alpha/index.ts", ".railway/**/*.ts"]);
    expect(knipEntries(config("  entry: [],"))).toEqual([]);
    expect(() =>
      knipEntries(config('  entry: [...MODULES.map(index), "scripts/bench.ts"],')),
    ).toThrow("tiene algo que no es un texto");
    expect(() =>
      knipEntries(config('  entry: ["scripts/bench.ts", `src/modules/alpha/index.ts`],')),
    ).toThrow("tiene algo que no es un texto");
    expect(() =>
      knipEntries(config('  entry: ["scripts/bench.ts", /* ] */ "src/modules/*/index.ts"],')),
    ).toThrow("tiene algo que no es un texto");
    expect(() => knipEntries('const config = { entry: ["scripts/bench.ts",')).toThrow(
      "tiene algo que no es un texto",
    );
    expect(() => knipEntries(config("  entry: ENTRIES,"))).toThrow("no es una lista escrita ahí");
    expect(() => knipEntries(config(""))).toThrow("no es una lista escrita ahí");
  });

  it("lo de competition que nadie importa va en su propia clase, y lo que solo importa una prueba, en solo-pruebas: el que quedó en la otra pone la lista en rojo, y el que falta sale con la decisión que espera su clase", () => {
    const { modules } = moduleInterfaces(
      [file("src/modules/competition/index.ts", 'export { quiet, tested } from "./domain/hub";')],
      [file("tests/unit/hub.test.ts", 'import { tested } from "@/modules/competition";')],
    );
    expect(
      mismatches(modules, { competition: { competition: "quiet", "solo-pruebas": "tested" } }),
    ).toEqual([]);
    expect(
      mismatches(modules, { competition: { competition: "tested", "solo-pruebas": "quiet" } }),
    ).toEqual([
      "competition: `quiet` está como «solo-pruebas» y hoy es «competition»",
      "competition: `tested` está como «competition» y hoy es «solo-pruebas»",
    ]);
    expect(mismatches(modules, {})).toEqual([
      "competition: `quiet` se exporta y nadie de producción lo importa de afuera; no está en la lista (sería «competition», que espera la decisión abierta 8, DT-360)",
      "competition: `tested` se exporta y nadie de producción lo importa de afuera; no está en la lista (sería «solo-pruebas», que espera la decisión abierta 73, DT-359)",
    ]);
  });

  it("avisa de lo que no puede seguir, en producción y en pruebas: import *, import por defecto, export *, import() sin desestructurar, require y typeof import()", () => {
    const { opaque } = moduleInterfaces(
      [
        file("src/modules/alpha/index.ts", 'export { used } from "./domain/things";'),
        file(
          "src/app/whole.ts",
          lines(
            'import * as alpha from "@/modules/alpha";',
            'import whole from "@/modules/alpha";',
            'export * from "@/modules/alpha";',
            'const later = await import("@/modules/alpha");',
            'type Whole = typeof import("@/modules/alpha");',
          ),
        ),
      ],
      [file("tests/unit/whole.test.ts", 'const alpha = require("@/modules/alpha");')],
    );
    expect(opaque.map(({ path, line, how }) => `${path}:${line} ${how}`)).toEqual([
      'src/app/whole.ts:1 import * as alpha from "@/modules/alpha";',
      'src/app/whole.ts:2 import whole from "@/modules/alpha";',
      'src/app/whole.ts:3 export * from "@/modules/alpha";',
      'src/app/whole.ts:4 import("@/modules/alpha")',
      'src/app/whole.ts:5 typeof import("@/modules/alpha")',
      'tests/unit/whole.test.ts:1 require("@/modules/alpha")',
    ]);
  });

  it("lee lo que sobrescribe un vi.mock: el objeto literal y el que llega por vi.hoisted, sin lo que trae el módulo de verdad; un mock no es un import", () => {
    const { mocks, opaque, modules } = moduleInterfaces(
      [file("src/modules/alpha/index.ts", 'export { other, used } from "./domain/things";')],
      [
        file(
          "tests/unit/mocks.test.ts",
          lines(
            "const whole = vi.hoisted(() => ({ used: vi.fn() }));",
            'vi.mock("@/modules/alpha", () => whole);',
            'vi.mock("@/modules/alpha", async (importOriginal) => ({',
            '  ...(await importOriginal<typeof import("@/modules/alpha")>()),',
            "  other: vi.fn(),",
            "  gone: vi.fn(),",
            "}));",
            'vi.mock("@/modules/alpha", async (importOriginal) => {',
            '  const mod = await importOriginal<typeof import("@/modules/alpha")>();',
            "  return { ...mod, used: () => null };",
            "});",
            'vi.mock("@/modules/alpha");',
            'vi.mock("@/modules/alpha", () => build());',
          ),
        ),
      ],
    );
    expect(mocks.map((mock) => [mock.line, mock.names])).toEqual([
      [2, ["used"]],
      [3, ["other", "gone"]],
      [8, ["used"]],
      [12, []],
      [13, null],
    ]);
    expect(opaque).toEqual([]);
    expect(modules.map((found) => found.testOnly)).toEqual([[]]);
  });

  it("sigue lo que entra a la fábrica de un vi.mock con `...`: suma las claves de una constante o de un vi.hoisted, deja pasar el index.ts de verdad y los archivos del propio módulo, y no da por leído lo demás", () => {
    const { mocks } = moduleInterfaces(
      [
        file("src/modules/alpha/index.ts", 'export { other, used } from "./domain/things";'),
        file("src/modules/alpha/domain/things.ts", "export const inner = 0, other = 1, used = 2;"),
        file("src/modules/beta/index.ts", 'export { foreign } from "./domain/things";'),
        file("src/shared/kit.ts", "export const kit = 1;"),
      ],
      [
        file(
          "tests/unit/spreads.test.ts",
          lines(
            "const hoisted = vi.hoisted(() => ({ used: vi.fn(), gone: vi.fn() }));",
            "const plain = { other: 1 };",
            'vi.mock("@/modules/alpha", async () => {',
            '  const pure = await vi.importActual<typeof import("@/modules/alpha/domain/things")>(',
            '    "@/modules/alpha/domain/things",',
            "  );",
            "  return { ...hoisted, other: pure.other };",
            "});",
            'vi.mock("@/modules/alpha", () => ({ ...plain, used: vi.fn() }));',
            'vi.mock("@/modules/alpha", async () => ({',
            '  ...(await import("@/modules/alpha/domain/things")),',
            '  ...(await vi.importActual("../../src/modules/alpha/domain/things")),',
            "  used: vi.fn(),",
            "}));",
            'vi.mock("@/modules/alpha", async () => ({',
            '  ...(await vi.importActual<typeof import("@/modules/alpha")>("@/modules/alpha")),',
            '  ...(await import("@/modules/alpha")),',
            "  other: vi.fn(),",
            "}));",
            'vi.mock("@/modules/alpha", async () => ({ ...(await import("@/shared/kit")), used: 1 }));',
            'vi.mock("@/modules/alpha", async () => ({ ...(await import("@/modules/alpha/domain/missing")), used: 1 }));',
            'vi.mock("@/modules/alpha", async () => ({ ...(await import("@/modules/beta/domain/things")), used: 1 }));',
            'vi.mock("@/modules/alpha", () => ({ ...build(), used: 1 }));',
            'vi.mock("@/modules/alpha", async () => ({ ...(await importOriginal()), used: 1 }));',
            'vi.mock("@/modules/alpha", () => ({ ...unknown, used: 1 }));',
          ),
        ),
      ],
    );
    expect(mocks.map((mock) => [mock.line, mock.names])).toEqual([
      [3, ["used", "gone", "other"]],
      [9, ["other", "used"]],
      [10, ["used"]],
      [15, ["other"]],
      [20, null],
      [21, null],
      [22, null],
      [23, null],
      [24, null],
      [25, null],
    ]);
  });

  it("dentro de la fábrica de un vi.mock solo deja de contar la carga del módulo que se simula; la de otro módulo cuenta, y vi.importActual y vi.importMock cargan un index.ts como un import()", () => {
    const { modules, opaque } = moduleInterfaces(
      [
        file("src/modules/alpha/index.ts", 'export { mocked, viaActual } from "./domain/things";'),
        file(
          "src/modules/beta/index.ts",
          'export { inFactory, untouched } from "./domain/things";',
        ),
      ],
      [
        file(
          "tests/unit/loads.test.ts",
          lines(
            'vi.mock("@/modules/alpha", async () => {',
            '  const { inFactory } = await import("@/modules/beta");',
            "  return { mocked: inFactory };",
            "});",
            'const { viaActual } = await vi.importActual<typeof import("@/modules/alpha")>(',
            '  "@/modules/alpha",',
            ");",
            'const whole = await vi.importMock("@/modules/beta");',
          ),
        ),
      ],
    );
    expect(modules.map((found) => [found.module, found.testOnly])).toEqual([
      ["alpha", ["viaActual"]],
      ["beta", ["inFactory"]],
    ]);
    expect(opaque.map(({ path, line, how }) => `${path}:${line} ${how}`)).toEqual([
      'tests/unit/loads.test.ts:8 vi.importMock("@/modules/beta")',
    ]);
  });

  it("cuenta un export namespace y el export por defecto del propio index.ts, y falla ante un export que no sabe nombrar, en vez de contar de menos", () => {
    const index = (...text: string[]) => [file("src/modules/alpha/index.ts", lines(...text))];
    const { modules } = moduleInterfaces(
      index(
        "export namespace Grouped {",
        "  export const inner = 1;",
        "}",
        "export default function whole() {}",
      ),
      [],
    );
    expect(modules.map((found) => found.exported)).toEqual([["Grouped", "default"]]);
    expect(moduleInterfaces(index("export default 1;"), []).modules[0]?.exported).toEqual([
      "default",
    ]);

    expect(() => moduleInterfaces(index("export const { a, b } = pair;"), [])).toThrow(
      "desestructuración",
    );
    expect(() => moduleInterfaces(index('export module "quoted" {}'), [])).toThrow(
      "no sabe nombrar",
    );
    expect(() => moduleInterfaces(index("export = whole;"), [])).toThrow("no sabe nombrar");
  });

  it("falla si no puede seguir un export *, en vez de contar de menos", () => {
    expect(() =>
      moduleInterfaces(
        [file("src/modules/alpha/index.ts", 'export * from "./domain/missing";')],
        [],
      ),
    ).toThrow("export *");
  });
});
