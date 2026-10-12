import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKET_STATUSES } from "@/modules/competition/domain/betting-pure";
import { REQUEST_STATUSES } from "@/modules/crm/domain/requests-pure";
import {
  challengeParticipationStatus,
  occasionApproval,
  reconciliationStatus,
  rewardStatus,
} from "@/modules/participation/schema";
import { COMPLIANCE_STATES } from "@/modules/permanence/domain/snapshot-pure";
import {
  FALLBACK_SHAPES,
  type LabelCall,
  type LabelFallback,
  labelCalls,
  labelFallbacks,
  POSITIONAL_FORMS,
  type PositionalForm,
  type PositionalRead,
  positionalLabelCounts,
  positionalLabelReads,
} from "../../scripts/lib/label-position-metrics";
import { PAIRS, UNSEEN_PAIRS } from "./enum-label-pairs.table";
import { FALLBACKS_BY_FILE } from "./label-fallbacks.table";

// DT-011: la etiqueta de un valor de un enum se lee por valor, con `tLabels(código, ENUM)[valor]`, y
// no por la posición del valor en una lista del catálogo de textos. La migración de la spec #242 dejó
// `src` así, y una lectura nueva por posición funcionaría igual sin que nada lo notara: por eso esta
// prueba lee el código (ADR-126 regla 11). La cuenta es la de `scripts/lib/label-position-metrics.ts`,
// la misma que suma `npm run audit:metrics`.
//
// Es un trinquete. Lee archivo por archivo y sin tipos: no sigue una lista que llega por parámetro o
// por props, salvo donde el subíndice trae un `indexOf`, un `findIndex` o una constante de posiciones,
// que caen sobre cualquier lista. Qué etiqueta le toca a cada valor lo sigue fijando la tabla de
// `tests/unit/enum-label-pairs.test.ts`.

const ROOT = process.cwd();

interface Exception {
  path: string;
  form: PositionalForm;
  /** La expresión como la devuelve la regla: sin espacios ni comas finales. */
  read: string;
  /** Cuántas veces la escribe el archivo. Una más también cae. */
  times?: number;
  /** Por qué esta lectura sigue por posición, en una frase. */
  reason: string;
}

const UNEVEN = "Par de largo distinto, que queda fuera de `tLabels` (ADR-126 regla 2, DT-373):";
const BY_HAND =
  "Constante de posiciones que fija `INDEX_PAIRS` de la tabla de pares y espera su migración (DT-366):";
const DOMAIN_NUMBER =
  "El subíndice es un número que calcula el dominio o que está escrito en el sitio, no un valor de un enum (DT-369):";
const NOT_LABELS = "No empareja un enum con sus etiquetas:";

