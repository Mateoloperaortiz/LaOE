import { addMonths } from "./sanction-pure";

interface Lifecycle {
  status: "ACTIVE" | "INACTIVE" | "ON_TRIAL";
  trialStartsOn: string | null;
  trialEndsOn: string | null;
  deactivatedOn: string | null;
}

/** Plazos del Reglamento, arts. 25–26. La junta decide; el registro respeta sus límites. */
export function committeeLifecycleError(
  next: Lifecycle,
  previous: Lifecycle | null,
  reason: string,
  today: string,
): "T-2325" | "T-2326" | "T-2327" | "T-2328" | null {
  if (next.status === "INACTIVE" && (!next.deactivatedOn || next.deactivatedOn > today)) {
    return "T-2325";
  }
  if (previous?.status === "INACTIVE" && next.status !== "INACTIVE") {
    if (
      next.status !== "ON_TRIAL" ||
      !previous.deactivatedOn ||
      !next.trialStartsOn ||
      next.trialStartsOn < addMonths(previous.deactivatedOn, 2) ||
      next.trialStartsOn > today
    ) {
      return "T-2326";
    }
  }
  if (next.status === "ON_TRIAL") {
    if (
      !next.trialStartsOn ||
      !next.trialEndsOn ||
      next.trialEndsOn < addMonths(next.trialStartsOn, 6) ||
      next.trialEndsOn > addMonths(next.trialStartsOn, 12) ||
      (previous?.status === "ON_TRIAL" && next.trialStartsOn !== previous.trialStartsOn)
    ) {
      return "T-2327";
    }
    if (
      next.trialEndsOn > addMonths(next.trialStartsOn, 6) &&
      next.trialEndsOn !== previous?.trialEndsOn &&
      reason.trim().length < 2
    ) {
      return "T-2328";
    }
  }
  if (
    previous?.status === "ON_TRIAL" &&
    next.status === "ACTIVE" &&
    (!previous.trialEndsOn || today < previous.trialEndsOn)
  ) {
    return "T-2327";
  }
  return null;
}
