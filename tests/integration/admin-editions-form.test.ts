import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getResource } from "@/app/admin/_kit/registry";
import { closeDb } from "@/db/client";
import { t } from "@/shared/copy";
import { seedCommittee } from "../factories";
import { truncateAll } from "./db";

// El formulario de ediciones tal como lo arma el registro del admin, que es el que usan la pantalla
// de ediciones y la action de guardar. `events` no importa `people` (ADR-110): las opciones de comité
// las pone el registro.

// El barrel del admin kit trae componentes con `next/font`, que no carga fuera de Next; de él los
// recursos solo usan lo que vive en `types`.
vi.mock("@/shared/admin-kit", async () => await import("@/shared/admin-kit/types"));

describe("formulario de ediciones del admin", () => {
  beforeEach(() => truncateAll());
  afterAll(() => closeDb());

  it("ofrece como organizadores los comités vivos, y no los desactivados", async () => {
    const a3 = await seedCommittee("a3", "A3");
    const agro = await seedCommittee("agro", "AGRO");
    await seedCommittee("viejo", "VIEJO", { status: "INACTIVE" });

    const resource = getResource("ediciones");
    const fields =
      typeof resource?.fields === "function" ? await resource.fields() : (resource?.fields ?? []);

    const organizers = fields.find((field) => field.name === "committeeIds");
    expect(organizers).toMatchObject({ label: t("T-354"), type: "multiselect" });
    expect(organizers?.options).toEqual([
      { value: a3, label: "A3" },
      { value: agro, label: "AGRO" },
    ]);
  });
});
