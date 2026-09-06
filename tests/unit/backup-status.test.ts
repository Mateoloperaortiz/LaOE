import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "@/modules/system/domain/config";
import { getBackupStatus } from "@/modules/system/domain/maintenance";

const state = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  where: vi.fn(),
  runCommand: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: state.where }) }) }),
}));
vi.mock("@/db/tx", () => ({
  runCommand: state.runCommand,
  SYSTEM_ACTOR: { personId: null },
}));

const now = new Date("2026-07-10T12:00:00.000Z");
const maxAge = 35 * 24 * 60 * 60_000;

beforeEach(() => {
  state.values.clear();
  state.runCommand.mockClear();
  state.where.mockImplementation(async (condition: SQL) => {
    const key = new PgDialect().sqlToQuery(condition).params[0] as string;
    return state.values.has(key) ? [{ value: state.values.get(key) }] : [];
  });
});
afterEach(() => vi.useRealTimers());

describe("estado actual del respaldo", () => {
  it("refleja dos copias sucesivas aunque el control diario y la caché sigan sin copias", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const missing = {
      ok: false,
      checkedAt: "2026-07-10T00:00:00.000Z",
      lastRunAt: null,
      message: "Todavía no hay ninguna copia externa registrada",
    };
    state.values.set("backup.status", missing);
    expect(await getConfig("backup.status")).toEqual(missing);
    expect(await getConfig("backup.lastRunAt")).toBeNull();
    expect(await getBackupStatus(now)).toMatchObject({ ok: false, lastRunAt: null });

    for (const lastRunAt of ["2026-07-10T10:00:00.000Z", "2026-07-10T11:00:00.000Z"]) {
      state.values.set("backup.lastRunAt", lastRunAt);
      expect(await getBackupStatus(now)).toMatchObject({
        ok: true,
        lastRunAt,
        checkedAt: now.toISOString(),
      });
    }

    expect(await getConfig("backup.lastRunAt")).toBeNull();
    expect(await getConfig("backup.status")).toEqual(missing);
    expect(state.values.get("backup.status")).toEqual(missing);
    expect(state.runCommand).not.toHaveBeenCalled();
  });

  it.each([undefined, null])("informa ausencia cuando la marca es %s", async (value) => {
    if (value !== undefined) state.values.set("backup.lastRunAt", value);
    expect(await getBackupStatus(now)).toMatchObject({ ok: false, lastRunAt: null });
    expect(state.runCommand).not.toHaveBeenCalled();
  });

  it("recalcula la antigüedad aunque no cambie la marca", async () => {
    const lastRunAt = new Date(now.getTime() - maxAge).toISOString();
    state.values.set("backup.lastRunAt", lastRunAt);
    expect(await getBackupStatus(now)).toMatchObject({ ok: true, lastRunAt });
    expect(await getBackupStatus(new Date(now.getTime() + 1))).toMatchObject({
      ok: false,
      lastRunAt,
    });
  });
});
