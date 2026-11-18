"use client";

import { useRouter } from "next/navigation";
import { type SubmitEvent, useRef, useState } from "react";
import { t, tList } from "@/shared/copy/client";
import { Button } from "@/shared/ui/Button";
import { uploadReviewFile } from "@/shared/ui/bucket-upload";
import { Field, Select, TextArea, TextInput } from "@/shared/ui/Field";
import { UploadError, uploadErrorMessage } from "@/shared/ui/upload-error";
import { submitCreativeAction } from "../actions";

export function CreativeForm({
  slug,
  id: initialId,
  maxBytes,
}: {
  slug: string;
  id: string;
  maxBytes: number;
}) {
  const router = useRouter();
  const [id] = useState(initialId);
  const [destination, setDestination] = useState("board");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const [, title, channel, caption, attachment, send] = tList("T-5178");
  const [board, other, channelName] = tList("T-5181");
  const [progress, fallback] = tList("T-5177");

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size || file.size > maxBytes) {
      setError(t("T-5180"));
      return;
    }
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const uploaded = await uploadReviewFile(file, `/api/piezas/subidas/${slug}`, { id });
      const response = await submitCreativeAction(slug, {
        id,
        title: data.get("title"),
        caption: data.get("caption"),
        channel: data.get("destination") === "board" ? null : data.get("channel"),
        file: uploaded,
      });
      if (response.error) throw new UploadError(response.error);
      router.replace(`/admin/comites/${slug}?area=comunicacion&guardado=pieza`, { scroll: false });
      router.refresh();
    } catch (cause) {
      setError(uploadErrorMessage(cause, fallback));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <form method="post" onSubmit={submit}>
      <fieldset disabled={loading} className="grid gap-4 p-4">
        <Field id="pieza-titulo" label={title}>
          <TextInput id="pieza-titulo" name="title" required minLength={2} maxLength={140} />
        </Field>
        <Field id="pieza-destino" label={channel}>
          <Select
            id="pieza-destino"
            name="destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="board">{board}</option>
            <option value="other">{other}</option>
          </Select>
        </Field>
        {destination === "other" && (
          <Field id="pieza-canal" label={channelName}>
            <TextInput id="pieza-canal" name="channel" required minLength={2} maxLength={120} />
          </Field>
        )}
        <Field id="pieza-texto" label={caption}>
          <TextArea id="pieza-texto" name="caption" rows={4} maxLength={20000} />
        </Field>
        <Field id="pieza-archivo" label={attachment} help={t("T-5180")}>
          <TextInput id="pieza-archivo" type="file" name="file" required />
        </Field>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" area="operacion" className="justify-self-start">
          {loading ? progress : send}
        </Button>
      </fieldset>
    </form>
  );
}
