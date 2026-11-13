import { describe, expect, it } from "vitest";
import { operationCommand, SPACE_KEYS } from "@/shared/admin-kit/operation-keys";
import {
  addRecent,
  labelFromTitle,
  MAX_FAVORITES,
  MAX_RECENTS,
  parsePinned,
  pinnableHref,
  toggleFavorite,
} from "@/shared/admin-kit/pinned-pages";
import { buildHref, visibleColumnKeys } from "@/shared/admin-kit/table-view";
import {
  type FieldDefinition,
  isInlineField,
  MULTI_SEPARATOR,
  storedFormData,
} from "@/shared/admin-kit/types";

// Patrones de escritorio de la Operación (ADR-167): la lógica pura de los atajos, de Favoritos y
// Recientes, de las columnas en la dirección y del formulario que arma la edición en línea.

const key = (
  value: string,
  mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {},
) => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
});

describe("operationCommand: la tecla de cada atajo (regla 1)", () => {
  it("en la página: ? abre el mapa, / busca, C crea, E edita y G espera la letra", () => {
    expect(operationCommand(key("?"), "page", false)).toEqual({ kind: "map" });
    expect(operationCommand(key("/"), "page", false)).toEqual({ kind: "search" });
    expect(operationCommand(key("c"), "page", false)).toEqual({ kind: "create" });
    expect(operationCommand(key("E"), "page", false)).toEqual({ kind: "edit" });
    expect(operationCommand(key("g"), "page", false)).toEqual({ kind: "go-prefix" });
  });

  it("después de G, la letra de un espacio va a ese espacio y otra tecla no hace nada", () => {
    expect(operationCommand(key("m"), "page", true)).toEqual({ kind: "go", key: "m" });
    expect(operationCommand(key("P"), "page", true)).toEqual({ kind: "go", key: "p" });
    // La C después de G es Comités, no crear.
    expect(operationCommand(key("c"), "page", true)).toEqual({ kind: "go", key: "c" });
    expect(operationCommand(key("z"), "page", true)).toBeNull();
  });

  it("ninguna letra actúa mientras se escribe, con un diálogo abierto o con una tecla modificadora", () => {
    for (const place of ["typing", "dialog"] as const) {
      for (const letter of ["?", "/", "c", "e", "g"]) {
        expect(operationCommand(key(letter), place, false)).toBeNull();
      }
    }
    expect(operationCommand(key("c", { metaKey: true }), "page", false)).toBeNull();
    expect(operationCommand(key("e", { altKey: true }), "page", false)).toBeNull();
  });

  it("⌘Enter guarda en todas partes, también escribiendo y dentro del panel", () => {
    for (const place of ["typing", "dialog", "page"] as const) {
      expect(operationCommand(key("Enter", { metaKey: true }), place, false)).toEqual({
        kind: "save",
      });
      expect(operationCommand(key("Enter", { ctrlKey: true }), place, false)).toEqual({
        kind: "save",
      });
    }
    expect(operationCommand(key("Enter"), "page", false)).toBeNull();
  });

  it("cada espacio tiene una letra distinta", () => {
    const letters = Object.values(SPACE_KEYS);
    expect(new Set(letters).size).toBe(letters.length);
  });
});

