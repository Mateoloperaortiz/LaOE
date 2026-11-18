import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it, onTestFinished } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import {
  creativeFileUrl,
  decideCreativeAs,
  listCreativeApprovals,
  prepareCreativeUpload,
  publishCreativeAs,
  requestCreativeAs,
} from "@/modules/comms";
import { creativeApproval } from "@/modules/comms/schema";
import {
  createAnnouncement,
  createCommitteeAnnouncementAs,
  getMemberAnnouncement,
  listCommitteeAnnouncements,
  publishAnnouncement,
} from "@/modules/content";
import { unpublishAnnouncement, updateAnnouncement } from "@/modules/content/domain/announcements";
import { announcement } from "@/modules/content/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { deleteObject, putObject } from "@/shared/adapters/storage";
import { t } from "@/shared/copy";
import { seedAppointment, seedCommittee, seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

beforeEach(truncateAll);
afterAll(closeDb);

const now = new Date("2026-09-13T15:00:00Z");

async function stagePiece(personId: string, committeeId: string, channel: string | null) {
  const id = createId();
  const bytes = Buffer.from("Afiche sintético final");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const signed = await prepareCreativeUpload(personId, committeeId, {
    id,
    digest,
    byteSize: bytes.length,
  });
  const input = {
    id,
    title: "Afiche de la jornada",
    caption: "Viernes a las dos",
    channel,
    file: { name: "afiche.png", digest, key: signed.key },
  };
  onTestFinished(async () => {
    await Promise.all([deleteObject(signed.key), deleteObject(`creatives/files/${id}/${digest}`)]);
  });
  return { id, bytes, signed, input };
}

it("la titular decide una sola vez y el comité recibe el motivo del rechazo", async () => {
  const term = await seedTerm("2026-2");
  const author = await seedMember("pieza-comite@eafit.edu.co");
  const vp = await seedMember("pieza-vp@eafit.edu.co");
  const president = await seedMember("pieza-presidencia@eafit.edu.co");
  await seedAppointment(president, term, "PRESIDENT");
  await seedAppointment(vp, term, "VP_COMMUNICATIONS");
  const committeeId = await seedCommittee("piezas-teatro", "Teatro de prueba");
  const staged = await stagePiece(author, committeeId, "Canal del comité");
  await putObject(staged.signed.key, staged.bytes, "application/octet-stream");
  const piece = await requestCreativeAs(
    { personId: author, ip: null },
    committeeId,
    staged.input,
    now,
  );
  const approve = (personId: string) =>
    decideCreativeAs({ personId, ip: null }, piece.id, { decision: "APPROVED" }, now);
  await expect(approve(president)).rejects.toThrow();
  await expect(approve(author)).rejects.toThrow();
  await expect(
    decideCreativeAs({ personId: vp, ip: null }, piece.id, { decision: "REJECTED" }, now),
  ).rejects.toThrow();
  const note = "Corrige la fecha del ensayo";
  await decideCreativeAs({ personId: vp, ip: null }, piece.id, { decision: "REJECTED", note }, now);
  await expect(approve(vp)).rejects.toThrow();
  await expect(
    publishCreativeAs({ personId: author, ip: null }, committeeId, piece.id, now),
  ).rejects.toThrow(t("T-5183"));
  const [saved] = await getDb()
    .select()
    .from(creativeApproval)
    .where(eq(creativeApproval.id, piece.id));
  expect(saved).toMatchObject({
    status: "REJECTED",
    decidedById: vp,
    decidedAs: "HOLDER",
    decidedAt: now,
    decisionNote: note,
  });
  const decisions = await getDb().select().from(auditLog).where(eq(auditLog.entityId, piece.id));
  expect(decisions.filter((row) => row.action === "creative.decided")).toHaveLength(1);
  const notices = await getDb()
    .select()
    .from(outbox)
    .where(eq(outbox.eventType, "notification.requested"));
  expect(notices.map((row) => row.payload)).toContainEqual(
    expect.objectContaining({
      recipients: [{ personId: vp }],
      url: `/admin/avales?pieza=${piece.id}`,
    }),
  );
  expect(notices.map((row) => row.payload)).toContainEqual(
    expect.objectContaining({
      recipients: [{ personId: author }],
      body: expect.stringContaining(note),
      url: "/admin/comites/piezas-teatro?area=comunicacion",
    }),
  );
});

it.each([
  null,
  "Red social del grupo",
])("el comité publica manualmente una sola vez en el canal elegido (%s)", async (channel) => {
  const term = await seedTerm("2026-2");
  const author = { personId: await seedMember("afiche-comite@eafit.edu.co"), ip: null };
  const substitute = { personId: await seedMember("afiche-suplente@eafit.edu.co"), ip: null };
  await seedAppointment(substitute.personId, term, "PRESIDENT");
  const committeeId = await seedCommittee("canal-piezas", "Comité sintético");
  const other = await seedCommittee("otro-canal", "Otro comité");
  const { id, bytes, signed, input } = await stagePiece(author.personId, committeeId, channel);
  const reader = { all: false, committees: [], readableCommittees: [committeeId] };
  const publish = () => publishCreativeAs(author, committeeId, id, now);
  await putObject(signed.key, Buffer.from("otros bytes"), "application/octet-stream");
  await expect(requestCreativeAs(author, committeeId, input, now)).rejects.toThrow(t("T-5180"));
  await putObject(signed.key, bytes, "application/octet-stream");
  await expect(requestCreativeAs(author, other, input, now)).rejects.toThrow(t("T-5180"));
  await Promise.all([
    requestCreativeAs(author, committeeId, input, now),
    requestCreativeAs(author, committeeId, input, now),
  ]);
  expect(await listCreativeApprovals({ committeeId: other })).toHaveLength(0);
  expect(await creativeFileUrl(id, reader)).toBeNull();
  await expect(publish()).rejects.toThrow(t("T-5183"));
  expect(await listCommitteeAnnouncements(committeeId)).toHaveLength(0);
  await decideCreativeAs(substitute, id, { decision: "APPROVED" }, now);
  expect((await listCreativeApprovals({ committeeId }))[0]).toMatchObject({
    decidedAs: "PRESIDENCY",
    publishedAt: null,
  });
  expect(await listCommitteeAnnouncements(committeeId)).toHaveLength(0);
  expect(await creativeFileUrl(id, reader)).toBeNull();
  await expect(publishCreativeAs(author, other, id, now)).rejects.toThrow();
  await Promise.all([publish(), publish()]);
  const entries = await listCommitteeAnnouncements(committeeId);
  expect((await listCreativeApprovals({ committeeId }))[0]).toMatchObject({
    publishedAt: now,
    publishedById: author.personId,
  });
  const logged = await getDb().select().from(auditLog).where(eq(auditLog.entityId, id));
  expect(logged.map((row) => row.action).sort()).toEqual([
    "creative.decided",
    "creative.published",
    "creative.requested",
  ]);
  if (channel) {
    expect(entries).toHaveLength(0);
    expect(await creativeFileUrl(id, reader)).toBeNull();
  } else {
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    if (!entry) throw new Error("Falta la publicación del comité");
    const post = await getMemberAnnouncement(entry.id);
    expect(post).toMatchObject({
      committeeId,
      creativeApprovalId: id,
      title: input.title,
      body: input.caption,
    });
    const url = await creativeFileUrl(id, reader);
    expect(
      await creativeFileUrl(id, { all: false, committees: [], readableCommittees: [other] }),
    ).toBeNull();
    if (!url) throw new Error("Falta el archivo publicado");
    expect(await (await fetch(url)).text()).toBe(bytes.toString());
    await expect(
      runCommand(author, (ctx) =>
        updateAnnouncement(ctx, entry.id, {
          committeeId,
          title: "Otro afiche",
          body: "Cambio",
          audience: "MEMBERS",
          pinned: false,
        }),
      ),
    ).rejects.toThrow(t("T-5184"));
    await runCommand(author, (ctx) =>
      updateAnnouncement(ctx, entry.id, {
        title: input.title,
        body: input.caption,
        audience: "MEMBERS",
        pinned: true,
      }),
    );
    expect(await getMemberAnnouncement(entry.id)).toMatchObject({
      committeeId,
      pinned: true,
      creativeApprovalId: id,
    });
    await runCommand(author, (ctx) => unpublishAnnouncement(ctx, entry.id));
    expect(await creativeFileUrl(id, reader)).toBeNull();
  }
});

it("la cartelera conserva los avisos de texto y pide aval para imágenes en Markdown", async () => {
  const committeeId = await seedCommittee("cartelera-piezas", "Cartelera de prueba");
  const actor = { personId: await seedMember("aviso-pieza@eafit.edu.co"), ip: null };
  const send = (body: string) =>
    createCommitteeAnnouncementAs(actor, committeeId, {
      title: "Aviso del comité",
      body,
      push: false,
    });
  await expect(send("![Afiche][arte]\n\n[arte]: /api/media/archivo")).rejects.toThrow(t("T-5185"));
  await send("El ensayo es a las cuatro. [Agenda](/app/agenda)");
  expect(await listCommitteeAnnouncements(committeeId)).toHaveLength(1);
  const draft = await runCommand(actor, (ctx) =>
    createAnnouncement(ctx, {
      committeeId,
      title: "Borrador anterior",
      body: "",
      pinned: false,
      audience: "MEMBERS",
    }),
  );
  // Borrador redactado antes de que existiera A6.
  await getDb()
    .update(announcement)
    .set({ body: "![Afiche](/api/media/archivo)" })
    .where(eq(announcement.id, draft.id));
  await expect(runCommand(actor, (ctx) => publishAnnouncement(ctx, draft.id))).rejects.toThrow(
    t("T-5185"),
  );
});
