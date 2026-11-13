import {
  APP_TIME_ZONE,
  LOCAL_INPUT,
  utcToZonedInput,
  zonedInputToUtc,
} from "@/shared/lib/dates-pure";

/** Rechaza también días imposibles y normalizaciones silenciosas de Date. */
export function inventoryRange(
  startsAt: string,
  endsAt: string,
): { start: Date; end: Date } | null {
  if (!LOCAL_INPUT.test(startsAt) || !LOCAL_INPUT.test(endsAt)) return null;
  try {
    const start = zonedInputToUtc(startsAt, APP_TIME_ZONE);
    const end = zonedInputToUtc(endsAt, APP_TIME_ZONE);
    if (
      utcToZonedInput(start, APP_TIME_ZONE) !== startsAt ||
      utcToZonedInput(end, APP_TIME_ZONE) !== endsAt ||
      start >= end
    )
      return null;
    return { start, end };
  } catch {
    return null;
  }
}
