// Entradas del ICS personal sin I/O (ADR-038 regla 12): cada ocasión y cada edición con un UID propio.

export interface AgendaOccasion {
  id: string;
  publicId: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt: Date | null;
  updatedAt: Date;
}

export interface AgendaEdition {
  id: string;
  name: string;
  eventName: string;
  eventSlug: string;
  slug: string;
  description: string;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  updatedAt: Date;
}

export interface AgendaEntry {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  url: string;
  start: Date;
  end?: Date | null;
  stamp: Date;
}

/** Corta un Markdown a `max` caracteres de texto plano para la descripción del evento. */
function plain(markdown: string, max = 500): string {
  const text = markdown
    .replace(/[#*_>`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function agendaEntries(
  occasions: readonly AgendaOccasion[],
  editions: readonly AgendaEdition[],
  base: string,
  host: string,
): AgendaEntry[] {
  const fromOccasions = occasions.map((row) => {
    const description = plain(row.description);
    return {
      uid: `ocasion-${row.id}@${host}`,
      summary: row.title,
      ...(description ? { description } : {}),
      ...(row.location ? { location: row.location } : {}),
      url: `${base}/a/${row.publicId}`,
      start: row.startsAt,
      end: row.endsAt,
      stamp: row.updatedAt,
    };
  });
  const fromEditions = editions.map((edition) => {
    const description = plain(edition.description);
    return {
      uid: `edicion-${edition.id}@${host}`,
      summary: `${edition.eventName} · ${edition.name}`,
      ...(description ? { description } : {}),
      ...(edition.location ? { location: edition.location } : {}),
      url: `${base}/eventos/${edition.eventSlug}/${edition.slug}`,
      start: edition.startsAt,
      end: edition.endsAt,
      stamp: edition.updatedAt,
    };
  });
  return [...fromOccasions, ...fromEditions].sort((a, b) => a.start.getTime() - b.start.getTime());
}
