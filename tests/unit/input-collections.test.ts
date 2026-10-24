import { describe, expect, it } from "vitest";
import { transferPayloadSchema } from "@/modules/crm/domain/requests-pure";
import { editionInputSchema } from "@/modules/events/domain/editions";
import { campaignInputSchema } from "@/modules/participation/domain/boosters";
import { admitInputSchema } from "@/modules/people/domain/admission";
import { committeeRoleInputSchema } from "@/modules/people/domain/roles";
import { segmentInputSchema } from "@/modules/people/domain/segments";
import { decisionInputSchema } from "@/modules/permanence/domain/closing";

// ADR-146: representa solo la longitud de la colección y un acceso. Si Zod intenta validar
// elementos, falla de inmediato: no se construye ni se recorre un payload de DoS.
function unreadCollection(): unknown[] {
  const values: unknown[] = [];
  Object.defineProperty(values, 0, {
    get() {
      throw new Error("La colección sobredimensionada recorrió un elemento");
    },
  });
  values.length = 1_001;
  return values;
}

describe("colecciones recibidas del usuario", () => {
  it.each([
    "leaveCommitteeIds",
    "joinCommitteeIds",
  ] as const)("rechaza %s de una transferencia antes de recorrer sus elementos", (field) => {
    const parsed = transferPayloadSchema.safeParse({
      reason: "Cambio para el siguiente semestre",
      [field]: unreadCollection(),
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toMatchObject([{ code: "too_big", path: [field] }]);
    }
  });

  it.each([
    {
      name: "alta de persona",
      schema: admitInputSchema,
      input: { termId: "term-test" },
      field: "committeeIds",
    },
    {
      name: "organizadores de la edición",
      schema: editionInputSchema,
      input: {
        eventId: "event-test",
        slug: "edicion-test",
        name: "Edición de prueba",
        startsAt: "2026-10-25T10:00",
      },
      field: "committeeIds",
    },
    ...["challengeIds", "occasionIds"].map((field) => ({
      name: `campaña de puntos: ${field}`,
      schema: campaignInputSchema,
      input: {
        name: "Campaña de prueba",
        percent: 25,
        startsAt: "2026-10-25T10:00:00Z",
        endsAt: "2026-10-26T10:00:00Z",
      },
      field,
    })),
    {
      name: "decisiones por comité del cierre de permanencia",
      schema: decisionInputSchema,
      input: { personId: "person-test", person: "CONTINUES" },
      field: "committees",
    },
    {
      name: "capacidades del cargo",
      schema: committeeRoleInputSchema,
      input: { code: "GENERAL", label: "General" },
      field: "capabilities",
    },
    ...["stages", "statuses", "committeeIds", "roleCodes", "tagIds"].map((field) => ({
      name: `segmento: ${field}`,
      schema: segmentInputSchema,
      input: { name: "Segmento de prueba" },
      field,
    })),
  ])("rechaza $name antes de recorrer sus elementos", ({ schema, input, field }) => {
    const parsed = schema.safeParse({ ...input, [field]: unreadCollection() });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toMatchObject([{ code: "too_big", path: [field] }]);
    }
  });

  it("conserva selecciones normales, valores por defecto y la normalización de capacidades", () => {
    expect(
      transferPayloadSchema.parse({ reason: "Cambio de comité", joinCommitteeIds: ["comite"] }),
    ).toMatchObject({ leaveCommitteeIds: [], joinCommitteeIds: ["comite"] });
    expect(admitInputSchema.parse({ termId: "term", committeeIds: ["a", "a", "b"] })).toMatchObject(
      { committeeIds: ["a", "a", "b"] },
    );
    expect(
      committeeRoleInputSchema.parse({
        code: "GENERAL",
        label: "General",
        capabilities: ["ROSTER", "ROSTER", "FINANCE"],
      }).capabilities,
    ).toEqual(["ROSTER", "FINANCE"]);
    expect(segmentInputSchema.parse({ name: "Segmento de prueba" })).toMatchObject({
      stages: [],
      statuses: [],
      committeeIds: [],
      roleCodes: [],
      tagIds: [],
    });
  });
});
