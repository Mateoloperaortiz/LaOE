import { getDb } from "@/db/client";
import { lockPersonAnonymization } from "@/modules/people";

/**
 * Lo que la casa le avisa a una persona sale solo si todavía no fue anonimizada (ADR-116 regla 9; todo
 * correo de un evento y todo push, ADR-119 regla 11). El
 * evento trae el correo que la persona tenía cuando ocurrió, y el poller lo puede procesar o reintentar
 * después de anonimizarla, cuando el registro que evitaba el reenvío ya se borró. Aquí se la vuelve a
 * leer y se la retiene con candado compartido mientras sale el aviso: una anonimización que llegue en
 * ese momento espera, y su limpieza encuentra el registro ya escrito y se lo lleva. Si la persona ya
 * fue anonimizada, o no existe, no corre `deliver` y responde `null`.
 */
export async function unlessAnonymized<Delivered>(
  personId: string,
  deliver: () => Promise<Delivered>,
): Promise<Delivered | null> {
  return getDb().transaction(async (tx) => {
    const who = await lockPersonAnonymization(tx, personId);
    if (!who || who.anonymized) {
      return null;
    }
    return deliver();
  });
}
