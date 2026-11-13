import type { Metadata } from "next";
import { requireActor } from "@/modules/identity";
import { type MentorshipPerson, mentorshipsFor } from "@/modules/people";
import { tList } from "@/shared/copy";

// Padrinos (ADR-185): el nuevo ve a su padrino y el padrino a sus ahijados, por su nombre y sus
// comités del semestre. Un egresado con acceso (ADR-184) también entra: es padrino desde afuera.

export const metadata: Metadata = { title: tList("T-5016")[0] ?? "" };

function Persona({ item, alumni }: { item: MentorshipPerson; alumni: string }) {
  const detail = item.alumni ? [alumni, ...item.committees] : item.committees;
  return (
    <li className="flex flex-col gap-1 rounded-tarjeta bg-superficie p-4">
      <span className="font-semibold">{item.name}</span>
      {detail.length > 0 ? (
        <span className="text-secundario text-tinta-secundaria">{detail.join(" · ")}</span>
      ) : null}
    </li>
  );
}

export default async function PadrinosPage() {
  const actor = await requireActor("/app/padrinos");
  const { mentor, mentees } = await mentorshipsFor(actor.personId);
  const [titulo, intro, tuPadrino, tusAhijados, egresado, vacio] = tList("T-5016");
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pantalla">{titulo}</h1>
        <p className="text-secundario text-tinta-secundaria">{intro}</p>
      </header>
      {!mentor && mentees.length === 0 ? <p className="text-tinta-secundaria">{vacio}</p> : null}
      {mentor ? (
        <section aria-labelledby="padrinos-padrino" className="flex flex-col gap-2">
          <h2 id="padrinos-padrino" className="titulo-seccion">
            {tuPadrino}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            <Persona item={mentor} alumni={egresado ?? ""} />
          </ul>
        </section>
      ) : null}
      {mentees.length > 0 ? (
        <section aria-labelledby="padrinos-ahijados" className="flex flex-col gap-2">
          <h2 id="padrinos-ahijados" className="titulo-seccion">
            {tusAhijados}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {mentees.map((item) => (
              <Persona key={item.personId} item={item} alumni={egresado ?? ""} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
