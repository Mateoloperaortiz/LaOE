import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import knipConfig from "../../knip";
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
 * La configuración de knip ya evaluada: la prueba importa `knip.ts`, no lee su texto, así que ve
 * también lo que se arme con código. Falla cerrado: si no es un objeto, o su `entry` no es una lista
 * de textos, no la da por leída.
 */
function knipOptions(config: unknown): { entry: string[]; rest: Record<string, unknown> } {
  const { entry, ...rest } = knipObject(config);
  if (!Array.isArray(entry) || !entry.every((each): each is string => typeof each === "string")) {
    throw new Error("No se puede leer `entry` en knip.ts: no es una lista de textos");
  }
  return { entry, rest };
}

function knipObject(config: unknown): Record<string, unknown> {
  if (typeof config !== "object" || config === null) {
    throw new Error("No se puede leer knip.ts: su configuración no es un objeto");
  }
  return config as Record<string, unknown>;
}

/**
 * Las opciones que `knip.ts` puede traer, cada una con su razón: por qué está y por qué no le quita a
 * knip el `index.ts` de un módulo. Van las claves a cualquier profundidad, con la ruta de las que las
 * contienen. Una opción nueva pone la prueba en rojo hasta que entre acá con la suya, y una que
 * `knip.ts` ya no trae, también: así no pasa callada la que apaga el análisis sin nombrar un archivo
 * (`exclude`, `rules`) ni la que trae sus propios patrones (un plugin, `ignore`, `workspaces`). La
 * prueba no juzga la razón: la lee quien revisa el diff (ADR-125 regla 3).
 */
const KNIP_OPTIONS: Record<string, string> = {
  entry:
    "Lo que knip no descubre solo. De los `index.ts` de los módulos solo entra el de `competition`: lo comprueba `entryMismatches`.",
  project:
    "Los archivos que knip analiza. Es la única opción que alcanza un `index.ts` sin taparlo, y por eso no se interpreta: `projectMismatches` la compara entera con `KNIP_PROJECT`.",
  compilers: "knip no lee CSS: lleva un compilador por extensión, y cada extensión entra acá.",
  "compilers › css":
    "Saca los `@import` de Tailwind para que cuenten como uso. Solo recibe archivos `.css`.",
  ignoreDependencies: "Nombra paquetes de `package.json`, no archivos.",
  ignoreBinaries: "Nombra binarios del sistema (`openssl`, `uv`), no archivos.",
  ignoreExportsUsedInFile:
    "Calla el export que se usa en el archivo que lo define. Un `index.ts` reexporta y no usa lo que exporta: knip sigue marcando ahí el nombre sin uso (ADR-125 regla 3, «Podar no es borrar»).",
};

/**
 * Los archivos que knip analiza, tal como los trae `knip.ts`. A un `index.ts` se lo puede sacar de
 * ahí sin que expandir el patrón lo muestre: negando su carpeta (`!src/modules/terms`), con una
 * sintaxis que el glob de knip expande y el de Node no (`!src/modules/(terms|zz)/**`), o dejando de
 * incluirlo (`src/modules/!(terms)/**`). Por eso `project` no se interpreta: se compara entero con
 * esta lista. Quien lo cambie cambia la lista en el mismo diff, y ahí lo lee quien revisa (ADR-125
 * regla 3).
 */
const KNIP_PROJECT = [
  "src/**/*.{ts,tsx,css}",
  "scripts/**/*.{ts,mjs}",
  "tests/**/*.ts",
  ".railway/**/*.ts",
];

/** Lo que separa al `project` de `knip.ts` de la lista; vacío cuando son el mismo, en el mismo orden. */
function projectMismatches(config: unknown, pinned: string[]): string[] {
  const { project } = knipObject(config);
  const same =
    Array.isArray(project) &&
    project.length === pinned.length &&
    project.every((pattern, index) => pattern === pinned[index]);
  return same
    ? []
    : [
        "`project`: knip.ts no trae los patrones de la lista `KNIP_PROJECT`; si knip tiene que analizar otros archivos, la lista cambia en el mismo diff, después de comprobar que sigue marcando un export sembrado en el `index.ts` de un módulo",
      ];
}

