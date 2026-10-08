import { getDb } from "@/db/client";

/**
 * Deja abiertas y listas `connections` conexiones del pool. Una prueba de solicitudes simultáneas lo
 * llama antes de lanzarlas: con una sola conexión abierta, la segunda solicitud gasta su arranque
 * abriendo la suya, la primera confirma antes de que la otra lea y la carrera que la prueba nombra no
 * llega a darse (la prueba pasa aunque falte el candado).
 */
export async function warmPool(connections = 4): Promise<void> {
  const pool = getDb().$client;
  // Se piden todas antes de devolver ninguna: así el pool abre una por cada pedido.
  const clients = await Promise.all(Array.from({ length: connections }, () => pool.connect()));
  try {
    await Promise.all(clients.map((client) => client.query("select 1")));
  } finally {
    for (const client of clients) {
      client.release();
    }
  }
}
