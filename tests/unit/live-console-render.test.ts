import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { liveConsoleLabels } from "@/modules/participation/admin";
import { ConsolaEnVivo, type LiveData } from "@/modules/participation/components/ConsolaEnVivo";
import { tList } from "@/shared/copy";

// Lo que la consola en vivo de una ocasión dibuja con las etiquetas que le llegan por props (ADR-126
// regla 5). `live-console-labels.test.ts` fija lo que `liveConsoleLabels` entrega; acá se dibuja el
// componente, que es quien las lee: qué pieza de T-585 lleva cada contador, qué etiqueta lleva la
// fuente y el estado de un registro y que un valor sin etiqueta se muestra tal cual, que es el
// respaldo de hoy (decisión abierta 75). Como la tabla de enum-label-pairs, compara con posiciones
// literales de la lista.

const STRANGERS = ["NO_EXISTE", "constructor", "toString", "hasOwnProperty", "__proto__"];

type Recent = LiveData["recent"][number];

function entry(id: string, source: string, status: string): Recent {
  return { id, name: `Persona ${id}`, at: "2026-10-12T15:00:00.000Z", source, status };
}

/** La consola como la dibuja `src/app/admin/ocasiones/[id]/page.tsx`, con esos registros. */
function consoleHtml(recent: Recent[]): string {
  return renderToStaticMarkup(
    createElement(ConsolaEnVivo, {
      occasionId: "00000000-0000-4000-8000-000000000000",
      initial: {
        status: "OPEN",
        counts: { APPROVED: 4, PENDING: 3, REJECTED: 2, CANCELLED: 1 },
        recent,
        code: null,
        link: "https://casa.test/o/1",
        qrSvg: "<svg></svg>",
        generatedAt: "2026-10-12T15:00:00.000Z",
      },
      locale: "es-CO",
      timeZone: "America/Bogota",
      labels: {
        qrTitle: "",
        qrAlt: "",
        link: "",
        code: "",
        stale: "",
        counters: [...tList("T-585")],
        recentTitle: "",
        recentEmpty: "",
        ...liveConsoleLabels(),
      },
    }),
  );
}

/** Cada contador: su estado, lo que muestra de título y su cuenta. */
function counters(html: string): [string, string, string][] {
  return [
    ...html.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*data-contador="([^"]+)"[^>]*>(\d+)<\/dd>/g),
  ].map(([, label = "", status = "", count = ""]) => [status, label, count]);
}

/** De cada registro, lo que muestra de fuente y de estado. */
function sourceAndStatus(html: string): [string, string][] {
  return [...html.matchAll(/<span class="text-tinta-suave">([^<]*)<\/span>/g)].map(
    ([, text = ""]) => {
      const [, source = "", status = ""] = text.split(" · ");
      return [source, status];
    },
  );
}

describe("la consola en vivo de una ocasión", () => {
  it("cada contador muestra la pieza de T-585 de su posición, en el orden de la pantalla", () => {
    const list: readonly string[] = tList("T-585");

    expect(counters(consoleHtml([]))).toEqual([
      ["APPROVED", list[0], "4"],
      ["PENDING", list[1], "3"],
      ["REJECTED", list[2], "2"],
      ["CANCELLED", list[3], "1"],
    ]);
  });

  it("un registro muestra la etiqueta de su fuente (T-596) y la de su estado (T-597)", () => {
    const sources: readonly string[] = tList("T-596");
    const statuses: readonly string[] = tList("T-597");
    const html = consoleHtml([
      entry("1", "SELF_QR", "PENDING"),
      entry("2", "HOST", "APPROVED"),
      entry("3", "ADMIN", "REJECTED"),
      entry("4", "IMPORT", "CANCELLED"),
    ]);

    expect(sourceAndStatus(html)).toEqual([
      [sources[0], statuses[0]],
      [sources[1], statuses[1]],
      [sources[2], statuses[2]],
      [sources[3], statuses[3]],
    ]);
  });

  it("una asistencia excusada muestra su código: la consola no nombra ese estado (DT-364, decisión abierta 75)", () => {
    expect(sourceAndStatus(consoleHtml([entry("1", "HOST", "EXCUSED")]))).toEqual([
      [tList("T-596")[1], "EXCUSED"],
    ]);
  });

  it("una fuente o un estado sin etiqueta se muestran tal cual, también si se llaman como una propiedad de Object (decisión abierta 75)", () => {
    const html = consoleHtml(STRANGERS.map((value, index) => entry(String(index), value, value)));

    expect(sourceAndStatus(html)).toEqual(STRANGERS.map((value) => [value, value]));
  });
});
