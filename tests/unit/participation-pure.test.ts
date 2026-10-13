import { describe, expect, it } from "vitest";
import {
  assemblyCompliance,
  requiredTotal,
  termAssemblyRequirement,
} from "@/modules/participation/domain/assembly-pure";
import {
  canCancelWithOccasion,
  canTransitionCheckIn,
  closedToSelf,
  initialStatus,
  outcomeFor,
  type SelfCheckInFacts,
  selfCheckInEligibilityDenial,
  statusForDecision,
} from "@/modules/participation/domain/check-in-pure";
import {
  MAX_EXCUSED_ABSENCES,
  representationLadder,
} from "@/modules/participation/domain/committee-assembly";
import {
  type ViabilityInput,
  viabilityAlerts,
} from "@/modules/participation/domain/committee-viability-pure";
import {
  competitionRanks,
  levelFor,
  meanRate,
  rawRate,
  round4,
  smoothedRate,
  termCommitteeScore,
} from "@/modules/participation/domain/ledger-pure";
import {
  canOpenOccasion,
  canTransitionOccasion,
  defaultWindow,
  isAutoCloseDue,
  isShortNotice,
  windowState,
} from "@/modules/participation/domain/occasion-pure";
import {
  isPublicId,
  newPublicId,
  PUBLIC_ID_ALPHABET,
} from "@/modules/participation/domain/public-id-pure";
import {
  newRotatingSecret,
  rotatingCodeAt,
  secondsUntilRotation,
  verifyRotatingCode,
} from "@/modules/participation/domain/rotating-code-pure";
import { eligibleByCommittee } from "@/modules/participation/domain/scores";
import { midpointDay } from "@/shared/lib/dates-pure";

describe("publicId", () => {
  it("genera diez caracteres del alfabeto sin ambiguos y valida el formato", () => {
    const id = newPublicId();
    expect(id).toHaveLength(10);
    for (const char of id) {
      expect(PUBLIC_ID_ALPHABET).toContain(char);
    }
    expect(isPublicId(id)).toBe(true);
    expect(newPublicId(() => 0)).toBe("2222222222");
  });
  it("acepta los publicId heredados de GHPOINTS aunque traigan 0, 1, l u o", () => {
    expect(isPublicId("a0l1o9z8y7")).toBe(true);
    expect(isPublicId("ABCDEFGHJK")).toBe(false);
    expect(isPublicId("abc")).toBe(false);
    expect(isPublicId("abcdefghjk1")).toBe(false);
  });
});

describe("código rotativo", () => {
  const secret = "secreto-de-prueba";
  const occasionId = "ocasion1";
  const at = new Date("2026-09-04T15:00:30Z");

  it("es determinista, de seis dígitos, y cambia al minuto", () => {
    const code = rotatingCodeAt(secret, occasionId, at);
    expect(code).toMatch(/^[0-9]{6}$/);
    expect(rotatingCodeAt(secret, occasionId, new Date("2026-09-04T15:00:59Z"))).toBe(code);
    expect(rotatingCodeAt(secret, occasionId, new Date("2026-09-04T15:01:00Z"))).not.toBe(code);
    expect(rotatingCodeAt("otro", occasionId, at)).not.toBe(code);
    expect(rotatingCodeAt(secret, "ocasion2", at)).not.toBe(code);
  });
  it("acepta la ventana actual y la anterior, rechaza dos atrás, otro secreto y basura", () => {
    const previous = rotatingCodeAt(secret, occasionId, new Date("2026-09-04T14:59:10Z"));
    const twoBack = rotatingCodeAt(secret, occasionId, new Date("2026-09-04T14:58:10Z"));
    const current = rotatingCodeAt(secret, occasionId, at);
    expect(verifyRotatingCode(secret, occasionId, current, at)).toBe(true);
    expect(verifyRotatingCode(secret, occasionId, ` ${previous} `, at)).toBe(true);
    expect(verifyRotatingCode(secret, occasionId, twoBack, at)).toBe(false);
    expect(verifyRotatingCode("otro", occasionId, current, at)).toBe(false);
    expect(verifyRotatingCode(secret, occasionId, "12345", at)).toBe(false);
    expect(verifyRotatingCode(secret, occasionId, "abcdef", at)).toBe(false);
  });
  it("cuenta los segundos hasta la rotación y genera secretos distintos", () => {
    expect(secondsUntilRotation(new Date("2026-09-04T15:00:30Z"))).toBe(30);
    expect(secondsUntilRotation(new Date("2026-09-04T15:00:00Z"))).toBe(60);
    expect(newRotatingSecret()).not.toBe(newRotatingSecret());
  });
});

