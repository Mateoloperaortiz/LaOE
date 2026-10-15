import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PresenceStreak } from "@/modules/participation/components/PresenceStreak";
import { t } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";

type Streak = Parameters<typeof PresenceStreak>[0]["streak"];
const render = (overrides: Partial<Streak> = {}) =>
  renderToStaticMarkup(
    createElement(PresenceStreak, {
      streak: {
        recognitionAvailable: true,
        launched: true,
        currentStreak: 7,
        longestStreak: 7,
        weekStatus: "PAUSED",
        bonus: 0,
        nextBonus: 5,
        ...overrides,
      },
    }),
  );

describe("explicación de la pausa presencial", () => {
  it("distingue publicación tardía de ausencia de actividades y de una licencia", () => {
    const html = render({ weekPauseReasons: ["LATE_PUBLICATION"] });
    expect(html).toContain(t("T-3470"));
    expect(html).not.toContain(t("T-3471"));
    expect(html).not.toContain(t("T-3472"));
    expect(html).not.toContain(t("T-3473"));
    expect(html).not.toContain(t("T-553"));
    expect(html).not.toContain(t("T-3476"));
  });

  it("explica el aviso menor a 24 horas solo cuando el dominio lo acredita", () => {
    const html = render({ weekPauseReasons: ["SHORT_NOTICE"] });
    expect(html).toContain(t("T-3476"));
    expect(html).not.toContain(t("T-3470"));
    expect(html).not.toContain(t("T-3471"));
    expect(html).not.toContain(t("T-3472"));
    expect(html).not.toContain(t("T-553"));
  });

  it("muestra juntos los motivos registrados sin agregar otros", () => {
    const html = render({ weekPauseReasons: ["EXCUSED", "LATE_PUBLICATION"] });
    expect(html).toContain(t("T-3472"));
    expect(html).toContain(t("T-3470"));
    expect(html).not.toContain(t("T-3471"));
    expect(html).not.toContain(t("T-3474"));
  });

  it("identifica una licencia sin afirmar que no había actividades", () => {
    const html = render({ weekPauseReasons: ["ON_LEAVE"] });
    expect(html).toContain(t("T-3471"));
    expect(html).not.toContain(t("T-3473"));
    expect(html).not.toContain(t("T-3470"));
  });

  it("acota la ausencia de actividades al registro de actividades habilitadas", () => {
    const html = render({ weekPauseReasons: ["NO_RECORDED_ACTIVITIES"] });
    expect(html).toContain(t("T-3473"));
    expect(html).not.toContain(t("T-3474"));
  });

  it("declara información insuficiente sin inventar ausencia de oferta", () => {
    const html = render({ weekPauseReasons: ["INSUFFICIENT_HISTORY"] });
    expect(html).toContain(t("T-3474"));
    expect(html).not.toContain(t("T-3473"));
    expect(html).not.toContain(t("T-3476"));
  });

  const oldSnapshots: Array<{ name: string; overrides: Partial<Streak> }> = [
    { name: "sin campo", overrides: {} },
    { name: "lista vacía", overrides: { weekPauseReasons: [] } },
  ];
  it.each(oldSnapshots)("declara el motivo no guardado en una foto anterior ($name)", ({
    overrides,
  }) => {
    const html = render(overrides);
    expect(html).toContain(t("T-3475"));
    expect(html).not.toContain(t("T-3470"));
    expect(html).not.toContain(t("T-3471"));
    expect(html).not.toContain(t("T-3472"));
    expect(html).not.toContain(t("T-3473"));
    expect(html).not.toContain(t("T-3474"));
    expect(html).not.toContain(t("T-3476"));
  });

  it("explica que la pausa conserva siete semanas sin sumar semana ni pagar bono", () => {
    const html = render({ weekPauseReasons: ["LATE_PUBLICATION"] });
    expect(html.match(copyPattern("T-3442", { n: 7 }, "g"))).toHaveLength(2);
    expect(html).toContain(t("T-3445"));
    expect(html).toContain(t("T-3448", { n: 5 }));
    expect(html).not.toMatch(copyPattern("T-3447"));
  });

  it("no presenta motivos de pausa cuando la semana está cumplida", () => {
    const html = render({
      weekStatus: "COMPLETED",
      weekPauseReasons: ["LATE_PUBLICATION"],
      bonus: 5,
    });
    expect(html).toContain(t("T-3443"));
    expect(html).toContain(t("T-3447", { n: 5 }));
    expect(html).not.toContain(t("T-3470"));
    expect(html).not.toContain(t("T-3475"));
  });
});