/** Las claves de la configuración de knip, a cualquier profundidad, con la ruta de las que las contienen. */
function knipKeys(value: unknown, where: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((each) => knipKeys(each, where));
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, inner]) => [
    [...where, key].join(" › "),
    ...knipKeys(inner, [...where, key]),
  ]);
}

/**
 * Lo que separa a las opciones de `knip.ts` de la lista, una frase por caso; vacío cuando coinciden.
 * Falla cerrado: la opción que la lista no trae no se admite, sea la que sea.
 */
function optionMismatches(config: unknown, admitted: Record<string, string>): string[] {
  const found = knipKeys(knipObject(config));
  const problems: string[] = [];
  for (const key of found) {
    if (!Object.hasOwn(admitted, key)) {
      problems.push(
        `\`${key}\`: knip.ts trae una opción que no está en la lista; entra con su razón, que dice por qué no le quita a knip el \`index.ts\` de un módulo`,
      );
    }
  }
  for (const [key, reason] of Object.entries(admitted)) {
    if (!found.includes(key)) {
      problems.push(`\`${key}\`: sobra en la lista: knip.ts ya no trae esa opción`);
    } else if (reason.trim() === "") {
      problems.push(`\`${key}\`: está en la lista sin su razón`);
    }
  }
  return problems;
}

/** Un texto de la configuración de knip, con la opción donde está escrito. */
type KnipText = { where: string; pattern: string; includes: boolean };

/**
 * Todo texto de la configuración de knip, sea valor o clave y a cualquier profundidad: `ignore`, la
 * entrada de un plugin o de un workspace, la clave de `ignoreIssues`. `includes` marca el patrón de
 * un `project` que suma archivos al análisis: el único que alcanza un `index.ts` sin taparlo.
 */
function knipTexts(value: unknown, where: string[] = [], inProject = false): KnipText[] {
  if (typeof value === "string") {
    const includes = inProject && !value.startsWith("!");
    return [{ where: where.join(" › "), pattern: value, includes }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((each) => knipTexts(each, where, inProject));
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, inner]) => [
    { where: where.join(" › "), pattern: key, includes: false },
    ...knipTexts(inner, [...where, key], key === "project"),
  ]);
}

const MODULE_ENTRY = /^src\/modules\/([a-z0-9-]+)\/index\.ts$/;

/**
 * Si un patrón de knip alcanza un archivo. Se expande contra la ruta y no se mira su forma, que es lo
 * que hace knip: un comodín en medio de `src` o un corchete (`sr[c]/modules/terms/index.ts`) nombran
 * un `index.ts` sin empezar por `src`. Antes de expandirlo se lee como lo lee knip.
 */
function reaches(pattern: string, path: string): boolean {
  const bare = asKnipReadsIt(pattern);
  return bare === path || posix.matchesGlob(path, bare);
}

/**
 * Un patrón como lo deja knip antes de expandirlo (`prependDirToPatterns`, knip 6.34): sin el `!` del
 * final, que es su sufijo de producción y fuera de ese modo no cuenta; relativo a la raíz si llega
 * como ruta absoluta; y con los `./` y los `..` resueltos. La negación del principio tampoco cambia a
 * qué archivo apunta. La raíz es la carpeta desde donde corren knip y esta prueba.
 */
function asKnipReadsIt(pattern: string): string {
  const bare = pattern.replace(/^!/, "").replace(/!$/, "");
  return posix.isAbsolute(bare) ? posix.relative(process.cwd(), bare) : posix.normalize(bare);
}

