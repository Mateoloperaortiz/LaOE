import { describe, expect, it } from "vitest";
import { altaNotice } from "@/app/admin/permanencia/grupos/[id]/alta";
import { t } from "@/shared/copy";

// La pantalla del grupo lee `?alta=` de la URL: lo arma la action, pero también lo puede escribir
// cualquiera en un enlace. Un valor que no es uno de los tres no dice nada y no tumba la pantalla.

describe("el aviso del alta a mano en la pantalla del grupo", () => {
  it("dice qué pasó con la persona: entró, volvió o ya estaba", () => {
    expect(altaNotice("entro")).toBe(t("T-3214"));
    expect(altaNotice("volvio")).toBe(t("T-3215"));
    expect(altaNotice("ya-estaba")).toBe(t("T-3216"));
  });

  it("un valor que no es uno de los tres no dice nada, aunque sea una clave que todo objeto hereda", () => {
    for (const key of ["", "otro", "constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(altaNotice(key)).toBe("");
    }
  });
});