describe("ocasión", () => {
  it("solo admite las transiciones del ciclo de vida", () => {
    expect(canTransitionOccasion("DRAFT", "OPEN")).toBe(true);
    expect(canTransitionOccasion("DRAFT", "CLOSED")).toBe(false);
    expect(canTransitionOccasion("OPEN", "CLOSED")).toBe(true);
    expect(canTransitionOccasion("OPEN", "DRAFT")).toBe(false);
    expect(canTransitionOccasion("CLOSED", "OPEN")).toBe(false);
    expect(canTransitionOccasion("CLOSED", "CANCELLED")).toBe(true);
    expect(canTransitionOccasion("CANCELLED", "OPEN")).toBe(false);
  });
  it("calcula el estado de la ventana y la ventana por defecto alrededor del inicio", () => {
    const window = defaultWindow(new Date("2026-09-04T23:00:00Z"), {
      opensMinutesBefore: 30,
      closesMinutesAfter: 180,
    });
    expect(window.checkInOpensAt.toISOString()).toBe("2026-09-04T22:30:00.000Z");
    expect(window.checkInClosesAt.toISOString()).toBe("2026-09-05T02:00:00.000Z");
    expect(windowState(window, new Date("2026-09-04T22:29:59Z"))).toBe("NOT_OPEN");
    expect(windowState(window, new Date("2026-09-04T22:30:00Z"))).toBe("OPEN");
    expect(windowState(window, new Date("2026-09-05T02:00:00Z"))).toBe("CLOSED");
  });
  it("el líder abre solo las sin puntos; el cierre automático espera 24 horas tras la ventana", () => {
    expect(canOpenOccasion({ isAdmin: false }, { points: 0 })).toBe(true);
    expect(canOpenOccasion({ isAdmin: false }, { points: 10 })).toBe(false);
    expect(canOpenOccasion({ isAdmin: true }, { points: 10 })).toBe(true);
    const closesAt = new Date("2026-09-04T20:00:00Z");
    expect(
      isAutoCloseDue(
        { status: "OPEN", checkInClosesAt: closesAt },
        new Date("2026-09-05T19:59:00Z"),
        24,
      ),
    ).toBe(false);
    expect(
      isAutoCloseDue(
        { status: "OPEN", checkInClosesAt: closesAt },
        new Date("2026-09-05T20:00:00Z"),
        24,
      ),
    ).toBe(true);
    expect(
      isAutoCloseDue(
        { status: "CLOSED", checkInClosesAt: closesAt },
        new Date("2026-09-06T20:00:00Z"),
        24,
      ),
    ).toBe(false);
  });
});

describe("check-in", () => {
  it("reaprueba un rechazo pero no un anulado; el anfitrión nace aprobado", () => {
    expect(canTransitionCheckIn("PENDING", "APPROVED")).toBe(true);
    expect(canTransitionCheckIn("PENDING", "REJECTED")).toBe(true);
    expect(canTransitionCheckIn("PENDING", "CANCELLED")).toBe(false);
    expect(canTransitionCheckIn("REJECTED", "APPROVED")).toBe(true);
    expect(canTransitionCheckIn("APPROVED", "CANCELLED")).toBe(true);
    expect(canTransitionCheckIn("APPROVED", "REJECTED")).toBe(false);
    expect(canTransitionCheckIn("CANCELLED", "APPROVED")).toBe(false);
    expect(statusForDecision("APPROVE")).toBe("APPROVED");
    expect(statusForDecision("REJECT")).toBe("REJECTED");
    expect(statusForDecision("CANCEL")).toBe("CANCELLED");
    expect(initialStatus("SELF_QR", "AUTO")).toBe("APPROVED");
    expect(initialStatus("SELF_QR", "MANUAL")).toBe("PENDING");
    expect(initialStatus("HOST", "MANUAL")).toBe("APPROVED");
    expect(initialStatus("ADMIN", "MANUAL")).toBe("APPROVED");
    expect(outcomeFor("APPROVED", 10)).toBe("APPROVED_WITH_POINTS");
    expect(outcomeFor("APPROVED", 0)).toBe("APPROVED");
    expect(outcomeFor("PENDING", 10)).toBe("PENDING");
  });

  it("cancelar la ocasión anula pendientes y aprobadas, y nada más", () => {
    expect(canCancelWithOccasion("PENDING")).toBe(true);
    expect(canCancelWithOccasion("APPROVED")).toBe(true);
    expect(canCancelWithOccasion("REJECTED")).toBe(false);
    expect(canCancelWithOccasion("CANCELLED")).toBe(false);
    expect(canCancelWithOccasion("EXCUSED")).toBe(false);
  });
});

