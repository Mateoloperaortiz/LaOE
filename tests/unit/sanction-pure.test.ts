import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  deriveDates,
  expulsionWarning,
  hasOfficeBan,
  isLive,
  SANCTION_KINDS,
  type SanctionLike,
  sanctionState,
  suspendedUntil,
} from "@/modules/people/domain/sanction-pure";
import { tList } from "@/shared/copy";

// Faltas y sanciones (Regl. cap. 9 y Anexo 1; ADR-060 regla 6): duraciones, vigencia y efectos.

function sanction(overrides: Partial<SanctionLike> & { kind: SanctionLike["kind"] }): SanctionLike {
  const occurredOn = overrides.occurredOn ?? "2026-09-01";
  const dates = deriveDates(overrides.kind, occurredOn, overrides.suspendedUntil ?? null);
  if ("error" in dates) {
    throw new Error(dates.error);
  }
  return { occurredOn, revokedAt: null, ...dates, ...overrides };
}

describe("fechas derivadas", () => {
  it("un llamado suspende 7 días, una leve 20, una grave nada, y todo vence al año", () => {
    expect(deriveDates("WARNING", "2026-09-01", null)).toEqual({
      suspendedFrom: "2026-09-01",
      suspendedUntil: "2026-09-08",
      expiresOn: "2027-09-01",
    });
    expect(deriveDates("MINOR", "2026-09-01", null)).toEqual({
      suspendedFrom: "2026-09-01",
      suspendedUntil: "2026-09-21",
      expiresOn: "2027-09-01",
    });
    expect(deriveDates("MAJOR", "2026-09-01", null)).toEqual({
      suspendedFrom: null,
      suspendedUntil: null,
      expiresOn: "2027-09-01",
    });
    expect(deriveDates("OFFICE_BAN", "2026-02-28", null)).toMatchObject({
      expiresOn: "2027-02-28",
    });
  });

  it("una suspensión explícita exige su fin dentro del mes siguiente (Regl. art. 58)", () => {
    expect(deriveDates("SUSPENSION", "2026-09-01", "2026-09-25")).toEqual({
      suspendedFrom: "2026-09-01",
      suspendedUntil: "2026-09-25",
      expiresOn: "2027-09-01",
    });
    expect(deriveDates("SUSPENSION", "2026-09-01", null)).toEqual({ error: "T-2241" });
    expect(deriveDates("SUSPENSION", "2026-09-01", "2026-08-30")).toEqual({ error: "T-2241" });
    expect(deriveDates("SUSPENSION", "2026-09-01", "2026-10-02")).toEqual({ error: "T-2241" });
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(deriveDates("SUSPENSION", "2026-01-31", "2026-03-01")).toEqual({ error: "T-2241" });
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("los tipos tienen su etiqueta en T-2229 en el mismo orden", () => {
    expect(tList("T-2229")).toHaveLength(SANCTION_KINDS.length);
    expect(tList("T-2243")).toHaveLength(3);
  });
});

describe("efectos", () => {
  it("una sanción vive hasta vencer o revocarse", () => {
    const warning = sanction({ kind: "WARNING" });
    expect(isLive(warning, "2026-09-01")).toBe(true);
    expect(isLive(warning, "2026-08-31")).toBe(false);
    expect(isLive(warning, "2027-09-01")).toBe(true);
    expect(isLive(warning, "2027-09-02")).toBe(false);
    expect(sanctionState(warning, "2027-09-02")).toBe("EXPIRED");
    expect(sanctionState({ ...warning, revokedAt: new Date() }, "2026-09-05")).toBe("REVOKED");
    expect(sanctionState(warning, "2026-09-05")).toBe("LIVE");
  });

  it("los derechos quedan suspendidos mientras dure la sanción más larga viva", () => {
    const items = [
      sanction({ kind: "WARNING" }),
      sanction({ kind: "MINOR", occurredOn: "2026-09-03" }),
    ];
    expect(suspendedUntil(items, "2026-09-01")).toBe("2026-09-08");
    expect(suspendedUntil(items, "2026-09-10")).toBe("2026-09-23");
    expect(suspendedUntil(items, "2026-09-24")).toBeNull();
    expect(
      suspendedUntil([{ ...(items[1] as SanctionLike), revokedAt: new Date() }], "2026-09-10"),
    ).toBeNull();
    expect(suspendedUntil([sanction({ kind: "MAJOR" })], "2026-09-01")).toBeNull();
  });

  it("la inhabilidad dura un año y una grave más otra sanción viva advierte la expulsión", () => {
    const ban = sanction({ kind: "OFFICE_BAN" });
    expect(hasOfficeBan([ban], "2027-09-01")).toBe(true);
    expect(hasOfficeBan([ban], "2027-09-02")).toBe(false);
    const major = sanction({ kind: "MAJOR" });
    expect(expulsionWarning([major], "2026-12-05")).toBe(false);
    expect(expulsionWarning([major, sanction({ kind: "WARNING" })], "2026-12-05")).toBe(true);
    expect(
      expulsionWarning([sanction({ kind: "MINOR" }), sanction({ kind: "WARNING" })], "2026-12-05"),
    ).toBe(false);
    // Vencida o revocada, la otra sanción ya no cuenta.
    expect(
      expulsionWarning(
        [major, sanction({ kind: "WARNING", occurredOn: "2025-01-10" })],
        "2026-12-05",
      ),
    ).toBe(false);
    expect(
      expulsionWarning(
        [major, { ...sanction({ kind: "WARNING" }), revokedAt: new Date() }],
        "2026-12-05",
      ),
    ).toBe(false);
  });
});