// Las únicas lecturas por posición que quedan en `src`. Antes de sumar una acá, leela por valor: si
// es la etiqueta de un valor de un enum, `tLabels(código, ENUM)[valor]` con el respaldo que el sitio
// ya tenga. La lista es por expresión y por archivo: otra lectura en uno de estos archivos también cae.
const EXCEPTIONS: Exception[] = [
  {
    path: "src/app/admin/personas/[id]/_ui/TabPermanencia.tsx",
    form: "indexOf",
    read: 'reasonLabels[decision.proposed==="EXIT_OE"?view.result.mandatory.met?3:4:DECISIONS.indexOf(decision.proposed)]',
    reason: `${UNEVEN} T-801 trae seis motivos para cuatro decisiones, y \`EXIT_OE\` lee el 3 o el 4 según la asamblea obligatoria.`,
  },
  {
    path: "src/app/admin/gamificacion/campanas/page.tsx",
    form: "positionConstant",
    read: "stateLabels[STATE_INDEX[campaign.state]]",
    reason: `${UNEVEN} los cuatro estados de una campaña leen las piezas 1 a 4 de T-2511, la lista de los estados de un reto, y no hay enum de esa lista con el que leerla por valor (DT-366).`,
  },
  {
    path: "src/app/app/gh-points/coleccion/page.tsx",
    form: "positionConstant",
    read: "familyNames[FAMILY_INDEX[family.family]]",
    times: 2,
    reason: `${UNEVEN} \`FAMILY_INDEX\` trae las cuatro familias con niveles de las cinco de T-2473 (DT-366).`,
  },
  {
    path: "src/modules/participation/components/ChallengeCard.tsx",
    form: "positionConstant",
    read: "kinds[KIND_INDEX[card.kind]]",
    reason: `${BY_HAND} el tipo de un reto, T-2409.`,
  },
  {
    path: "src/modules/participation/components/ChallengeCard.tsx",
    form: "positionConstant",
    read: "audiences[AUDIENCE_INDEX[card.audience]]",
    reason: `${BY_HAND} la audiencia de un reto, T-2411.`,
  },
  {
    path: "src/modules/participation/components/ChallengeCard.tsx",
    form: "positionConstant",
    read: "states[STATE_INDEX[card.state]]",
    reason: `${BY_HAND} el estado de un reto, T-2511.`,
  },
  {
    path: "src/modules/participation/components/ChallengeCard.tsx",
    form: "positionConstant",
    read: "memberStates[STATUS_INDEX[card.status]]",
    reason: `${BY_HAND} el estado de la entrega de un miembro, T-2410.`,
  },
  {
    path: "src/modules/participation/components/ChallengeCard.tsx",
    form: "positionConstant",
    read: 'tList("T-2451")[BOOSTER_INDEX[card.boosterKind]]',
    reason: `${BY_HAND} el nombre de un booster, T-2451.`,
  },
  {
    path: "src/app/app/gh-points/retos/[id]/page.tsx",
    form: "positionConstant",
    read: 'tList("T-2409")[KIND_INDEX[challenge.kind]]',
    reason: `${BY_HAND} el tipo de un reto en su detalle, T-2409.`,
  },
  {
    path: "src/app/admin/sistema/importaciones/page.tsx",
    form: "positionConstant",
    read: "estados[STATUS_INDEX[job.status]]",
    reason: `${BY_HAND} el estado de una importación, T-493.`,
  },
  {
    path: "src/shared/lib/image-decoder.ts",
    form: "positionConstant",
    read: 'tList("T-3207")[MOTIVES[reason]]',
    reason: `${BY_HAND} el motivo por el que una imagen no se abre, T-3207; sus posiciones son literales y la tupla de \`tList\` sí cuida el largo.`,
  },
  {
    path: "src/app/app/ajustes/page.tsx",
    form: "storedIndex",
    read: "CONSENT_TEXTS[index]",
    reason: `${NOT_LABELS} \`CONSENT_TEXTS\` es una lista de códigos de texto, uno por finalidad (ADR-126 regla 1).`,
  },
  {
    path: "src/app/admin/gamificacion/campanas/page.tsx",
    form: "traversal",
    read: "percents[index]",
    reason: `${NOT_LABELS} T-2534 se recorre con las cantidades \`[25, 50, 100]\` (ADR-126 regla 1).`,
  },
  {
    path: "src/app/admin/the-games/[id]/_ui/Play.tsx",
    form: "traversal",
    read: "clock[index]",
    reason: `${NOT_LABELS} T-2836 se recorre con los ajustes del reloj \`[60, 300, -60]\` (ADR-126 regla 1).`,
  },
  {
    path: "src/app/admin/personas/[id]/_ui/Tabs.tsx",
    form: "traversal",
    read: "requisitos[index]",
    reason: `${NOT_LABELS} T-2316 se recorre con los requisitos que calcula el dominio, sin un orden escrito en el código (ADR-126 regla 1).`,
  },
  {
    path: "src/modules/crm/domain/pipelines.ts",
    form: "storedIndex",
    read: "reordered[index]",
    reason: `${NOT_LABELS} intercambia dos etapas en una copia de la lista donde buscó la posición.`,
  },
  {
    path: "src/modules/crm/domain/pipelines.ts",
    form: "storedIndex",
    read: "reordered[target]",
    reason: `${NOT_LABELS} intercambia dos etapas en una copia de la lista donde buscó la posición.`,
  },
  {
    path: "src/modules/permanence/domain/groups-pure.ts",
    form: "storedIndex",
    read: "row[column]",
    reason: `${NOT_LABELS} lee de cada fila de un CSV la columna que encontró en el encabezado.`,
  },
  {
    path: "src/modules/competition/domain/staff-import.ts",
    form: "computedIndex",
    read: 'tList("T-3048")[day-1]',
    reason: `${DOMAIN_NUMBER} la jornada de The Games.`,
  },
  {
    path: "src/modules/competition/domain/powers.ts",
    form: "computedIndex",
    read: "dayName(problem.day)",
    times: 2,
    reason: `${DOMAIN_NUMBER} la jornada de The Games, por el ayudante que lee T-3048.`,
  },
  {
    path: "src/app/admin/the-games/[id]/_ui/Powers.tsx",
    form: "computedIndex",
    read: "dayName(day)",
    times: 2,
    reason: `${DOMAIN_NUMBER} la jornada de The Games, que el sitio recorre con \`[1, 2]\`.`,
  },
  {
    path: "src/app/admin/the-games/[id]/_ui/Powers.tsx",
    form: "computedIndex",
    read: "columns[day]",
    reason: `${DOMAIN_NUMBER} la columna de cada jornada, que el sitio recorre con \`[1, 2]\`.`,
  },
  {
    path: "src/app/admin/the-games/[id]/_ui/Powers.tsx",
    form: "computedIndex",
    read: "days[day-1]",
    reason: `${DOMAIN_NUMBER} la jornada de The Games, que el sitio recorre con \`[1, 2]\`.`,
  },
  {
    path: "src/app/admin/the-games/[id]/_ui/Setup.tsx",
    form: "computedIndex",
    read: "days[day-1]",
    reason: `${DOMAIN_NUMBER} la jornada de The Games.`,
  },
  {
    path: "src/modules/participation/components/Panal.tsx",
    form: "computedIndex",
    read: 'tList("T-2739")[panalRank(score,puzzle.maxScore)]',
    reason: `${DOMAIN_NUMBER} el rango del Panal.`,
  },
  {
    path: "src/app/admin/asambleas/page.tsx",
    form: "computedIndex",
    read: "ladderLabels[row.ladder]",
    reason: `${DOMAIN_NUMBER} el escalón de la representación de un comité en las asambleas.`,
  },
  {
    path: "src/app/admin/comites/[slug]/_ui/Personas.tsx",
    form: "computedIndex",
    read: "ladderLabels[representation.ladder]",
    reason: `${DOMAIN_NUMBER} el escalón de la representación de un comité en las asambleas.`,
  },
  {
    path: "src/app/admin/permanencia/cierre/page.tsx",
    form: "computedIndex",
    read: "reasonLabels[row.personReason]",
    reason: `${DOMAIN_NUMBER} el motivo automático de una propuesta del cierre, una de las seis piezas de T-801.`,
  },
  {
    path: "src/app/app/gh-points/page.tsx",
    form: "computedIndex",
    read: "levelLabels[level.index+1]",
    reason: `${DOMAIN_NUMBER} el nivel que sigue al del miembro.`,
  },
  {
    path: "src/app/app/gh-points/page.tsx",
    form: "computedIndex",
    read: "levelLabels[level.index]",
    reason: `${DOMAIN_NUMBER} el nivel del miembro.`,
  },
  {
    path: "src/app/app/gh-points/coleccion/page.tsx",
    form: "computedIndex",
    read: "conditions[level.badge.level-1]",
    reason: `${DOMAIN_NUMBER} el nivel de una insignia.`,
  },
  {
    path: "src/app/app/juegos/page.tsx",
    form: "computedIndex",
    read: "estados[juego.estado]",
    reason: `${DOMAIN_NUMBER} el estado de cada juego de la biblioteca, que la página calcula como 0, 1 o 2.`,
  },
  {
    path: "src/modules/people/domain/roster-pure.ts",
    form: "computedIndex",
    read: 'text(assignments.error,{sigla:values.role,sugerencia:"—"})',
    reason: `${DOMAIN_NUMBER} la posición del error que devuelve el validador de asignaciones.`,
  },
];

