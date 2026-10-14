import { getActor } from "@/modules/identity";
import { hasLiveConsent } from "@/modules/people";

export const GALLERY_PRIVATE_HEADERS = {
  "cache-control": "private, no-store",
  pragma: "no-cache",
  vary: "Cookie",
  "x-content-type-options": "nosniff",
  "cross-origin-resource-policy": "same-origin",
};

/** Los handlers no heredan el guard del layout de Mi OE; también lo exigen las miniaturas. */
export async function galleryAccessDenied(): Promise<Response | null> {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401, headers: GALLERY_PRIVATE_HEADERS });
  if (
    !["ACTIVE", "HONORARY", "ON_LEAVE"].includes(actor.membershipStatus) ||
    !(await hasLiveConsent(actor.personId, "MEMBERSHIP"))
  ) {
    return new Response(null, { status: 403, headers: GALLERY_PRIVATE_HEADERS });
  }
  return null;
}
