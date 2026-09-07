import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { issueCarnet, readCarnet } from "@/modules/identity/domain/carnet";
import { getOrCreateCarnetToken } from "@/modules/identity/domain/carnet-token";
import { checkInSelfAs, hostCheckInAs } from "@/modules/participation/domain/commands";
import { buildLiveSnapshot, checkInLink } from "@/modules/participation/domain/live";
import { rotatingCodeAt } from "@/modules/participation/domain/rotating-code-pure";
import { searchMembersByName } from "@/modules/people/domain/people-reads";
import { truncateAll } from "./db";
import { currentTermCode, seedMember, seedOccasion, seedTerm } from "./factories";

describe("modo anfitrión y consola en vivo", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("lee el carnet con el secreto de la app: válido, vencido y manipulado", async () => {
    const personId = await seedMember("carnet@eafit.edu.co");
    const carnet = issueCarnet(personId);
    const read = await readCarnet(carnet.token);
    expect(read.ok && read.personId).toBe(personId);
    const expired = await readCarnet(carnet.token, new Date(carnet.expiresAt.getTime() + 1000));
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe("EXPIRED");
    const tampered = await readCarnet(`${carnet.token.slice(0, -4)}AAAA`);
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.reason).toBe("BAD_SIGNATURE");
    expect((await readCarnet("basura")).ok).toBe(false);
  });

  it("el anfitrión registra un check-in al escanear el carnet persistente oe2", async () => {
    const termId = await seedTerm(currentTermCode());
    const personId = await seedMember("billetera@eafit.edu.co");
    const hostId = await seedMember("anfitrion@eafit.edu.co");
    const { id } = await seedOccasion(termId);
    const read = await readCarnet(await getOrCreateCarnetToken(personId));
    if (!read.ok) throw new Error("No se pudo leer el carnet de billetera");
    expect(read.source).toBe("WALLET");
    await hostCheckInAs(
      { personId: hostId },
      { occasionId: id, personId: read.personId, personName: "Persona Sintética", source: "HOST" },
    );
    const snapshot = await buildLiveSnapshot(id);
    expect(snapshot?.counts.APPROVED).toBe(1);
    expect(snapshot?.recent[0]?.source).toBe("HOST");
  });

  it("la búsqueda por nombre del anfitrión nunca devuelve correos", async () => {
    await seedMember("ana.perez@eafit.edu.co", { firstName: "Ana", lastName: "Pérez" });
    const found = await searchMembersByName("Ana");
    expect(found.map((item) => item.fullName)).toContain("Ana Pérez");
    expect(Object.keys(found[0] ?? {})).not.toContain("email");
  });

  it("el snapshot en vivo cuenta por estado, lista los últimos con nombre y embebe el código en el QR", async () => {
    const termId = await seedTerm(currentTermCode());
    const host = await seedMember("host@eafit.edu.co", { firstName: "Líder", lastName: "Comité" });
    const a = await seedMember("a@eafit.edu.co", { firstName: "Ana", lastName: "Uno" });
    const b = await seedMember("b@eafit.edu.co", { firstName: "Beto", lastName: "Dos" });
    const secret = "secreto-vivo";
    const { id, publicId } = await seedOccasion(termId, {
      approval: "MANUAL",
      requireRotatingCode: true,
      rotatingSecret: secret,
    });
    const now = new Date();
    await checkInSelfAs({ personId: a }, { publicId, code: rotatingCodeAt(secret, id, now) });
    await hostCheckInAs(
      { personId: host },
      { occasionId: id, personId: b, personName: "Beto Dos", source: "HOST" },
    );
    const snapshot = await buildLiveSnapshot(id, now);
    if (!snapshot) throw new Error("sin snapshot");
    expect(snapshot.counts).toEqual({ PENDING: 1, APPROVED: 1, REJECTED: 0, CANCELLED: 0 });
    expect(snapshot.recent.map((item) => [item.name, item.status, item.source])).toEqual([
      ["Beto Dos", "APPROVED", "HOST"],
      ["Ana Uno", "PENDING", "SELF_QR"],
    ]);
    expect(snapshot.code?.value).toBe(rotatingCodeAt(secret, id, now));
    expect(snapshot.link).toBe(checkInLink(publicId, snapshot.code?.value ?? null));
    expect(snapshot.link).toContain(`/a/${publicId}?c=`);
    expect(snapshot.qrSvg.startsWith("<svg")).toBe(true);
    expect(await buildLiveSnapshot("no-existe")).toBeNull();
  });
});
