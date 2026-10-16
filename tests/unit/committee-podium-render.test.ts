import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommitteePodium, type CommitteePodiumEntry } from "@/app/app/gh-points/CommitteePodium";
import { t } from "@/shared/copy";

const combined: CommitteePodiumEntry = {
  id: "comite-sintetico",
  name: "Comité sintético",
  rank: 1,
  rankingMetric: "COMBINED",
  score: "75,00",
  rawScore: "10,00%",
  attendanceScore: "15,00%",
  adjustment: t("T-2609", { n: "+5,00" }),
  occasions: 2,
  ghAverage: "40,00",
  ghTotal: "80,00",
  activeMembers: 2,
  ghNormalized: "100,00",
  attendanceNormalized: "50,00",
  ghContribution: "50,00",
  attendanceContribution: "25,00",
};

describe("métrica visible del podio de comités", () => {
  it("anuncia el índice combinado sobre 100 y conserva el acceso al detalle sin llamarlo asistencia", () => {
    const html = renderToStaticMarkup(createElement(CommitteePodium, { entries: [combined] }));
    expect(html).toContain(t("T-3555"));
    expect(html).toContain(t("T-3558"));
    expect(html).toContain(
      t("T-3556", { comité: combined.name, puesto: 1, puntaje: combined.score }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(t("T-3566"));
    expect(html).not.toContain(t("T-2601"));
    expect(html).not.toContain(`${combined.score}%`);
    expect(html).not.toContain(t("T-3572"));
  });

  it("conserva la participación histórica y no fabrica promedio GH ni puntaje combinado", () => {
    const historical: CommitteePodiumEntry = {
      ...combined,
      rankingMetric: "ATTENDANCE",
      score: "9,03%",
      attendanceScore: "9,03%",
      ghAverage: null,
      ghTotal: null,
      activeMembers: null,
      ghNormalized: null,
      attendanceNormalized: null,
      ghContribution: null,
      attendanceContribution: null,
    };
    const html = renderToStaticMarkup(createElement(CommitteePodium, { entries: [historical] }));
    expect(html).toContain(t("T-2601"));
    expect(html).toContain(
      t("T-2603", { comité: historical.name, puesto: 1, porcentaje: historical.score }),
    );
    expect(html).toContain(t("T-3572"));
    expect(html).toContain(t("T-2613"));
    expect(html).not.toContain(t("T-3555"));
    expect(html).not.toContain(t("T-3558"));
    expect(html).not.toContain(t("T-3566"));
    expect(html).not.toContain(t("T-3559"));
  });
});
