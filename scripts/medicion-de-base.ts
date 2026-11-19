import { spawnSync } from "node:child_process";
import { closeSync, openSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { closeDb } from "@/db/client";
import { logger } from "@/shared/log";
import {
  MeasurementError,
  type MeasurementPlan,
  prepareMeasurement,
  retireMeasurement,
} from "./lib/medicion-de-base";

// Prepara las cuentas y los datos sintéticos de la medición de base (docs/23-medicion-de-base.md).
// Sin --env-file, como el arranque del acceso: el operador apunta DATABASE_URL y APP_URL al entorno
// confirmado. El guion por cuenta va a un archivo fuera del repositorio, que es público.

function report(plan: MeasurementPlan): string {
  const formatTime = (date: Date) => date.toISOString().slice(0, 16).replace("T", " ");
  const lines = [
    "# Medición de base · cuentas de demostración",
    "",
    `Término ${plan.term}. Datos sintéticos. La ocasión «${plan.occasion.title}» y la convocatoria «${plan.call.title}» quedan abiertas hasta ${formatTime(plan.occasion.closesAt)} UTC.`,
    "",
    "El moderador abre la Persona 360 de la cuenta del participante y emite el enlace de acceso antes de la sesión. El enlace dura una hora. El participante lo abre en su dispositivo y elige su contraseña.",
    "",
    `La cuenta de moderación es ${plan.moderator.email}. Su primer enlace se emite con \`npm run bootstrap:access -- --email ${plan.moderator.email}\` en el entorno de la medición. El código de la tarea M1 sale de la consola de anfitrión de la ocasión \`${plan.occasion.publicId}\`.`,
    "",
    `## Miembros (${plan.committee}, Mi OE)`,
    "",
    "En M5, lee «Pide una licencia hasta el último día de este mes. Volverás el primer día del mes siguiente». La fecha que solicita el formulario es la de regreso.",
    "",
    "| Cuenta | Nombre en la app | Participante | Fecha | Dispositivo |",
    "| --- | --- | --- | --- | --- |",
    ...plan.members.map((item) => `| ${item.email} | ${item.name} | | | |`),
    "",
    "## Operación",
    "",
    `En O4, la campaña en borrador es para GEMIS. Están disponibles el segmento «${plan.campaign.segment}» y la plantilla «${plan.campaign.template}».`,
    "",
    "| Cuenta | Nombre en la app | Persona de O1 | Solicitante de O2 | Reto de O3 | Participante | Fecha | Dispositivo |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...plan.operations.map(
      (item) =>
        `| ${item.email} | ${item.name} | ${item.searchPerson} | ${item.leaveRequester} | ${item.challengeTitle} | | | |`,
    ),
    "",
    "## Registro privado de las sesiones",
    "",
    "Commit de la app según `/api/health` _____________________",
    "",
    "Lee las cinco tareas de su grupo en el protocolo de medición. Registra si terminó sola, con ayuda o si abandonó. Cada tarea tiene un máximo de cinco minutos.",
    "",
    "| Cuenta | Tarea | Segundos | Resultado | Errores | Observación |",
    "| --- | --- | --- | --- | --- | --- |",
    ...[
      ...plan.members.map(({ email }) => ({ email, group: "M" })),
      ...plan.operations.map(({ email }) => ({ email, group: "O" })),
    ].flatMap(({ email, group }) =>
      [1, 2, 3, 4, 5].map((task) => `| ${email} | ${group}${task} | | | | |`),
    ),
    "",
    "## Cuestionario SUS",
    "",
    "Registra una respuesta de 1 a 5 en cada frase del protocolo.",
    "",
    "| Cuenta | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...[...plan.members, ...plan.operations].map(({ email }) => `| ${email} | | | | | | | | | | |`),
    "",
  ];
  return lines.join("\n");
}

function reserveGuide(path: string) {
  const parent = realpathSync(dirname(resolve(path)));
  const git = spawnSync("git", ["-C", parent, "rev-parse", "--git-dir"], { stdio: "ignore" });
  if (git.error) throw git.error;
  if (git.status === 0) {
    throw new MeasurementError("Elige una carpeta privada fuera de Git para el guion.");
  }
  const target = join(parent, basename(path));
  try {
    return { target, fd: openSync(target, "wx", 0o600) };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new MeasurementError(
        "El guion ya existe. Elige un nombre nuevo para conservar las anotaciones.",
      );
    }
    throw error;
  }
}

try {
  const { values } = parseArgs({
    options: {
      miembros: { type: "string", default: "15" },
      operacion: { type: "string", default: "12" },
      dias: { type: "string", default: "21" },
      salida: { type: "string" },
      retirar: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  if (values.retirar) {
    const revoked = await retireMeasurement();
    logger.info({ revoked }, "medición: permisos de las cuentas de demostración retirados");
  } else {
    if (!values.salida) throw new MeasurementError("Uso: --salida <archivo fuera del repositorio>");
    const guide = reserveGuide(values.salida);
    try {
      const plan = await prepareMeasurement({
        members: Number(values.miembros),
        operations: Number(values.operacion),
        days: Number(values.dias),
      });
      writeFileSync(guide.fd, report(plan));
      logger.info(
        {
          term: plan.term,
          members: plan.members.length,
          operations: plan.operations.length,
          closesAt: plan.occasion.closesAt.toISOString(),
        },
        "medición preparada",
      );
    } catch (error) {
      unlinkSync(guide.target);
      throw error;
    } finally {
      closeSync(guide.fd);
    }
  }
} catch (error) {
  // Sin el error completo: puede traer fragmentos de la conexión.
  logger.error(
    error instanceof MeasurementError
      ? error.message
      : "La medición no se preparó; revisa el entorno y la conexión al Postgres elegido",
  );
  if (!(error instanceof MeasurementError) && error instanceof Error) {
    logger.error({ name: error.name }, "tipo del error");
  }
  process.exitCode = 1;
} finally {
  await closeDb();
}
