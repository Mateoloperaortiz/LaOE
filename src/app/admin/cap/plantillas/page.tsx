import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single } from "@/app/_lib/search";
import { currentSeatAuthority } from "@/modules/people";
import { FOLLOW_UP_KINDS, templateQuestions } from "@/modules/permanence";
import { tLabels, tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Banner } from "@/shared/ui/Banner";
import { Button } from "@/shared/ui/Button";
import { Field, TextArea } from "@/shared/ui/Field";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { saveTemplateAction } from "../actions";

// Las preguntas de los formatos de la bitácora (ADR-197 regla 4): la Presidencia las cambia sin tocar
// código. Lo ya escrito guarda las preguntas como estaban.

const [titulo] = tList("T-5134");
export const metadata: Metadata = { title: titulo };

export default async function Page({ searchParams }: PageProps<"/admin/cap/plantillas">) {
  const roles = await requireAdminAreaRoles("/admin/cap/plantillas");
  if ((await currentSeatAuthority(roles.actor.personId, "PRESIDENT")) !== "HOLDER") {
    redirect("/admin/cap");
  }
  const query = await searchParams;
  const templates = await Promise.all(
    // Los formatos del CAP; los de los macroeventos llegan con su tramo (P4).
    FOLLOW_UP_KINDS.filter((kind) => kind.startsWith("CAP_")).map(async (kind) => ({
      kind,
      questions: await templateQuestions(kind),
    })),
  );
  const kinds = tLabels("T-5123", FOLLOW_UP_KINDS);
  const [heading, intro, unaPorLinea, guardar] = tList("T-5134");
  const [, , , , , , volver] = tList("T-5130");
  const error = single(query.error);

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={heading} description={intro} />
      <p className="text-sm">
        <Link href="/admin/cap">{volver}</Link>
      </p>
      {error ? (
        <Banner tone="error" title={error} />
      ) : single(query.guardado) === "1" ? (
        <Banner tone="exito" title={tList("T-4302")[0]} />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        {templates.map(({ kind, questions }) => (
          <form key={kind} action={saveTemplateAction} className="flex flex-col gap-3">
            <h2 className="text-display-md">{kinds[kind] ?? kind}</h2>
            <input type="hidden" name="kind" value={kind} />
            <Field id={`plantilla-${kind}`} label={`${kinds[kind] ?? kind}: ${unaPorLinea ?? ""}`}>
              <TextArea
                id={`plantilla-${kind}`}
                name="questions"
                rows={Math.max(4, questions.length + 1)}
                defaultValue={questions.join("\n")}
              />
            </Field>
            <Button type="submit" variant="secundaria" area="operacion" className="self-start">
              {guardar}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