describe("registro propio: por qué no procede (ADR-120 regla 17)", () => {
  const TERM = "termino-de-la-ocasion";
  const opensAt = new Date("2026-03-10T15:00:00Z");
  const closesAt = new Date("2026-03-10T17:00:00Z");
  const before = new Date("2026-03-10T14:59:59Z");
  const during = new Date("2026-03-10T16:00:00Z");
  const after = new Date("2026-03-10T17:00:01Z");

  const nueva = { status: "ACTIVE", firstTermId: TERM } as const;
  const veterana = { status: "ACTIVE", firstTermId: "termino-anterior" } as const;
  const honoraria = { status: "HONORARY", firstTermId: "termino-anterior" } as const;
  const enLicencia = { status: "ON_LEAVE", firstTermId: TERM } as const;
  const deBaja = { status: "INACTIVE", firstTermId: TERM } as const;
  const deBajaVeterana = { status: "INACTIVE", firstTermId: "termino-anterior" } as const;

  type Over = Partial<Omit<SelfCheckInFacts, "occasion">> & {
    occasion?: Partial<SelfCheckInFacts["occasion"]>;
  };

  /** Una persona activa y nueva frente a una ocasión abierta, en su ventana y con el término abierto. */
  function facts(over: Over = {}): SelfCheckInFacts {
    return {
      termClosed: false,
      membership: nueva,
      now: during,
      ...over,
      occasion: {
        status: "OPEN",
        termId: TERM,
        newMembersOnly: false,
        checkInOpensAt: opensAt,
        checkInClosesAt: closesAt,
        ...over.occasion,
      },
    };
  }

  it.each<[string, Over, ReturnType<typeof selfCheckInEligibilityDenial>]>([
    ["una activa se registra", {}, null],
    ["una honoraria se registra", { membership: honoraria }, null],
    [
      "una veterana se registra si la ocasión no es solo para nuevos",
      { membership: veterana },
      null,
    ],
    [
      "una nueva se registra en una ocasión solo para nuevos",
      { occasion: { newMembersOnly: true } },
      null,
    ],
    ["la ventana abre en su hora exacta", { now: opensAt }, null],
    ["una ocasión en borrador", { occasion: { status: "DRAFT" } }, "DRAFT"],
    ["una ocasión cancelada", { occasion: { status: "CANCELLED" } }, "CANCELLED"],
    ["una ocasión cerrada", { occasion: { status: "CLOSED" } }, "CLOSED"],
    ["el término con los puntos cerrados", { termClosed: true }, "TERM_CLOSED"],
    ["antes de la ventana", { now: before }, "NOT_OPEN_YET"],
    ["después de la ventana", { now: after }, "WINDOW_CLOSED"],
    ["la ventana cierra en su hora exacta", { now: closesAt }, "WINDOW_CLOSED"],
    ["una persona en licencia", { membership: enLicencia }, "NOT_ELIGIBLE"],
    ["una persona de baja", { membership: deBaja }, "NOT_ELIGIBLE"],
    ["quien no tiene membresía", { membership: null }, "NOT_ELIGIBLE"],
    [
      "una veterana en una ocasión solo para nuevos",
      { membership: veterana, occasion: { newMembersOnly: true } },
      "NEW_MEMBERS_ONLY",
    ],
  ])("un motivo por caso: %s", (_title, over, expected) => {
    expect(selfCheckInEligibilityDenial(facts(over))).toBe(expected);
  });

  it.each<[string, Over, ReturnType<typeof selfCheckInEligibilityDenial>]>([
    [
      "el estado antes que el término",
      { occasion: { status: "CANCELLED" }, termClosed: true },
      "CANCELLED",
    ],
    ["el término antes que la ventana", { termClosed: true, now: after }, "TERM_CLOSED"],
    ["la ventana antes que la membresía", { now: before, membership: deBaja }, "NOT_OPEN_YET"],
    [
      "la membresía antes que solo nuevos",
      { membership: deBajaVeterana, occasion: { newMembersOnly: true } },
      "NOT_ELIGIBLE",
    ],
    [
      "sin membresía tampoco se responde solo nuevos",
      { membership: null, occasion: { newMembersOnly: true } },
      "NOT_ELIGIBLE",
    ],
    [
      "con todos a la vez manda el estado",
      {
        occasion: { status: "DRAFT", newMembersOnly: true },
        termClosed: true,
        now: after,
        membership: deBajaVeterana,
      },
      "DRAFT",
    ],
  ])("cuando aplican varios responde el primero: %s", (_title, over, expected) => {
    expect(selfCheckInEligibilityDenial(facts(over))).toBe(expected);
  });

  it("con el término cerrado siempre hay motivo: el comando no escribe sin tomarlo", () => {
    for (const status of ["OPEN", "DRAFT", "CLOSED", "CANCELLED"] as const) {
      for (const now of [before, during, after]) {
        for (const membership of [nueva, veterana, honoraria, enLicencia, deBaja, null]) {
          for (const newMembersOnly of [true, false]) {
            const denial = selfCheckInEligibilityDenial(
              facts({ termClosed: true, now, membership, occasion: { status, newMembersOnly } }),
            );
            expect(denial, `${status} ${now.toISOString()}`).not.toBeNull();
          }
        }
      }
    }
  });

  it("falla cerrado ante un valor que no reconoce", () => {
    // Un estado de ocasión o de membresía que el tipo todavía no conoce no abre el registro.
    expect(closedToSelf("OPEN")).toBeNull();
    expect(closedToSelf("ARCHIVED" as never)).toBe("ARCHIVED");
    expect(selfCheckInEligibilityDenial(facts({ occasion: { status: "ARCHIVED" as never } }))).toBe(
      "ARCHIVED",
    );
    expect(
      selfCheckInEligibilityDenial(
        facts({ membership: { status: "SUSPENDED" as never, firstTermId: TERM } }),
      ),
    ).toBe("NOT_ELIGIBLE");
  });
});