function sourceFiles(dir: string): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name)
      ? [{ path: relative(ROOT, path), text: readFileSync(path, "utf8") }]
      : [];
  });
}

const key = (read: { path: string; form: PositionalForm; read: string }) =>
  `${read.path} · ${read.form} · ${read.read}`;

function tally(reads: PositionalRead[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const read of reads) {
    counts.set(key(read), (counts.get(key(read)) ?? 0) + 1);
  }
  return counts;
}

/** Las lecturas que ninguna excepción nombra, o que su archivo escribe más veces de las que nombra. */
function unlisted(reads: PositionalRead[]): string[] {
  const allowed = new Map(EXCEPTIONS.map((exception) => [key(exception), exception.times ?? 1]));
  const counts = tally(reads);
  return reads
    .filter((read) => (counts.get(key(read)) ?? 0) > (allowed.get(key(read)) ?? 0))
    .map((read) => `${read.path}:${read.line} · ${read.form} · ${read.read}`);
}

/** Las excepciones que ya no nombran ninguna lectura, o nombran más de las que hay. */
function stale(reads: PositionalRead[]): string[] {
  const counts = tally(reads);
  return EXCEPTIONS.filter(
    (exception) => (counts.get(key(exception)) ?? 0) < (exception.times ?? 1),
  ).map(key);
}

const files = sourceFiles(join(ROOT, "src"));
const reads = positionalLabelReads(files);
// Lo que `src` ya traiga sin excepción: se descuenta de cada sitio sembrado, para que una lectura
// de más en `src` deje en rojo su caso y no los de todas las formas.
const alreadyUnlisted = unlisted(reads);

const HEAD =
  'import { tLabels, tList } from "@/shared/copy";\nconst KINDS = ["A", "B"] as const;\n';

