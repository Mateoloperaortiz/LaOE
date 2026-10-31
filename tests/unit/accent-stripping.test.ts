import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ComitesPage from "@/app/(public)/comites/page";
import { CommitteeDirectory } from "@/app/app/comites/CommitteeDirectory";
import { checkPassword } from "@/modules/identity/domain/pure";
import { detectMapping, normalizeHeader, normalizeText } from "@/modules/people/domain/roster-pure";
import { parseGroupCsv } from "@/modules/permanence/domain/groups-pure";
import { ResourceMultiSelect } from "@/shared/admin-kit/AdminMultiSelect";
import { type GhSnapshot, ghManifestSchema, planGhImport } from "../../scripts/lib/ghpoints-plan";

// DT-074: «quitar acentos» estaba escrito en ocho sitios fuera de `competition`. Acá queda lo que
// responde hoy cada uno por su función pública, con tildes, eñes, diéresis, mayúsculas y espacios.
//
// Los ocho pliegan igual el español: la ñ sale como n en todos. Hasta el ciclo 10 no quitaban las
// mismas marcas después de descomponer (cuatro el bloque U+0300 a U+036F, tres toda marca y uno los
// diacríticos), y por eso cada sitio lleva además tres textos que delataban la diferencia:
//   - una flecha combinante (U+20D7) o el selector de variante de un emoji (U+FE0F): son marcas, pero
//     no del bloque U+0300 a U+036F;
//   - un acento suelto (´, U+00B4), el que deja una tecla muerta: es un diacrítico, pero no una marca;
//   - un unidor de grafemas (U+034F): es del bloque y es marca, pero no es un diacrítico.
// Desde DT-332 (ADR-123 regla 18) los ocho quitan lo mismo, toda marca: los dos primeros y el tercero
// salen en todos, y el acento suelto no sale en ninguno. Las celdas que cambiaron son las de la
// contraseña, el roster (dos veces) y los grupos, que quitaban solo el bloque, y las del selector
// múltiple del admin, que quitaba los diacríticos. Qué texto cambia y cuál no, por la función que
// comparten, está en `accents.test.ts`.

const ARROW = "\u20d7";
const VARIANT = "\ufe0f";
const LOOSE_ACUTE = "\u00b4";
const JOINER = "\u034f";

const search = vi.hoisted(() => ({
  query: "",
  committees: [] as Array<{
    id: string;
    slug: string;
    name: string;
    logoKey: string | null;
    presentation: string | null;
  }>,
}));

// Los dos buscadores de cliente guardan lo escrito en su estado y la suite unitaria no tiene DOM: el
// estado que nace vacío devuelve lo que la prueba «escribió», y el filtro que corre es el del componente.
// El HTML se renderiza sin el router de Next; las transiciones se prueban en navegador.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const state = actual.useState(initial);
      return initial === "" ? [search.query, state[1]] : state;
    },
  };
});
vi.mock("@/modules/people", () => ({ listPublishedCommittees: async () => search.committees }));
vi.mock("@/modules/content", async () => {
  const { excerpt } = await import("@/modules/content/domain/markdown-pure");
  return { excerpt };
});
// Se conservan las piezas reales; se evita cargar next/font desde el barrel de marca.
vi.mock("@/shared/brand", async () => {
  const { BarraTitulo } = await import("@/shared/brand/BarraTitulo");
  const { Cartel } = await import("@/shared/brand/Cartel");
  const { feedVariant } = await import("@/shared/brand/feed");
  return { BarraTitulo, Cartel, feedVariant };
});

const COMMITTEES = [
  { id: "c1", slug: "agora", name: "Café Ágora" },
  { id: "c2", slug: "pdn", name: "Pingüinos del Ñame" },
  { id: "c3", slug: "gemis", name: "GEMIS" },
  { id: "c4", slug: "ninos", name: "Niños  OE" },
].map((committee) => ({ ...committee, logoKey: null, presentation: null, summary: "" }));

const ALL = ["agora", "pdn", "gemis", "ninos"];

