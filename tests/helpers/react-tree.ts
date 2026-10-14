import { isValidElement, type ReactElement, type ReactNode } from "react";

export type AnyElement = ReactElement<Record<string, unknown>>;

/** Los elementos del árbol que devuelve un componente, sin ejecutar los que monta. */
export function elements(node: ReactNode): AnyElement[] {
  if (Array.isArray(node)) {
    return node.flatMap(elements);
  }
  if (!isValidElement<Record<string, unknown>>(node)) {
    return [];
  }
  return [node, ...elements(node.props.children as ReactNode)];
}
