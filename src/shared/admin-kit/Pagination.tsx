import { AppLink as Link } from "@/shared/ui/AppLink";

type Props = {
  page: number;
  totalPages: number;
  hrefFor(page: number): string;
  labels: { summary: string; previous: string; next: string };
};

export function Pagination({ page, totalPages, hrefFor, labels }: Props) {
  if (totalPages <= 1) {
    return null;
  }
  return (
    <nav
      aria-label={labels.summary}
      className="admin-pagination flex flex-wrap items-center justify-between gap-4 text-sm"
    >
      <span className="text-tinta-suave" aria-live="polite">
        {labels.summary}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            href={hrefFor(page - 1)}
            rel="prev"
            className="boton-secundario min-h-11 px-4 py-2 text-sm"
          >
            {labels.previous}
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link
            href={hrefFor(page + 1)}
            rel="next"
            className="boton-secundario min-h-11 px-4 py-2 text-sm"
          >
            {labels.next}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