/** Lo que encuentran los dos buscadores de comités, que miran el nombre y la sigla. */
const COMMITTEE_SEARCHES: Array<[query: string, slugs: string[]]> = [
  ["", ALL],
  ["cafe", ["agora"]],
  ["CAFÉ ÁGORA", ["agora"]],
  ["  agora ", ["agora"]],
  ["pinguinos", ["pdn"]],
  ["PINGÜINOS DEL ÑAME", ["pdn"]],
  ["name", ["pdn"]],
  ["ñame", ["pdn"]],
  ["NINOS", ["ninos"]],
  ["gemís", ["gemis"]],
  // Los espacios de adentro no se juntan: el nombre tiene dos.
  ["niños oe", []],
  ["niños  oe", ["ninos"]],
  // Toda marca se quita, también la que no es del bloque; un acento suelto no es una marca.
  [`cafe${VARIANT}`, ["agora"]],
  [`ca${JOINER}fe`, ["agora"]],
  [`caf${LOOSE_ACUTE}e`, []],
  [LOOSE_ACUTE, []],
];

function hrefsUnder(html: string, prefix: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1] ?? "")
    .filter((href) => href.startsWith(prefix))
    .map((href) => href.slice(prefix.length));
}

beforeEach(() => {
  search.query = "";
  search.committees = COMMITTEES;
});

