import { describe, expect, it } from "vitest";
import {
  TRIAL_ENDING_DAYS,
  type ViabilityInput,
  viabilityAlerts,
} from "@/modules/participation/domain/committee-viability-pure";

// DT-337, inciso b: los días que le quedan a la prueba de un comité (Regl. art. 25) los contaba una
// resta propia de `committee-viability-pure.ts` que ninguna unitaria fijaba: con un día de más, la
// suite pasaba entera. Acá queda el borde del aviso, día por día, antes de juntar esa resta con las
// otras dos de la casa.

/** Un comité en prueba al que no le falta nada: lo único que puede avisar es que la prueba se acaba. */
const onTrial: ViabilityInput = {
  status: "ON_TRIAL",
  directions: 3,
  missingRequired: 0,
  membersOutsideDirection: 10,
  unexcusedAbsences: 0,
  representedAssemblies: 0,
  closedAssemblies: 0,
  eventsThisTerm: 1,
  pastMidterm: false,
  trialEndsOn: null,
  todayKey: "2026-09-01",
};

const alertsOn = (todayKey: string, trialEndsOn: string | null) =>
  viabilityAlerts({ ...onTrial, todayKey, trialEndsOn });

describe("los días que le quedan a la prueba de un comité", () => {
  it("el aviso sale desde que faltan treinta días, y con treinta y uno todavía no", () => {
    expect(TRIAL_ENDING_DAYS).toBe(30);
    // Septiembre tiene 30 días: del 1 de septiembre al 1 de octubre van 30.
    expect(alertsOn("2026-09-01", "2026-10-01")).toEqual(["TRIAL_ENDING"]);
    expect(alertsOn("2026-09-01", "2026-10-02")).toEqual([]);
    expect(alertsOn("2026-09-02", "2026-10-02")).toEqual(["TRIAL_ENDING"]);
  });

  it("cuenta días de calendario: febrero, el año bisiesto y el cambio de año", () => {
    // Febrero de 2027 tiene 28 días y el de 2028, 29.
    expect(alertsOn("2027-02-01", "2027-03-03")).toEqual(["TRIAL_ENDING"]);
    expect(alertsOn("2027-02-01", "2027-03-04")).toEqual([]);
    expect(alertsOn("2028-02-01", "2028-03-02")).toEqual(["TRIAL_ENDING"]);
    expect(alertsOn("2028-02-01", "2028-03-03")).toEqual([]);
    expect(alertsOn("2026-12-15", "2027-01-14")).toEqual(["TRIAL_ENDING"]);
    expect(alertsOn("2026-12-15", "2027-01-15")).toEqual([]);
  });

  it("el día en que vence y después de vencida la prueba sigue avisando", () => {
    expect(alertsOn("2026-10-01", "2026-10-01")).toEqual(["TRIAL_ENDING"]);
    expect(alertsOn("2026-10-05", "2026-10-01")).toEqual(["TRIAL_ENDING"]);
  });

  it("sin fecha de fin no hay aviso", () => {
    expect(alertsOn("2026-09-01", null)).toEqual([]);
  });
});
