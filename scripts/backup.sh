#!/usr/bin/env bash
# ADR-039: cron y corrida manual comparten respaldo y retención; nunca recibe secretos por argumentos.
set -euo pipefail
umask 077
export TZ=UTC

if (( $# != 0 )); then
  printf 'El respaldo se configura por variables y no recibe argumentos.\n' >&2
  exit 1
fi
for key in DATABASE_URL S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY \
  S3_FORCE_PATH_STYLE R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY AGE_RECIPIENT; do
  if [[ -z "${!key:-}" ]]; then
    printf 'Falta la variable requerida %s.\n' "$key" >&2
    exit 1
  fi
done
if [[ "$S3_FORCE_PATH_STYLE" != true && "$S3_FORCE_PATH_STYLE" != false ]]; then
  printf 'S3_FORCE_PATH_STYLE debe ser true o false.\n' >&2
  exit 1
fi
for key in S3_BUCKET R2_BUCKET; do
  if [[ ! "${!key}" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
    printf 'El nombre del bucket de %s no es válido.\n' "$key" >&2
    exit 1
  fi
done

# Configuración en memoria: no se escribe rclone.conf ni se muestra una URL de conexión.
export PGCONNECT_TIMEOUT=15 PGAPPNAME=casa-digital-backup
export RCLONE_CONFIG=/dev/null
export RCLONE_CONFIG_MEDIA_TYPE=s3 RCLONE_CONFIG_MEDIA_PROVIDER=Other
export RCLONE_CONFIG_MEDIA_ENDPOINT="$S3_ENDPOINT" RCLONE_CONFIG_MEDIA_REGION="$S3_REGION"
export RCLONE_CONFIG_MEDIA_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export RCLONE_CONFIG_MEDIA_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_MEDIA_FORCE_PATH_STYLE="$S3_FORCE_PATH_STYLE"
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT" RCLONE_CONFIG_R2_REGION="${R2_REGION:-auto}"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_FORCE_PATH_STYLE=true

temporary=$(mktemp -d)
pending_remote=
lock_pid=
cleanup() {
  local result=$?
  trap - EXIT
  if [[ -n "$pending_remote" ]]; then
    rclone deletefile "$pending_remote" --retries 1 --low-level-retries 1 \
      --contimeout 5s --timeout 5s >/dev/null 2>&1 || true
  fi
  if [[ -n "$lock_pid" ]]; then
    kill "$lock_pid" >/dev/null 2>&1 || true
    wait "$lock_pid" >/dev/null 2>&1 || true
  fi
  exec 3>&- 4<&-
  rm -rf "$temporary"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Una sesión conserva el lock durante dump, subida, poda y marcador, incluso entre contenedores.
# Los FIFO evitan depender de coproc (el lint también corre con Bash 3.2 en macOS).
mkfifo "$temporary/lock-input" "$temporary/lock-output"
PGAPPNAME=casa-digital-backup-lock psql --dbname="$DATABASE_URL" --no-psqlrc \
  --tuples-only --no-align --quiet --set=ON_ERROR_STOP=1 \
  < "$temporary/lock-input" > "$temporary/lock-output" &
lock_pid=$!
exec 3>"$temporary/lock-input"
exec 4<"$temporary/lock-output"
printf 'SELECT pg_try_advisory_lock(7043, 39);\n' >&3
if ! IFS= read -r locked <&4; then
  printf 'No se pudo adquirir el lock del respaldo.\n' >&2
  exit 1
fi
if [[ "$locked" != t ]]; then
  printf 'Ya hay otro respaldo en curso; no se inicia una segunda corrida.\n' >&2
  exit 1
fi

started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
nonce=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')
filename="$stamp-$nonce.tar.zst.age"
remote="r2:$R2_BUCKET/casa-digital"
mkdir "$temporary/payload" "$temporary/payload/media"

printf 'Creando el volcado de PostgreSQL.\n'
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$temporary/payload/database.dump"
postgres_version=$(psql --dbname="$DATABASE_URL" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command='show server_version')
printf 'Copiando los objetos del bucket.\n'
rclone copy "media:$S3_BUCKET" "$temporary/payload/media" --transfers 2 --checkers 4
jq -n --arg startedAt "$started_at" --arg postgresVersion "$postgres_version" \
  --arg backupRevision "${RAILWAY_GIT_COMMIT_SHA:-unknown}" --arg bucket "$S3_BUCKET" \
  '{formatVersion: 1, startedAt: $startedAt, postgresVersion: $postgresVersion,
    backupRevision: $backupRevision, mediaBucket: $bucket,
    databaseFile: "database.dump", mediaDirectory: "media"}' > "$temporary/payload/manifest.json"

printf 'Comprimiendo y cifrando el respaldo.\n'
tar -C "$temporary/payload" -cf - database.dump media manifest.json \
  | zstd -q -T1 \
  | age -r "$AGE_RECIPIENT" > "$temporary/$filename"
expected_hash=$(sha256sum "$temporary/$filename")
expected_hash=${expected_hash%% *}
pending_remote="$remote/$filename.uploading"
rclone copyto "$temporary/$filename" "$pending_remote"
actual_hash=$(rclone cat "$pending_remote" | sha256sum)
actual_hash=${actual_hash%% *}
if [[ "$actual_hash" != "$expected_hash" ]]; then
  printf 'La copia remota no coincide con el archivo cifrado.\n' >&2
  exit 1
fi
rclone moveto "$pending_remote" "$remote/$filename"
pending_remote=

# Si se perdió la sesión de PostgreSQL durante la transferencia, no competir por la retención.
printf 'SELECT 1;\n' >&3
if ! IFS= read -r lock_alive <&4 || [[ "$lock_alive" != 1 ]]; then
  printf 'Se perdió la sesión que protegía el respaldo.\n' >&2
  exit 1
fi

# Solo copias completas con nuestro formato: jamás alcanza ghpoints/ ni otros objetos del bucket.
rclone lsf "$remote" --files-only --max-depth 1 > "$temporary/remote-files"
LC_ALL=C sort "$temporary/remote-files" > "$temporary/sorted-files"
backups=()
while IFS= read -r item; do
  if [[ "$item" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}\.tar\.zst\.age$ ]]; then
    backups+=("$item")
  fi
done < "$temporary/sorted-files"
remove_count=$(( ${#backups[@]} - 12 ))
for (( index=0; index<remove_count; index++ )); do
  rclone deletefile "$remote/${backups[$index]}"
done

# El marcador se escribe solo al finalizar la verificación y la retención.
psql --dbname="$DATABASE_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --quiet <<'SQL'
INSERT INTO app_config (key, value, updated_at, updated_by_id)
VALUES (
  'backup.lastRunAt',
  to_jsonb(to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  now(),
  NULL
)
ON CONFLICT (key) DO UPDATE
SET value = excluded.value, updated_at = excluded.updated_at, updated_by_id = NULL;
SQL
printf 'Respaldo verificado: %s (retención: 12 copias completas en total).\n' "$filename"