describe("ledger y tableros", () => {
  it("ubica el nivel por cortes", () => {
    const cutoffs = [0, 100, 250, 500, 1000];
    expect(levelFor(0, cutoffs)).toEqual({ index: 0, min: 0, next: 100, remaining: 100 });
    expect(levelFor(99, cutoffs)).toEqual({ index: 0, min: 0, next: 100, remaining: 1 });
    expect(levelFor(100, cutoffs)).toEqual({ index: 1, min: 100, next: 250, remaining: 150 });
    expect(levelFor(1200, cutoffs)).toEqual({ index: 4, min: 1000, next: null, remaining: null });
  });
  it("da puestos de competición 1, 2, 2, 4 con desempate visual por nombre", () => {
    const rows = [
      { name: "Zoe", total: 30 },
      { name: "Ana", total: 30 },
      { name: "Luis", total: 50 },
      { name: "Pedro", total: 10 },
    ];
    const ranked = competitionRanks(
      rows,
      (row) => row.total,
      (a, b) => a.name.localeCompare(b.name, "es"),
    );
    expect(ranked.map((item) => [item.rank, item.row.name])).toEqual([
      [1, "Luis"],
      [2, "Ana"],
      [2, "Zoe"],
      [4, "Pedro"],
    ]);
  });
  it("suaviza la tasa hacia la media de la ocasión con los ejemplos de ADR-024", () => {
    const mu = 0.4;
    expect(round4(smoothedRate(3, 3, mu, 5))).toBe(0.625);
    expect(round4(smoothedRate(1, 3, mu, 5))).toBe(0.375);
    expect(round4(smoothedRate(30, 30, mu, 5))).toBe(0.9143);
    expect(round4(smoothedRate(12, 30, mu, 5))).toBe(0.4);
    expect(rawRate(3, 3)).toBe(1);
    expect(rawRate(0, 0)).toBe(0);
    expect(meanRate([1, 0.5, 0])).toBe(0.5);
    expect(termCommitteeScore([])).toBeNull();
    expect(termCommitteeScore([0.5, 1])).toBe(0.75);
  });
});

