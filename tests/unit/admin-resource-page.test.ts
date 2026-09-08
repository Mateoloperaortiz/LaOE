import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ResourcePage } from "@/app/admin/_kit/ResourcePage";
import type { AnyResource } from "@/shared/admin-kit/types";

const state = vi.hoisted(() => ({
  actor: vi.fn(),
  stepUp: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  fields: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/modules/identity", () => ({
  requireAdminActor: state.actor,
  hasRecentStepUp: state.stepUp,
}));
vi.mock("@/app/admin/_kit/actions", () => ({
  rowActionAction: vi.fn(),
  saveResourceAction: vi.fn(),
}));
vi.mock("@/shared/admin-kit", async () => ({
  ...(await import("@/shared/admin-kit/types")),
  Pagination: () => null,
  ResourceForm: () => null,
  ResourcePanel: () => null,
  ResourceSubmitButton: () => null,
  ResourceTable: () => null,
  ResourceToolbar: () => null,
}));

function resource(overrides: Partial<AnyResource> = {}): AnyResource {
  return {
    key: "ejemplo",
    names: { singular: "Ejemplo", plural: "Ejemplos" },
    basePath: "/admin/ejemplo",
    columns: [],
    filters: [{ key: "status", label: "Estado", options: [{ value: "ACTIVE", label: "Activo" }] }],
    schema: z.object({ name: z.string() }),
    fields: state.fields,
    list: state.list,
    get: state.get,
    toFormValues: () => ({ name: "Ejemplo sintético" }),
    create: async () => ({ id: "nuevo-sintetico" }),
    update: async () => {},
    exportRow: () => ({}),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.actor.mockResolvedValue({ personId: "admin-sintetico", isAdmin: true });
  state.stepUp.mockReturnValue(true);
  state.get.mockResolvedValue({ id: "registro-sintetico" });
  state.list.mockResolvedValue({ rows: [], total: 0 });
  state.fields.mockResolvedValue([]);
});

describe("navegación y capacidades de un recurso administrativo", () => {
  it("no convierte un identificador de edición inexistente en un alta", async () => {
    state.get.mockResolvedValue(null);
    await expect(
      ResourcePage({ resource: resource(), searchParams: { editar: "inexistente" } }),
    ).rejects.toThrow("not-found");
    expect(state.fields).not.toHaveBeenCalled();
  });

  it("no abre paneles fuera de las capacidades del recurso", async () => {
    const readOnly = resource();
    delete readOnly.create;
    delete readOnly.update;
    for (const searchParams of [{ nuevo: "1" }, { editar: "registro-sintetico" }]) {
      await expect(ResourcePage({ resource: readOnly, searchParams })).rejects.toThrow("not-found");
    }
    expect(state.get).not.toHaveBeenCalled();
  });

  it("exige step-up antes de pedir los campos y vuelve al formulario con sus filtros", async () => {
    state.stepUp.mockReturnValue(false);
    const next = "/admin/ejemplo?q=prueba&status=ACTIVE&nuevo=1";
    await expect(
      ResourcePage({
        resource: resource({ stepUp: true }),
        searchParams: { q: "prueba", status: "ACTIVE", nuevo: "1" },
      }),
    ).rejects.toThrow(`redirect:/ingresar/paso?next=${encodeURIComponent(next)}`);
    expect(state.fields).not.toHaveBeenCalled();
  });

  it("corrige la página fuera de rango conservando filtros y edición", async () => {
    state.list.mockResolvedValue({ rows: [], total: 30 });
    await expect(
      ResourcePage({
        resource: resource(),
        searchParams: { q: "prueba", status: "ACTIVE", pagina: "99", editar: "registro-sintetico" },
      }),
    ).rejects.toThrow(
      "redirect:/admin/ejemplo?q=prueba&status=ACTIVE&pagina=2&editar=registro-sintetico",
    );
  });

  it("no entrega al listado un número de página infinito o inseguro", async () => {
    for (const pagina of ["1e100", "Infinity", "4.5", "no-es-un-numero"]) {
      await ResourcePage({ resource: resource(), searchParams: { pagina } });
      expect(state.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    }
  });

  it("el filtro del contexto prevalece sobre una URL manipulada", async () => {
    const example = resource({
      filters: [{ key: "eventId", label: "Evento", options: [{ value: "ajeno", label: "Ajeno" }] }],
    });
    await ResourcePage({
      resource: example,
      searchParams: { eventId: "ajeno" },
      basePath: "/admin/eventos/original/ediciones",
      fixedFilters: { eventId: "original" },
    });
    expect(state.list).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { eventId: "original" } }),
    );
  });
});