describe("quitar acentos, sitio por sitio", () => {
  it("la contraseña se compara sin tildes, eñes ni mayúsculas contra los datos propios y los caracteres repetidos", () => {
    const context = {
      email: "maría.núñez@eafit.edu.co",
      names: ["María Núñez", "Begoña Agüero"],
    };
    const verdicts = [
      "ÁáÀàÄäÂâAaAaAaAa",
      "ÑñÑñÑñNnNnNnNnNn",
      "xx-MARÍA-2026-zz",
      "clave-de-NUÑEZ-9",
      "soy-begona-45210",
      "soy-AGÜERO-45210",
      "caballo-grapa-azul",
    ].map((password) => [password, checkPassword(password, context)]);
    expect(verdicts).toEqual([
      ["ÁáÀàÄäÂâAaAaAaAa", "COMMON"],
      ["ÑñÑñÑñNnNnNnNnNn", "COMMON"],
      ["xx-MARÍA-2026-zz", "PERSONAL"],
      ["clave-de-NUÑEZ-9", "PERSONAL"],
      ["soy-begona-45210", "PERSONAL"],
      ["soy-AGÜERO-45210", "PERSONAL"],
      ["caballo-grapa-azul", null],
    ]);
  });

  it("la contraseña pierde toda marca: una de fuera del bloque en medio del nombre no la deja pasar, y un acento suelto sí", () => {
    const context = { email: "otra@eafit.edu.co", names: ["Maria"] };
    expect(checkPassword(`mari${VARIANT}a-clave-2026`, context)).toBe("PERSONAL");
    expect(checkPassword(`mari${ARROW}a-clave-2026`, context)).toBe("PERSONAL");
    expect(checkPassword(`mari${LOOSE_ACUTE}a-clave-2026`, context)).toBeNull();
    expect(checkPassword(`mari${JOINER}a-clave-2026`, context)).toBe("PERSONAL");
  });

  it("el nombre se lee igual que la contraseña: uno partido por una marca de fuera del bloque ya no cuenta como dos trozos, y la clave que lleva solo uno pasa", () => {
    // El caso al revés de ADR-123 regla 18: con solo el bloque, la marca quedaba y partía el nombre
    // en «rosa» y «linda»; sin ella es un solo trozo, «rosalinda». Ningún nombre real la trae.
    const context = { email: "otra@eafit.edu.co", names: [`Rosa${ARROW}linda`] };
    expect(checkPassword("una-rosa-azul-2026", context)).toBeNull();
    expect(checkPassword("una-linda-clave-2026", context)).toBeNull();
    expect(checkPassword("soy-rosalinda-2026", context)).toBe("PERSONAL");
    expect(checkPassword(`soy-rosa${ARROW}linda-2026`, context)).toBe("PERSONAL");
  });

  it("la cabecera del roster queda en mayúsculas, sin tildes ni signos y con un solo espacio", () => {
    const headers = [
      "  Entrada a la OÉ ",
      "Año de  ingreso (¿cuál?)",
      "PINGÜINO-ÑAME",
      "ñandú",
      `a${ARROW}b`,
      `a${VARIANT}b`,
      `a${LOOSE_ACUTE}b`,
      `a${JOINER}b`,
    ].map(normalizeHeader);
    expect(headers).toEqual([
      "ENTRADA A LA OE",
      "ANO DE INGRESO CUAL",
      "PINGUINO-NAME",
      "NANDU",
      // Toda marca se quita; el acento suelto no es una marca: cae en «signo» y deja un espacio.
      "AB",
      "AB",
      "A B",
      "AB",
    ]);
    expect(detectMapping(["Fécha de  Nacimiento", "id épik", "Año"])).toEqual([
      "birthDate",
      "epikId",
      null,
    ]);
  });

  it("un texto del roster queda en minúsculas, sin tildes y con un solo espacio", () => {
    const texts = [
      "  Ñandú   GÜIRO  ",
      "Graduado\tÁ",
      `A${ARROW}B`,
      `A${VARIANT}B`,
      `A${LOOSE_ACUTE}B`,
      `A${JOINER}B`,
    ].map(normalizeText);
    expect(texts).toEqual(["nandu guiro", "graduado a", "ab", "ab", `a${LOOSE_ACUTE}b`, "ab"]);
  });

  it("la cabecera de correos de un grupo se reconoce con tildes, mayúsculas y espacios a los lados, y los correos no se pliegan", () => {
    const body = "Ana@eafit.edu.co\nñandú@eafit.edu.co";
    const read = (header: string) => parseGroupCsv(`${header}\n${body}`);
    const emails = ["ana@eafit.edu.co", "ñandú@eafit.edu.co"];
    expect(read("Córreo")).toEqual(emails);
    expect(read("  CORREO INSTITUCIONÁL  ")).toEqual(emails);
    expect(read("É-mail")).toEqual(emails);
    expect(read(`co${JOINER}rreo`)).toEqual(emails);
    expect(read(`correo${VARIANT}`)).toEqual(emails);
    expect(read(`co${ARROW}rreo`)).toEqual(emails);
    // Los espacios de adentro no se juntan, y un acento suelto no es una marca: sin cabecera
    // reconocida ni un correo en la primera fila, no hay columna.
    expect(read("correo  institucional")).toEqual([]);
    expect(read(`corr${LOOSE_ACUTE}eo`)).toEqual([]);
  });

  it("la importación de GH Points reconoce una ocasión que ya existe por su título sin tildes, signos ni mayúsculas", () => {
    const manifest = (title: string) =>
      ghManifestSchema.parse({
        format: "oe-ghpoints/2",
        batchId: "synthetic-batch",
        termCode: "2025-2",
        targetTermId: "term-test",
        allowOnLeavePoints: true,
        sources: [{ key: "SOURCE", path: "source.txt", sha256: "0".repeat(64) }],
        activities: [
          {
            key: "ACTIVITY",
            title,
            type: "DECORACION",
            date: "2025-09-08",
            endDate: "2025-09-10",
            datePrecision: "DAY",
            newMembersOnly: true,
            existingOccasionId: null,
            sourceKey: "SOURCE",
            evidenceEvaluation: "GOOD",
            participants: [{ recordId: "RECORD", email: "person@example.test", sourceRow: 1 }],
          },
        ],
      });
    const snapshot = (title: string): GhSnapshot => ({
      queriedAt: "2025-09-14T18:00:00Z",
      environment: "test",
      terms: [
        {
          id: "term-test",
          code: "2025-2",
          starts_on: "2025-07-01",
          ends_on: "2025-12-31",
          points_closed_at: null,
          permanence_closed_at: null,
        },
      ],
      people: [
        {
          id: "person-test",
          email: "person@example.test",
          full_name: "Persona sintética",
          stage: "MEMBER",
          anonymized_at: null,
          status: "ACTIVE",
          first_term_id: "term-test",
        },
      ],
      occasions: [
        {
          id: "existing",
          legacy_id: null,
          title,
          kind: "ACTIVITY",
          assembly_kind: null,
          category: "OTHER",
          new_members_only: true,
          status: "CLOSED",
          points: 0,
          starts_at: "2025-09-08T20:00:00Z",
          ends_at: null,
        },
      ],
      checkIns: [],
      entries: [],
      groups: [],
      groupMemberships: [],
      rules: [],
      generalTableLocked: false,
    });
    const sameOccasion = (imported: string, existing: string) =>
      planGhImport(manifest(imported), snapshot(existing)).activities[0]?.reason ===
      "EXISTING_OCCASION_NEEDS_MAPPING";
    const pairs: Array<[imported: string, existing: string]> = [
      ["Actividad sintética", "ACTIVIDAD SINTETICA"],
      ["Decoración de  Ñapa — Pingüinos", "decoracion de napa pinguinos"],
      ["¡Año  Nuevo!", "ano nuevo"],
      ["Actividad sintética", "Actividad sintética 2"],
      // Toda marca se quita; un acento suelto es un signo y deja un espacio.
      [`a${ARROW}b actividad`, "ab actividad"],
      [`a${VARIANT}b actividad`, "ab actividad"],
      [`a${JOINER}b actividad`, "ab actividad"],
      [`a${LOOSE_ACUTE}b actividad`, "ab actividad"],
      [`a${LOOSE_ACUTE}b actividad`, "a b actividad"],
    ];
    expect(pairs.map(([imported, existing]) => sameOccasion(imported, existing))).toEqual([
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      false,
      true,
    ]);
  });

  it("el selector múltiple del admin filtra sus opciones sin tildes ni mayúsculas, y con las mismas marcas que los buscadores de comités", () => {
    const labels = [
      ...COMMITTEES.map((committee) => committee.name),
      ...Array.from({ length: 7 }, (_, index) => `Mesa ${index + 1}`),
    ];
    const visible = (query: string): string[] => {
      search.query = query;
      const html = renderToStaticMarkup(
        createElement(ResourceMultiSelect, {
          field: {
            name: "comites",
            label: "Comités",
            type: "multiselect",
            options: labels.map((label, index) => ({ value: `v${index}`, label })),
          },
          value: "",
          error: undefined,
          editing: false,
          onChange: () => {},
        }),
      );
      return html
        .split("<label")
        .slice(1)
        .filter((chunk) => !chunk.slice(0, chunk.indexOf(">")).includes(' hidden=""'))
        .map((chunk) => /<span>([^<]*)<\/span>/.exec(chunk)?.[1] ?? "");
    };
    const found = (
      [
        ["", labels],
        ["cafe", ["Café Ágora"]],
        ["CAFÉ ÁGORA", ["Café Ágora"]],
        ["  agora ", ["Café Ágora"]],
        ["pinguinos", ["Pingüinos del Ñame"]],
        ["PINGÜINOS DEL ÑAME", ["Pingüinos del Ñame"]],
        ["name", ["Pingüinos del Ñame"]],
        ["ñame", ["Pingüinos del Ñame"]],
        ["NINOS", ["Niños  OE"]],
        ["gemís", ["GEMIS"]],
        ["niños oe", []],
        ["niños  oe", ["Niños  OE"]],
        // Toda marca se quita, también la que no es un diacrítico; un acento suelto no es una marca.
        [`caf${LOOSE_ACUTE}e`, []],
        [LOOSE_ACUTE, []],
        [`cafe${VARIANT}`, ["Café Ágora"]],
        [`ca${JOINER}fe`, ["Café Ágora"]],
      ] as Array<[string, string[]]>
    ).map(([query, expected]) => ({ query, expected, got: visible(query) }));
    for (const { query, expected, got } of found) {
      expect(got, JSON.stringify(query)).toEqual(expected);
    }
  });

  it("el buscador público de comités encuentra por nombre o sigla sin tildes ni mayúsculas, y quita toda marca", async () => {
    for (const [query, slugs] of COMMITTEE_SEARCHES) {
      const page = await ComitesPage({
        params: Promise.resolve({}),
        searchParams: Promise.resolve({ q: query }),
      });
      expect(hrefsUnder(renderToStaticMarkup(page), "/comites/"), JSON.stringify(query)).toEqual(
        slugs,
      );
    }
  });

  it("el directorio de comités de la app encuentra lo mismo que el buscador público", () => {
    for (const [query, slugs] of COMMITTEE_SEARCHES) {
      search.query = query;
      const html = renderToStaticMarkup(
        createElement(CommitteeDirectory, { mine: [], others: COMMITTEES }),
      );
      expect(hrefsUnder(html, "/app/comites/"), JSON.stringify(query)).toEqual(slugs);
    }
  });
});
