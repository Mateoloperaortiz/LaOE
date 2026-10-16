import { describe, expect, it } from "vitest";
import { insertTargets, looseInserts } from "../../scripts/lib/test-suite-metrics";
import { countByKey, expectReasonedOnce, sourceFiles } from "../helpers/ratchet";

// La siembra de las pruebas pasa por la fábrica de `tests/factories`, que comparten integración y
// E2E (DT-013, ADR-124 reglas 5 y 6). Una fila escrita a mano en una prueba puede armar un estado que
// ningún comando deja, y la prueba queda en verde sobre algo imposible. Por eso esta prueba lee el
// código: fuera de la fábrica no admite un `.insert(` ni un `insert into` que no esté en su lista de
// excepciones.
//
// `EXCEPTIONS` es para el estado que ningún comando produce y que la prueba arma a propósito, y para
// la escritura que no es siembra. Cada una lleva su razón. No hay otra lista ni un techo: la de
// pendientes, que guardaba lo que faltaba mudar, quedó vacía y salió (#305). Un insert nuevo pasa por
// la fábrica o entra acá con su razón escrita.
//
// Lee todo `tests/` menos la fábrica, que es la que escribe, y las unitarias, que no tocan la base y
// traen insert de muestra en sus cadenas.
//
// La lista iguala la fila «Insert sueltos» de `npm run audit:metrics`. El destino es el nombre que
// el archivo le pasa a `.insert(`, o `into` y lo que sigue a `insert into` en un SQL crudo: una tabla
// importada con otro nombre figura con ese nombre, y un SQL que arma el nombre, con `<…>`.

const FACTORY_TABLES = ["person", "permission", "membership", "term"];
const SUITES = ["tests/integration", "tests/e2e"];
const NOT_SEEDING_DIRS = ["tests/factories/", "tests/unit/"];

interface Exception {
  path: string;
  /** La tabla que recibe `.insert(`, o `into` y el nombre que sigue a `insert into`. */
  target: string;
  /** Cuántos insert sueltos de ese destino quedan en el archivo. */
  inserts: number;
  /** Por qué no pasan por la fábrica, en una frase. */
  reason: string;
}

const PROBE_SCHEMA =
  "Son filas del esquema de sondeo que la prueba crea para ejercitar la foto y la restauración de la E2E: no son tablas de la casa y la fábrica no las conoce.";

