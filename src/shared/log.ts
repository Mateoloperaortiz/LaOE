import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const pretty = !isProduction && !process.env.CI && process.stdout.isTTY;

// JSON en producción, CI y archivos; el formateador con worker queda para la terminal local.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
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
  ...(pretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
});
