import type { Metadata } from "next";
import Link from "next/link";
import { EXCUSE_CAUSES, excuseDeadline, listRequestsByPerson } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import { listCheckInsForPerson, listOccasionsForTerm } from "@/modules/participation";
import { getMembershipRef, getMyMembership, listAllCommittees } from "@/modules/people";
import { getPrivacyPolicyState } from "@/modules/system";
import { PrivacyPolicyNotice } from "@/modules/system/components/PrivacyPolicyNotice";
import { getCurrentTerm } from "@/modules/terms";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { Vacio } from "../_ui/Vacio";
import { requestTypes } from "./form-state";
import { RequestForm, RequestResult, WithdrawRequest } from "./RequestForm";

export const metadata: Metadata = { title: t("T-138") };

type Search = Record<string, string | string[] | undefined>;
function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function SolicitudesPage({ searchParams }: PageProps<"/app/solicitudes">) {
  const actor = await requireActor("/app/solicitudes");
  const search: Search = await searchParams;
  const selected = requestTypes[single(search.tipo)];
  const error = single(search.error);
  const [requests, membership, mine, committees, policy, term] = await Promise.all([
    listRequestsByPerson(actor.personId),
    getMembershipRef(actor.personId),
    getMyMembership(actor.personId),
    listAllCommittees(),
    getPrivacyPolicyState(),
    getCurrentTerm(),
  ]);
  // Ocasiones que todavía se pueden excusar (ADR-060 regla 5): del término, no canceladas, sin
  // asistencia ni excusa registrada, dentro del plazo de tres días hábiles y hasta 45 días adelante.
  const now = new Date();
  const horizon = new Date(now.getTime() + 45 * 86_400_000);
  const [termOccasions, myCheckIns] =
    selected === "EXCUSE" && term
      ? await Promise.all([
          listOccasionsForTerm(term.id, ["OPEN", "CLOSED"]),
          listCheckInsForPerson(actor.personId),
        ])
      : [[], []];
  const covered = new Set(
    myCheckIns
      .filter((row) => row.status === "APPROVED" || row.status === "EXCUSED")
      .map((row) => row.occasionId),
  );
  const occasionOptions = termOccasions
    .filter((row) => !covered.has(row.id) && row.startsAt <= horizon)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((row) => ({
      id: row.id,
      label: `${formatDateTime(row.startsAt)} · ${row.title}${excuseDeadline(row.startsAt) < now ? ` · ${t("T-2338")}` : ""}`,
    }));
  const causeLabels = tList("T-2215");
  const causeOptions = EXCUSE_CAUSES.map((code, index) => ({
    code,
    label: causeLabels[index] ?? code,
  }));
  const kinds = tList("T-139");
  const kindLabels = tList("T-894");
  const isActive = membership?.status === "ACTIVE";
  const mineIds = new Set(mine.committees.map((row) => row.committeeId));
  const pending = new Set(
    requests.filter((row) => row.status === "PENDING").map((row) => row.kind),
  );
  // Conservar el contexto del historial al abrir, cambiar y cerrar el trámite.
  function href(extra: Record<string, string> = {}, section = ""): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      if (!["tipo", "error", "enviada", "retirada"].includes(key) && value !== undefined) {
        for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
      }
    }
    for (const [key, value] of Object.entries(extra)) query.set(key, value);
    return `/app/solicitudes${query.size ? `?${query}` : ""}${section ? `#${section}` : ""}`;
  }
  const options = [
    {
      type: "licencia",
      kind: "LEAVE",
      title: kinds[0] ?? "",
      label: kindLabels[0] ?? "",
      explanation: t("T-882"),
    },
    {
      type: "cambio",
      kind: "TRANSFER",
      title: kinds[2] ?? "",
      label: kindLabels[2] ?? "",
      explanation: t("T-883"),
    },
    {
      type: "retiro",
      kind: "RESIGNATION",
      title: kinds[1] ?? "",
      label: kindLabels[1] ?? "",
      explanation: t("T-143"),
    },
    {
      type: "excusa",
      kind: "EXCUSE",
      title: kinds[3] ?? "",
      label: kindLabels[3] ?? "",
      explanation: t("T-2221"),
    },
  ] as const;
  const activeOption = options.find((option) => option.kind === selected);

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-138")}</h1>
        <p className="max-w-prose text-base">{t("T-874")}</p>
        {single(search.enviada) === "1" ? <RequestResult message={t("T-140")} /> : null}
        {single(search.retirada) === "1" ? <RequestResult message={t("T-879")} /> : null}
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-oe-orange bg-fondo-suave px-4 py-3 font-semibold"
          >
            {error}
          </p>
        ) : null}
      </header>

      {!isActive ? (
        <Vacio texto={t("T-892")} />
      ) : activeOption && selected ? (
        <RequestForm
          key={selected}
          kind={selected}
          title={activeOption.title}
          explanation={activeOption.explanation}
          currentCommittees={mine.committees.map((row) => ({
            id: row.committeeId,
            name: row.committeeName,
          }))}
          otherCommittees={committees
            .filter((committee) => !mineIds.has(committee.id))
            .map((committee) => ({ id: committee.id, name: committee.name }))}
          occasions={occasionOptions}
          causes={causeOptions}
          policyReady={policy.ready}
          policyNotice={!policy.ready ? <PrivacyPolicyNotice /> : null}
          existingPending={selected !== "EXCUSE" && pending.has(selected)}
          pendingLabel={t("T-891", { tipo: activeOption.label })}
          closeHref={href()}
          successHref={href({ enviada: "1" }, "solicitudes")}
        />
      ) : (
        <section aria-labelledby="new-request" className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 id="new-request" className="text-2xl">
              {t("T-1580")}
            </h2>
            <p className="text-sm text-tinta-suave">{t("T-1581")}</p>
          </div>
          <ul className="grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-4">
            {options.map((option) => (
              <li key={option.type} className="min-w-0">
                <Link
                  href={href({ tipo: option.type })}
                  className="flex h-full min-h-28 flex-col justify-between gap-4 rounded-2xl border border-borde bg-fondo p-4 transition-colors hover:border-titulo focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-titulo"
                >
                  <span className="flex items-start justify-between gap-3 text-base font-semibold">
                    <span>{option.title}</span>
                    <span aria-hidden="true">↗</span>
                  </span>
                  {option.kind !== "EXCUSE" && pending.has(option.kind) ? (
                    <span className="text-sm text-tinta-suave">
                      {t("T-891", { tipo: option.label })}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="solicitudes" aria-labelledby="mis-solicitudes" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-borde pt-6">
          <h2 id="mis-solicitudes" className="text-2xl">
            {t("T-877")}
          </h2>
          <p className="text-sm text-tinta-suave">{t("T-1597", { n: requests.length })}</p>
        </div>
        {requests.length === 0 ? (
          <Vacio texto={t("T-875")} />
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0">
            {requests.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-2xl border border-borde bg-fondo p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{row.kindLabel}</span>
                  <Insignia
                    fondo={
                      row.status === "APPROVED"
                        ? "amarillo"
                        : row.status === "REJECTED"
                          ? "naranja"
                          : row.status === "PENDING"
                            ? "sky"
                            : "paper"
                    }
                  >
                    {row.statusLabel}
                  </Insignia>
                  <time dateTime={row.createdAt.toISOString()} className="text-sm text-tinta-suave">
                    {formatDateTime(row.createdAt)}
                  </time>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{row.detail}</p>
                {typeof row.payload.reason === "string" ? (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    <span className="font-semibold">{t("T-434")}: </span>
                    {row.payload.reason}
                  </p>
                ) : null}
                {row.status === "APPROVED" ? (
                  <p className="text-sm font-semibold">
                    <span className="text-tinta-suave">{t("T-895")}: </span>
                    {t("T-141", { tipo: row.kindLabel })}
                  </p>
                ) : null}
                {row.status === "REJECTED" ? (
                  <p className="break-words text-sm font-semibold">
                    <span className="text-tinta-suave">{t("T-895")}: </span>
                    {t("T-142", { tipo: row.kindLabel, motivo: row.reason ?? "" })}
                  </p>
                ) : null}
                {row.status === "PENDING" ? (
                  <WithdrawRequest
                    requestId={row.id}
                    successHref={href({ retirada: "1" }, "solicitudes")}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