// Antes de sumar uno acá, sembralo con la fábrica: la lista es para el estado que ningún comando
// produce y que la prueba arma a propósito, y para la escritura que no es siembra.
const EXCEPTIONS: Exception[] = [
  {
    path: "tests/e2e/committee-podium.spec.ts",
    target: "committeeParticipation",
    inserts: 1,
    reason:
      "Son fotos históricas de participación con tasas y denominadores explícitos, distintas de la población actual de un integrante por comité: el recálculo actual no reproduce esa historia y la prueba necesita conservarla para contrastar los componentes y puestos del podio.",
  },
  {
    path: "tests/e2e/database.ts",
    target: "into <tables[index]>",
    inserts: 1,
    reason:
      "Es la restauración de la E2E, que vuelve a llenar cada tabla desde la foto (ADR-116 regla 21): copia filas, no siembra un estado.",
  },
  {
    path: "tests/e2e/sistema-jobs.spec.ts",
    target: "outbox",
    inserts: 1,
    reason:
      "Es un evento en letra muerta con su último error, para ver la pantalla de trabajos: solo el poller lo deja así, después de agotar los reintentos.",
  },
  {
    path: "tests/integration/admin-export-truncated.test.ts",
    target: "into point_entry",
    inserts: 1,
    reason:
      "Son los movimientos de un punto que pasan el tope del exporte, escritos en una sola sentencia con `generate_series` y con la fecha escalonada: es volumen con fechas elegidas, y por el único escritor del libro haría falta un comando por fila (ADR-119 regla 8).",
  },
  {
    path: "tests/integration/calendar-token-withdrawal.test.ts",
    target: "calendarToken",
    inserts: 3,
    reason:
      "Son tokens de calendario que quedaron de antes de la regla, en manos de quien ya salió o fue borrado, y el que la prueba retiene dentro de una transacción ajena: el comando no le deja un token a quien ya no está.",
  },
  {
    path: "tests/integration/campaigns-quota-status.test.ts",
    target: "appConfig",
    inserts: 1,
    reason:
      "Son la reserva y el corte del cupo como los deja otro proceso: van directo a la base, sin pasar por `setConfig`, para que la caché de configuración de este proceso no se entere, que es lo que la prueba mira.",
  },
  {
    path: "tests/integration/crm.test.ts",
    target: "interaction",
    inserts: 1,
    reason:
      "Es la segunda interacción con la misma referencia, que la prueba escribe para afirmar que el índice de la línea de tiempo la descarta.",
  },
  {
    path: "tests/integration/dashboard.test.ts",
    target: "outbox",
    inserts: 1,
    reason:
      "Son eventos sintéticos en cada estado del outbox (pendiente, en letra muerta y despachado) para contar el tablero: a letra muerta solo llega el poller, después de agotar los reintentos.",
  },
  {
    path: "tests/integration/db.ts",
    target: "into public.<table>",
    inserts: 1,
    reason:
      "Es el vaciado, que devuelve los catálogos de migración a la foto (ADR-124 regla 3): copia filas de la foto, no siembra un estado.",
  },
  {
    path: "tests/integration/e2e-baseline.test.ts",
    target: "into e2e_probe.Préstamo Raro",
    inserts: 1,
    reason: PROBE_SCHEMA,
  },
  {
    path: "tests/integration/e2e-baseline.test.ts",
    target: "into e2e_probe.author",
    inserts: 3,
    reason: PROBE_SCHEMA,
  },
  {
    path: "tests/integration/e2e-baseline.test.ts",
    target: "into e2e_probe.book",
    inserts: 4,
    reason: PROBE_SCHEMA,
  },
  {
    path: "tests/integration/e2e-baseline.test.ts",
    target: "into e2e_probe.shelf",
    inserts: 3,
    reason: PROBE_SCHEMA,
  },
  {
    path: "tests/integration/e2e-baseline.test.ts",
    target: "into e2e_probe_baseline.book",
    inserts: 1,
    reason: PROBE_SCHEMA,
  },
  {
    path: "tests/integration/game2048.test.ts",
    target: "game2048Run",
    inserts: 1,
    reason:
      "Es la segunda partida acreditada de una persona en un mismo día, que la prueba espera ver rechazada por `game2048_run_person_day_credited_unique`: ningún comando llega a escribirla.",
  },
  {
    path: "tests/integration/gamer.test.ts",
    target: "pointEntry",
    inserts: 1,
    reason:
      "Son créditos legados de partidas importadas de GHPOINTS, anteriores al modelo actual, con fecha y origen originales: los comandos de hoy no crean entradas LEGACY y la fábrica no puede escribir el libro (ADR-119 regla 8).",
  },
  {
    path: "tests/integration/gamification-regressions.test.ts",
    target: "achievement",
    inserts: 1,
    reason:
      "Es un logro retirado que todavía ocupa su posición destacada, como quedaban antes de la migración 0032, que la prueba vuelve a correr para verla soltar esa posición: retirar un logro hoy ya la suelta.",
  },
  {
    path: "tests/integration/gamification-regressions.test.ts",
    target: "challengeEvidenceFile",
    inserts: 1,
    reason:
      "Es una evidencia lista que todavía sirve el archivo original, como quedaban antes de la migración 0032, que la prueba vuelve a correr para verla devolverla a la cola: hoy una evidencia solo queda lista después de procesada.",
  },
  {
    path: "tests/integration/gamification-rewards.test.ts",
    target: "pointEntry",
    inserts: 3,
    reason:
      "Son entradas del libro fuera del rango de puntos, sin su premio o con un premio que no les toca, que la prueba espera ver rechazadas por los checks de `point_entry`: el único escritor del libro no llega a armarlas (ADR-119 regla 8).",
  },
  {
    path: "tests/integration/identity-prune.test.ts",
    target: "accessGrant",
    inserts: 1,
    reason:
      "Son enlaces de acceso ya vencidos, que es lo que la poda tiene que borrar: ningún comando escribe un enlace viejo.",
  },
  {
    path: "tests/integration/identity-prune.test.ts",
    target: "loginAttempt",
    inserts: 1,
    reason:
      "Son intentos de ingreso de hace días, que es lo que la poda tiene que borrar: ningún comando escribe un intento viejo.",
  },
  {
    path: "tests/integration/identity-prune.test.ts",
    target: "session",
    inserts: 1,
    reason:
      "Son sesiones ya vencidas, que es lo que la poda tiene que borrar: ningún comando escribe una sesión vieja.",
  },
  {
    path: "tests/integration/macroevent-board.test.ts",
    target: "appointment",
    inserts: 3,
    reason:
      "Son el nombramiento histórico de Publicidad, un cargo que ya no está en el catálogo del macroevento, y los dos que la prueba espera ver rechazados por `appointment_macroevent_consistent`: ningún comando nombra con un cargo retirado ni llega a escribir los otros dos.",
  },
  {
    path: "tests/integration/media.test.ts",
    target: "mediaAsset",
    inserts: 1,
    reason:
      "Es un medio de un tipo que hoy la subida no admite, cargado antes de la regla: la prueba necesita que ya esté para ver qué hace la casa con él.",
  },
  {
    path: "tests/integration/notifications.test.ts",
    target: "pushSubscription",
    inserts: 1,
    reason:
      "Son suscripciones de antes de que se validara el destino, una hacia una dirección interna: el comando de hoy la rechaza, y la prueba necesita que ya esté para ver que no se le envía.",
  },
  {
    path: "tests/integration/otp.test.ts",
    target: "otpChallenge",
    inserts: 1,
    reason:
      "Es un código de ingreso ya vencido, que la prueba espera ver rechazado: pedir un código siempre deja uno vigente.",
  },
  {
    path: "tests/integration/outbox.test.ts",
    target: "outbox",
    inserts: 1,
    reason:
      "Es el evento que deja un poller caído a mitad de un despacho, con su intento contado y su clave tomada: ningún comando deja esa fila.",
  },
  {
    path: "tests/integration/panal.test.ts",
    target: "panalWord",
    inserts: 2,
    reason:
      "Son la palabra que guarda un escritor sintético dentro de la transacción que la prueba retiene para forzar el cruce, y las de un panal entero guardadas sin sus puntos, como las deja un despliegue gradual: la primera tiene que ir por esa transacción, y por el comando cada palabra cuenta los suyos.",
  },
  {
    path: "tests/integration/panal.test.ts",
    target: "pointEntry",
    inserts: 5,
    reason:
      "Son un premio histórico del Panal sin meta, de antes de las metas, y las entradas de importe incorrecto o de meta repetida que la prueba espera ver rechazadas por la base: el único escritor del libro no arma ninguna (ADR-119 regla 8).",
  },
  {
    path: "tests/integration/permanence-facts.test.ts",
    target: "leaderScore",
    inserts: 2,
    reason:
      "Son el puntaje de un criterio y su repetido, que la prueba escribe uno por uno para ver chocar el segundo con `leader_score_unique` y que un criterio con puntajes no se deja borrar: es la prueba de las restricciones de la tabla.",
  },
  {
    path: "tests/integration/permanence-facts.test.ts",
    target: "permanenceDecision",
    inserts: 7,
    reason:
      "Son las decisiones que la prueba escribe una por una para ver chocar la repetida de un comité y la de la persona con sus índices únicos, y las que espera ver rechazadas por `permanence_decision_reason_when_changed`, `permanence_decision_person_scope` y `permanence_decision_proposal_reason_range`: las que entran están para que las demás choquen o para fijar los bordes del rango, con un motivo de la propuesta que `confirmDecisions` nunca escribiría.",
  },
  {
    path: "tests/integration/permanence-facts.test.ts",
    target: "workGroupMembership",
    inserts: 1,
    reason:
      "Es una evaluación buena sin fecha ni evaluador, que la prueba espera ver rechazada por `work_group_membership_evaluated_consistent`: la fábrica siempre le pone la fecha.",
  },
  {
    path: "tests/integration/release-skipped-migration.test.ts",
    target: "into <table>",
    inserts: 1,
    reason:
      "Es el segundo registro de una misma migración en el diario aplicado de un esquema de sondeo, que la prueba copia para ver que `db:release` termina bien igual: no es una tabla de la casa y la fábrica no la conoce.",
  },
  {
    path: "tests/integration/schema-constraints.test.ts",
    target: "committeeMembership",
    inserts: 2,
    reason:
      "Son la pertenencia con cargo GENERAL que la prueba deja sin su cargo asignado, para escribirlo ella y verlo chocar con los índices, y la de un cargo fuera del catálogo que espera ver rechazada: la fábrica escribe el cargo asignado y no llega a ninguna de las dos.",
  },
  {
    path: "tests/integration/schema-constraints.test.ts",
    target: "committeeRoleAssignment",
    inserts: 3,
    reason:
      "Son los cargos asignados que la prueba escribe uno por uno para ver chocar el titular repetido y el cargo repetido de una pertenencia con sus índices únicos: ningún comando llega a escribirlos.",
  },
  {
    path: "tests/integration/schema-constraints.test.ts",
    target: "membership",
    inserts: 1,
    reason:
      "Es la segunda membresía de una misma persona, que la prueba espera ver rechazada por `membership_person_unique`: ningún comando llega a escribirla.",
  },
  {
    path: "tests/integration/schema-constraints.test.ts",
    target: "membershipTerm",
    inserts: 4,
    reason:
      "Son las condiciones repetidas de una persona en un término y en un comité que la prueba espera ver rechazadas por los índices únicos: la fábrica actualiza la que ya está en vez de chocar.",
  },
  {
    path: "tests/integration/schema-constraints.test.ts",
    target: "permission",
    inserts: 4,
    reason:
      "Son el permiso repetido, el de líder sin comité y el ADMIN con comité que la prueba espera ver rechazados por los índices únicos y por `permission_committee_scope`: la fábrica devuelve el permiso que ya está en vez de chocar.",
  },
  {
    path: "tests/integration/schema-constraints.test.ts",
    target: "person",
    inserts: 2,
    reason:
      "Es la mutación de un comando de prueba: tiene que ir por `ctx.tx` para afirmar que mutación, auditoría y evento se confirman y se deshacen en la misma transacción.",
  },
  {
    path: "tests/integration/sudoku.test.ts",
    target: "sudokuRun",
    inserts: 1,
    reason:
      "Es la segunda partida acreditada de una persona en un mismo día, que la prueba espera ver rechazada por `sudoku_run_person_day_credited_unique`: ningún comando llega a escribirla.",
  },
  {
    path: "tests/integration/survey-invites-retry.test.ts",
    target: "occasionSurveyInvite",
    inserts: 1,
    reason:
      "Es la invitación que deja otra corrida, escrita dentro de una transacción que la prueba retiene para forzar el cruce: tiene que ir por esa transacción, y la fábrica escribe por `getDb()`.",
  },
  {
    path: "tests/integration/tasks-characterization.test.ts",
    target: "task",
    inserts: 1,
    reason:
      "Es una tarea de antes del despliegue, sin clave, como la dejaba el sitio que la abría: `openTaskForReason` hoy le pone la suya, y la prueba necesita la vieja para ver que se reconoce sin abrir otra.",
  },
  {
    path: "tests/integration/truncate-all-tables.test.ts",
    target: "into <OTHER_SCHEMA>.tag",
    inserts: 1,
    reason:
      "Es la fila de una tabla de otro esquema, que la prueba crea para afirmar que el vaciado no la toca: no es una tabla de la casa.",
  },
  {
    path: "tests/integration/truncate-all-tables.test.ts",
    target: "into public.<NEW_TABLE>",
    inserts: 1,
    reason:
      "Es la fila de una tabla que la prueba crea en `public`, para afirmar que el vaciado la alcanza sin que nadie la anote: no es una tabla del esquema de la casa.",
  },
  {
    path: "tests/integration/truncate-all.test.ts",
    target: "into <table>",
    inserts: 2,
    reason:
      "Es la caracterización del vaciado, que le pone una fila a cada tabla de `public` y vuelve a escribir las de una en otro orden físico: recorre el esquema entero, no siembra el estado de una prueba.",
  },
  {
    path: "tests/integration/truncate-all.test.ts",
    target: "into app_config",
    inserts: 1,
    reason:
      "Es la clave de configuración que la caracterización del vaciado escribe sin avisarle a la caché, con un autor que no existe y una fecha vieja, para afirmar que el vaciado devuelve el catálogo a la foto: ningún comando deja esa fila.",
  },
];

