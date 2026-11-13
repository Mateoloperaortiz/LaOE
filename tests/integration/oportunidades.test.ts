import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { listOpenOpportunitiesFor } from "@/modules/crm";
import {
  createOpportunity,
  type OpportunityInput,
  updateOpportunity,
} from "@/modules/crm/domain/opportunities";
import { t } from "@/shared/copy";
import { seedOrganization } from "../factories";
import { truncateAll } from "./db";

// Oportunidades de los aliados (ADR-186): Mi OE muestra las publicadas que no han cerrado, a miembros,
// a egresados o a los dos.

beforeEach(truncateAll);
afterAll(() => closeDb());

const admin = { personId: null, ip: null };
const HOY = "2026-11-13";

function create(input: Partial<OpportunityInput> & { organizationId: string; title: string }) {
  return runCommand(admin, (ctx) =>
    createOpportunity(ctx, {
      kind: "INTERNSHIP",
      audience: "BOTH",
      description: "",
      status: "PUBLISHED",
      ...input,
    }),
  );
}

describe("oportunidades de los aliados", () => {
  it("cada público ve lo suyo, sin borradores ni cerradas, y lo que cierra antes va primero", async () => {
    const aliado = await seedOrganization("Aliado de prueba");
    await create({ organizationId: aliado, title: "Para todos, sin fecha" });
    await create({ organizationId: aliado, title: "Para todos, cierra pronto", closesOn: HOY });
    await create({ organizationId: aliado, title: "Solo miembros", audience: "MEMBERS" });
    await create({ organizationId: aliado, title: "Solo egresados", audience: "ALUMNI" });
    await create({ organizationId: aliado, title: "Ya cerró", closesOn: "2026-11-12" });
    await create({ organizationId: aliado, title: "Borrador", status: "DRAFT" });

    const miembros = await listOpenOpportunitiesFor("MEMBER", HOY);
    expect(miembros.map((item) => item.title)).toEqual([
      "Para todos, cierra pronto",
      "Solo miembros",
      "Para todos, sin fecha",
    ]);
    expect(miembros[0]?.organizationName).toBe("Aliado de prueba");
    const egresados = await listOpenOpportunitiesFor("ALUMNI", HOY);
    expect(egresados.map((item) => item.title).sort()).toEqual(
      ["Para todos, cierra pronto", "Para todos, sin fecha", "Solo egresados"].sort(),
    );
  });

  it("una oportunidad es de una organización que existe, también al editarla", async () => {
    const aliado = await seedOrganization("Otro aliado");
    await expect(create({ organizationId: "no-existe-0000", title: "Huérfana" })).rejects.toThrow(
      t("T-5019"),
    );
    const { id } = await create({ organizationId: aliado, title: "Práctica de verano" });
    await expect(
      runCommand(admin, (ctx) =>
        updateOpportunity(ctx, id, {
          organizationId: "no-existe-0000",
          kind: "JOB",
          audience: "BOTH",
          title: "Práctica de verano",
          description: "",
          status: "PUBLISHED",
        }),
      ),
    ).rejects.toThrow(t("T-5019"));
  });
});
