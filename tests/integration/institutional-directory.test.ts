import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import {
  addUnitContactAs,
  createUnitAs,
  listInstitutionalDirectory,
  saveDirectoryEntryAs,
} from "@/modules/crm";
import { tList } from "@/shared/copy";
import { seedAppointment, seedMediaAsset, seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

// El directorio institucional (ADR-197 regla 3): lo edita la Presidencia sobre las dependencias
// («Unidad EAFIT») del CRM; Mi OE ve solo lo publicado y nunca el correo; la foto exige autorización.

const guard = (index: number) => tList("T-5143")[index] ?? "";

async function setup() {
  const termId = await seedTerm();
  const presidentId = await seedMember("presidencia.directorio@eafit.edu.co");
  await seedAppointment(presidentId, termId, "PRESIDENT");
  const memberId = await seedMember("miembro.directorio@eafit.edu.co");
  return {
    president: { personId: presidentId, ip: null },
    member: { personId: memberId, ip: null },
  };
}

describe("el directorio institucional", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("solo la Presidencia crea dependencias y suma a su gente", async () => {
    const f = await setup();

    await expect(createUnitAs(f.member, { name: "Desarrollo Estudiantil" })).rejects.toThrow(
      guard(0),
    );
    const { id: unit } = await createUnitAs(f.president, { name: "Desarrollo Estudiantil" });
    await expect(
      addUnitContactAs(f.member, unit, {
        firstName: "Ana",
        lastName: "Sintética",
        email: "ana.sintetica@example.org",
        role: "Coordinadora de grupos estudiantiles",
      }),
    ).rejects.toThrow(guard(0));
    await addUnitContactAs(f.president, unit, {
      firstName: "Ana",
      lastName: "Sintética",
      email: "ana.sintetica@example.org",
      role: "Coordinadora de grupos estudiantiles",
    });

    const [todo] = await listInstitutionalDirectory({ publishedOnly: false });
    expect(todo?.people).toEqual([
      expect.objectContaining({ fullName: "Ana Sintética", published: false }),
    ]);
    // Sin publicar, Mi OE no la ve.
    expect(await listInstitutionalDirectory()).toEqual([]);
  });

  it("publica funciones y qué atiende, sin el correo, y la foto solo con autorización", async () => {
    const f = await setup();
    const { id: unit } = await createUnitAs(f.president, { name: "Bienestar Universitario" });
    const { id: contact } = await addUnitContactAs(f.president, unit, {
      firstName: "Luis",
      lastName: "Sintético",
      email: "luis.sintetico@example.org",
      role: "Profesional de bienestar",
    });
    const photo = await seedMediaAsset(`media/${"a".repeat(24)}.jpg`, {
      visibility: "PUBLIC",
      status: "READY",
    });

    await expect(
      saveDirectoryEntryAs(f.president, contact, {
        functions: "Acompaña a los grupos",
        handles: "Préstamo de espacios de bienestar",
        published: true,
        photoAssetId: photo,
        photoAuthorized: false,
      }),
    ).rejects.toThrow(guard(2));
    await saveDirectoryEntryAs(f.president, contact, {
      functions: "Acompaña a los grupos",
      handles: "Préstamo de espacios de bienestar",
      published: true,
      photoAssetId: photo,
      photoAuthorized: true,
    });

    const [publicado] = await listInstitutionalDirectory();
    expect(publicado).toMatchObject({ name: "Bienestar Universitario" });
    expect(publicado?.people[0]).toEqual({
      contactId: contact,
      fullName: "Luis Sintético",
      role: "Profesional de bienestar",
      functions: "Acompaña a los grupos",
      handles: "Préstamo de espacios de bienestar",
      published: true,
      photoAssetId: photo,
      photoAuthorized: true,
    });
    expect(JSON.stringify(publicado)).not.toContain("example.org");

    // Quitar la autorización quita la foto.
    await saveDirectoryEntryAs(f.president, contact, {
      functions: "Acompaña a los grupos",
      handles: "Préstamo de espacios de bienestar",
      published: true,
      photoAssetId: null,
      photoAuthorized: false,
    });
    expect((await listInstitutionalDirectory())[0]?.people[0]?.photoAssetId).toBeNull();
  });
});
