import type { Metadata } from "next";
import { requireActor } from "@/modules/identity";
import { getSurveyInviteForActor } from "@/modules/participation";
import { t, tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { FormularioEncuesta } from "../../encuesta/[token]/FormularioEncuesta";

// La encuesta de una ocasión abierta por su id con la sesión (ADR-174): la misma de `/app/encuesta/<token>`,
// para llegar desde «Te toca». Solo la invitación de quien tiene la sesión; la respuesta va sin persona.

export const metadata: Metadata = { title: t("T-1161"), robots: { index: false } };

export default async function EncuestaPorIdPage({ params }: PageProps<"/app/encuestas/[id]">) {
  const { id } = await params;
  const actor = await requireActor(`/app/encuestas/${id}`);
  if (actor.membershipStatus === "ON_LEAVE") {
    return (
      <div className="flex flex-col gap-6">
        <h1>{t("T-1161")}</h1>
        <p>{t("T-2041")}</p>
      </div>
    );
  }
  const invite = await getSurveyInviteForActor(actor.personId, { inviteId: id });
  const [ratingLow, ratingHigh] = tList("T-1102");
  const title =
    invite.state === "NOT_FOUND" ? t("T-1161") : t("T-1095", { actividad: invite.occasionTitle });
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-display-lg">{title}</h1>
      {invite.state === "OPEN" ? (
        <>
          <p className="max-w-prose">{t("T-1096")}</p>
          <FormularioEncuesta
            invite={id}
            fields={invite.fields}
            labels={{
              submit: t("T-1097"),
              required: t("T-853"),
              multiHelp: t("T-870"),
              dateHelp: t("T-871"),
              rating: [ratingLow, ratingHigh],
              thanks: t("T-1098"),
              answered: t("T-1099"),
              expired: t("T-1100"),
              notFound: t("T-1101"),
            }}
          />
        </>
      ) : (
        <p className="rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
          {invite.state === "ANSWERED"
            ? t("T-1099")
            : invite.state === "EXPIRED"
              ? t("T-1100")
              : t("T-1101")}
        </p>
      )}
      <Link href="/app" className="boton-secundario self-start">
        {t("T-1094")}
      </Link>
    </div>
  );
}