/**
 * Si una entrada de knip no puede alcanzar `src`, por cómo está escrita: su primera carpeta es un
 * nombre literal que no es `src` y en ninguna parte sube con `..`. Así, la expanda el glob que la
 * expanda, se queda bajo esa carpeta. Todo lo demás se trata como si alcanzara `src`: falla cerrado
 * ante una sintaxis que el glob de knip expande y el de Node no, como `(src)/modules/terms/index.ts`.
 */
function staysOutOfSrc(pattern: string): boolean {
  const bare = asKnipReadsIt(pattern);
  const first = bare.split("/")[0] ?? "";
  return /^[\w.-]+$/.test(first) && first !== "src" && first !== "." && !bare.includes("..");
}

/**
 * Lo que separa a `knip.ts` de la lista, una frase por caso; vacío cuando coinciden. knip no analiza
 * los exports de una entrada, así que el `index.ts` de un módulo es entrada solo si tiene nombres en
 * la clase `competition`: los marcaría en cuanto saliera. Ninguna otra clase deja a un módulo de
 * entrada, tampoco una que la lista no admite. Y fuera de `entry` ningún texto de la configuración
 * alcanza el `index.ts` de un módulo, salvo el `project` que lo incluye: la entrada de un plugin o
 * de un workspace, `ignore`, `ignoreIssues` y un `project` que lo niega también lo sacan del
 * análisis (ADR-125 reglas 3 y 5).
 */
