import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DownloadNotice } from "@/app/admin/_kit/DownloadNotice";
import { ResourcePage } from "@/app/admin/_kit/ResourcePage";
import { ResourceToolbar } from "@/shared/admin-kit";
import { type AnyResource, EXPORT_ROW_LIMIT } from "@/shared/admin-kit/types";
import { t } from "@/shared/copy";
import { type AnyElement, elements } from "../helpers/react-tree";

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
vi.mock("@/shared/admin-kit", async () => {
  const { resolveFilters } = await import("@/shared/admin-kit/types");
  return {
    resolveFilters,
    Pagination: () => null,
    ResourceForm: () => null,
    ResourcePanel: () => null,
    ResourceSubmitButton: () => null,
    ResourceTable: () => null,
    ResourceToolbar: () => null,
  };
});

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
    personalData: false,
    exportRow: () => ({}),
    ...overrides,
  };
}

/** Lo que pinta el aviso de descarga de la página, o `null` si no pinta nada. */
function downloadNotice(page: ReactNode): AnyElement | null {
  const notice = elements(page).find((element) => element.type === DownloadNotice);
  if (!notice) {
    throw new Error("la página no monta el aviso de descarga");
  }
  return DownloadNotice(notice.props as Parameters<typeof DownloadNotice>[0]) as AnyElement | null;
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

  it("el enlace del exporte nombra la pantalla donde está montado el recurso, con su búsqueda y su página", async () => {
    state.list.mockResolvedValue({ rows: [], total: 60 });
    const page = await ResourcePage({
      resource: resource({
        filters: [{ key: "editionId", label: "Edición", options: [] }],
      }),
      searchParams: { q: "ana maría", pagina: "2", descarga: "1" },
      basePath: "/admin/eventos/evento1/ediciones/edicion1/inscritos",
      fixedFilters: { editionId: "edicion1" },
    });
    const toolbar = elements(page).find((element) => element.type === ResourceToolbar);
    const href = new URL(String(toolbar?.props.exportHref), "http://local");
    expect(href.pathname).toBe("/api/export/ejemplo");
    expect(href.searchParams.get("q")).toBe("ana maría");
    expect(href.searchParams.get("editionId")).toBe("edicion1");
    expect(href.searchParams.get("pantalla")).toBe(
      "/admin/eventos/evento1/ediciones/edicion1/inscritos?q=ana+mar%C3%ADa&pagina=2",
    );
  });

  it("al volver de una descarga que no salió avisa que hay que pedirla otra vez", async () => {
    const page = await ResourcePage({ resource: resource(), searchParams: { descarga: "1" } });
    const notice = downloadNotice(page);
    expect(notice?.type).toBe("output");
    expect(notice?.props.children).toBe(t("T-3211"));
  });

  it("sin la marca de descarga, o con un valor que no reconoce, no avisa", async () => {
    for (const searchParams of [{}, { descarga: "" }, { descarga: "0" }, { descarga: "si" }]) {
      expect(downloadNotice(await ResourcePage({ resource: resource(), searchParams }))).toBeNull();
    }
  });
});

describe("aviso de exporte recortado en el listado", () => {
  /** Los textos sueltos que pinta la página. */
  function texts(page: ReactNode): unknown[] {
    return elements(page).map((element) => element.props.children);
  }

  it("un listado con más registros que el tope del exporte avisa que el CSV sale recortado", async () => {
    state.list.mockResolvedValue({ rows: [], total: EXPORT_ROW_LIMIT + 1 });
    const page = await ResourcePage({ resource: resource(), searchParams: {} });
    expect(texts(page)).toContain(
      t("T-3249", { n: EXPORT_ROW_LIMIT, total: EXPORT_ROW_LIMIT + 1 }),
    );
  });

  it("uno que cabe entero en el exporte no avisa nada", async () => {
    state.list.mockResolvedValue({ rows: [], total: EXPORT_ROW_LIMIT });
    const page = await ResourcePage({ resource: resource(), searchParams: {} });
    expect(texts(page)).not.toContain(
      t("T-3249", { n: EXPORT_ROW_LIMIT, total: EXPORT_ROW_LIMIT }),
    );
  });
});
