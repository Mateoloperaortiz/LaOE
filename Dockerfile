# Imagen única de despliegue (ADR-141): se construye una vez por SHA, sirve en staging y se
# promueve a producción por digest. Sin NEXT_PUBLIC_* el artefacto no depende del entorno; lo
# único horneado es el SHA, con el mismo nombre que Railway inyectaba (salud y respaldo lo leen).
FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
# El prepare de npm llama este script (no hace nada sin .git) y debe existir para que npm ci pase.
COPY scripts/install-hooks.mjs ./scripts/install-hooks.mjs
RUN --mount=type=cache,id=npm,target=/root/.npm npm ci

COPY . .

# Los mismos valores sintéticos del workflow de CI: construir no toca servicios reales.
ENV NODE_ENV=production \
    APP_URL=http://localhost:3000 \
    APP_TIMEZONE=America/Bogota \
    TZ=UTC \
    SESSION_SECRET=ci-secreto-de-sesion-que-no-es-real-0000000000000000 \
    INSTITUTIONAL_EMAIL_DOMAINS=eafit.edu.co \
    OTP_FIXED_CODE= \
    EMAIL_FROM="OE EAFIT <noreply@localhost>" \
    MAILER=console \
    S3_ENDPOINT=http://127.0.0.1:3900 \
    S3_REGION=garage \
    S3_BUCKET=media \
    S3_ACCESS_KEY_ID=GK0c1a5ad191ta1de5a2r0110000dev0 \
    S3_SECRET_ACCESS_KEY=9b3f0e6d2c1a4f8e7d6c5b4a3928170f6e5d4c3b2a190807f6e5d4c3b2a19080 \
    S3_FORCE_PATH_STYLE=true \
    JOBS_ENABLED=false

RUN npm run build
# El release de base viaja transpilado a un solo archivo (sin tsx en runtime), con la lista de
# índices exigidos precalculada acá, donde los esquemas sí están (REQUIRED_INDEXES_FILE).
RUN npm run db:indexes -- required-indexes.json
RUN ./node_modules/.bin/esbuild scripts/db-release.ts --bundle --platform=node --format=esm \
    --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
    --outfile=db-release.mjs

FROM node:24-bookworm-slim AS runner
WORKDIR /app

ARG APP_COMMIT_SHA=unknown
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    RAILWAY_GIT_COMMIT_SHA=$APP_COMMIT_SHA \
    REQUIRED_INDEXES_FILE=/app/required-indexes.json

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/db-release.mjs /app/required-indexes.json ./
COPY --from=builder /app/drizzle ./drizzle

USER node
EXPOSE 8080
CMD ["node", "server.js"]
