import { describe, expect, it } from "vitest";
import { sortTodo, TODO_KINDS, type TodoItem } from "@/app/app/_ui/today-items";
import { tList } from "@/shared/copy";

// «Te toca» de «Hoy» (ADR-160 regla 2): lo que vence antes va primero y lo que no tiene fecha, al final.

const item = (id: string, due: string | null): TodoItem => ({
  id,
  kind: "request",
  subject: id,
  href: "/app",
  due: due ? new Date(due) : null,
});

describe("Te toca", () => {
  it("tiene un texto por tipo, en el orden de sus tipos", () => {
    expect(tList("T-4891")).toHaveLength(TODO_KINDS.length);
  });

  it("ordena por fecha límite y deja lo que no vence al final, en su orden de llegada", () => {
    const sorted = sortTodo([
      item("sin-fecha-1", null),
      item("viernes", "2026-11-20T12:00:00Z"),
      item("sin-fecha-2", null),
      item("martes", "2026-11-17T12:00:00Z"),
    ]);
    expect(sorted.map((row) => row.id)).toEqual([
      "martes",
      "viernes",
      "sin-fecha-1",
      "sin-fecha-2",
    ]);
  });

  it("no cambia la lista que recibe", () => {
    const original = [item("b", "2026-11-20T12:00:00Z"), item("a", "2026-11-17T12:00:00Z")];
    sortTodo(original);
    expect(original.map((row) => row.id)).toEqual(["b", "a"]);
  });
});
