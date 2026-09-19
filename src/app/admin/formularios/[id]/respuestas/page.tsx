import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormView, getSubmission } from "@/modules/forms";
import { submissionsResource } from "@/modules/forms/admin";
import { ResourcePanel } from "@/shared/admin-kit";
import { Dato } from "@/shared/admin-kit/AdminFields";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { ResourcePage } from "../../../_kit/ResourcePage";

// Bandeja de respuestas de un formulario (ADR-037): el listado del kit con el formulario fijado y un
// panel de solo lectura con las respuestas de cada envío (?ver=<id>).

const ID = /^[a-z0-9-]{10,40}$/;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export async function generateMetadata({
  params,
}: PageProps<"/admin/formularios/[id]/respuestas">): Promise<Metadata> {
  const { id } = await params;
  const view = ID.test(id) ? await getFormView(id) : null;
  return {
    title: view
      ? `${submissionsResource.names.plural} · ${view.title}`
      : submissionsResource.names.plural,
  };
}

function renderAnswer(value: unknown): string {
  const [si, no] = tList("T-1058");
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? si : no;
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "—";
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/admin/formularios/[id]/respuestas">) {
  const { id } = await params;
  const view = ID.test(id) ? await getFormView(id) : null;
  if (!view) {
    notFound();
  }
  const search = await searchParams;
  const ver = single(search.ver);
  const basePath = `/admin/formularios/${view.id}/respuestas`;
  const submission = ver && ID.test(ver) ? await getSubmission(ver) : null;
  const [fecha, nombre, correo, , , consentimiento] = tList("T-936");
  return (
    <>
      <ResourcePage
        resource={submissionsResource}
        searchParams={search}
        basePath={basePath}
        fixedFilters={{ formId: view.id }}
        title={`${submissionsResource.names.plural} · ${view.title}`}
      />
      {submission ? (
        <ResourcePanel
          title={t("T-946", { formulario: submission.formTitle })}
          closeHref={basePath}
          closeLabel={t("T-291")}
        >
          <dl className="grid gap-4">
            <Dato
              etiqueta={nombre ?? ""}
              valor={
                submission.personName ??
                `${submission.firstName ?? ""} ${submission.lastName ?? ""}`.trim()
              }
            />
            <Dato etiqueta={correo ?? ""} valor={submission.email} />
            <Dato etiqueta={fecha ?? ""} valor={formatDateTime(submission.createdAt)} />
            <Dato
              etiqueta={consentimiento ?? ""}
              valor={
                submission.consentAcceptedAt
                  ? formatDateTime(submission.consentAcceptedAt)
                  : tList("T-1058")[1]
              }
            />
            {view.parsedFields.map((field) => (
              <Dato
                key={field.key}
                etiqueta={field.label}
                valor={renderAnswer(submission.answers[field.key])}
              />
            ))}
          </dl>
        </ResourcePanel>
      ) : null}
    </>
  );
}