describe("elegibles del score", () => {
  it("cuenta solo activos con pertenencia viva al empezar la ocasión", () => {
    const startsAt = new Date("2026-08-20T18:00:00Z");
    const before = new Date("2026-08-01T05:00:00Z");
    const after = new Date("2026-09-01T05:00:00Z");
    const roster = [
      {
        personId: "p1",
        committeeId: "c1",
        status: "ACTIVE" as const,
        joinedAt: null,
        leftAt: null,
      },
      {
        personId: "p2",
        committeeId: "c1",
        status: "ACTIVE" as const,
        joinedAt: before,
        leftAt: null,
      },
      {
        personId: "p3",
        committeeId: "c1",
        status: "ACTIVE" as const,
        joinedAt: after,
        leftAt: null,
      },
      {
        personId: "p4",
        committeeId: "c1",
        status: "ACTIVE" as const,
        joinedAt: before,
        leftAt: before,
      },
      {
        personId: "p5",
        committeeId: "c1",
        status: "ACTIVE" as const,
        joinedAt: before,
        leftAt: after,
      },
      {
        personId: "p6",
        committeeId: "c1",
        status: "ON_LEAVE" as const,
        joinedAt: before,
        leftAt: null,
      },
      {
        personId: "p7",
        committeeId: "c2",
        status: "ACTIVE" as const,
        joinedAt: after,
        leftAt: null,
      },
    ];
    const eligible = eligibleByCommittee(roster, startsAt);
    expect([...(eligible.get("c1") ?? [])].sort()).toEqual(["p1", "p2", "p5"]);
    expect(eligible.has("c2")).toBe(false);
  });
});

describe("asambleas", () => {
  it("deriva el requisito de las ocasiones del término: elección y segunda vuelta cuando existen (ADR-060 regla 13)", () => {
    const none = termAssemblyRequirement({ requiredOrdinaryAssemblies: 1 }, []);
    expect(none).toMatchObject({
      requiredOrdinary: 1,
      requiresBoardElection: false,
      requiresRunoff: false,
    });
    const election = termAssemblyRequirement({ requiredOrdinaryAssemblies: 1 }, [
      { assemblyKind: "BOARD_ELECTION", status: "OPEN" },
    ]);
    expect(election).toMatchObject({
      requiredOrdinary: 1,
      requiresBoardElection: true,
      requiresRunoff: false,
    });
    const withRunoff = termAssemblyRequirement({ requiredOrdinaryAssemblies: 2 }, [
      { assemblyKind: "BOARD_ELECTION", status: "OPEN" },
      { assemblyKind: "RUNOFF", status: "OPEN" },
    ]);
    expect(withRunoff.requiresRunoff).toBe(true);
    expect(requiredTotal(withRunoff)).toBe(4);
  });
  it("marca la asamblea citada con menos de tres días hábiles (Regl. art. 15 par. 1)", () => {
    // Creada un lunes: tres días hábiles llegan al jueves.
    const monday = new Date("2026-09-14T15:00:00Z");
    expect(isShortNotice(monday, new Date("2026-09-16T23:00:00Z"))).toBe(true);
    expect(isShortNotice(monday, new Date("2026-09-17T15:00:00Z"))).toBe(false);
    // Creada un jueves: el fin de semana no cuenta, llega al martes.
    const thursday = new Date("2026-09-17T15:00:00Z");
    expect(isShortNotice(thursday, new Date("2026-09-21T15:00:00Z"))).toBe(true);
    expect(isShortNotice(thursday, new Date("2026-09-22T15:00:00Z"))).toBe(false);
  });
  it("calcula el cumplimiento por persona y lo que falta en orden", () => {
    const requirement = termAssemblyRequirement({ requiredOrdinaryAssemblies: 1 }, [
      { assemblyKind: "BOARD_ELECTION", status: "OPEN" },
      { assemblyKind: "RUNOFF", status: "OPEN" },
    ]);
    const none = assemblyCompliance(requirement, []);
    expect(none.compliant).toBe(false);
    expect(none.missing).toEqual(["ORDINARY", "BOARD_ELECTION", "RUNOFF"]);
    const all = assemblyCompliance(requirement, [
      { assemblyKind: "ORDINARY", status: "APPROVED" },
      { assemblyKind: "ORDINARY", status: "CANCELLED" },
      { assemblyKind: "BOARD_ELECTION", status: "APPROVED" },
      { assemblyKind: "RUNOFF", status: "APPROVED" },
    ]);
    expect(all.compliant).toBe(true);
    expect(all.ordinaryAttended).toBe(1);
    expect(all.attendedTotal).toBe(3);
    const excused = assemblyCompliance(requirement, [
      { assemblyKind: "ORDINARY", status: "EXCUSED" },
      { assemblyKind: "BOARD_ELECTION", status: "EXCUSED" },
      { assemblyKind: "RUNOFF", status: "EXCUSED" },
    ]);
    expect(excused).toMatchObject({
      compliant: true,
      missing: [],
      ordinaryAttended: 0,
      attendedTotal: 0,
    });
    const pending = assemblyCompliance(requirement, [
      { assemblyKind: "ORDINARY", status: "PENDING" },
      { assemblyKind: "BOARD_ELECTION", status: "APPROVED" },
    ]);
    expect(pending.missing).toEqual(["ORDINARY", "RUNOFF"]);
  });
});