function entryMismatches(
  config: unknown,
  modules: string[],
  exceptions: WrittenExceptions,
): string[] {
  const { entry, rest } = knipOptions(config);
  const problems: string[] = [];
  const named: string[] = [];
  const reached = (pattern: string) =>
    modules.filter((module) => reaches(pattern, `src/modules/${module}/index.ts`));
  for (const pattern of entry) {
    const module = MODULE_ENTRY.exec(pattern)?.[1];
    if (module && named.includes(module)) {
      problems.push(`${module}: su \`index.ts\` está dos veces en \`entry\` de knip`);
    } else if (module) {
      named.push(module);
    } else if (!staysOutOfSrc(pattern) || reached(pattern).length > 0) {
      problems.push(
        `\`${pattern}\`: una entrada de knip que alcanza \`src\` nombra el \`index.ts\` de un módulo, no un patrón ni otro archivo`,
      );
    }
  }
  for (const { where, pattern, includes } of knipTexts(rest)) {
    const hit = includes ? [] : reached(pattern);
    if (hit.length > 0) {
      problems.push(
        `\`${pattern}\`${where ? `, en \`${where}\`` : ""}: fuera de \`entry\`, nada en knip.ts alcanza el \`index.ts\` de un módulo (${hit.join(", ")}), o knip deja de analizar sus exports`,
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
    expect(
      entryMismatches(
        knipConfig,
        today.modules.map((found) => found.module),
        EXCEPTIONS,
      ),
    ).toEqual([]);
    const { entry } = knipOptions(knipConfig);
    expect(entry.filter((pattern) => MODULE_ENTRY.test(pattern))).toEqual([
      `src/modules/${QUIET_MODULE}/index.ts`,
    ]);
  });

  it("knip.ts trae solo las opciones de la lista, cada una con su razón: una nueva, como exclude, rules, ignore o un plugin, no entra sin decir por qué no le quita a knip el index.ts de un módulo", () => {
    expect(optionMismatches(knipConfig, KNIP_OPTIONS)).toEqual([]);
    const unlisted = (key: string) =>
      `\`${key}\`: knip.ts trae una opción que no está en la lista; entra con su razón, que dice por qué no le quita a knip el \`index.ts\` de un módulo`;
    for (const [key, value] of Object.entries({
      exclude: ["exports"],
      ignore: ["tests/fixtures/**"],
      ignoreWorkspaces: ["packages/*"],
      next: true,
    })) {
      expect(optionMismatches({ ...knipConfig, [key]: value }, KNIP_OPTIONS)).toEqual([
        unlisted(key),
      ]);
    }
    expect(optionMismatches({ ...knipConfig, rules: { exports: "off" } }, KNIP_OPTIONS)).toEqual([
      unlisted("rules"),
      unlisted("rules › exports"),
    ]);
  });

  it("knip analiza los archivos de la lista: project no cambia sin que cambie ella, niegue un módulo, lo deje de incluir o lo escriba con otra sintaxis", () => {
    expect(projectMismatches(knipConfig, KNIP_PROJECT)).toEqual([]);
    const changed = [
      "`project`: knip.ts no trae los patrones de la lista `KNIP_PROJECT`; si knip tiene que analizar otros archivos, la lista cambia en el mismo diff, después de comprobar que sigue marcando un export sembrado en el `index.ts` de un módulo",
    ];
    for (const project of [
      [...KNIP_PROJECT, "!src/modules/terms"],
      [...KNIP_PROJECT, "!src/modules/terms/"],
      [...KNIP_PROJECT, "!src/modules/{terms,zz}"],
      [...KNIP_PROJECT, "!src/modules/(terms|zz)/**"],
      ["src/modules/!(terms)/**/*.{ts,tsx,css}", ...KNIP_PROJECT.slice(1)],
      KNIP_PROJECT.slice(1),
      [...KNIP_PROJECT].reverse(),
      KNIP_PROJECT[0],
      undefined,
    ]) {
      expect(projectMismatches({ ...knipConfig, project }, KNIP_PROJECT)).toEqual(changed);
    }
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
    const { entry, rest } = knipOptions(knipConfig);
    const modules = seeded.map((found) => found.module);
    expect(
      entryMismatches(
        { ...rest, entry: [...entry, "src/modules/terms/index.ts"] },
        modules,
        covered,
      ),
    ).toEqual([
      "terms: no tiene nada en «competition» y su `index.ts` sigue en `entry` de knip, que así no analiza sus exports",
    ]);
    // Tampoco por otra opción de knip.ts: lo que alcanza un `index.ts` se ve aunque no esté en `entry`.
    expect(
      entryMismatches({ ...rest, entry, ignore: ["src/modules/terms/index.ts"] }, modules, covered),
    ).toEqual([
      "`src/modules/terms/index.ts`, en `ignore`: fuera de `entry`, nada en knip.ts alcanza el `index.ts` de un módulo (terms), o knip deja de analizar sus exports",
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
    const knip = (...entry: string[]) => ({ entry });
    expect(entryMismatches(knip(...elsewhere, index("competition")), modules, exceptions)).toEqual(
      [],
    );
    expect(entryMismatches(knip(), ["alpha", "beta", "gamma"], exceptions)).toEqual([]);

    expect(entryMismatches(knip("src/modules/*/index.ts"), modules, exceptions)).toEqual([
      pattern("src/modules/*/index.ts"),
      missing,
    ]);
    // El patrón se expande, no se mira su forma: un comodín en medio de `src` o un corchete nombran
    // un `index.ts` igual que el patrón de siempre, sin empezar por `src` ni por un comodín.
    for (const entry of [
      "**/index.ts",
      "{src,scripts}/**/*.ts",
      "src/modules/alpha/admin.ts",
      "s*/modules/*/index.ts",
      "sr[c]/modules/alpha/index.ts",
      "s?c/modules/{beta,gamma}/index.ts",
      // Y se lee como lo lee knip: una ruta absoluta nombra el mismo archivo, también con su sufijo.
      `${process.cwd()}/src/modules/alpha/index.ts`,
      `${process.cwd()}/src/modules/*/index.ts!`,
      "scripts/../src/modules/alpha/index.ts",
      // Y falla cerrado ante lo que el glob de knip expande y el de Node no: la primera carpeta de
      // una entrada es un nombre literal que no es `src`, y no sube con `..`.
      "(src)/modules/alpha/index.ts",
      "+(src)/modules/alpha/index.ts",
      "(scripts|src)/**/*.ts",
      "tests/{..,e2e}/src/modules/alpha/index.ts",
      ".",
    ]) {
      expect(entryMismatches(knip(entry, index("competition")), modules, exceptions)).toEqual([
        pattern(entry),
      ]);
    }
    // Lo que solo importan las pruebas no deja a un módulo de entrada, y escribirle «nadie» tampoco.
    const both = knip(index("alpha"), index("competition"));
    expect(entryMismatches(both, modules, exceptions)).toEqual([stays("alpha")]);
    expect(entryMismatches(both, modules, { ...exceptions, alpha: { nadie: "nobody" } })).toEqual([
      stays("alpha"),
    ]);
    expect(
      entryMismatches(
        knip(index("alpha"), index("beta"), index("gamma"), index("alpha"), index("delta")),
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

  it("fuera de entry, ninguna opción de knip.ts alcanza el index.ts de un módulo: la entrada de un plugin o de un workspace, también con el sufijo «!» de knip o como ruta absoluta, ignore, la clave de ignoreIssues y un project que lo niega la ponen en rojo; el project que lo incluye y lo que no alcanza ninguno, no", () => {
    const modules = ["alpha", "beta", "competition", "gamma"];
    const exceptions: Exceptions = { competition: { competition: "quiet" } };
    const index = (module: string) => `src/modules/${module}/index.ts`;
    const knip = (rest: Record<string, unknown>) => ({ entry: [index("competition")], ...rest });
    const outside = (pattern: string, where: string, reached: string) =>
      `\`${pattern}\`, en \`${where}\`: fuera de \`entry\`, nada en knip.ts alcanza el \`index.ts\` de un módulo (${reached}), o knip deja de analizar sus exports`;
    const check = (rest: Record<string, unknown>) =>
      entryMismatches(knip(rest), modules, exceptions);

    expect(check({ next: { entry: ["src/modules/*/index.ts"] } })).toEqual([
      outside("src/modules/*/index.ts", "next › entry", "alpha, beta, competition, gamma"),
    ]);
    expect(check({ workspaces: { ".": { entry: "./src/modules/gamma/index.ts" } } })).toEqual([
      outside("./src/modules/gamma/index.ts", "workspaces › . › entry", "gamma"),
    ]);
    // El patrón se lee como lo lee knip antes de expandirlo: el `!` del final es su sufijo de
    // producción, que fuera de ese modo no cuenta, y una ruta absoluta nombra el mismo archivo.
    const absolute = `${process.cwd()}/${index("alpha")}`;
    for (const [pattern, reached] of [
      [`${index("alpha")}!`, "alpha"],
      ["src/modules/*/index.ts!", "alpha, beta, competition, gamma"],
      [absolute, "alpha"],
      [`${absolute}!`, "alpha"],
      [`!${absolute}`, "alpha"],
      [`${process.cwd()}/src/modules/{beta,gamma}/*.ts`, "beta, gamma"],
      ["scripts/../src/modules/beta/index.ts", "beta"],
    ] as const) {
      expect(check({ next: { entry: [pattern] } })).toEqual([
        outside(pattern, "next › entry", reached),
      ]);
    }
    // Una ruta absoluta de otra raíz no es de esta casa.
    expect(check({ next: { entry: [`/otra-casa/${index("alpha")}`] } })).toEqual([]);
    expect(check({ ignore: [index("alpha")] })).toEqual([
      outside(index("alpha"), "ignore", "alpha"),
    ]);
    // Tampoco el del módulo quieto: fuera de `entry` no hay excepción.
    expect(check({ ignore: "src/modules/c*/**" })).toEqual([
      outside("src/modules/c*/**", "ignore", "competition"),
    ]);
    expect(check({ ignoreIssues: { "src/modules/beta/*.ts": ["exports"] } })).toEqual([
      outside("src/modules/beta/*.ts", "ignoreIssues", "beta"),
    ]);
    expect(check({ project: ["src/**/*.{ts,tsx}", "!src/modules/alpha/**"] })).toEqual([
      outside("!src/modules/alpha/**", "project", "alpha"),
    ]);

    expect(
      check({
        project: ["src/**/*.{ts,tsx,css}", "tests/**/*.ts"],
        ignore: ["src/modules/alpha/legacy/**", "src/modules/alpha"],
        ignoreDependencies: ["pino-pretty"],
        compilers: { css: (text: string) => text },
        ignoreExportsUsedInFile: true,
      }),
    ).toEqual([]);
  });

  it("lee la configuración de knip ya evaluada y falla cerrado: si no es un objeto, o su entry no es una lista de textos, no la da por leída", () => {
    const check = (config: unknown) => () => entryMismatches(config, ["alpha"], {});
    expect(check({ entry: [] })).not.toThrow();
    expect(check({ entry: "src/modules/*/index.ts" })).toThrow("no es una lista de textos");
    expect(check({ entry: ["scripts/bench.ts", 1] })).toThrow("no es una lista de textos");
    expect(check({ project: ["src/**/*.ts"] })).toThrow("no es una lista de textos");
    expect(check(() => ({ entry: [] }))).toThrow("no es un objeto");
    expect(check(null)).toThrow("no es un objeto");
  });

  it("las opciones de knip.ts siguen a su lista: una clave nueva, a cualquier profundidad, una que sobra en la lista y una sin su razón la ponen en rojo, y una configuración que no es un objeto no se da por leída", () => {
    const admitted = {
      entry: "Lo que knip no descubre solo.",
      compilers: "knip no lee CSS.",
      "compilers › css": "Solo recibe archivos `.css`.",
    };
    const config = { entry: ["scripts/bench.ts"], compilers: { css: (text: string) => text } };
    const unlisted = (key: string) =>
      `\`${key}\`: knip.ts trae una opción que no está en la lista; entra con su razón, que dice por qué no le quita a knip el \`index.ts\` de un módulo`;
    const stale = (key: string) => `\`${key}\`: sobra en la lista: knip.ts ya no trae esa opción`;
    expect(optionMismatches(config, admitted)).toEqual([]);

    // Lo que apaga el análisis sin nombrar un archivo no alcanza ningún `index.ts`: lo frena la lista.
    expect(optionMismatches({ ...config, exclude: ["exports"] }, admitted)).toEqual([
      unlisted("exclude"),
    ]);
    expect(optionMismatches({ ...config, rules: { exports: "off" } }, admitted)).toEqual([
      unlisted("rules"),
      unlisted("rules › exports"),
    ]);
    // La clave de adentro también se mira: admitir `compilers` no admite un compilador nuevo.
    expect(
      optionMismatches({ ...config, compilers: { ...config.compilers, ts: () => "" } }, admitted),
    ).toEqual([unlisted("compilers › ts")]);
    expect(
      optionMismatches({ ...config, workspaces: { ".": { ignore: ["tests/**"] } } }, admitted),
    ).toEqual([
      unlisted("workspaces"),
      unlisted("workspaces › ."),
      unlisted("workspaces › . › ignore"),
    ]);
    // Una clave que cualquier objeto hereda tampoco pasa por estar en el prototipo de la lista.
    expect(optionMismatches({ ...config, toString: true }, admitted)).toEqual([
      unlisted("toString"),
    ]);

    expect(optionMismatches({ entry: [] }, admitted)).toEqual([
      stale("compilers"),
      stale("compilers › css"),
    ]);
    expect(optionMismatches(config, { ...admitted, compilers: " " })).toEqual([
      "`compilers`: está en la lista sin su razón",
    ]);
    expect(() => optionMismatches(null, admitted)).toThrow("no es un objeto");
    expect(() => optionMismatches(() => config, admitted)).toThrow("no es un objeto");
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
