import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { type Env, getEnv } from "@/env";
import { getCarnetCredential, rotateCarnetTokenAs } from "@/modules/identity";
import { buildApplePass } from "@/modules/wallet/domain/apple";
import { listPassesFor } from "@/modules/wallet/domain/passes";
import * as appleAdapter from "@/shared/adapters/apple-pass";
import { truncateAll } from "./db";
import { seedMember } from "./factories";
import { walletActor } from "./wallet-fixtures";

function unzip(buffer: Buffer): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  let cursor = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < buffer.readUInt16LE(end + 10); i++) {
    expect(buffer.readUInt32LE(cursor)).toBe(0x02014b50);
    const method = buffer.readUInt16LE(cursor + 10);
    const size = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const local = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString();
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const body = buffer.subarray(start, start + size);
    result.set(name, method === 0 ? body : inflateRawSync(body));
    cursor += 46 + nameLength + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
  }
  return result;
}

describe("emisión Apple Wallet", () => {
  let original: Env;
  beforeEach(async () => {
    original = { ...getEnv() };
    await truncateAll();
  });
  afterEach(() => {
    Object.assign(getEnv(), original);
    vi.restoreAllMocks();
  });
  afterAll(closeDb);

  it("firma un pkpass real y registra la revisión que contiene su QR", async () => {
    const personId = await seedMember("apple-wallet@eafit.edu.co", {
      firstName: "Alma",
      lastName: "Sintética",
    });
    const bytes = await buildApplePass(personId);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const files = unzip(bytes);
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(["pass.json", "manifest.json", "signature", "icon.png", "logo.png"]),
    );
    const passJson = JSON.parse(files.get("pass.json")?.toString() ?? "{}");
    const credential = await getCarnetCredential(personId);
    expect(passJson).toMatchObject({
      serialNumber: personId,
      passTypeIdentifier: "pass.test.oe",
      sharingProhibited: true,
      barcodes: [{ format: "PKBarcodeFormatQR", message: credential?.token }],
      generic: { primaryFields: [{ key: "member", value: "Alma Sintética" }] },
    });
    const manifest = JSON.parse(files.get("manifest.json")?.toString() ?? "{}") as Record<
      string,
      string
    >;
    for (const [name, hash] of Object.entries(manifest)) {
      expect(
        createHash("sha1")
          .update(files.get(name) as Buffer)
          .digest("hex"),
      ).toBe(hash);
    }
    expect(files.get("signature")?.length).toBeGreaterThan(100);
    const [record] = await listPassesFor(personId);
    expect(record).toMatchObject({
      platform: "APPLE",
      walletEpoch: credential?.walletEpoch,
      tokenRevision: credential?.revision,
    });
    expect(record?.issuedAt).toBeInstanceOf(Date);
    await buildApplePass(personId);
    expect(await listPassesFor(personId)).toHaveLength(1);
    expect((await listPassesFor(personId))[0]?.issuedAt).toEqual(record?.issuedAt);
  });

  it("no entrega ni registra un pase si el QR rota durante la firma", async () => {
    const personId = await seedMember("apple-carrera@eafit.edu.co");
    const realSign = appleAdapter.signPass;
    vi.spyOn(appleAdapter, "signPass").mockImplementationOnce(async (input) => {
      const result = await realSign(input);
      await rotateCarnetTokenAs(walletActor(personId));
      return result;
    });
    await expect(buildApplePass(personId)).rejects.toThrow("QR cambió");
    expect(await listPassesFor(personId)).toEqual([]);
    expect((await getCarnetCredential(personId))?.revision).toBe(2);
  });

  it("sin configuración no crea ni token ni registro", async () => {
    const personId = await seedMember("apple-apagado@eafit.edu.co");
    delete getEnv().APPLE_PASS_TYPE_ID;
    await expect(buildApplePass(personId)).rejects.toThrow("no está configurado");
    expect(await listPassesFor(personId)).toEqual([]);
    expect(await getCarnetCredential(personId)).toBeNull();
  });
});
