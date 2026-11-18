import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { afterAll, beforeEach, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import {
  contractFileUrl,
  decideContractAs,
  listContracts,
  prepareContractUpload,
  requestContractAs,
} from "@/modules/finance";
import { deleteObject, putObject } from "@/shared/adapters/storage";
import { t } from "@/shared/copy";
import { seedAppointment, seedCommittee, seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

beforeEach(truncateAll);
afterAll(closeDb);

it("la Presidencia puede registrar la firma con la VP titular presente, solo después de adjuntar los tres archivos", async () => {
  const now = new Date("2026-09-13T15:00:00Z");
  const id = createId();
  const committeeId = await seedCommittee("musica", "Música");
  const scope = { committeeId };
  const committee = { personId: await seedMember("fin-contrato@eafit.edu.co"), ip: null };
  const president = { personId: await seedMember("presi-contrato@eafit.edu.co"), ip: null };
  const vp = { personId: await seedMember("vp-contrato@eafit.edu.co"), ip: null };
  const termId = await seedTerm("2026-2");
  await seedAppointment(president.personId, termId, "PRESIDENT");
  await seedAppointment(vp.personId, termId, "VP_FINANCE");
  const file = (name: string) => ({
    name,
    digest: createHash("sha256").update(name).digest("hex"),
    key: "",
  });
  const files = {
    contract: file("contrato.pdf"),
    legal: file("concepto.pdf"),
    coordinator: file("visto-bueno.pdf"),
  };
  const input = {
    id,
    title: "Alquiler del escenario",
    supplier: "Teatro de prueba",
    amount: 32000,
    files,
  };
  const send = () => requestContractAs(committee, input, scope, now);
  const cleanup: string[] = [];
  try {
    for (const slot of ["contract", "legal", "coordinator"] as const) {
      const f = files[slot];
      const up = await prepareContractUpload(committee.personId, scope, {
        id,
        slot,
        digest: f.digest,
        byteSize: Buffer.byteLength(f.name),
      });
      f.key = up.key;
      cleanup.push(up.key);
      if (slot === "coordinator") {
        await expect(send()).rejects.toThrow(t("T-5174"));
        expect(await listContracts(scope)).toHaveLength(0);
      }
      await putObject(up.key, f.name, "application/octet-stream");
    }
    await putObject(files.legal.key, "Cambio posterior", "application/octet-stream");
    await expect(send()).rejects.toThrow(t("T-5174"));
    await putObject(files.legal.key, files.legal.name, "application/octet-stream");
    const req = await send();
    expect(await send()).toEqual(req);
    expect(
      await contractFileUrl(id, "legal", { all: false, committees: ["otro-comite"] }),
    ).toBeNull();
    const signedUrl = await contractFileUrl(id, "legal", { all: false, committees: [committeeId] });
    if (!signedUrl) throw new Error("Falta el respaldo jurídico");
    await putObject(files.legal.key, "Copia temporal nueva", "application/octet-stream");
    expect(await (await fetch(signedUrl)).text()).toBe(files.legal.name);
    await expect(decideContractAs(committee, id, { decision: "APPROVED" }, now)).rejects.toThrow();
    await decideContractAs(president, id, { decision: "APPROVED" }, now);
    await expect(decideContractAs(vp, id, { decision: "APPROVED" }, now)).rejects.toThrow();
    const [row] = await listContracts(scope);
    expect(row).toMatchObject({
      id,
      status: "APPROVED",
      decidedSeat: "PRESIDENT",
      decidedById: president.personId,
      files: { legal: { name: "concepto.pdf", digest: files.legal.digest } },
    });
  } finally {
    for (const slot of ["contract", "legal", "coordinator"] as const)
      cleanup.push(`contracts/files/${id}/${slot}/${files[slot].digest}`);
    await Promise.all(cleanup.map((key) => deleteObject(key)));
  }
});