describe("Favoritos y Recientes (regla 3)", () => {
  it("la dirección fijada conserva los filtros y pierde el registro abierto y la página", () => {
    expect(pinnableHref("/admin/personas", "?estado=ACTIVE&editar=abc&pagina=3")).toBe(
      "/admin/personas?estado=ACTIVE",
    );
    expect(pinnableHref("/admin/mesa", "")).toBe("/admin/mesa");
    expect(pinnableHref("/admin/tareas", "?nuevo=1&guardado=1")).toBe("/admin/tareas");
  });

  it("el nombre sale del título del documento, sin el nombre del sitio", () => {
    expect(labelFromTitle("Personas · Casa digital de la OE")).toBe("Personas");
    expect(labelFromTitle("Mesa")).toBe("Mesa");
  });

  it("lo guardado que no tiene la forma esperada, o que no es de la Operación, se descarta", () => {
    expect(parsePinned(null)).toEqual([]);
    expect(parsePinned("{no es json")).toEqual([]);
    expect(parsePinned(JSON.stringify({ href: "/admin" }))).toEqual([]);
    expect(
      parsePinned(
        JSON.stringify([
          { href: "/admin/personas", label: "Personas" },
          { href: "https://otro.sitio", label: "Afuera" },
          { href: "/admin/tareas" },
        ]),
      ),
    ).toEqual([{ href: "/admin/personas", label: "Personas" }]);
  });

  it("fijar pone primero y no pasa del tope; fijar lo fijado lo suelta", () => {
    const many = Array.from({ length: MAX_FAVORITES }, (_, index) => ({
      href: `/admin/p${index}`,
      label: `P${index}`,
    }));
    const added = toggleFavorite(many, { href: "/admin/nueva", label: "Nueva" });
    expect(added).toHaveLength(MAX_FAVORITES);
    expect(added[0]?.href).toBe("/admin/nueva");
    expect(toggleFavorite(added, { href: "/admin/nueva", label: "Nueva" })).not.toContainEqual({
      href: "/admin/nueva",
      label: "Nueva",
    });
  });

  it("una visita sube a la primera fila de recientes sin repetirse", () => {
    let recents = [] as { href: string; label: string }[];
    for (const href of [
      "/admin/a",
      "/admin/b",
      "/admin/a",
      "/admin/c",
      "/admin/d",
      "/admin/e",
      "/admin/f",
    ]) {
      recents = addRecent(recents, { href, label: href });
    }
    expect(recents.map((item) => item.href)).toEqual([
      "/admin/f",
      "/admin/e",
      "/admin/d",
      "/admin/c",
      "/admin/a",
    ]);
    expect(recents).toHaveLength(MAX_RECENTS);
  });
});

describe("columnas en la dirección (regla 4)", () => {
  const keys = ["name", "kind", "website", "contacts"];

  it("lee la lista separada por comas o repetida por un formulario, en el orden de la tabla", () => {
    expect(visibleColumnKeys("website,name", keys)).toEqual(["name", "website"]);
    expect(visibleColumnKeys(["kind", "name"], keys)).toEqual(["name", "kind"]);
  });

  it("sin parámetro, con todas o sin ninguna válida se ven todas", () => {
    expect(visibleColumnKeys(undefined, keys)).toBeNull();
    expect(visibleColumnKeys(keys.join(","), keys)).toBeNull();
    expect(visibleColumnKeys("otra,,", keys)).toBeNull();
  });

  it("la dirección no lleva parámetros vacíos", () => {
    expect(buildHref("/admin/x", { q: "", columnas: "name" })).toBe("/admin/x?columnas=name");
    expect(buildHref("/admin/x", { q: "" })).toBe("/admin/x");
  });
});

describe("el formulario de la edición en línea (regla 5)", () => {
  const fields: FieldDefinition[] = [
    { name: "label", label: "Nombre", type: "text" },
    { name: "code", label: "Código", type: "text", lockedOnEdit: true },
    { name: "isLeadership", label: "Dirección", type: "checkbox" },
    { name: "capabilities", label: "Capacidades", type: "multiselect" },
    { name: "kind", label: "Tipo", type: "select" },
  ];

  it("solo los campos simples y no bloqueados se editan en la celda", () => {
    expect(fields.filter(isInlineField).map((field) => field.name)).toEqual(["label", "kind"]);
  });

  it("arma lo guardado como si se enviara el panel: casillas marcadas y listas repetidas", () => {
    const data = storedFormData(fields, {
      label: "Vocería",
      code: "VOCERIA",
      isLeadership: "true",
      capabilities: ["OCCASIONS", "PERMANENCE"].join(MULTI_SEPARATOR),
      kind: "",
    });
    expect(data.get("label")).toBe("Vocería");
    expect(data.get("isLeadership")).toBe("on");
    expect(data.getAll("capabilities")).toEqual(["OCCASIONS", "PERMANENCE"]);
    expect(storedFormData(fields, { isLeadership: "" }).has("isLeadership")).toBe(false);
  });
});
