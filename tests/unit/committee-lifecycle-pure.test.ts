import { describe, expect, it } from "vitest";
import { committeeLifecycleError } from "@/modules/people/domain/committee-lifecycle-pure";

const today = "2026-09-14";
const trial = {
  status: "ON_TRIAL" as const,
  trialStartsOn: "2026-01-31",
  trialEndsOn: "2026-07-31",
  deactivatedOn: null,
};
describe("plazos del comité", () => {
  it("exige seis meses, limita a doce y registra el motivo de ampliar", () => {
    expect(committeeLifecycleError(trial, null, "", today)).toBeNull();
    expect(committeeLifecycleError({ ...trial, trialEndsOn: "2026-07-30" }, null, "", today)).toBe(
      "T-2327",
    );
    expect(
      committeeLifecycleError({ ...trial, trialEndsOn: "2027-02-01" }, null, "Motivo", today),
    ).toBe("T-2327");
    expect(committeeLifecycleError({ ...trial, trialEndsOn: "2027-01-31" }, trial, "", today)).toBe(
      "T-2328",
    );
    expect(
      committeeLifecycleError(
        { ...trial, trialEndsOn: "2027-01-31" },
        trial,
        "Decisión de la junta",
        today,
      ),
    ).toBeNull();
    expect(
      committeeLifecycleError(
        { ...trial, trialStartsOn: "2026-02-01", trialEndsOn: "2026-08-01" },
        trial,
        "Reiniciar",
        today,
      ),
    ).toBe("T-2327");
  });
  it("la reactivación espera dos meses y reinicia una prueba, sin saltar directo a activo", () => {
    const inactive = { ...trial, status: "INACTIVE" as const, deactivatedOn: "2026-07-14" };
    const next = { ...trial, trialStartsOn: today, trialEndsOn: "2027-03-14" };
    expect(committeeLifecycleError(next, inactive, "", today)).toBeNull();
    expect(
      committeeLifecycleError({ ...next, trialStartsOn: "2026-09-13" }, inactive, "", today),
    ).toBe("T-2326");
    expect(committeeLifecycleError({ ...next, status: "ACTIVE" }, inactive, "", today)).toBe(
      "T-2326",
    );
    expect(committeeLifecycleError({ ...inactive, deactivatedOn: null }, trial, "", today)).toBe(
      "T-2325",
    );
    expect(committeeLifecycleError({ ...trial, status: "ACTIVE" }, trial, "", "2026-06-30")).toBe(
      "T-2327",
    );
  });
});
