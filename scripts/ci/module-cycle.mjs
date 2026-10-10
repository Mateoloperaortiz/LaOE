/**
 * El primer ciclo de un grafo de dependencias entre módulos de dominio (ADR-110), o `null` si no tiene.
 * El ciclo vuelve escrito de punta a punta: empieza y termina en el mismo módulo, sin el camino que
 * llevó hasta él. `.dependency-cruiser.cjs` lo corre sobre `MODULE_DEPS` al cargar: `sin-ciclos` solo
 * ve ciclos de archivos, y dos módulos pueden importarse por sus `index.ts` sin que ningún archivo
 * cierre el círculo.
 *
 * @param {Readonly<Record<string, readonly string[]>>} deps De qué módulos importa cada uno.
 * @returns {string[] | null}
 */
export function findModuleCycle(deps) {
  const done = new Set();
  const visit = (name, path) => {
    if (path.includes(name)) {
      return [...path.slice(path.indexOf(name)), name];
    }
    if (done.has(name)) {
      return null;
    }
    for (const next of deps[name] ?? []) {
      const cycle = visit(next, [...path, name]);
      if (cycle) {
        return cycle;
      }
    }
    done.add(name);
    return null;
  };
  for (const name of Object.keys(deps)) {
    const cycle = visit(name, []);
    if (cycle) {
      return cycle;
    }
  }
  return null;
}
