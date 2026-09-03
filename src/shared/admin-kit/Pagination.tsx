import Link from "next/link";

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
    <nav aria-label={labels.summary} className="flex items-center justify-between gap-4 text-sm">
      <span className="text-tinta-suave">{labels.summary}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="boton-secundario min-h-9 px-4 py-1 text-sm">
            {labels.previous}
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className="boton-secundario min-h-9 px-4 py-1 text-sm">
            {labels.next}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
