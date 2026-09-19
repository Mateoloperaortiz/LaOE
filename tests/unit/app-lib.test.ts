import { describe, expect, it } from "vitest";
import { formOptional, formRaw, formText } from "@/app/_lib/form";
import { safeBack, single, withQuery } from "@/app/_lib/search";

function form(entries: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }
  return data;
}

describe("lectura de FormData", () => {
  it("formText recorta y trata como vacío lo ausente o lo que no es texto", () => {
    const data = form({ nombre: "  Ana  ", archivo: new Blob(["x"]) });
    expect(formText(data, "nombre")).toBe("Ana");
    expect(formText(data, "falta")).toBe("");
    expect(formText(data, "archivo")).toBe("");
  });

  it("formRaw no recorta: un espacio puede ser parte de una contraseña", () => {
    expect(formRaw(form({ clave: " con espacios " }), "clave")).toBe(" con espacios ");
    expect(formRaw(form({}), "clave")).toBe("");
  });

  it("formOptional devuelve undefined cuando el campo queda vacío", () => {
    expect(formOptional(form({ nota: "   " }), "nota")).toBeUndefined();
    expect(formOptional(form({ nota: " algo " }), "nota")).toBe("algo");
  });
});

describe("parámetros y rutas de vuelta", () => {
  it("single toma el primero de un parámetro repetido", () => {
    expect(single(["a", "b"])).toBe("a");
    expect(single("a")).toBe("a");
    expect(single(undefined)).toBe("");
    expect(single([])).toBe("");
  });

  it("withQuery agrega, reemplaza y conserva lo que la base ya traía", () => {
    expect(withQuery("/admin/ledger", { guardado: "1" })).toBe("/admin/ledger?guardado=1");
    expect(withQuery("/admin/ledger?q=ana&error=x", { error: "otro" })).toBe(
      "/admin/ledger?q=ana&error=otro",
    );
    expect(withQuery("/admin/ledger", {})).toBe("/admin/ledger");
    expect(withQuery("/admin/ledger", { error: "No se pudo" })).toBe(
      "/admin/ledger?error=No+se+pudo",
    );
  });

  it("safeBack acepta rutas del área y rechaza todo lo demás", () => {
    const fallback = "/admin/ledger";
    expect(safeBack("/admin/personas/abc-123?pestana=datos", "/admin", fallback)).toBe(
      "/admin/personas/abc-123?pestana=datos",
    );
    expect(safeBack("/admin", "/admin", fallback)).toBe("/admin");
    for (const hostile of [
      undefined,
      "",
      "https://evil.test/admin",
      "//evil.test/admin",
      "/admin//evil.test",
      "/administrador",
      "/app/gh-points",
      "/admin/\\evil",
      "/admin/x y",
      "javascript:alert(1)",
    ]) {
      expect(safeBack(hostile, "/admin", fallback)).toBe(fallback);
    }
  });

  it("safeBack sirve también para acotar a una sola sección", () => {
    const within = "/app/gh-points/coleccion";
    expect(safeBack(`${within}?insignia=x`, within, within)).toBe(`${within}?insignia=x`);
    expect(safeBack("/app/gh-points/retos", within, within)).toBe(within);
  });
});
