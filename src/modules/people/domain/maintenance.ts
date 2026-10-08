import { and, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { deletePhotosFor, listPhotoOwners } from "@/modules/content";
import { person } from "../schema";

// Depuración diaria de `people` (ADR-012, prune). Desde ADR-116 regla 8, las fotos propias que todavía
// tenga alguien ya anonimizado.

/**
 * Borra las fotos propias de quien ya fue anonimizado (ADR-116 regla 8): las de quien lo fue antes de
 * esa regla, cuando el aviso no borraba nada, y las que el handler de `person.anonymized` no haya
 * alcanzado. Pasa por quienes tienen alguna foto registrada, que son a lo sumo los miembros de hoy, y
 * borra con `deletePhotosFor`, que es repetible: no choca con el aviso de una anonimización que llegue
 * a la vez. Devuelve cuántas fotos borró.
 */
export async function prunePhotosOfAnonymized(): Promise<number> {
  const owners = await listPhotoOwners();
  if (owners.length === 0) {
    return 0;
  }
  const gone = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(and(inArray(person.id, owners), isNotNull(person.anonymizedAt)));
  let photos = 0;
  for (const { id } of gone) {
    photos += await deletePhotosFor(id);
  }
  return photos;
}