/** Todo `tests/` menos la fábrica y las unitarias: donde un insert suelto es siembra a mano. */
function seedingSources() {
  return sourceFiles("tests").filter(
    ({ path }) => !NOT_SEEDING_DIRS.some((dir) => path.startsWith(dir)),
  );
}

const named = (path: string, target: string) => `${path} › ${target}`;

/** Cuántos insert sueltos de cada destino hay de verdad en cada archivo. */
function looseInsertCounts(): Record<string, number> {
  return countByKey(insertTargets(seedingSources()), ({ path, target }) => named(path, target));
}

describe("la siembra de las pruebas", () => {
  it("pasa por la fábrica: fuera de ella quedan solo los insert de la lista de excepciones, ni uno más ni uno menos", () => {
    expect(looseInsertCounts()).toEqual(
      Object.fromEntries(
        EXCEPTIONS.map(({ path, target, inserts }) => [named(path, target), inserts]),
      ),
    );
  });

  it("cada destino de un archivo está una sola vez en la lista, y cada excepción trae su razón en una frase", () => {
    expectReasonedOnce(EXCEPTIONS, ({ path, target }) => named(path, target));
  });

  it.each(
    SUITES,
  )("la lista de excepciones iguala la fila de insert sueltos de audit:metrics en %s", (dir) => {
    const listed = (raw: boolean) =>
      EXCEPTIONS.filter(
        ({ path, target }) => path.startsWith(`${dir}/`) && target.startsWith("into ") === raw,
      ).reduce((total, { inserts }) => total + inserts, 0);

    expect({ calls: listed(false), raw: listed(true) }).toEqual(looseInserts(sourceFiles(dir)));
  });

  it("la fábrica es la que escribe las cuatro tablas", () => {
    const written = insertTargets(sourceFiles("tests/factories"))
      .map(({ target }) => target)
      .filter((target) => FACTORY_TABLES.includes(target));

    expect([...new Set(written)].sort()).toEqual([...FACTORY_TABLES].sort());
  });

  it("la fábrica no escribe puntos ni nombra su tabla: `point_entry` tiene un solo escritor, el libro (ADR-119 regla 8)", () => {
    const factory = sourceFiles("tests/factories");

    expect(insertTargets(factory).filter(({ target }) => /point_?entry/i.test(target))).toEqual([]);
    // Importada con otro nombre no se vería en el destino del insert: tampoco puede nombrarla.
    for (const file of factory) {
      expect(file.text, file.path).not.toMatch(/\bpointEntry\b|\bpoint_entry\b/);
    }
  });

  it("cada insert de la fábrica nombra una tabla que importa de un `schema.ts`: ninguna función recibe la tabla y escribe lo que le pasen", () => {
    for (const file of sourceFiles("tests/factories")) {
      const tables = new Set(
        [...file.text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/modules\/[a-z0-9-]+\/schema"/g)]
          .flatMap((match) => (match[1] ?? "").split(","))
          .map((name) => name.trim())
          .filter(Boolean),
      );

      expect(insertTargets([file]).filter(({ target }) => !tables.has(target))).toEqual([]);
    }
  });
});
