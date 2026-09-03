import pino from "pino";

const enProduccion = process.env.NODE_ENV === "production";

// Logs estructurados: JSON en producción (Railway los indexa), legibles en desarrollo.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (enProduccion ? "info" : "debug"),
  base: null,
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.code",
      "*.secret",
      "req.headers.cookie",
      "req.headers.authorization",
    ],
    censor: "[oculto]",
  },
  ...(enProduccion
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
      }),
});
