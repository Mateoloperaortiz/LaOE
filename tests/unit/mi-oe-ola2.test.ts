import { describe, expect, it } from "vitest";
import { semesterCards } from "@/app/app/semestre/semester-cards";
import { linkedInAddUrl } from "@/modules/crm/domain/credentials-pure";

// Piezas puras de Mi OE en la ola 2: las tarjetas de «Tu semestre en la OE» (ADR-173) y el enlace de
// LinkedIn de una credencial (ADR-171).

describe("semesterCards", () => {
  it("salen en su orden y solo las que tienen algo: una en cero no se muestra", () => {
    expect(semesterCards({ attended: 7, points: 0, challenges: 2, badges: 0, games: 31 })).toEqual([
      { key: "attended", value: 7 },
      { key: "challenges", value: 2 },
      { key: "games", value: 31 },
    ]);
    expect(semesterCards({ attended: 0, points: 0, challenges: 0, badges: 0, games: 0 })).toEqual(
      [],
    );
  });
});

describe("linkedInAddUrl", () => {
  it("arma el enlace de agregar certificación con el título, la organización, la fecha y la página", () => {
    const url = new URL(
      linkedInAddUrl({
        title: "Dirección de GEMIS",
        organization: "Organización Estudiantil EAFIT",
        publishedAt: new Date("2026-11-13T15:00:00Z"),
        url: "https://oeeafit.com/verificar/abc",
        certId: "abc",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/profile/add");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      startTask: "CERTIFICATION_NAME",
      name: "Dirección de GEMIS",
      organizationName: "Organización Estudiantil EAFIT",
      issueYear: "2026",
      issueMonth: "11",
      certUrl: "https://oeeafit.com/verificar/abc",
      certId: "abc",
    });
  });
});