describe("excusa válida aceptada (ADR-060 regla 5)", () => {
  it("un pendiente, un rechazado o un anulado pasan a excusado; un aprobado no, y el excusado es terminal", () => {
    expect(canTransitionCheckIn("PENDING", "EXCUSED")).toBe(true);
    expect(canTransitionCheckIn("REJECTED", "EXCUSED")).toBe(true);
    expect(canTransitionCheckIn("CANCELLED", "EXCUSED")).toBe(true);
    expect(canTransitionCheckIn("APPROVED", "EXCUSED")).toBe(false);
    expect(canTransitionCheckIn("EXCUSED", "APPROVED")).toBe(false);
    expect(canTransitionCheckIn("EXCUSED", "CANCELLED")).toBe(false);
  });
});

describe("representación de los comités en la asamblea (ADR-060 regla 7)", () => {
  it("sube la escalera del Reglamento (art. 64) con cada falta sin excusa y admite dos con excusa", () => {
    expect(representationLadder(0)).toBe(0);
    expect(representationLadder(1)).toBe(1);
    expect(representationLadder(2)).toBe(2);
    expect(representationLadder(3)).toBe(3);
    expect(representationLadder(7)).toBe(3);
    expect(MAX_EXCUSED_ABSENCES).toBe(2);
  });
});

