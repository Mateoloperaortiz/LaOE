import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCall } from "@/modules/crm";
import { getFormView } from "@/modules/forms";
import { FormFields } from "@/modules/forms/components/FormFields";
import { requireActor } from "@/modules/identity";
import { listGroupRefs } from "@/modules/permanence";
import { BarraTitulo } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { Markdown } from "@/shared/ui/Markdown";
import { applyAction } from "../actions";

// "Me apunto" a una convocatoria (ADR-037 regla 10): la descripción, los campos del formulario si lo
// tiene y el botón; el resultado se muestra en la lista.

const ID = /^[a-z0-9-]{10,40}$/;

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export async function generateMetadata({
  params,
}: PageProps<"/app/convocatorias/[id]">): Promise<Metadata> {
  const { id } = await params;
  const call = ID.test(id) ? await getCall(id) : null;
  return { title: call?.title ?? t("T-144") };
}

export default async function ConvocatoriaPage({
  params,
  searchParams,
}: PageProps<"/app/convocatorias/[id]">) {
  const { id } = await params;
  await requireActor(`/app/convocatorias/${id}`);
  const call = ID.test(id) ? await getCall(id) : null;
  if (!call) {
    notFound();
  }
  const search: Search = await searchParams;
  const error = single(search.error);
  const [groups, form] = await Promise.all([
    listGroupRefs([call.groupId]),
    call.formId ? getFormView(call.formId) : Promise.resolve(null),
  ]);
  const [porOrden, manual] = tList("T-905") as [string, string];
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <BarraTitulo nivel="h1" color="amarillo" className="self-start">
          {call.title}
        </BarraTitulo>
        <p className="text-tinta-suave">{groups.get(call.groupId)?.name ?? ""}</p>
        <p className="text-sm">
          {call.capacity !== null
            ? t("T-897", { cupo: call.capacity, fecha: formatDate(call.closesAt) })
            : t("T-898", { fecha: formatDate(call.closesAt) })}
          {" · "}
          {call.selection === "FIRST_COME" ? porOrden : manual}
        </p>
        {call.description.trim() ? <Markdown source={call.description} /> : null}
        {error ? (
          <p role="alert" className="rounded-xl bg-oe-orange px-4 py-3 font-semibold text-oe-navy">
            {error}
          </p>
        ) : null}
      </header>
      <form action={applyAction} className="flex max-w-2xl flex-col gap-6">
        <input type="hidden" name="callId" value={call.id} />
        {form ? (
          <FormFields
            fields={form.parsedFields}
            labels={{ required: t("T-853"), multiHelp: t("T-870"), dateHelp: t("T-871") }}
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="boton-calido">
            {t("T-146")}
          </button>
          <Link href="/app/convocatorias" className="boton-secundario">
            {t("T-254")}
          </Link>
        </div>
      </form>
    </div>
  );
}