// Un sitio sembrado en memoria por cada forma vieja: cada uno, sumado a `src`, deja la prueba en rojo.
const SEEDED: { title: string; form: PositionalForm; path: string; text: string }[] = [
  {
    title: "un indexOf en el subíndice de una lista del catálogo",
    form: "indexOf",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}export const label = (kind: string) => tList("T-444")[KINDS.indexOf(kind as "A")] ?? kind;\n`,
  },
  {
    title: "un indexOf en el subíndice de una lista que llega por props",
    form: "indexOf",
    path: "src/app/sembrado/Fila.tsx",
    text: `const ORDER = ["A", "B"];\nexport function Fila({ labels, kind }: { labels: { kinds: string[] }; kind: string }) {\n  return <span>{labels.kinds[ORDER.indexOf(kind)] ?? kind}</span>;\n}\n`,
  },
  {
    title: "un indexOf con desplazamiento",
    form: "indexOf",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = tList("T-444");\nexport const label = (kind: string) => labels[3 + KINDS.indexOf(kind as "A")] ?? "";\n`,
  },
  {
    title: "un findIndex en el subíndice",
    form: "indexOf",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const AREAS = [{ key: "a" }, { key: "b" }];\nexport const label = (area: string) =>\n  tList("T-444")[AREAS.findIndex((item) => item.key === area)] ?? area;\n`,
  },
  {
    title: "el indexOf guardado en una constante",
    form: "storedIndex",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}export function label(labels: string[], kind: string) {\n  const index = KINDS.indexOf(kind as "A");\n  return labels[index] ?? kind;\n}\n`,
  },
  {
    title: "el indexOf guardado en una constante que suma un desplazamiento",
    form: "storedIndex",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}export function label(labels: string[], kind: string) {\n  const index = KINDS.indexOf(kind as "A");\n  const shifted = index + 3;\n  return labels[shifted] ?? kind;\n}\n`,
  },
  {
    title: "el indexOf guardado en una función",
    form: "storedIndex",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const indexOf = (value: string) => KINDS.indexOf(value as "A");\nexport const label = (labels: string[], kind: string) => labels[indexOf(kind)] ?? kind;\n`,
  },
  {
    title: "un findIndex guardado en una constante",
    form: "storedIndex",
    path: "src/app/sembrado/page.ts",
    text: `const AREAS = [{ key: "a" }, { key: "b" }];\nexport function label(area: string, labels: readonly string[]) {\n  const index = AREAS.findIndex((item) => item.key === area);\n  return labels[index] ?? area;\n}\n`,
  },
  {
    title: "un recorrido que lee la lista con su índice",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = tList("T-444");\nexport const options = KINDS.map((value, index) => ({ value, label: labels[index] ?? value }));\n`,
  },
  {
    title: "un recorrido que indexa la llamada, con otro nombre para el índice",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}export const options = KINDS.map((value, position) => tList("T-444")[position] ?? value);\n`,
  },
  {
    title: "un recorrido lejos de su subíndice y por una variable en minúsculas",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = { kinds: tList("T-444") };\nconst kinds = [...KINDS];\nexport const options = kinds.map((value, i) => {\n  const a = 1;\n  const b = 2;\n  const c = 3;\n  const d = 4;\n  const e = 5;\n  return { value, label: labels.kinds[i] ?? value, sum: a + b + c + d + e };\n});\n`,
  },
  {
    title: "un for que lee la lista con su contador",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = tList("T-444");\nexport const pairs: string[] = [];\nfor (let i = 0; i < KINDS.length; i += 1) {\n  pairs.push(labels[i] ?? "");\n}\n`,
  },
  {
    title: "un zip de claves y etiquetas",
    form: "zip",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}declare function zip(keys: readonly string[], list: readonly string[]): Record<string, string>;\nexport const labels = { kinds: zip(KINDS, tList("T-444")) };\n`,
  },
  {
    title: "un zip de una lista guardada en una variable",
    form: "zip",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}declare function options(values: readonly string[], list: readonly string[]): unknown;\nconst list = tList("T-444");\nexport const kinds = options(KINDS, list);\n`,
  },
  {
    title: "una constante que guarda a mano la posición de cada valor",
    form: "positionConstant",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const KIND_INDEX: Record<string, number> = { A: 0, B: 1 };\nexport const label = (kind: string) => tList("T-444")[KIND_INDEX[kind]] ?? kind;\n`,
  },
  {
    title: "una constante de posiciones sobre una lista que llega por props",
    form: "positionConstant",
    path: "src/app/sembrado/page.ts",
    text: `const positions = { A: 0, B: 1 } as const;\nexport const label = (kinds: string[], kind: "A" | "B") => kinds[positions[kind]] ?? kind;\n`,
  },
  {
    title: "un subíndice calculado sobre la llamada",
    form: "computedIndex",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}declare function rank(score: number): number;\nexport const label = (score: number) => tList("T-444")[rank(score)] ?? "";\n`,
  },
  {
    title: "un ayudante de posiciones al que le llega algo que no es un número escrito",
    form: "computedIndex",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const list = tList("T-444");\nconst label = (index: number) => list[index] ?? "";\nexport const first = label(0);\nexport const other = (position: number) => label(position);\n`,
  },
  {
    title: "un ayudante de posiciones al que le llega un indexOf",
    form: "indexOf",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const list = tList("T-444");\nfunction label(index: number) {\n  return list[index] ?? "";\n}\nexport const kind = (value: string) => label(KINDS.indexOf(value as "A"));\n`,
  },
  // Las cuatro formas que la revisión del ticket sembró sin que la regla cayera, y una quinta que
  // salió al cerrarlas (DT-375, ADR-126 regla 11).
  {
    title: "un indexOf dentro de at(), que lee la lista igual que un subíndice",
    form: "indexOf",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}export const label = (kind: string) => tList("T-444").at(KINDS.indexOf(kind as "A")) ?? kind;\n`,
  },
  {
    title: "un recorrido que lee la lista con at() y su índice",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = tList("T-444");\nexport const options = KINDS.map((value, index) => ({ value, label: labels.at(index) ?? value }));\n`,
  },
  {
    title: "el recorrido inverso, que recorre las etiquetas y lee el orden con su índice",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}export const options = tList("T-444").map((label, index) => ({ value: KINDS[index], label }));\n`,
  },
  {
    title: "el indexOf asignado después a una variable que nació con otro valor",
    form: "storedIndex",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}export function label(labels: string[], kind: string) {\n  let index = -1;\n  index = KINDS.indexOf(kind as "A");\n  return labels[index] ?? kind;\n}\n`,
  },
  {
    title: "un contador que avanza a mano mientras se recorre el orden",
    form: "computedIndex",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = tList("T-444");\nexport const pairs: string[] = [];\nlet position = 0;\nfor (const value of KINDS) {\n  pairs.push(labels[position] ?? value);\n  position += 1;\n}\n`,
  },
  {
    title: "un indexOf envuelto en una llamada, sobre una lista que llega por props",
    form: "indexOf",
    path: "src/app/sembrado/page.ts",
    text: `const ORDER = ["A", "B"];\nexport const label = (labels: string[], kind: string) =>\n  labels[Math.max(0, ORDER.indexOf(kind))] ?? kind;\n`,
  },
  // Las formas que la revisión de la rama encontró sin nombrar (ADR-126 regla 11): la lista pasa
  // por otra expresión antes de leerse, o `tList` llega con otro nombre, y la regla dejaba de seguirla.
  {
    title: "un recorrido sobre una copia de la lista hecha con spread",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = [...tList("T-444")];\nexport const options = KINDS.map((value, index) => ({ value, label: labels[index] ?? value }));\n`,
  },
  {
    title: "un recorrido sobre una copia de la lista hecha con Array.from",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = Array.from(tList("T-444"));\nexport const options = KINDS.map((value, index) => ({ value, label: labels[index] ?? value }));\n`,
  },
  {
    title: "un recorrido sobre la lista después de un concat",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = tList("T-444").concat([]);\nexport const options = KINDS.map((value, index) => ({ value, label: labels[index] ?? value }));\n`,
  },
  {
    title: "un recorrido sobre la lista invertida con toReversed",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = tList("T-444").toReversed();\nexport const options = KINDS.map((value, index) => ({ value, label: labels[index] ?? value }));\n`,
  },
  {
    title: "un recorrido sobre la lista ordenada con toSorted",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = tList("T-444").toSorted();\nexport const options = KINDS.map((value, index) => ({ value, label: labels[index] ?? value }));\n`,
  },
  {
    title: "un recorrido sobre la lista ordenada con sort",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = [...tList("T-444")].sort();\nexport const options = KINDS.map((value, index) => ({ value, label: labels[index] ?? value }));\n`,
  },
  {
    title: "un recorrido sobre la lista invertida con reverse",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels = [...tList("T-444")].reverse();\nexport const options = KINDS.map((value, index) => ({ value, label: labels[index] ?? value }));\n`,
  },
  {
    title: "un recorrido sobre una lista asignada después de declarada",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}let labels: readonly string[] = [];\nlabels = tList("T-444");\nexport const options = KINDS.map((value, index) => ({ value, label: labels[index] ?? value }));\n`,
  },
  {
    title: "un recorrido sobre una lista desestructurada de un objeto literal",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const { labels } = { labels: tList("T-444") };\nexport const options = KINDS.map((value, index) => ({ value, label: labels[index] ?? value }));\n`,
  },
  {
    title: "un recorrido sobre un tList importado con otro nombre",
    form: "traversal",
    path: "src/app/sembrado/page.ts",
    text: 'import { tList as lista } from "@/shared/copy";\nconst KINDS = ["A", "B"] as const;\nexport const options = KINDS.map((value, index) => ({ value, label: lista("T-444")[index] ?? value }));\n',
  },
  {
    title: "un método que recibe la lista junto con su orden",
    form: "zip",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}import { util } from "@/shared/lib/util";\nexport const labels = util.zip(KINDS, tList("T-444"));\n`,
  },
  // DT-371 (ADR-126 regla 10): anotado con claves abiertas, `tsc` deja pasar el número y la lectura
  // da `undefined`; sin anotar ya lo rechaza el tipo de `tLabels`.
  {
    title: "un número escrito de subíndice de un Record de tLabels anotado con claves abiertas",
    form: "recordByNumber",
    path: "src/app/sembrado/page.ts",
    text: `${HEAD}const labels: Readonly<Record<string, string>> = tLabels("T-444", KINDS);\nexport const reversed = labels[1] ?? "";\n`,
  },
  {
    title: "un número escrito de subíndice de las etiquetas que llegan por props",
    form: "recordByNumber",
    path: "src/app/sembrado/Fila.tsx",
    text: `import { labelsFromProps } from "@/shared/copy/client";\nexport function Fila(props: { kinds: Record<string, string> }) {\n  const kinds = labelsFromProps(props.kinds);\n  return <span>{kinds[0]}</span>;\n}\n`,
  },
];

// Lo que la regla deja pasar: la lectura por valor y las que la spec dejó fuera.
const ALLOWED: { title: string; text: string }[] = [
  {
    title: "la etiqueta por valor",
    text: `${HEAD}const labels = tLabels("T-444", KINDS);\nexport const label = (kind: "A" | "B") => labels[kind] ?? kind;\n`,
  },
  {
    title: "un índice literal, que la tupla de tList ya cuida",
    text: `${HEAD}const labels = tList("T-444");\nexport const first = labels[0] ?? "";\nexport const second = tList("T-444")[1];\n`,
  },
  {
    title: "dos posiciones literales que elige una condición",
    text: `${HEAD}export const answer = (value: boolean) => tList("T-444")[value ? 0 : 1] ?? "";\n`,
  },
  {
    title: "un ayudante que recibe solo posiciones escritas",
    text: `${HEAD}const list = tList("T-444");\nconst label = (index: number) => list[index] ?? "";\nexport const title = label(0);\nexport const hint = label(2);\n`,
  },
  {
    title: "buscar una posición en una lista y leer esa misma lista",
    text: `export function next(stages: { id: string }[], id: string) {\n  const index = stages.findIndex((item) => item.id === id);\n  return stages[index + 1] ?? stages[stages.findIndex((item) => item.id === id)];\n}\n`,
  },
  {
    title: "la última pieza con at() y un número escrito",
    text: `${HEAD}export const last = tList("T-444").at(-1) ?? "";\n`,
  },
  {
    title: "una variable que elige entre posiciones escritas",
    text: `${HEAD}export function answer(value: boolean) {\n  let position = 0;\n  if (value) {\n    position = 1;\n  }\n  return tList("T-444")[position] ?? "";\n}\n`,
  },
  {
    title: "buscar una posición con tope en una lista y leer esa misma lista",
    text: `export const current = (stages: { id: string }[], id: string) =>\n  stages[Math.max(0, stages.findIndex((item) => item.id === id))];\n`,
  },
  {
    title: "Array.from sobre la lista con una función que no lee otra secuencia",
    text: `${HEAD}export const shouted = Array.from(tList("T-444"), (label) => label.toUpperCase());\n`,
  },
  {
    title: "un recorrido de dos arreglos paralelos que no son del catálogo",
    text: `export const pairs = (keys: string[], values: number[]) => keys.map((item, index) => [item, values[index]]);\n`,
  },
];

describe("las lecturas por posición de una lista del catálogo de textos", () => {
  it("recorre src y encuentra las llamadas a tLabels y las lecturas que quedan", () => {
    // Si el recorrido deja de encontrar archivos o lecturas, la prueba no puede pasar por vacía.
    expect(files.length).toBeGreaterThan(500);
    expect(files.filter((file) => file.text.includes("tLabels(")).length).toBeGreaterThan(60);
    expect(reads.length).toBeGreaterThan(0);
  });

  it("ninguna lectura por posición de src queda sin su excepción", () => {
    expect(unlisted(reads)).toEqual([]);
  });

  it("ninguna excepción sobra: la que ya no nombra una lectura se quita", () => {
    expect(stale(reads)).toEqual([]);
  });

  it("no repite una excepción y cada una dice por qué", () => {
    expect(new Set(EXCEPTIONS.map(key)).size).toBe(EXCEPTIONS.length);
    expect(EXCEPTIONS.filter((exception) => exception.reason.trim().length < 20)).toEqual([]);
  });

  it("cuenta por forma lo mismo que nombran las excepciones: es la fila de audit:metrics", () => {
    const named = Object.fromEntries(POSITIONAL_FORMS.map((form) => [form, 0]));
    for (const exception of EXCEPTIONS) {
      named[exception.form] = (named[exception.form] ?? 0) + (exception.times ?? 1);
    }
    expect(positionalLabelCounts(files)).toEqual(named);
  });
});

describe("cada forma vieja, sembrada en memoria, deja la prueba en rojo", () => {
  it.each(SEEDED)("$title ($form)", ({ form, path, text }) => {
    const seeded = positionalLabelReads([{ path, text }]);
    expect(seeded.map((read) => read.form)).toEqual([form]);
    // Sumada a lo que hay en `src`, es justo la lectura que la prueba de arriba rechazaría.
    expect(
      unlisted([...reads, ...seeded]).filter((entry) => !alreadyUnlisted.includes(entry)),
    ).toEqual(seeded.map((read) => `${path}:${read.line} · ${form} · ${read.read}`));
  });

  it("siembra al menos un sitio de cada forma que la regla cuenta", () => {
    const forms = new Set(SEEDED.map((seed) => seed.form));
    expect([...forms].sort()).toEqual([...POSITIONAL_FORMS].sort());
  });

  it("una lectura más en un archivo que ya tiene su excepción también cae", () => {
    const [first] = reads;
    if (!first) {
      throw new Error("No quedó ninguna lectura con la que probar");
    }
    const again = unlisted([...reads, first]);
    expect(again.length).toBeGreaterThan(0);
    expect(again.every((entry) => entry.startsWith(`${first.path}:`))).toBe(true);
  });
});

// La regla es de `src`. En `tests` había siete sitios con el `indexOf` de subíndice, que ya leen por
// valor, y nada impedía que volvieran: acá va la única búsqueda de subíndice que queda ahí.
const TEST_SEARCHES = [
  'tests/integration/finance.test.ts · indexOf · decisions[outcomes.findIndex((outcome)=>outcome.status==="fulfilled")]',
];

describe("las pruebas no vuelven a calcular una etiqueta con la posición de un valor", () => {
  it("en tests no queda más búsqueda de subíndice que la que no es de etiquetas", () => {
    const searches = positionalLabelReads(sourceFiles(join(ROOT, "tests")))
      .filter((read) => read.form === "indexOf" || read.form === "storedIndex")
      .map(key);
    expect(searches).toEqual(TEST_SEARCHES);
  });
});

describe("lo que la regla deja pasar", () => {
  it.each(ALLOWED)("$title", ({ text }) => {
    expect(positionalLabelReads([{ path: "src/app/sembrado/page.ts", text }])).toEqual([]);
  });

  it("no lee los generados del catálogo ni lo que no es TypeScript", () => {
    const text = `${HEAD}export const label = (kind: string) => tList("T-444")[KINDS.indexOf(kind as "A")];\n`;
    expect(positionalLabelReads([{ path: "src/shared/copy/textos.generated.ts", text }])).toEqual(
      [],
    );
    expect(positionalLabelReads([{ path: "src/app/notas.md", text }])).toEqual([]);
  });
});

// `tLabels` compara largos, no pares: `tLabels("T-381", CONDITIONS)` compila porque las dos listas
// traen cuatro piezas, y mostraría el estado de una membresía con la etiqueta de una condición. La
// tabla de pares dice qué lista lee cada orden; acá se comprueba que cada llamada de `src` arma uno
// de esos pares (ADR-126 regla 12). Donde el orden está escrito en el archivo se comparan sus
// valores con las posiciones de la tabla; donde se importa, su nombre con el del par.
const TABLE = [...PAIRS, ...UNSEEN_PAIRS];

// Los órdenes que el código nombra distinto que la tabla y que no están escritos en el archivo que
// los usa: acá va la tupla de verdad, y lo que se compara son sus valores. Con `path`, el nombre es
// de ese archivo y de ningún otro.
const NAMED_OTHERWISE: { order: string; path?: string; tuple: readonly string[] }[] = [
  { order: "COMPLIANCE_STATES", tuple: COMPLIANCE_STATES },
  { order: "MARKET_STATUSES", tuple: MARKET_STATUSES },
  {
    order: "challengeParticipationStatus.enumValues",
    tuple: challengeParticipationStatus.enumValues,
  },
  { order: "rewardStatus.enumValues", tuple: rewardStatus.enumValues },
  { order: "occasionApproval.enumValues", tuple: occasionApproval.enumValues },
  { order: "reconciliationStatus.enumValues", tuple: reconciliationStatus.enumValues },
  {
    order: "statusValues",
    path: "src/app/admin/solicitudes/page.tsx",
    tuple: [...REQUEST_STATUSES, "ALL"],
  },
];

const namedOtherwise = (call: LabelCall) =>
  NAMED_OTHERWISE.find(
    (other) => other.order === call.order && (!other.path || other.path === call.path),
  );

function paired(call: LabelCall): boolean {
  const values = call.values ?? namedOtherwise(call)?.tuple;
  return TABLE.some((pair) => {
    if (pair.code !== call.code) {
      return false;
    }
    return values
      ? values.length === Object.keys(pair.positions).length &&
          values.every((value, index) => pair.positions[value] === index)
      : pair.order === call.order;
  });
}

const sighting = (call: LabelCall) => `${call.path}:${call.line} · ${call.code} · ${call.order}`;

describe("cada llamada a tLabels de src arma un par de la tabla", () => {
  const calls = labelCalls(files).filter((call) => !call.path.startsWith("src/shared/copy/"));

  it("encuentra las llamadas de src", () => {
    expect(calls.length).toBeGreaterThan(150);
  });

  it("ninguna lee una lista con un orden que no es el de su par", () => {
    expect(calls.filter((call) => !paired(call)).map(sighting)).toEqual([]);
  });

  it("ningún nombre de más: cada orden nombrado distinto lo usa alguna llamada", () => {
    const used = new Set(calls.map(namedOtherwise));
    expect(NAMED_OTHERWISE.filter((other) => !used.has(other)).map((other) => other.order)).toEqual(
      [],
    );
  });

  it.each([
    {
      title: "otra lista del mismo largo, con una tupla importada",
      text: 'import { CONDITIONS } from "@/modules/permanence";\nimport { tLabels } from "@/shared/copy";\nexport const labels = tLabels("T-381", CONDITIONS);\n',
    },
    {
      title: "dos valores cruzados en un orden escrito en el archivo",
      text: 'import { tLabels } from "@/shared/copy";\nconst STATUSES = ["DRAFT", "CLOSED", "OPEN", "CANCELLED"] as const;\nexport const labels = tLabels("T-568", STATUSES);\n',
    },
    {
      title: "una tupla importada con el nombre del orden de otro par",
      text: 'import { CONDITIONS as STATUS_CODES } from "@/modules/permanence";\nimport { tLabels } from "@/shared/copy";\nexport const labels = tLabels("T-381", STATUS_CODES);\n',
    },
    {
      title: "una constante que guarda otra tupla con el nombre del orden de su par",
      text: 'import { CONDITIONS } from "@/modules/permanence";\nimport { tLabels } from "@/shared/copy";\nconst STATUS_CODES = CONDITIONS;\nexport const labels = tLabels("T-381", STATUS_CODES);\n',
    },
    {
      title: "otra lista del mismo largo, con tLabels importado con otro nombre",
      text: 'import { CONDITIONS } from "@/modules/permanence";\nimport { tLabels as etiquetas } from "@/shared/copy";\nexport const labels = etiquetas("T-381", CONDITIONS);\n',
    },
    {
      title: "un código que no está escrito en la llamada",
      text: 'import { tLabels } from "@/shared/copy";\nexport const labels = (code: "T-568", order: readonly ["A"]) => tLabels(code, order);\n',
    },
  ])("sembrada en memoria, cae $title", ({ text }) => {
    const seeded = labelCalls([{ path: "src/app/sembrado/page.ts", text }]);
    expect(seeded).toHaveLength(1);
    expect(seeded.filter(paired)).toEqual([]);
  });

  it("sembrada en memoria, pasa la que escribe el orden de su par con otro nombre", () => {
    const text =
      'import { tLabels } from "@/shared/copy";\nconst ESTADOS = ["DRAFT", "OPEN", "CLOSED", "CANCELLED"] as const;\nexport const labels = tLabels("T-568", ESTADOS);\n';
    const seeded = labelCalls([{ path: "src/app/sembrado/page.ts", text }]);
    expect(seeded).toHaveLength(1);
    expect(seeded.filter(paired)).toHaveLength(1);
  });
});

// Qué muestra un sitio cuando un valor no tiene etiqueta espera la decisión abierta 75 (DT-372). La
// migración conservó el respaldo de cada lectura, pero nada lo cuidaba: el tipo de `tLabels` ya no lo
// pide donde el valor es del enum, y quitar el `?? ""` del motivo guardado de un crédito o cambiarlo
// por el valor crudo dejaba `tsc` y todas las pruebas en verde. Acá queda, por archivo, cuántas
// lecturas caen a qué (ADR-126 regla 3). Ve el `Record` leído en la llamada o en la variable del
// archivo que lo guarda; el que llega por parámetro o por props lo cuidan las pruebas de su sitio.
describe("cada lectura por valor conserva el respaldo que tenía", () => {
  /** Por archivo, cuántas lecturas tienen cada forma de respaldo, en el orden de `FALLBACK_SHAPES`. */
  const byFile = (found: LabelFallback[]) =>
    Object.fromEntries(
      [...new Set(found.map(({ path }) => path))].map((path) => [
        path,
        FALLBACK_SHAPES.map(
          (shape) => found.filter((read) => read.path === path && read.shape === shape).length,
        ),
      ]),
    );
  const fallbacks = labelFallbacks(files);

  it("encuentra las lecturas por valor de src", () => {
    expect(fallbacks.length).toBeGreaterThan(150);
  });

  it("ningún archivo de src quita, agrega ni cambia un respaldo (decisión abierta 75)", () => {
    expect(byFile(fallbacks)).toEqual(FALLBACKS_BY_FILE);
  });

  it("sembrada en memoria, reconoce cada forma de respaldo", () => {
    const text = `${HEAD}const labels: Readonly<Record<string, string>> = tLabels("T-444", KINDS);
export const raw = (kind: string) => labels[kind] ?? kind;
export const empty = (kind: string) => (labels[kind] ?? "");
export const other = (kind: string) => labels[kind] ?? labels.A;
export const none = (kind: string) => labels[kind];
export const direct = (kind: "A" | "B") => tLabels("T-444", KINDS)[kind] ?? "";
export const cast = (kind: string) => labels[kind as "A"] ?? kind;
`;
    const seeded = labelFallbacks([{ path: "src/app/sembrado/page.ts", text }]);
    expect(seeded.map(({ shape }) => shape)).toEqual([
      "raw",
      "empty",
      "other",
      "none",
      "empty",
      "raw",
    ]);
    expect(new Set(seeded.map(({ shape }) => shape))).toEqual(new Set(FALLBACK_SHAPES));
  });
});
