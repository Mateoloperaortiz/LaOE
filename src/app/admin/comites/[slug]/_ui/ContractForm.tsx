"use client";

import { createId } from "@paralleldrive/cuid2";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useRef, useState } from "react";
import { Button } from "@/shared/ui/Button";
import { uploadReviewFile } from "@/shared/ui/bucket-upload";
import { Field, TextInput as Input } from "@/shared/ui/Field";
import { UploadError, uploadErrorMessage } from "@/shared/ui/upload-error";
import { submitContractAction } from "../actions";

export function ContractForm({
  id: initialId,
  maxBytes,
  slug,
  slots,
  fields,
  invalid,
  progress,
}: {
  id: string;
  maxBytes: number;
  slug: string;
  slots: { slot: string; label: string }[];
  fields: readonly string[];
  invalid: string;
  progress: readonly string[];
}) {
  const router = useRouter();
  const [id, setId] = useState(initialId);
  const busy = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [, title, supplier, amount, send] = fields;
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const selected = slots.map(({ slot }) => ({ slot, file: data.get(slot) }));
    if (
      selected.some(({ file }) => !(file instanceof File) || !file.size || file.size > maxBytes)
    ) {
      setError(invalid);
      return;
    }
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const files: Record<string, { name: string; digest: string; key: string }> = {};
      for (const { slot, file } of selected) {
        if (!(file instanceof File)) throw new UploadError(invalid);
        files[slot] = await uploadReviewFile(file, `/api/contratos/subidas/${slug}`, { id, slot });
      }
      const response = await submitContractAction(slug, {
        id,
        title: data.get("title"),
        supplier: data.get("supplier"),
        amount: data.get("amount"),
        files,
      });
      if (response.error) throw new UploadError(response.error);
      form.reset();
      setId(createId());
      router.replace(`/admin/comites/${slug}?area=finanzas&guardado=contrato`, { scroll: false });
      router.refresh();
    } catch (cause) {
      setError(uploadErrorMessage(cause, progress[1] ?? ""));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  return (
    <form method="post" onSubmit={submit}>
      <fieldset disabled={loading} className="grid max-w-2xl gap-3">
        <Field id={`objeto-${id}`} label={title}>
          <Input id={`objeto-${id}`} name="title" minLength={2} maxLength={200} required />
        </Field>
        <Field id={`proveedor-${id}`} label={supplier}>
          <Input id={`proveedor-${id}`} name="supplier" maxLength={200} required />
        </Field>
        <Field id={`monto-${id}`} label={amount}>
          <Input
            id={`monto-${id}`}
            name="amount"
            type="number"
            min="0.01"
            max="9999999999.99"
            step="0.01"
            required
          />
        </Field>
        {slots.map(({ slot, label }) => (
          <Field key={slot} id={`${slot}-${id}`} label={label}>
            <Input id={`${slot}-${id}`} type="file" name={slot} required />
          </Field>
        ))}
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={loading} area="operacion" className="justify-self-start">
          {loading ? progress[0] : send}
        </Button>
      </fieldset>
    </form>
  );
}
