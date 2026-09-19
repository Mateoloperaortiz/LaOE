import { getEnv } from "@/env";
import { logger } from "@/shared/log";
import "./handlers";
import { type Poller, startPoller } from "./poller";
import { SCHEDULE } from "./schedule";
import { type Scheduler, startScheduler } from "./scheduler";

// Arranque único por proceso (instrumentation.ts). El HMR de next dev reevalúa módulos: el estado vive en globalThis.

interface Jobs {
  poller: Poller;
  scheduler: Scheduler;
}

const globalRef = globalThis as typeof globalThis & { __casaDigitalJobs?: Jobs | undefined };

export function startJobs(): void {
  if (globalRef.__casaDigitalJobs) {
    return;
  }
  const env = getEnv();
  const poller = startPoller({
    intervalMs: env.JOBS_POLL_INTERVAL_MS,
    batchSize: env.JOBS_BATCH_SIZE,
    handlerTimeoutMs: env.JOBS_HANDLER_TIMEOUT_MS,
  });
  const scheduler = startScheduler(SCHEDULE, env.APP_TIMEZONE);
  globalRef.__casaDigitalJobs = { poller, scheduler };

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "apagando jobs");
    scheduler.stop();
    await poller.stop();
    globalRef.__casaDigitalJobs = undefined;
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
