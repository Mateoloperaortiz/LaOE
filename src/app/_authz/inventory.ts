import "server-only";
import { redirect } from "next/navigation";
import { actorContext } from "@/app/_lib/actor";
import { canOperate, requireActor } from "@/modules/identity";
import { getInventoryContext } from "@/modules/inventory";

/** Las facultades del inventario se derivan del cargo y del término; nunca de ADMIN prestado. */
export async function requireInventoryAccess(
  path: string,
  access: "MEMBER" | "MANAGE" | "OPERATE" = "MEMBER",
) {
  const session = await requireActor(path);
  const context = await getInventoryContext(session.personId);
  if (access !== "MEMBER" && !canOperate(session)) redirect("/app/inventario");
  if (access === "MANAGE" && !context.canManage) redirect("/app/inventario");
  if (access === "OPERATE" && !context.canOperate) redirect("/app/inventario");
  return { session, context, actor: await actorContext(session) };
}
