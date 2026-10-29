import { t } from "@/shared/copy";

export function Feedback({
  error,
  saved,
}: {
  error?: string | undefined;
  saved?: string | undefined;
}) {
  return (
    <>
      {error ? (
        <p role="alert" className="inventory-notice inventory-error">
          {error}
        </p>
      ) : null}
      {saved ? <output className="inventory-notice">{t("T-4302")}</output> : null}
    </>
  );
}
