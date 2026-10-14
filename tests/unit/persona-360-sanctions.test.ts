import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Sanciones } from "@/app/admin/personas/[id]/_ui/Sanciones";
import type { SanctionView } from "@/modules/people";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";

vi.mock("@/env", () => ({ getEnv: () => ({ APP_TIMEZONE: "America/Bogota" }) }));
// Se conserva la Insignia real; se evita cargar next/font desde el barrel de marca.
vi.mock("@/shared/brand", async () => {
  const { Insignia } = await import("@/shared/brand/Insignia");
  return { Insignia };
});

// El bloque de faltas y sanciones de la Persona 360 (ADR-116 regla 13): dice hasta cuándo fue la
// suspensión de cada sanción con un texto propio, que no afirma que siga. El de Mi OE (T-2237) le
// habla a la persona suspendida y no sale en la ficha.

const [live, expired, revoked] = tList("T-2243");
const SUSPENDED_UNTIL = "2026-09-20";
const until = formatDate(new Date(`${SUSPENDED_UNTIL}T12:00:00Z`));

function view(id: string, overrides: Partial<SanctionView>): SanctionView {
  return {
    id,
    personId: "persona-sintetica",
    termId: "termino-sintetico",
    committeeId: null,
    kind: "SUSPENSION",
    cause: "Uso indebido de la oficina, con descargos el 5 de septiembre",
    reference: null,
    occurredOn: "2026-09-01",
    suspendedFrom: "2026-09-01",
    suspendedUntil: SUSPENDED_UNTIL,
    expiresOn: "2027-09-01",
    issuedById: null,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    createdAt: new Date("2026-09-05T15:00:00Z"),
    kindLabel: tList("T-2229")[3] ?? "",
    committeeName: null,
    state: "LIVE",
    stateLabel: live ?? "",
    ...overrides,
  };
}

/** El HTML de cada sanción de la lista, en el orden en que se le pasaron al bloque. */
function lines(sanctions: SanctionView[]): string[] {
  const html = renderToStaticMarkup(
    createElement(Sanciones, { personId: "persona-sintetica", canRecord: true, sanctions }),
  );
  return html.split("<li").slice(1);
}

describe("faltas y sanciones en la Persona 360", () => {
  it("dice hasta cuándo fue la suspensión de una sanción vigente, vencida o revocada, sin el texto de Mi OE", () => {
    const [first, second, third] = lines([
      view("revocada", {
        state: "REVOKED",
        stateLabel: revoked ?? "",
        revokedAt: new Date("2026-09-10T15:00:00Z"),
        revokeReason: "La junta aceptó la revisión de los descargos",
      }),
      view("vencida", { state: "EXPIRED", stateLabel: expired ?? "", expiresOn: "2026-09-30" }),
      view("vigente", {}),
    ]);

    for (const [line, state] of [
      [first, revoked],
      [second, expired],
      [third, live],
    ]) {
      expect(line).toContain(state);
      // El de Mi OE afirma que los derechos «están suspendidos»: en la ficha no sale en ningún estado.
      expect(line).not.toContain(t("T-2237", { fecha: until }));
      expect(line).toContain(t("T-3218", { fecha: until }));
    }
  });

  it("una sanción sin suspensión no dice nada de suspensión", () => {
    const [line] = lines([
      view("grave", {
        kind: "MAJOR",
        kindLabel: tList("T-2229")[2] ?? "",
        suspendedFrom: null,
        suspendedUntil: null,
      }),
    ]);

    expect(line).toContain(tList("T-2229")[2]);
    expect(line).not.toContain(t("T-3218", { fecha: until }).split(until)[0]);
    expect(line).not.toContain(t("T-2237", { fecha: until }).split(until)[0]);
  });
});