describe("viabilidad del comité (ADR-060 regla 8)", () => {
  const healthy: ViabilityInput = {
    status: "ACTIVE",
    directions: 4,
    missingRequired: 0,
    membersOutsideDirection: 8,
    unexcusedAbsences: 1,
    representedAssemblies: 3,
    closedAssemblies: 4,
    eventsThisTerm: 1,
    pastMidterm: true,
    trialEndsOn: null,
    todayKey: "2026-10-05",
  };

  it("un comité sano no avisa nada y un inactivo tampoco", () => {
    expect(viabilityAlerts(healthy)).toEqual([]);
    expect(viabilityAlerts({ ...healthy, status: "INACTIVE", directions: 0 })).toEqual([]);
  });

  it("avisa las causales de desactivación del Regl. art. 26", () => {
    expect(
      viabilityAlerts({
        ...healthy,
        directions: 2,
        missingRequired: 1,
        membersOutsideDirection: 5,
        unexcusedAbsences: 3,
        eventsThisTerm: 0,
      }),
    ).toEqual(["FEW_DIRECTIONS", "MISSING_REQUIRED", "FEW_MEMBERS", "ABSENCES", "NO_EVENT"]);
    // Antes de la mitad del término no se reclama el evento.
    expect(viabilityAlerts({ ...healthy, eventsThisTerm: 0, pastMidterm: false })).toEqual([]);
  });

  it("la mitad del término es un día del calendario, con días pares o impares", () => {
    // 2026-1: 180 días del 1 de enero al 30 de junio.
    expect(midpointDay("2026-01-01", "2026-06-30")).toBe("2026-04-01");
    // 2026-2: 183 días del 1 de julio al 31 de diciembre; el medio día que sobra no cuenta.
    expect(midpointDay("2026-07-01", "2026-12-31")).toBe("2026-09-30");
  });

  it("en prueba exige diez miembros, el 90 % de asambleas y avisa el vencimiento (Regl. art. 25)", () => {
    expect(
      viabilityAlerts({
        ...healthy,
        status: "ON_TRIAL",
        membersOutsideDirection: 9,
        representedAssemblies: 3,
        closedAssemblies: 4,
        trialEndsOn: "2026-10-20",
      }),
    ).toEqual(["TRIAL_FEW_MEMBERS", "TRIAL_LOW_ATTENDANCE", "TRIAL_ENDING"]);
    expect(
      viabilityAlerts({
        ...healthy,
        status: "ON_TRIAL",
        membersOutsideDirection: 10,
        representedAssemblies: 9,
        closedAssemblies: 10,
        trialEndsOn: "2027-03-01",
      }),
    ).toEqual([]);
  });
});

describe("requisito de asambleas del término", () => {
  type Kind = "ORDINARY" | "BOARD_ELECTION" | "RUNOFF" | null;
  type Status = "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
  const term = { requiredOrdinaryAssemblies: 1 };
  const occasion = (assemblyKind: Kind, status: Status = "OPEN") => ({ assemblyKind, status });

  it("sin asambleas especiales exige solo las ordinarias del término", () => {
    expect(
      termAssemblyRequirement({ requiredOrdinaryAssemblies: 2 }, [
        occasion("ORDINARY"),
        occasion(null),
      ]),
    ).toEqual({
      requiredOrdinary: 2,
      requiresBoardElection: false,
      requiresRunoff: false,
      adjusted: false,
      reason: null,
    });
    expect(termAssemblyRequirement(term, [])).toMatchObject({
      requiredOrdinary: 1,
      requiresBoardElection: false,
      requiresRunoff: false,
    });
  });

  it("exige la elección de junta y la segunda vuelta que existen, en borrador, abiertas o cerradas", () => {
    for (const status of ["DRAFT", "OPEN", "CLOSED"] as const) {
      expect(
        termAssemblyRequirement(term, [
          occasion("BOARD_ELECTION", status),
          occasion("RUNOFF", status),
        ]),
      ).toMatchObject({ requiresBoardElection: true, requiresRunoff: true });
    }
  });

  it("una especial cancelada no exige nada, y otra del mismo tipo sin cancelar sí", () => {
    expect(
      termAssemblyRequirement(term, [occasion("BOARD_ELECTION"), occasion("RUNOFF", "CANCELLED")]),
    ).toMatchObject({ requiresBoardElection: true, requiresRunoff: false });
    expect(
      termAssemblyRequirement(term, [
        occasion("RUNOFF", "CANCELLED"),
        occasion("RUNOFF", "CLOSED"),
      ]),
    ).toMatchObject({ requiresBoardElection: false, requiresRunoff: true });
  });

  it("responde lo mismo con todas las ocasiones del término que con solo sus asambleas sin cancelar", () => {
    const all = [
      occasion(null),
      occasion("ORDINARY", "CLOSED"),
      occasion("BOARD_ELECTION"),
      occasion("RUNOFF", "CANCELLED"),
      occasion(null, "CANCELLED"),
    ];
    const assemblies = all.filter(
      (item) => item.assemblyKind !== null && item.status !== "CANCELLED",
    );
    expect(termAssemblyRequirement(term, all)).toEqual(termAssemblyRequirement(term, assemblies));
    expect(termAssemblyRequirement(term, all)).toMatchObject({
      requiresBoardElection: true,
      requiresRunoff: false,
    });
  });
});
