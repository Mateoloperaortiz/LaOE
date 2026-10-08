import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandContext } from "@/db/tx";
import {
  getOrCreateCalendarToken,
  rotateCalendarTokenAs,
} from "@/modules/identity/domain/calendar-token";
import { ForbiddenError } from "@/modules/identity/domain/errors";

const state = vi.hoisted(() => ({
  membership: vi.fn(),
  lock: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  audit: vi.fn(),
  db: {},
}));

vi.mock("@/modules/people", async () => ({
  canParticipate: (await import("@/modules/people/domain/access-pure")).canParticipate,
  getMembershipRef: state.membership,
  lockWalletMember: state.lock,
}));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));
vi.mock("@/db/tx", () => ({
  SYSTEM_ACTOR: { personId: null },
  runCommand: async (_actor: unknown, command: (ctx: CommandContext) => Promise<unknown>) =>
    command({ tx: state.db, audit: state.audit } as unknown as CommandContext),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.db = { select: state.select, insert: state.insert };
  state.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: async () => [{ token: "enlace-existente" }] }) }),
  });
  state.insert.mockReturnValue({ values: () => ({ onConflictDoUpdate: async () => {} }) });
});

describe("elegibilidad del token del calendario", () => {
  it.each([
    "ON_LEAVE",
    "INACTIVE",
    null,
  ])("%s no puede consultar, crear ni regenerar enlaces de agenda", async (status) => {
    state.membership.mockResolvedValue(status ? { status } : null);
    state.lock.mockResolvedValue(status ? { status, anonymizedAt: null } : null);
    await expect(getOrCreateCalendarToken("persona-sintetica")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(rotateCalendarTokenAs({ personId: "persona-sintetica" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(state.membership).toHaveBeenLastCalledWith("persona-sintetica");
    // Regenerar decide con la membresía que lee bajo el candado, dentro de su transacción.
    expect(state.lock).toHaveBeenLastCalledWith(state.db, "persona-sintetica");
    expect(state.select).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it.each(["ACTIVE", "HONORARY"])("%s puede consultar y regenerar su enlace", async (status) => {
    state.membership.mockResolvedValue({ status });
    state.lock.mockResolvedValue({ status, anonymizedAt: null });
    expect(await getOrCreateCalendarToken("persona-sintetica")).toBe("enlace-existente");
    const rotated = await rotateCalendarTokenAs({ personId: "persona-sintetica" });
    expect(rotated).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(state.insert).toHaveBeenCalledOnce();
    expect(state.audit).toHaveBeenCalledWith({
      action: "calendar-token.rotated",
      entityType: "calendar_token",
      entityId: "persona-sintetica",
    });
  });

  it("una persona anonimizada no regenera su enlace aunque su membresía se lea activa", async () => {
    state.lock.mockResolvedValue({ status: "ACTIVE", anonymizedAt: new Date(0) });
    await expect(rotateCalendarTokenAs({ personId: "persona-sintetica" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
});
