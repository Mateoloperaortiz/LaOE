import { describe, expect, it } from "vitest";
import {
  composeDesk,
  DESK_ROWS,
  DESK_SECTIONS,
  type DeskItem,
  deskSection,
  taskDate,
  taskHref,
} from "@/app/admin/_kit/desk-items";
import { tList } from "@/shared/copy";

// La Mesa (ADR-159 regla 3, tramo O2): las piezas puras. Qué lee cada rol lo prueba la E2E de la Mesa.

const item = (id: string): DeskItem => ({
  id,
  title: id,
  detail: null,
  href: "/admin",
  date: null,
});

describe("Mesa", () => {
  it("tiene un título por grupo, en el orden de sus grupos", () => {
    expect(tList("T-4866")).toHaveLength(DESK_SECTIONS.length);
  });

  it("una tarea lleva a su solicitud, a su persona, a su organización o a la lista", () => {
    const base = { id: "t1", kind: "TASK", personId: null, organizationId: null };
    expect(taskHref({ ...base, kind: "REQUEST" })).toBe("/admin/solicitudes?tarea=t1");
    expect(taskHref({ ...base, personId: "p1" })).toBe("/admin/personas/p1");
    expect(taskHref({ ...base, organizationId: "o1" })).toBe("/admin/organizaciones/o1");
    expect(taskHref(base)).toBe("/admin/tareas");
  });

  it("una tarea vence o ya venció según su límite, y sin límite no lleva fecha", () => {
    const now = new Date("2026-11-12T15:00:00Z");
    const before = new Date("2026-11-10T15:00:00Z");
    const after = new Date("2026-11-14T15:00:00Z");
    expect(taskDate(before, now)).toEqual({ kind: "overdue", at: before });
    expect(taskDate(after, now)).toEqual({ kind: "due", at: after });
    expect(taskDate(null, now)).toBeNull();
  });

  it("un grupo sin pendientes no aparece, y uno largo muestra solo los primeros", () => {
    expect(deskSection("tasks", 0, [], "/admin/tareas")).toEqual([]);
    const many = Array.from({ length: DESK_ROWS + 3 }, (_, index) => item(`i${index}`));
    const [section] = deskSection("requests", 40, many, "/admin/solicitudes");
    expect(section?.total).toBe(40);
    expect(section?.items).toHaveLength(DESK_ROWS);
  });

  it("los grupos salen en su orden y el contador suma todos los pendientes, no solo los que se ven", () => {
    const desk = composeDesk([
      ...deskSection("alerts", 2, [item("a"), item("b")], null),
      ...deskSection("tasks", 9, [item("t")], "/admin/tareas"),
      ...deskSection("evaluations", 3, [item("e")], "/admin/permanencia/evaluaciones"),
    ]);
    expect(desk.sections.map((section) => section.key)).toEqual(["tasks", "evaluations", "alerts"]);
    expect(desk.total).toBe(14);
    expect(composeDesk([])).toEqual({ total: 0, sections: [] });
  });
});
