import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { getEnv } from "@/env";
import { requirePrivacyPolicyVersion } from "@/modules/system";
import { getTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { committee, membership, membershipEvent, person } from "../schema";
import { setCommitteeMemberships } from "./committee-memberships";
import { recordConsent } from "./consents";

// "Dar de alta" (ADR-002, ADR-003, ADR-037): junto con el roster, el único camino a la membresía. Crea la
// membresía activa con su primer término, pone la etapa en miembro, escribe de 1 a 3 comités con cargo
// Miembro, registra el consentimiento de membresía y emite los eventos que ya escuchan identity, crm y
// permanence; `person.admitted` lleva correo, nombre y comités para el correo de bienvenida (T-200).

export const admitInputSchema = z.object({
  termId: z.string().trim().min(1),
  committeeIds: z.array(z.string().trim().min(1)).min(1),
});

export type AdmitInput = z.infer<typeof admitInputSchema>;

export function isInstitutionalEmail(
  email: string,
  domains = getEnv().INSTITUTIONAL_EMAIL_DOMAINS,
) {
  const domain = email.split("@")[1] ?? "";
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

export async function admitPerson(
  ctx: CommandContext,
  personId: string,
  input: AdmitInput,
): Promise<{ membershipId: string }> {
  await requirePrivacyPolicyVersion(ctx, "admin");
  const [who] = await ctx.tx.select().from(person).where(eq(person.id, personId)).for("update");
  if (!who) {
    throw new DomainError(t("T-032"));
  }
  if (who.kind !== "STUDENT") {
    throw new DomainError(t("T-988"));
  }
  if (!isInstitutionalEmail(who.email)) {
    throw new DomainError(t("T-987"), "email");
  }
  const [existing] = await ctx.tx
    .select({ id: membership.id })
    .from(membership)
    .where(eq(membership.personId, personId))
    .limit(1);
  if (existing) {
    throw new DomainError(t("T-986", { nombre: `${who.firstName} ${who.lastName}`.trim() }));
  }
  const when = await getTerm(input.termId);
  if (!when) {
    throw new DomainError(t("T-989"), "termId");
  }
  const committeeIds = [...new Set(input.committeeIds)];
  const committees = await ctx.tx
    .select({ id: committee.id, name: committee.name })
    .from(committee)
    .where(inArray(committee.id, committeeIds));
  if (committees.length !== committeeIds.length) {
    throw new DomainError(t("T-032"), "committeeIds");
  }
  const [created] = await ctx.tx
    .insert(membership)
    .values({ personId, status: "ACTIVE", firstTermId: when.id })
    .returning({ id: membership.id });
  if (!created) {
    throw new Error("No se pudo crear la membresía");
  }
  await ctx.tx.insert(membershipEvent).values({
    membershipId: created.id,
    fromStatus: null,
    toStatus: "ACTIVE",
    reason: null,
    actorId: ctx.actor.personId,
  });
  await ctx.tx.update(person).set({ stage: "MEMBER" }).where(eq(person.id, personId));
  await setCommitteeMemberships(
    ctx,
    personId,
    when.id,
    committeeIds.map((committeeId) => ({ committeeId, roleCode: "MIEMBRO", transferredIn: false })),
  );
  await recordConsent(ctx, personId, { purpose: "MEMBERSHIP", source: "ADMIN" });
  await ctx.audit({
    action: "membership.created",
    entityType: "membership",
    entityId: created.id,
    before: { stage: who.stage },
    after: { status: "ACTIVE", firstTermId: when.id, committeeIds },
  });
  await ctx.emit({
    type: "membership.changed",
    payload: { actorId: ctx.actor.personId, personId, from: null, to: "ACTIVE", reason: null },
  });
  await ctx.emit({
    type: "stage.changed",
    payload: { actorId: ctx.actor.personId, personId, from: who.stage, to: "MEMBER" },
  });
  await ctx.emit({
    type: "person.admitted",
    payload: {
      actorId: ctx.actor.personId,
      personId,
      termId: when.id,
      termCode: when.code,
      email: who.email,
      firstName: who.preferredName || who.firstName,
      committees: committees.map((row) => row.name),
    },
  });
  return { membershipId: created.id };
}
