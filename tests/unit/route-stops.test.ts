import { describe, expect, it } from "vitest";
import { routeStops, stopState } from "@/app/app/permanencia/_ui/route-stops";

// La ruta de permanencia de Mi OE: el estado de cada parada sale de lo logrado, su peso y lo que
// todavía se puede sumar.

describe("stopState", () => {
  it("lograda cuando suma todo su peso, aunque falten decimales por redondeo", () => {
    expect(stopState({ achieved: 20, weight: 20, remaining: 0 })).toBe("done");
    expect(stopState({ achieved: 19.999, weight: 20, remaining: 5 })).toBe("done");
  });

  it("en camino con algo sumado, por hacer sin nada y cerrada si ya no queda qué sumar", () => {
    expect(stopState({ achieved: 8, weight: 20, remaining: 12 })).toBe("progress");
    expect(stopState({ achieved: 0, weight: 20, remaining: 20 })).toBe("todo");
    expect(stopState({ achieved: 8, weight: 20, remaining: 0 })).toBe("closed");
  });
});

describe("routeStops", () => {
  it("lleva los criterios en orden y deja fuera los que no pesan", () => {
    const stops = routeStops({
      criteria: [
        { ruleId: "a", label: "Reuniones", achieved: 30, weight: 30, remaining: 0 },
        { ruleId: "b", label: "Evaluación", achieved: 0, weight: 0, remaining: 0 },
        { ruleId: "c", label: "Actividades", achieved: 12.34, weight: 40, remaining: 20 },
      ] as never,
    });
    expect(stops.map((stop) => [stop.key, stop.state, stop.achieved])).toEqual([
      ["a", "done", 30],
      ["c", "progress", 12.3],
    ]);
  });
});
