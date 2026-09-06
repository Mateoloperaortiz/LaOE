import {
  bucket,
  defineRailway,
  github,
  postgres,
  preserve,
  project,
  type ResourceNode,
  ref,
  service,
} from "railway/iac";

const REGION = "us-east4-eqdc4a";
const LIMITS = { containers: { cpu: 1, memoryBytes: 1_000_000_000 } };

// ADR-039: solo configuración. Los secretos se cargan en recursos preparados antes del primer deploy.
export default defineRailway((ctx) => {
  if (ctx.environment !== "staging" && ctx.environment !== "production") {
    throw new Error("La infraestructura solo admite los entornos staging y production");
  }
  const production = ctx.environment === "production";
  const source = github("Mateoloperaortiz/LaOE", {
    branch: production ? "production" : "main",
    checkSuites: true,
  });
  const db = postgres("Postgres", { region: REGION });
  db.deploy = { ...db.deploy, limitOverride: LIMITS };
  const media = bucket("media", { region: "iad" });
  // PITR se habilita en Postgres antes del primer apply completo. Declarar su bucket
  // adopta el archivo existente y evita que IaC proponga borrarlo por estar omitido.
  const pitr = bucket("Postgres-PITR", { region: "iad" });
  const storage = {
    S3_ENDPOINT: ref(media, "ENDPOINT"),
    S3_REGION: ref(media, "REGION"),
    S3_BUCKET: ref(media, "BUCKET"),
    S3_ACCESS_KEY_ID: ref(media, "ACCESS_KEY_ID"),
    S3_SECRET_ACCESS_KEY: ref(media, "SECRET_ACCESS_KEY"),
    S3_FORCE_PATH_STYLE: "false",
  };
  const web = service("web", {
    source,
    build: "npm run build",
    start: "npm run start",
    preDeploy: "npm run db:release",
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    replicas: { [REGION]: 1 },
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
      sleepApplication: false,
      limitOverride: LIMITS,
    },
    // oeeafit.com se declara únicamente después del cambio de dominio comprobado.
    env: {
      ...storage,
      DATABASE_URL: db.env.DATABASE_URL,
      NODE_ENV: "production",
      RAILPACK_NODE_VERSION: "24",
      TZ: "UTC",
      APP_TIMEZONE: "America/Bogota",
      LOG_LEVEL: "info",
      PORT: "8080",
      APP_URL: production ? "https://oeeafit.com" : preserve(),
      SESSION_SECRET: preserve(),
      INSTITUTIONAL_EMAIL_DOMAINS: "eafit.edu.co",
      MAILER: production ? "resend" : "console",
      EMAIL_FROM: "OE EAFIT <noreply@oeeafit.com>",
      ...(production ? { RESEND_API_KEY: preserve() } : {}),
      VAPID_PUBLIC_KEY: preserve(),
      VAPID_PRIVATE_KEY: preserve(),
      VAPID_SUBJECT: preserve(),
      JOBS_ENABLED: "true",
      PUBLIC_INDEXING: production ? "true" : "false",
    },
  });
  const resources: ResourceNode[] = [db, media, pitr, web];
  if (production) {
    resources.push(
      service("backup", {
        source,
        build: {
          builder: "DOCKERFILE",
          dockerfilePath: "docker/backup/Dockerfile",
          watchPatterns: ["docker/backup/**", "scripts/backup.sh", ".dockerignore"],
        },
        replicas: { [REGION]: 1 },
        deploy: {
          cronSchedule: "0 8 1 * *",
          restartPolicyType: "NEVER",
          limitOverride: LIMITS,
        },
        env: {
          ...storage,
          DATABASE_URL: db.env.DATABASE_URL,
          TZ: "UTC",
          R2_ENDPOINT: preserve(),
          R2_BUCKET: preserve(),
          R2_ACCESS_KEY_ID: preserve(),
          R2_SECRET_ACCESS_KEY: preserve(),
          AGE_RECIPIENT: preserve(),
        },
      }),
    );
  }
  return project("casa-digital", { resources });
});
