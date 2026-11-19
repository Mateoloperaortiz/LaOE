import { createId } from "@paralleldrive/cuid2";
import { single } from "@/app/_lib/search";
import { creativeMentoringFor } from "@/modules/comms";
import { requireActor } from "@/modules/identity";
import { tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { leaveFeedbackAction } from "./actions";

export default async function MarketingPage({ searchParams }: PageProps<"/app/mercadeo">) {
  const actor = await requireActor("/app/mercadeo");
  const { pieces, canComment } = await creativeMentoringFor(actor.personId);
  const query = await searchParams;
  const [title, , , observations, submit, empty] = tList("T-5186");
  const [position, prompt, saved] = tList("T-5188");
  return (
    <div className="grid gap-5">
      <h1>{title}</h1>
      {single(query.error) && <p role="alert">{single(query.error)}</p>}
      {single(query.guardado) && <output>{saved}</output>}
      {!pieces.length && <p>{empty}</p>}
      {pieces.map((piece) => (
        <article key={piece.id} className="grid gap-3 rounded-tarjeta bg-superficie p-4">
          <h2>{piece.title}</h2>
          <p>
            {piece.directorName} · {position?.replace("{n}", String(piece.position))}
            {piece.publishedAt && ` · ${formatDateTime(piece.publishedAt)}`}
          </p>
          <a href={`/api/piezas/${piece.id}`} download>
            {piece.fileName}
          </a>
          <h3>{observations}</h3>
          {piece.notes.map((note) => (
            <p key={note.id} className="whitespace-pre-wrap">
              {note.author} · {formatDateTime(note.createdAt)}
              <br />
              {note.body}
            </p>
          ))}
          {canComment && (
            <form action={leaveFeedbackAction} className="grid gap-2">
              <input type="hidden" name="id" value={createId()} />
              <input type="hidden" name="piece" value={piece.id} />
              <label>
                {prompt}
                <textarea className="campo w-full" name="body" required maxLength={2000} rows={3} />
              </label>
              <button className="boton-secundario justify-self-start" type="submit">
                {submit}
              </button>
            </form>
          )}
        </article>
      ))}
    </div>
  );
}
