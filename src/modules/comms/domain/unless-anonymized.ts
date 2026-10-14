import { getDb } from "@/db/client";
import type { Tx } from "@/db/tx";
import { lockPersonAnonymization } from "@/modules/people";

/**
 * Lo que la casa le avisa a una persona sale solo si todavía no fue anonimizada (ADR-116 regla 9; todo
 * correo de un evento y todo push, ADR-119 regla 11). El
 * evento trae el correo que la persona tenía cuando ocurrió, y el poller lo puede procesar o reintentar
 * después de anonimizarla, cuando el registro que evitaba el reenvío ya se borró. Aquí se la vuelve a
 * leer y se la retiene con candado compartido mientras sale el aviso: una anonimización que llegue en
 * ese momento espera, y su limpieza encuentra el registro ya escrito y se lo lleva. Si la persona ya
 * fue anonimizada, o no existe, no corre `deliver` y responde `null`.
 *
 * `deliver` recibe la transacción del candado. Los correos que viajan sin transacción abierta, el de
 * una campaña y los transaccionales, retienen a la persona solo para escribir su `message` y lo
 * escriben por ella (ADR-120 regla 8): no piden una segunda conexión del pool y el registro se confirma
 * en el mismo instante en que la persona se suelta.
 */
export async function unlessAnonymized<Delivered>(
  personId: string,
  deliver: (tx: Tx) => Promise<Delivered>,
): Promise<Delivered | null> {
  return getDb().transaction(async (tx) => {
    const who = await lockPersonAnonymization(tx, personId);
    if (!who || who.anonymized) {
      return null;
    }
    return deliver(tx);
  });
}
