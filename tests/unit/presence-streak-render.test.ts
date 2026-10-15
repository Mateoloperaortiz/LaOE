import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PresenceStreak } from "@/modules/participation/components/PresenceStreak";

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
    expect(html).toContain("actividades publicadas después de empezar la semana");
    expect(html).toContain("Una asistencia aprobada puede cumplirla");
    expect(html).toContain("no asistir a esas actividades no rompe tu racha");
    expect(html).not.toContain("no tenías actividades disponibles");
    expect(html).not.toContain("La licencia registrada");
    expect(html).not.toContain("Tenés una excusa aprobada");
    expect(html).not.toContain("No hay actividades presenciales habilitadas registradas");
    expect(html).not.toContain("Registro abierto");
    expect(html).not.toContain("24 horas");
  });

  it("explica el aviso menor a 24 horas solo cuando el dominio lo acredita", () => {
    const html = render({ weekPauseReasons: ["SHORT_NOTICE"] });
    expect(html).toContain("actividades que no tuvieron 24 horas de aviso antes de empezar");
    expect(html).toContain("Una asistencia aprobada puede cumplir la semana");
    expect(html).toContain("no asistir a esas actividades no rompe tu racha");
    expect(html).not.toContain("actividades publicadas después de empezar la semana");
    expect(html).not.toContain("La licencia registrada");
    expect(html).not.toContain("Tenés una excusa aprobada");
    expect(html).not.toContain("Registro abierto");
  });

  it("muestra juntos los motivos registrados sin agregar otros", () => {
    const html = render({ weekPauseReasons: ["EXCUSED", "LATE_PUBLICATION"] });
    expect(html).toContain("Tenés una excusa aprobada");
    expect(html).toContain("actividades publicadas después de empezar la semana");
    expect(html).not.toContain("La licencia registrada");
    expect(html).not.toContain("No hay información histórica suficiente");
  });

  it("identifica una licencia sin afirmar que no había actividades", () => {
    const html = render({ weekPauseReasons: ["ON_LEAVE"] });
    expect(html).toContain("La licencia registrada para esta semana protege tu racha");
    expect(html).not.toContain("No hay actividades");
    expect(html).not.toContain("actividades publicadas después");
  });

  it("acota la ausencia de actividades al registro de actividades habilitadas", () => {
    const html = render({ weekPauseReasons: ["NO_RECORDED_ACTIVITIES"] });
    expect(html).toContain(
      "No hay actividades presenciales habilitadas registradas para esta semana",
    );
    expect(html).not.toContain("no tenías actividades disponibles");
  });

  it("declara información insuficiente sin inventar ausencia de oferta", () => {
    const html = render({ weekPauseReasons: ["INSUFFICIENT_HISTORY"] });
    expect(html).toContain("No hay información histórica suficiente");
    expect(html).toContain("La falta de ese registro no rompe tu racha");
    expect(html).not.toContain("No hay actividades presenciales");
    expect(html).not.toContain("24 horas");
  });

  const oldSnapshots: Array<{ name: string; overrides: Partial<Streak> }> = [
    { name: "sin campo", overrides: {} },
    { name: "lista vacía", overrides: { weekPauseReasons: [] } },
  ];
  it.each(oldSnapshots)("declara el motivo no guardado en una foto anterior ($name)", ({
    overrides,
  }) => {
    const html = render(overrides);
    expect(html).toContain("El motivo de esta pausa no quedó registrado");
    expect(html).not.toContain("La licencia registrada");
    expect(html).not.toContain("Tenés una excusa aprobada");
    expect(html).not.toContain("No hay actividades presenciales");
    expect(html).not.toContain("24 horas");
  });

  it("explica que la pausa conserva siete semanas sin sumar semana ni pagar bono", () => {
    const html = render({ weekPauseReasons: ["LATE_PUBLICATION"] });
    expect(html.match(/7 semanas/g)).toHaveLength(2);
    expect(html).toContain("Conservás las semanas cumplidas, sin sumar una semana ni un bono");
    expect(html).toContain("Tu próxima semana cumplida puede sumar 5 GH Points");
    expect(html).not.toContain("Bono de esta semana:");
  });

  it("no presenta motivos de pausa cuando la semana está cumplida", () => {
    const html = render({
      weekStatus: "COMPLETED",
      weekPauseReasons: ["LATE_PUBLICATION"],
      bonus: 5,
    });
    expect(html).toContain("Ya cumpliste esta semana");
    expect(html).toContain("Bono de esta semana: 5 GH Points");
    expect(html).not.toContain("actividades publicadas después de empezar la semana");
    expect(html).not.toContain("El motivo de esta pausa");
  });
});
